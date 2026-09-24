import { NextRequest } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';
import { sitasiBalasan } from '@/services/sitasi-per-klaim';
import { siapkanIndeksSemantik } from '@/app/api/query/route';
import { tahunPadaBukti } from '@/services/grounding';
import { catatCelahBilaPerlu } from '@/app/api/query/route';
import { composeAnswer } from '@/services/answer-compose';
import { catatJejak, jejakDariHasil } from '@/lib/jejak-audit';
import { getClientIp } from '@/lib/rate-limit';
import { denganTelemetri, ukurTahapAsync } from '@/lib/ai/telemetri';
import { terapkanBentuk } from '@/services/bentuk-jawaban';
import type { NiatJawaban } from '@/lib/intent-meta';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Klien memutus pada 45 s; platform (Hobby) mematikan fungsi pada 60 s.
export const maxDuration = 60;

/**
 * POST /api/query/stream — SSE.
 * event: status | token | result | error
 *
 * Token yang dikirim SUDAH melalui ejector: angka {{id}} diganti nilai evidence,
 * dan potongan token yang belum lengkap ditahan agar tidak bocor ke layar.
 */
export async function POST(req: NextRequest) {
  // CMP-04: durasi jejak dihitung dari awal permintaan streaming sampai jawaban
  // selesai disusun (bukan hanya lama model menulis token).
  const mulaiJejakMs = Date.now();
  let queryRaw = '';
  try {
    const body = await req.json();
    const kandidat = typeof body?.query === 'string' ? body.query : typeof body?.question === 'string' ? body.question : '';
    queryRaw = kandidat.trim();
  } catch {
    return Response.json({ error: 'Body harus JSON' }, { status: 400 });
  }
  if (queryRaw.length < 3) {
    return Response.json({ error: 'Query tidak valid (minimal 3 karakter)' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const kirim = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const tutup = () => controller.close();

      // NFR-07: satu episode telemetri untuk seluruh aliran. Dibuka DI DALAM
      // `start` supaya konteks async-nya mencakup semua tahap (pengambilan data,
      // indeks semantik, retrieval, prompt, model, grounding, gerbang).
      await denganTelemetri({ jalan: 'query-stream' }, async () => {
      try {
        kirim('status', { status: 'Mengambil data SAPA…' });
        const fetched = await ukurTahapAsync('pengambilan_data', () =>
          fetchSapaData().catch((err: unknown) => ({ splpError: err })),
        );
        if ('splpError' in fetched) {
          const detail = fetched.splpError instanceof Error ? fetched.splpError.message : String(fetched.splpError);
          kirim('error', { error: 'Sumber data SAPA (SPLP) tidak dapat dijangkau. Coba lagi beberapa saat.', stage: 'splp', detail });
          tutup();
          return;
        }

        kirim('status', { status: 'Menganalisis pertanyaan…' });
        const ip = getClientIp(req);
        await ukurTahapAsync('indeks_semantik', () => siapkanIndeksSemantik(fetched.records, fetched.meta.sidik));
        const hasil = await composeAnswer({
          query: queryRaw,
          records: fetched.records,
          ip,
          stream: true,
          signal: req.signal,
          sidikKorpus: fetched.meta.sidik,
          onToken: (teks) => kirim('token', { text: teks }),
        });

        // Admin mematikan AI + deterministik → akhiri aliran dengan error jujur,
        // bukan mengirim narasi yang seharusnya tidak beredar.
        if (hasil.ai?.limitedBy === 'service-unavailable') {
          kirim('error', { error: hasil.ai.reason ?? 'Layanan tidak dapat diakses', stage: 'service-unavailable' });
          return;
        }

        // Celah pengetahuan (FR-27) — jalur inilah yang dipakai halaman utama,
        // jadi pencatatan harus ada di sini juga, bukan hanya di jalur JSON.
        await catatCelahBilaPerlu(queryRaw, hasil.diagnosa);

        // CMP-04: jalur streaming mencatat jejak yang SAMA dengan jalur JSON
        // (satu pintu: `jejakDariHasil`) — supaya pemeriksaan tidak buta pada
        // jawaban yang disajikan lewat streaming.
        await catatJejak(jejakDariHasil({ query: queryRaw, hasil, durasiMs: Date.now() - mulaiJejakMs }));

        // FR-18: bentuk jawaban — pintu yang sama dengan jalur JSON.
        const bentukJawaban = terapkanBentuk(
          (hasil.ai.intent as NiatJawaban | undefined) ?? null,
          queryRaw,
          hasil.evidence,
        );

        kirim('result', {
          ...hasil.response,
          answer: hasil.response.narasi,
          source: hasil.response.dataSource,
          count: fetched.records.length,
          matched: hasil.matched,
          aggregated: hasil.aggregated.slice(0, 10),
          opds: hasil.opds,
          evidence: hasil.evidence,
          query: queryRaw,
          ai: hasil.ai,
          // FR-18 (aditif) — sama seperti jalur JSON.
          niat: hasil.ai.intent ?? null,
          bentuk: bentukJawaban.bentuk,
          urutanBukti: bentukJawaban.baris.map((b) => b.id),
          ...(bentukJawaban.porsi ? { porsi: bentukJawaban.porsi } : {}),
          // FR-25 & DS-03 (aditif) — sama seperti jalur JSON.
          dataFetchedAt: fetched.meta.diambilPada,
          dataFingerprint: fetched.meta.sidik,
          dataYears: tahunPadaBukti(hasil.evidence),
          // FR-19: sitasi per klaim — aturan yang sama dengan jalur JSON.
          ...sitasiBalasan(hasil.response.narasi, hasil.evidence),
          // FR-20: sebab jawaban — kontrak sama dengan jalur JSON.
          diagnosa: hasil.diagnosa,
          pemeriksaan: hasil.pemeriksaan,
        });
      } catch (e) {
        kirim('error', { error: e instanceof Error ? e.message : 'Gagal memproses query' });
      } finally {
        tutup();
      }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
