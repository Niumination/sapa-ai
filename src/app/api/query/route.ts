import { NextRequest } from 'next/server';
import { z } from 'zod';
import { processAIQueryStreaming } from '@/services/ai-orchestrator';
import { getMockQueryResponse } from '@/lib/mock-data';
import { isMockMode } from '@/lib/data-source';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { getAdminFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// LLM streaming bisa lama; tanpa ini stream bisa terpotong timeout platform.
export const maxDuration = 60;

const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_HOUR = 60;

const QuerySchema = z.object({
  query: z.string().trim().min(3).max(2000),
  sessionId: z.string().max(100).optional(),
});

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  const perMinute = await checkRateLimit({ key: `query:m:${ip}`, limit: RATE_LIMIT_PER_MINUTE, windowMs: 60 * 1000 });
  if (!perMinute.ok) {
    return Response.json({ error: 'Terlalu banyak pertanyaan. Tunggu sebentar lalu coba lagi.' }, { status: 429, headers: rateLimitHeaders(perMinute) });
  }
  const perHour = await checkRateLimit({ key: `query:h:${ip}`, limit: RATE_LIMIT_PER_HOUR, windowMs: 60 * 60 * 1000 });
  if (!perHour.ok) {
    return Response.json({ error: 'Kuota pertanyaan per jam tercapai. Silakan coba lagi nanti.' }, { status: 429, headers: rateLimitHeaders(perHour) });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body harus JSON yang valid.' }, { status: 400 });
  }

  const parsed = QuerySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Query tidak valid', detail: parsed.error.flatten() }, { status: 400 });
  }

  const { query } = parsed.data;

  // Mock mode — SSE juga (agar klien SSE tidak gagal parse)
  if (isMockMode()) {
    return sseResponse(mockStream(query));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {}
      };
      let queryId = crypto.randomUUID();
      send('trace', { queryId, phase: 'start', ts: new Date().toISOString() });
      try {
        let narasiBuffer = '';
        let lastSentPartial = ''; // Hotfix Aug 26: cegah snapshot narasi kumulatif terkirim duplikat
        // @hotfix 29-Agu-2026: baca sesi → role dipakai jalur DTSEN personal
        // (query NIK) di orchestrator. Pengguna publik tetap di-defleksi (privacy);
        // role DTSEN_LOOKUP/SUPERADMIN yang login bisa lookup by-NIK langsung.
        const admin = await getAdminFromRequest(req);
        const result = await processAIQueryStreaming(
          query,
          (status) => send('status', { status }),
          (delta) => {
            narasiBuffer += delta;
            const partial = extractNarasiPartialSafe(narasiBuffer);
            // Hotfix Aug 26: setelah field "narasi" JSON tertutup, snapshot kumulatif
            // sama terus dikirim ulang utk tiap delta berikutnya (tercatat 257x per
            // query di live) — boros bandwidth. Frontend menimpa state, jadi tak
            // terlihat user; cukup guard: kirim hanya jika snapshot berubah.
            if (partial && partial !== lastSentPartial) {
              lastSentPartial = partial;
              send('narasi', { text: partial });
            }
          },
          { role: admin?.role ?? null },
        );
        send('result', result);
        send('trace', { queryId, phase: 'end', ts: new Date().toISOString() });
      } catch (err) {
        console.error('AI Query streaming failed:', err);
        send('error', { error: 'Gagal memproses pertanyaan. Coba lagi.', detail: err instanceof Error ? err.message : String(err) });
        send('trace', { queryId, phase: 'error', ts: new Date().toISOString(), detail: err instanceof Error ? err.message : String(err) });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });

  return sseResponse(stream);
}

function sseResponse(stream: ReadableStream): Response {
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' } });
}

function mockStream(query: string): ReadableStream {
  const encoder = new TextEncoder();
  const result = getMockQueryResponse(query);
  const narasi: string = typeof result?.narasi === 'string' ? result.narasi : '';
  return new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try { controller.enqueue(encoder.encode(sse(event, data))); } catch {}
      };
      try {
        send('status', { status: 'Menganalisis pertanyaan... (mode data contoh)' });
        await sleep(200);
        send('status', { status: 'Menyusun jawaban... (mode data contoh)' });
        const chunks = narasi.match(/[^.!?]+[.!?]?\s*/g) ?? (narasi ? [narasi] : []);
        let progressive = '';
        for (const chunk of chunks) {
          progressive += chunk;
          send('narasi', { text: progressive });
          await sleep(120);
        }
        send('result', { ...result, dataSource: `${result?.dataSource ?? 'mock'} · DATA CONTOH` });
      } finally {
        try { controller.close(); } catch {}
      }
    },
  });
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function extractNarasiPartialSafe(raw: string): string {
  const match = raw.match(/"narasi"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!match) return '';
  return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
