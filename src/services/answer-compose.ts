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
import { isAiToggleEnabled, isDetToggleEnabled, readToggleState, toggleBackend } from '@/lib/ai/toggle';
import { buildPrompt } from '@/lib/ai/prompt';
import { parseLlmAnswer } from '@/lib/ai/schema';
import { ejectTokens, createStreamEjector, dedupUnits } from '@/lib/ai/tokens';
import { guardQuery, cekDataPribadi, cekPermintaanPerOrang } from '@/lib/ai/guard';
import { callLlmText, streamLlm, extractNarasiPartial } from '@/lib/ai/llm-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { cacheGet, cacheSet, incrementCounter, type CounterResult } from '@/lib/store';
import { normalizeText, dataSourceLabel, type SapaRecord } from '@/lib/sapa-client';
import type { HybridResponse } from '@/types';

const CACHE_TTL_MS = 15 * 60 * 1000;
const RATE_PER_MINUTE = 30;
const RATE_PER_HOUR = 300;

// ─── Metrics: track deterministic vs LLM output ratio ───
async function recordMetrics(kind: 'llm' | 'deterministic'): Promise<void> {
  const key = `metrics:query:${kind}:${tanggalHariIni()}`;
  await incrementCounter(key, 24 * 60 * 60 * 1000);
}

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
  limitedBy?: 'no-evidence' | 'rate-limit' | 'daily-limit' | 'unconfigured' | 'guard' | 'service-unavailable';
  unknownTokens?: number;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  /** Model sempat dipanggil (true) vs tidak pernah dicoba (skipped hemat/terbatas).
   *  Dipakai harness eval untuk membedakan "gagal panggil" dari "sengaja skip". */
  attempted?: boolean;
  /** Error message dari model call / parse / grounding (untuk debugging) */
  error?: string;
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
  toggles?: { aiEnabled: boolean; detEnabled: boolean; backend: 'redis' | 'memory'; updatedAt: string };
  metrics: {
    deterministicToday: number;
    llmToday: number;
    ratio: { deterministic: number; llm: number };
  };
}> {
  const cfg = getAiConfig();
  const dailyUsed = cfg.dailyCallLimit
    ? (await incrementCounter(`ai:llm:${tanggalHariIni()}`, 24 * 60 * 60 * 1000)).count - 1
    : 0;

  // Toggle admin menang atas env: status harus mencerminkan apa yang benar-benar
  // dikirim ke pengguna, bukan sekadar isi AI_ENABLED.
  const toggle = await readToggleState();
  const backend = toggleBackend();
  const dariEnv = isAiEnabled(cfg) ? 'active' : isAiShadow(cfg) ? 'shadow' : 'inactive';
  const state: 'active' | 'shadow' | 'inactive' =
    !toggle.aiEnabled || !toggle.detEnabled ? 'inactive' : dariEnv;
  const reason =
    !toggle.aiEnabled && !toggle.detEnabled
      ? 'AI dan deterministik dinonaktifkan oleh admin — layanan tidak dapat diakses'
      : !toggle.detEnabled
        ? 'Deterministik dinonaktifkan oleh admin — layanan tidak dapat diakses'
        : !toggle.aiEnabled
          ? 'AI dinonaktifkan oleh admin — jawaban deterministik saja'
          : aiStatusReason(cfg);

  // Read metrics
  const detKey = `metrics:query:deterministic:${tanggalHariIni()}`;
  const llmKey = `metrics:query:llm:${tanggalHariIni()}`;
  // Use incrementCounter with peek (count only, no increment) — fallback to direct read
  const detCount = await getCounterValue(detKey);
  const llmCount = await getCounterValue(llmKey);
  const total = detCount + llmCount;
  const ratioDet = total > 0 ? Math.round((detCount / total) * 100) : 0;
  const ratioLlm = total > 0 ? Math.round((llmCount / total) * 100) : 0;

  return {
    state,
    provider: cfg.provider,
    model: cfg.model || null,
    reason,
    dailyUsed: Math.max(0, dailyUsed),
    toggles: {
      aiEnabled: toggle.aiEnabled,
      detEnabled: toggle.detEnabled,
      backend,
      updatedAt: toggle.updatedAt,
    },
    metrics: {
      deterministicToday: detCount,
      llmToday: llmCount,
      ratio: { deterministic: ratioDet, llm: ratioLlm },
    },
  };
}

/** Read counter value without incrementing (uses store backend) */
async function getCounterValue(key: string): Promise<number> {
  const val = await cacheGet<string>(key);
  return val ? parseInt(val, 10) : 0;
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
    recordMetrics('deterministic');
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

  // ─── Toggle admin (menang atas env) ───
  // Dibaca SEBELUM cek env supaya keputusan pemilik aplikasi tidak bisa
  // ditimpa oleh AI_ENABLED/AI_SHADOW di Vercel.
  const aiToggleOn = await isAiToggleEnabled();
  const detToggleOn = await isDetToggleEnabled();
  /** true bila jawaban deterministik tidak boleh disajikan lagi. */
  const deterministikMati = !detToggleOn;

  const selesai = (alasan?: string, limitedBy?: AiMeta['limitedBy'], errorMsg?: string): ComposeResult => {
    meta.latencyMs = Date.now() - mulai;
    if (alasan) meta.reason = alasan;
    if (limitedBy) meta.limitedBy = limitedBy;
    if (errorMsg) meta.error = errorMsg.slice(0, 200);
    // Deterministik dimatikan admin → tidak ada jawaban yang boleh beredar.
    // Satu funnel di sini menjamin semua jalur (tanpa evidence, rate limit,
    // model gagal, parse gagal) ikut tertutup, bukan hanya jalur normal.
    if (deterministikMati) {
      meta.limitedBy = 'service-unavailable';
      meta.reason = 'Layanan SAPA-AI tidak dapat diakses. Deterministik dinonaktifkan oleh admin.';
      meta.grounded = 'skipped';
      meta.used = false;
      return selengkap(meta, { ...dasar.response, narasi: meta.reason, rekomendasi: [] });
    }
    recordMetrics('deterministic');
    return selengkap(meta, dasar.response);
  };

  // Deterministik dimatikan admin ⇒ hentikan di sini. Tanpa pagar ini, jalur
  // LLM sukses tetap mengirim narasi (melewati selesai()), sehingga tabel
  // kendali di panel admin tidak benar-benar berlaku.
  if (deterministikMati) {
    return selesai('Deterministik dinonaktifkan oleh admin', 'service-unavailable');
  }

  // 1. Tanpa evidence → tidak ada yang bisa dirangkai. Hemat 100% panggilan model.
  if (dasar.evidence.length === 0) return selesai('evidence kosong — model tidak dipanggil', 'no-evidence');

  const cfg = getAiConfig();
  // Toggle admin menang: AI dinonaktifkan admin ⇒ tidak ada panggilan model,
  // apa pun isi AI_ENABLED/AI_SHADOW.
  const aktif = isAiEnabled(cfg) && aiToggleOn;
  const shadow = isAiShadow(cfg) && aiToggleOn;
  if (!aktif && !shadow) {
    return selesai(
      aiToggleOn ? (aiStatusReason(cfg) ?? 'AI nonaktif') : 'AI dinonaktifkan oleh admin',
      'unconfigured',
    );
  }

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
  // Tandai: model dicoba (berhasil/gagal) — bedakan dari skip hemat/terbatas.
  meta.attempted = true;

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
    const errMsg = e instanceof Error ? e.message : String(e);
    // Kegagalan panggil JANGAN diam: tanpa baris ini, throttle gateway hanya
    // terlihat sebagai "model tak dipanggil" di metrik (terukur 2026-09-05:
    // 50 panggilan hilang tanpa jejak). Query di sini sudah lewat pagar PII.
    console.error('[ai-error]', JSON.stringify({
      query: opts.query.slice(0, 120), tahap: 'panggil',
      galat: errMsg.slice(0, 200),
    }));
    return selesai(`panggilan model gagal: ${errMsg}`, undefined, errMsg);
  }

  // 7. Parse skema — gagal = jatuh ke deterministik, tidak pernah menampilkan mentah.
  const terurai = parseLlmAnswer(mentah);
  if (!terurai.ok) {
    meta.model = cfg.model || null;
    meta.provider = cfg.provider;
    console.error('[ai-error]', JSON.stringify({
      query: opts.query.slice(0, 120), tahap: 'parse',
      finishReason: finishReason ?? null, mentah: mentah.slice(0, 200),
    }));
    return selesai(terurai.error, undefined, terurai.error);
  }

  // 8. Eject token {{id}} → nilai asli dari evidence.
  const ejected = ejectTokens(terurai.data.narasi, dasar.evidence);
  meta.unknownTokens = ejected.unknown.length;

  const extraAllowedNumbers = [statistik.totalRecord, statistik.totalOpd, statistik.evidenceDihitung];
  const rekomendasiAman = terurai.data.rekomendasi.filter((r) => isGroundedText(r, dasar.evidence, { extraAllowedNumbers }).ok);
  const followUpsAman = terurai.data.followUps.filter((r) => isGroundedText(r, dasar.evidence, { extraAllowedNumbers }).ok);

  let responsAi: HybridResponse = {
    narasi: dedupUnits(ejected.text, dasar.evidence),
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
    recordMetrics('deterministic');
    return selengkap(meta, dasar.response);
  }

  await cacheSet(cacheKey, { response: responsAi, ai: meta }, CACHE_TTL_MS);
  recordMetrics('llm');
  return selengkap(meta, responsAi);
}
