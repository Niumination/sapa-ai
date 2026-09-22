import { NextRequest } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';
import { composeAnswer } from '@/services/answer-compose';
import { getClientIp, rateLimitHeaders, checkRateLimit } from '@/lib/rate-limit';
import { sitasiBalasan } from '@/services/sitasi-per-klaim';
import { tahunPadaBukti } from '@/services/grounding';
import { catatCelah, type SebabCelah } from '@/lib/insight-celah';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/query — jawaban JSON (kontrak lama, dipakai riwayat & test).
 * Jalurnya kini melalui composeAnswer: deterministik sebagai dasar, model AI
 * hanya bila AI_ENABLED=true (atau AI_SHADOW=true untuk evaluasi).
 * Streaming tersedia di /api/query/stream.
 */
export async function POST(req: NextRequest) {
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

  // Hardening: SPLP mati → 503 graceful, bukan 500 mentah (test: route.test.ts)
  const fetched = await fetchSapaData().catch((err: unknown) => ({ splpError: err }));
  if ('splpError' in fetched) {
    const detail = fetched.splpError instanceof Error ? fetched.splpError.message : String(fetched.splpError);
    return Response.json(
      { error: 'Sumber data SAPA (SPLP) tidak dapat dijangkau. Coba lagi beberapa saat.', stage: 'splp', detail },
      { status: 503 },
    );
  }
  const { records, meta } = fetched;

  // Batas ketat sebelum kerja berat (retrieval + kemungkinan panggilan model).
  const ip = getClientIp(req);
  const batas = await checkRateLimit({ key: `query:${ip}`, limit: 30, windowMs: 60_000 });
  if (!batas.ok) {
    return Response.json(
      { error: 'Terlalu banyak permintaan. Coba lagi beberapa saat.', stage: 'rate-limit' },
      { status: 429, headers: rateLimitHeaders(batas) },
    );
  }

  const hasil = await composeAnswer({ query: queryRaw, records, ip, stream: false });

  // Jika admin mematikan AI dan Deterministik → 503, bukan 200
  if (hasil.ai?.limitedBy === 'service-unavailable') {
    return Response.json(
      { error: hasil.ai.reason ?? 'Layanan tidak dapat diakses', stage: 'service-unavailable' },
      { status: 503 },
    );
  }

  // Catat bila pertanyaan ini tidak terlayani (FR-27). Hanya kasus gagal yang
  // menulis — pertanyaan yang berhasil tidak menyentuh penyimpanan sama sekali.
  await catatCelahBilaPerlu(queryRaw, hasil.evidence.length, hasil.ai?.nilaiTambah);

  return Response.json(
    {
      ...hasil.response,
      // Alias kompatibilitas untuk klien lama / riwayat
      answer: hasil.response.narasi,
      source: hasil.response.dataSource,
      count: records.length,
      matched: hasil.matched,
      aggregated: hasil.aggregated.slice(0, 10),
      opds: hasil.opds,
      evidence: hasil.evidence,
      query: queryRaw,
      ai: hasil.ai,
      // FR-25 & DS-03: kesegaran data + sidik korpus + tahun data pada bukti.
      // Semuanya ADITIF — kunci lama tidak ada yang berubah atau hilang.
      dataFetchedAt: meta.diambilPada,
      dataFingerprint: meta.sidik,
      dataYears: tahunPadaBukti(hasil.evidence),
      // FR-19: sitasi per klaim. `narasiBersitasi` adalah narasi dengan penanda
      // [n]; `sitasi.tanpaSitasi` harus KOSONG — inilah yang diperiksa gerbang.
      ...sitasiBalasan(hasil.response.narasi, hasil.evidence),
    },
    { headers: rateLimitHeaders(batas) },
  );
}

/**
 * Penentu sebab celah (dipisah agar jalur JSON & streaming memakai aturan yang
 * sama persis, dan agar mudah diuji).
 */
export function tentukanSebabCelah(jumlahBukti: number, nilaiTambah?: string): SebabCelah | null {
  if (jumlahBukti === 0) return 'tanpa-bukti';
  if (nilaiTambah?.startsWith('ditolak')) return 'ai-ditolak';
  return null;
}

/** Catat celah tanpa pernah mengganggu jawaban (gagal senyap bila penyimpanan bermasalah). */
export async function catatCelahBilaPerlu(
  query: string,
  jumlahBukti: number,
  nilaiTambah?: string,
): Promise<void> {
  const sebab = tentukanSebabCelah(jumlahBukti, nilaiTambah);
  if (!sebab) return;
  await catatCelah(query, sebab).catch(() => {});
}
