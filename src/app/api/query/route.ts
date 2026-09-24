import { NextRequest } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';
import { indeksUntuk, opsiRemoteDariLingkungan, penyediaDariLingkungan } from '@/services/semantik';
import { composeAnswer } from '@/services/answer-compose';
import { getClientIp, rateLimitHeaders, checkRateLimit } from '@/lib/rate-limit';
import { sitasiBalasan } from '@/services/sitasi-per-klaim';
import { tahunPadaBukti } from '@/services/grounding';
import { catatCelah, type SebabCelah } from '@/lib/insight-celah';
import { sebabUntukCelah, type Diagnosa } from '@/services/sebab-kegagalan';
import { denganTelemetri, ukurTahapAsync } from '@/lib/ai/telemetri';

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
  // NFR-07: konteks telemetri dibuka di sini supaya pengambilan data & indeks
  // semantik (dua pekerjaan terberat sebelum penyusunan jawaban) ikut terukur
  // dan masuk ke SATU baris log `[gen_ai]` bersama tahap-tahap di composeAnswer.
  return denganTelemetri({ jalan: 'query-json' }, () => tanganiQuery(req));
}

async function tanganiQuery(req: NextRequest) {
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
  const fetched = await ukurTahapAsync('pengambilan_data', () =>
    fetchSapaData().catch((err: unknown) => ({ splpError: err })),
  );
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

  // FR-12: panaskan indeks semantik SEBELUM jawaban disusun. Penyusunan jawaban
  // bersifat sinkron, jadi indeks harus sudah siap — dan karena cache-nya
  // berkunci sidik korpus (FR-25), ini hanya benar-benar menghitung sekali per
  // versi korpus, bukan setiap permintaan.
  await ukurTahapAsync('indeks_semantik', () => siapkanIndeksSemantik(records, meta.sidik));

  const hasil = await composeAnswer({ query: queryRaw, records, ip, stream: false, sidikKorpus: meta.sidik });

  // Jika admin mematikan AI dan Deterministik → 503, bukan 200
  if (hasil.ai?.limitedBy === 'service-unavailable') {
    return Response.json(
      { error: hasil.ai.reason ?? 'Layanan tidak dapat diakses', stage: 'service-unavailable' },
      { status: 503 },
    );
  }

  // Catat bila pertanyaan ini tidak terlayani (FR-27). Hanya kasus gagal yang
  // menulis — pertanyaan yang berhasil tidak menyentuh penyimpanan sama sekali.
  await catatCelahBilaPerlu(queryRaw, hasil.diagnosa);

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
      // FR-20: sebab jawaban ini (satu tag `lapis:rincian` + status). Selalu ada.
      diagnosa: hasil.diagnosa,
      // FR-24: pemeriksaan pasangan entitas atas narasi yang disajikan. `keras > 0`
      // berarti ada nilai yang dipasangkan ke indikator/wilayah/satuan lain — pada
      // jalur AI hal itu sudah membuat narasi model ditolak sebelum sampai ke sini.
      pemeriksaan: hasil.pemeriksaan,
      // FR-19: sitasi per klaim. `narasiBersitasi` adalah narasi dengan penanda
      // [n]; `sitasi.tanpaSitasi` harus KOSONG — inilah yang diperiksa gerbang.
      ...sitasiBalasan(hasil.response.narasi, hasil.evidence),
    },
    { headers: rateLimitHeaders(batas) },
  );
}

/**
 * Panaskan indeks semantik (FR-12) tanpa pernah menggagalkan permintaan.
 *
 * Dipakai bersama oleh jalur JSON & streaming supaya keduanya memakai indeks
 * yang sama. Kegagalan penyedia remote ditangani di dalam semantik.ts (turun ke
 * penyedia hash), dan kegagalan tak terduga di sini pun tidak boleh menahan
 * jawaban: lebih baik kehilangan jalur cadangan daripada kehilangan jawaban.
 */
export async function siapkanIndeksSemantik(records: Parameters<typeof indeksUntuk>[0], sidikKorpus: string): Promise<void> {
  try {
    const opsi = penyediaDariLingkungan() === 'remote' ? opsiRemoteDariLingkungan() : undefined;
    await indeksUntuk(records, sidikKorpus, opsi);
  } catch {
    // senyap: jalur semantik hanya cadangan
  }
}

/**
 * Penentu sebab celah (dipisah agar jalur JSON & streaming memakai aturan yang
 * sama persis, dan agar mudah diuji).
 *
 * FR-20 (22 Sep 2026): masukannya bukan lagi dua sinyal kasar (jumlah bukti +
 * nilai tambah), melainkan DIAGNOSA jawaban yang sudah diklasifikasikan — satu
 * tag `lapis:rincian`. Perubahan ini disengaja: dua sinyal kasar tidak mampu
 * membedakan "kata kuncinya tidak ada di katalog" dari "datanya tidak ada",
 * padahal perbaikan keduanya berbeda jauh.
 */
export function tentukanSebabCelah(diagnosa: Pick<Diagnosa, 'sebab' | 'catatan'>): SebabCelah | null {
  return sebabUntukCelah({ ...diagnosa, lapis: 'retrieval', status: 'jujur-kosong', rincian: '', jumlahBukti: 0, konsepAsing: [] });
}

/** Catat celah tanpa pernah mengganggu jawaban (gagal senyap bila penyimpanan bermasalah). */
export async function catatCelahBilaPerlu(query: string, diagnosa: Pick<Diagnosa, 'sebab' | 'catatan'>): Promise<void> {
  const sebab = tentukanSebabCelah(diagnosa);
  if (!sebab) return;
  await catatCelah(query, sebab).catch(() => {});
}
