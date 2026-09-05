// ─── Penyusun jawaban: deterministik + AI (mode aktif / shadow) ───
//
// Urutan yang tidak boleh diubah:
//   retrieval → (evidence kosong? JANGAN panggil model) → cache → batas harian
//   → model → parse skema → eject token {{id}} → GROUNDING → fallback deterministik
//
// Grounding dijalankan SEBELUM format presentasi, dan model tidak pernah menulis
// angka sendiri: narasi ber-token {{id}} diganti oleh kode dengan nilai evidence.

import { buildDeterministicAnswer } from '@/services/deterministic-answer';
import {
  isGrounded,
  isGroundedText,
  groundOutput,
  formatAngkaPresentasi,
  type EvidenceItem,
} from '@/services/grounding';
import { getAiConfig, isAiEnabled, isAiShadow, aiStatusReason, type AiConfig } from '@/lib/ai/env';
import { buildPrompt } from '@/lib/ai/prompt';
import { parseLlmAnswer } from '@/lib/ai/schema';
import { ejectTokens, createStreamEjector } from '@/lib/ai/tokens';
import { guardQuery, cekDataPribadi, cekPermintaanPerOrang } from '@/lib/ai/guard';
import { callLlmText, streamLlm, extractNarasiPartial } from '@/lib/ai/llm-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { cacheGet, cacheSet, incrementCounter } from '@/lib/store';
import { normalizeText, dataSourceLabel, type SapaRecord } from '@/lib/sapa-client';
import type { HybridResponse } from '@/types';

const CACHE_TTL_MS = 15 * 60 * 1000;
const RATE_PER_MINUTE = 30;
const RATE_PER_HOUR = 300;

export interface ComposeOptions {
  query: string;
  records: SapaRecord[];
  /** Dipakai rate limit & log. */
  ip?: string;
  /** Kirim potongan narasi (sudah di-eject token) untuk pratinjau langsung. */
  onToken?: (teks: string) => void;
  /** Streaming dari provider (SSE). Default: true bila onToken diberikan. */
  stream?: boolean;
  signal?: AbortSignal;
}

export interface AiMeta {
  used: boolean;
  shadow: boolean;
  model: string | null;
  provider: string | null;
  latencyMs: number;
  grounded: 'pass' | 'replaced' | 'skipped';
  reason?: string;
  cached: boolean;
  limitedBy?: 'no-evidence' | 'rate-limit' | 'daily-limit' | 'unconfigured' | 'guard';
  unknownTokens?: number;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ComposeResult {
  response: HybridResponse;
  evidence: EvidenceItem[];
  ai: AiMeta;
  /** Jumlah record yang cocok dengan retrieval (kompatibel dengan kontrak lama). */
  matched: number;
  aggregated: ReturnType<typeof buildDeterministicAnswer>['aggregated'];
  opds: ReturnType<typeof buildDeterministicAnswer>['opds'];
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function tanggalHariIni(): string {
  return new Date().toISOString().slice(0, 10);
}

async function cekBatasHarian(cfg: AiConfig): Promise<{ ok: boolean; count: number }> {
  if (!cfg.dailyCallLimit) return { ok: true, count: 0 };
  const { count } = await incrementCounter(`ai:llm:${tanggalHariIni()}`, 24 * 60 * 60 * 1000);
  return { ok: count <= cfg.dailyCallLimit, count };
}

/** Status runtime untuk /api/status — jujur tentang aktif/shadow/nonaktif. */
export async function getAiRuntimeStatus(): Promise<{
  state: 'active' | 'shadow' | 'inactive';
  provider: string | null;
  model: string | null;
  reason: string | null;
  dailyUsed: number;
}> {
  const cfg = getAiConfig();
  const dailyUsed = cfg.dailyCallLimit
    ? (await incrementCounter(`ai:llm:${tanggalHariIni()}`, 24 * 60 * 60 * 1000)).count - 1
    : 0;
  const state = isAiEnabled(cfg) ? 'active' : isAiShadow(cfg) ? 'shadow' : 'inactive';
  return {
    state,
    provider: cfg.provider,
    model: cfg.model || null,
    reason: aiStatusReason(cfg),
    dailyUsed: Math.max(0, dailyUsed),
  };
}

// Pesan penolakan. Sengaja dipisah agar kedua jenis pagar (NIK dan
// permintaan data per-orang) memberi penjelasan yang tepat — bukan satu
// kalimat umum yang dipakai untuk semua keadaan.
const NARASI_TOLAK_NIK =
  'Permintaan ini tidak dilayani karena memuat nomor identitas kependudukan (NIK). ' +
  'Portal SAPA Aceh Tengah hanya menyajikan data agregat indikator pembangunan dan tidak menyimpan data per-orang. ' +
  'Untuk data kependudukan per-orang, ajukan permohonan ke Dinas Kependudukan dan Pencatatan Sipil ' +
  'Kabupaten Aceh Tengah sesuai UU No. 27/2022 tentang Pelindungan Data Pribadi.';
const NARASI_TOLAK_PER_ORANG =
  'Permintaan ini tidak dilayani karena meminta data per-orang (nama atau identitas penerima). ' +
  'Portal SAPA Aceh Tengah hanya menyajikan indikator agregat per OPD dan tidak menyimpan daftar bernama orang. ' +
  'Untuk data penerima per-orang, ajukan permohonan ke OPD pengampu (Dinas Sosial atau Disdukcapil) ' +
  'sesuai UU No. 27/2022 tentang Pelindungan Data Pribadi.';
const SARAN_TOLAK_NIK = [
  'Ajukan ulang sebagai pertanyaan agregat, mis. "jumlah penduduk Aceh Tengah".',
  'Data per-orang dilayani Disdukcapil melalui jalur resmi, bukan lewat portal ini.',
];
const SARAN_TOLAK_PER_ORANG = [
  'Ajukan ulang sebagai pertanyaan agregat, mis. "jumlah penerima PKH di Aceh Tengah".',
  'Data penerima per-orang dilayani OPD pengampu melalui jalur resmi, bukan lewat portal ini.',
];

export async function composeAnswer(opts: ComposeOptions): Promise<ComposeResult> {
  const mulai = Date.now();

  // 0. Pagar data pribadi — berlaku di SEMUA mode (deterministik, shadow, aktif).
  //    Sengaja diletakkan paling awal: bila dibiarkan lewat, NIK ikut ke retrieval,
  //    dipakai sebagai kata kunci, lalu dikembalikan ke layar melalui echo
  //    pertanyaan di dalam narasi. SAPA publik tidak punya data per-orang, jadi
  //    menolak lebih awal selalu lebih aman daripada menjawab.
  // Dua jenis pagar: NIK, dan permintaan data per-orang (nama/identitas
  // penerima). Keduanya berlaku di SEMUA mode — jangan sampai pertanyaan
  // "siapa nama penerima PKH" dijawab dengan angka agregat seolah-olah
  // portal ini tahu siapa orangnya.
  const pagarNik = cekDataPribadi(opts.query);
  const pagarPerOrang = cekPermintaanPerOrang(opts.query);
  const pagarData = pagarNik ?? pagarPerOrang;
  if (pagarData) {
    const narasiTolak = pagarNik ? NARASI_TOLAK_NIK : NARASI_TOLAK_PER_ORANG;
    const saranTolak = pagarNik ? SARAN_TOLAK_NIK : SARAN_TOLAK_PER_ORANG;
    return {
      response: {
        narasi: narasiTolak,
        visualisasi: { tipe: 'none', konfigurasi: {} },
        rekomendasi: saranTolak,
        dataSource: dataSourceLabel('splp'),
        timestamp: new Date().toISOString(),
      },
      evidence: [],
      ai: {
        used: false, shadow: false, model: null, provider: null, latencyMs: 0,
        grounded: 'skipped', reason: pagarData, cached: false, limitedBy: 'guard',
      },
      matched: 0,
      aggregated: [],
      opds: [],
    };
  }

  const dasar = buildDeterministicAnswer(opts.query, opts.records);

  const meta: AiMeta = {
    used: false,
    shadow: false,
    model: null,
    provider: null,
    latencyMs: 0,
    grounded: 'skipped',
    cached: false,
  };

  const selengkap = (m: AiMeta, response: HybridResponse): ComposeResult => ({
    response,
    evidence: dasar.evidence,
    ai: m,
    matched: dasar.hits.length,
    aggregated: dasar.aggregated,
    opds: dasar.opds,
  });

  const selesai = (alasan?: string, limitedBy?: AiMeta['limitedBy']): ComposeResult => {
    meta.latencyMs = Date.now() - mulai;
    if (alasan) meta.reason = alasan;
    if (limitedBy) meta.limitedBy = limitedBy;
    return selengkap(meta, dasar.response);
  };

  // 1. Tanpa evidence → tidak ada yang bisa dirangkai. Hemat 100% panggilan model.
  if (dasar.evidence.length === 0) return selesai('evidence kosong — model tidak dipanggil', 'no-evidence');

  const cfg = getAiConfig();
  const aktif = isAiEnabled(cfg);
  const shadow = isAiShadow(cfg);
  if (!aktif && !shadow) return selesai(aiStatusReason(cfg) ?? 'AI nonaktif', 'unconfigured');

  // 2. Pagar masuk: panjang & pola data pribadi.
  const dijaga = guardQuery(opts.query);
  if (!dijaga.ok) return selesai(dijaga.reason, 'unconfigured');

  // 3. Rate limit per-IP — lewati batas ⇒ jawab deterministik, bukan error.
  if (opts.ip) {
    const perMenit = await checkRateLimit({ key: `q:${opts.ip}`, limit: RATE_PER_MINUTE, windowMs: 60_000 });
    const perJam = await checkRateLimit({ key: `qh:${opts.ip}`, limit: RATE_PER_HOUR, windowMs: 3_600_000 });
    if (!perMenit.ok || !perJam.ok) return selesai('rate limit terlampaui', 'rate-limit');
  }

  // 4. Cache jawaban (query dinormalisasi + ukuran katalog).
  const cacheKey = `ai:v1:${hash(normalizeText(opts.query))}:${opts.records.length}`;
  const tersimpan = await cacheGet<{ response: HybridResponse; ai: AiMeta }>(cacheKey);
  if (tersimpan && aktif) {
    return { ...selengkap({ ...tersimpan.ai, cached: true }, tersimpan.response) };
  }

  // 5. Batas harian global (pengaman biaya).
  const harian = await cekBatasHarian(cfg);
  if (!harian.ok) return selesai(`batas harian ${cfg.dailyCallLimit} panggilan tercapai`, 'daily-limit');

  // 6. Panggil model.
  const statistik = {
    totalRecord: opts.records.length,
    totalOpd: new Set(opts.records.map((r) => r.opds_nama_opd)).size,
    evidenceDihitung: dasar.evidence.length,
  };
  const { system, user } = buildPrompt({
    query: dijaga.query,
    evidence: dasar.evidence,
    statistik,
  });
  const pesan = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];

  let mentah = '';
  let finishReason: string | undefined;
  let usage: AiMeta['usage'];

  try {
    if (opts.stream ?? Boolean(opts.onToken)) {
      const ejector = createStreamEjector(dasar.evidence);
      let bufferMentah = '';
      for await (const potong of streamLlm(cfg, pesan, opts.signal)) {
        bufferMentah += potong.delta;
        finishReason = potong.finishReason ?? finishReason;
        if (opts.onToken) {
          const parsial = extractNarasiPartial(bufferMentah);
          const keluar = ejector.push(parsial.slice(mentah.length));
          if (keluar) opts.onToken(keluar);
          mentah = parsial;
        }
      }
      if (opts.onToken) {
        const sisa = ejector.flush();
        if (sisa) opts.onToken(sisa);
      }
      // `mentah` = SELURUH teks mentah untuk di-parse; `parsial` tadi hanya
      // pratinjau isi field narasi. Tanpa ini, JSON yang di-parse akan terpotong.
      mentah = bufferMentah;
    } else {
      const hasil = await callLlmText(cfg, pesan, opts.signal);
      mentah = hasil.text;
      finishReason = hasil.finishReason;
      usage = hasil.usage;
    }
  } catch (e) {
    meta.model = cfg.model || null;
    meta.provider = cfg.provider;
    return selesai(`panggilan model gagal: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 7. Parse skema — gagal = jatuh ke deterministik, tidak pernah menampilkan mentah.
  const terurai = parseLlmAnswer(mentah);
  if (!terurai.ok) {
    meta.model = cfg.model || null;
    meta.provider = cfg.provider;
    return selesai(terurai.error);
  }

  // 8. Eject token {{id}} → nilai asli dari evidence.
  const ejected = ejectTokens(terurai.data.narasi, dasar.evidence);
  meta.unknownTokens = ejected.unknown.length;

  const extraAllowedNumbers = [statistik.totalRecord, statistik.totalOpd, statistik.evidenceDihitung];
  const rekomendasiAman = terurai.data.rekomendasi.filter((r) => isGroundedText(r, dasar.evidence, { extraAllowedNumbers }).ok);
  const followUpsAman = terurai.data.followUps.filter((r) => isGroundedText(r, dasar.evidence, { extraAllowedNumbers }).ok);

  let responsAi: HybridResponse = {
    narasi: ejected.text,
    visualisasi: dasar.response.visualisasi, // visualisasi tetap ditentukan aturan deterministik
    rekomendasi: rekomendasiAman.length > 0 ? rekomendasiAman : dasar.response.rekomendasi,
    dataSource: dasar.response.dataSource,
    timestamp: new Date().toISOString(),
    ...(followUpsAman.length > 0 ? { followUps: followUpsAman } : {}),
  } as HybridResponse & { followUps?: string[] };

  // 9. Grounding lapis kedua (lapis pertama = narasi ber-token).
  const cek = isGrounded(responsAi, dasar.evidence, { extraAllowedNumbers });
  if (!cek.ok) {
    const diganti = groundOutput(responsAi, dasar.evidence, opts.query, { extraAllowedNumbers });
    responsAi = diganti.response;
    meta.grounded = 'replaced';
    meta.reason = cek.reasons.join('; ');
  } else {
    meta.grounded = 'pass';
  }
  responsAi = formatAngkaPresentasi(responsAi);

  meta.used = true;
  meta.shadow = shadow;
  meta.model = cfg.model || null;
  meta.provider = cfg.provider;
  meta.latencyMs = Date.now() - mulai;
  meta.finishReason = finishReason;
  meta.usage = usage;

  // 10. Mode shadow: pengguna tetap menerima jawaban deterministik; hasil model dicatat.
  if (shadow) {
    console.info(
      '[ai-shadow]',
      JSON.stringify({
        query: dijaga.query.slice(0, 120),
        model: cfg.model,
        grounded: meta.grounded,
        reason: meta.reason ?? null,
        unknownTokens: meta.unknownTokens ?? 0,
        latencyMs: meta.latencyMs,
        narasiAi: responsAi.narasi.slice(0, 300),
        narasiDeterministik: dasar.response.narasi.slice(0, 300),
      }),
    );
    return selengkap(meta, dasar.response);
  }

  await cacheSet(cacheKey, { response: responsAi, ai: meta }, CACHE_TTL_MS);
  return selengkap(meta, responsAi);
}
