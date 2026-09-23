// ─── Penyusun jawaban: deterministik + AI (mode aktif / shadow) ───
//
// Urutan yang tidak boleh diubah:
//   retrieval → (evidence kosong? JANGAN panggil model) → cache → batas harian
//   → model → parse skema → eject token {{id}} → GROUNDING → fallback deterministik
//
// Grounding dijalankan SEBELUM format presentasi, dan model tidak pernah menulis
// angka sendiri: narasi ber-token {{id}} diganti oleh kode dengan nilai evidence.

import { buildDeterministicAnswer } from '@/services/deterministic-answer';
import { klasifikasiSebab, type Diagnosa } from '@/services/sebab-kegagalan';
import {
  isGrounded,
  isGroundedText,
  hitungSitasi,
  catatanTerjaga,
  formatAngkaPresentasi,
  type EvidenceItem,
} from '@/services/grounding';
import { getAiConfig, isAiEnabled, isAiShadow, aiStatusReason, type AiConfig } from '@/lib/ai/env';
import { isAiToggleEnabled, isDetToggleEnabled, readToggleState, toggleBackend } from '@/lib/ai/toggle';
import { buildPromptTerperiksa } from '@/lib/ai/prompt';
import { adaPenandaMencurigakan, teksSajianAman } from '@/lib/ai/bersih-data';
import { deteksiNiat } from '@/lib/intent-meta';
import { parseLlmAnswer } from '@/lib/ai/schema';
import { ejectTokens, createStreamEjector, dedupUnits } from '@/lib/ai/tokens';
import { guardQuery, cekDataPribadi, cekPermintaanPerOrang } from '@/lib/ai/guard';
import { callLlmText, streamLlm, extractNarasiPartial } from '@/lib/ai/llm-client';
import { checkRateLimit } from '@/lib/rate-limit';
import { cacheGet, cacheSet, incrementCounter, peekCounter, type CounterResult } from '@/lib/store';
import { bacaKesehatan, ringkasKesehatan } from '@/lib/ai/provider-health';
import { normalizeText, dataSourceLabel, daftarKecamatan, type SapaRecord } from '@/lib/sapa-client';
import {
  periksaPasanganEntitas,
  ringkasPemeriksaan,
  penjelasanPemeriksaan,
  type HasilPemeriksaan,
} from '@/services/pemeriksa-entitas';
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
  /** Niat yang dikirim ke model (router deterministik) — untuk audit & dasbor. */
  intent?: string;
  /** Kata pemicu niat, mis. 'perbandingan:"bandingkan"'. */
  intentPemicu?: string[];
  /**
   * Gerbang nilai-tambah: 'dipakai' | 'ditolak-tidak-menambah' | 'ditolak-catatan-hilang'.
   *
   * Mengapa ada: pertanyaan pemilik aplikasi — "kenapa AI aktif malah kalah dari
   * deterministik?". Terukur pada penyedia tiruan (21 Sep 2026): narasi AI
   * menyitir jumlah bukti yang SAMA (2,50 vs 2,60) tetapi MENGHAPUS peringatan
   * keterbatasan data. Tanpa gerbang ini, mode AI = menukar kesetaraan informasi
   * dengan kehalusan bahasa. Sekarang AI hanya dipakai bila terbukti tidak kalah.
   */
  nilaiTambah?:
    | 'dipakai'
    | 'dipakai-dengan-catatan'
    | 'ditolak-tidak-menambah'
    | 'ditolak-grounding'
    | 'ditolak-pasangan-entitas';
  /**
   * FR-24: hasil pemeriksaan pasangan entitas atas narasi model. Diisi hanya
   * bila gerbang benar-benar memeriksa narasi AI (`keras > 0` ⇒ narasi ditolak).
   */
  pasanganEntitas?: { ok: boolean; keras: number; lunak: number; jumlahNilai: number; jumlahKalimat: number };
  /**
   * FR-23: ringkasan pembersihan data katalog sebelum masuk prompt. Selalu ada
   * pada jalur yang benar-benar memanggil model; `selDibersihkan > 0` berarti ada
   * teks dari SPLP yang menyerupai perintah/struktur prompt dan telah dinetralkan.
   */
  pembersihan?: { selDiperiksa: number; selDibersihkan: number; selDipotong: number;
    karakterDibuang: number; penandaDinetralkan: number; perintahDinetralkan: number;
    jenisTersentuh: string[] };
  /**
   * FR-23 (lapis tampilan): baris bukti yang teks sumbernya memuat penanda
   * mencurigakan (karakter tak terlihat/bidi, penanda peran, pembatas prompt).
   * Balasan tetap mengutip data apa adanya; daftar ini hanya memberi tahu klien
   * bahwa baris tersebut perlu disanitasi saat DITAMPILKAN.
   */
  penandaData?: { id: string; indikator: string }[];
  /** FR-24: rincian temuan keras yang membuat narasi model ditolak (untuk audit). */
  alasanPasangan?: string[];
  /** Peringatan bakU yang disisipkan aplikasi karena model memarafrasekannya. */
  catatanDisisipkan?: string[];
  /** Sitasi (jumlah nilai evidence yang muncul di narasi) masing-masing jalur. */
  sitasiAi?: number;
  sitasiDeterministik?: number;
}

export interface ComposeResult {
  response: HybridResponse;
  evidence: EvidenceItem[];
  ai: AiMeta;
  /**
   * FR-20: sebab jawaban ini — satu tag `lapis:rincian` + status menjawab/jujur.
   * Selalu terisi, termasuk untuk jawaban yang BERHASIL (supaya dasbor bisa
   * membandingkan "terjawab lewat makna" vs "terjawab lewat kata").
   */
  diagnosa: Diagnosa;
  /**
   * FR-24: hasil pemeriksaan pasangan entitas atas narasi yang BENAR-BENAR
   * disajikan (model atau deterministik). Selalu diisi supaya: (a) uji invarians
   * eval dapat menolak satu pun temuan keras, dan (b) operator bisa melihat
   * angka mana yang pasangannya diragukan pada jawaban nyata.
   */
  pemeriksaan: HasilPemeriksaan;
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
  /** Apakah penyedia BENAR-BENAR menjawab — bukan sekadar env terisi.
   *  Diukur dari hasil panggilan nyata (circuit breaker), lihat provider-health.ts. */
  reachable?: boolean;
  /** Rincian kesehatan penyedia (sebab kegagalan terakhir, sisa cooldown). */
  health?: ReturnType<typeof ringkasKesehatan>;
  toggles?: { aiEnabled: boolean; detEnabled: boolean; backend: 'redis' | 'memory'; updatedAt: string };
  metrics: {
    deterministicToday: number;
    llmToday: number;
    ratio: { deterministic: number; llm: number };
  };
}> {
  const cfg = getAiConfig();
  // BACA, jangan TAMBAH. Versi sebelumnya memakai incrementCounter() lalu
  // mengurangi 1 — artinya setiap pemanggilan /api/status (halaman status,
  // polling monitoring, sidebar) ikut menggerogoti kuota AI_DAILY_CALL_LIMIT
  // tanpa satu pun panggilan model. Penghitung harian hanya boleh naik karena
  // panggilan model yang benar-benar terjadi.
  const dailyUsed = cfg.dailyCallLimit ? await peekCounter(`ai:llm:${tanggalHariIni()}`) : 0;

  // Toggle admin menang atas env: status harus mencerminkan apa yang benar-benar
  // dikirim ke pengguna, bukan sekadar isi AI_ENABLED.
  //
  // Semantik (dikoreksi pemilik 2026-09-19): "deterministik" adalah JAWABAN
  // TEMPLATE. Mematikannya melarang jawaban template, bukan mematikan layanan —
  // selama AI masih hidup, jawaban AI tetap disajikan (tanpa fallback template).
  const toggle = await readToggleState();
  const backend = toggleBackend();
  const dariEnv = isAiEnabled(cfg) ? 'active' : isAiShadow(cfg) ? 'shadow' : 'inactive';
  const aiHidup = dariEnv !== 'inactive' && toggle.aiEnabled;
  const state: 'active' | 'shadow' | 'inactive' = aiHidup ? dariEnv : 'inactive';
  const reason =
    !toggle.aiEnabled && !toggle.detEnabled
      ? 'AI dan deterministik dinonaktifkan oleh admin — layanan tidak dapat diakses'
      : !toggle.aiEnabled
        ? 'AI dinonaktifkan oleh admin — jawaban deterministik saja'
        : !toggle.detEnabled
          ? 'Deterministik dinonaktifkan oleh admin — jawaban AI saja, tanpa fallback template'
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

  // Kesehatan nyata penyedia: status "active" TIDAK boleh berarti "niat aktif"
  // padahal setiap panggilan gagal (terukur 2026-09-21: state=active sementara
  // semua panggilan 403 "subscription required").
  const kesehatan = ringkasKesehatan(await bacaKesehatan());
  const reasonJujur =
    state !== 'inactive' && !kesehatan.reachable
      ? `${reason ? `${reason}; ` : ''}penyedia tidak dapat dijangkau — ${kesehatan.sebab ?? 'galat'}${kesehatan.pesan ? `: ${kesehatan.pesan}` : ''}`
      : reason;

  return {
    state,
    provider: cfg.provider,
    model: cfg.model || null,
    reason: reasonJujur,
    dailyUsed: Math.max(0, dailyUsed),
    reachable: kesehatan.reachable,
    health: kesehatan,
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
  return peekCounter(key);
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
    await recordMetrics('deterministic');
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
      // Tidak ada narasi data yang disajikan ⇒ tidak ada pasangan untuk diperiksa.
      pemeriksaan: { ok: true, jumlahNilai: 0, jumlahKalimat: 0, keras: 0, lunak: 0, temuan: [] },
      diagnosa: klasifikasiSebab({
        jumlahBukti: 0,
        pagar: pagarNik ? 'nik' : 'per-orang',
        ai: { used: false, grounded: 'skipped', limitedBy: 'guard' },
      }),
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

  /**
   * Susun hasil akhir + sebabnya (FR-20).
   *
   * Sebab dihitung dari fakta yang SAMA untuk semua jalur keluar, sehingga
   * jawaban yang di-cache, jawaban yang ditolak gerbang, dan jawaban murni
   * deterministik tidak mungkin diberi tag yang berbeda untuk keadaan yang sama.
   */
  /**
   * Kosakata wilayah untuk FR-24. Dihitung SEKALI per permintaan: daftar ini
   * berasal dari katalog yang sedang dipegang, jadi pemeriksa memakai wilayah
   * yang benar-benar ada di data — bukan daftar kecamatan yang ditulis di kode.
   */
  const kosakataKecamatan = daftarKecamatan(opts.records);

  /**
   * Konstanta sistem yang sah walau bukan nilai bukti.
   *
   * Daftar ini SENGAJA sama dengan daftar yang dipakai uji invarians eval
   * (`eval-run.mjs`): jumlah record katalog, jumlah OPD katalog, jumlah baris
   * bukti, jumlah OPD & indikator UNIK DI DALAM bukti (narasi deterministik
   * menulis "15 indikator unik dari 13 OPD"), jumlah record yang cocok, dan
   * tahun yang diminta pengguna. Terukur 23 Sep 2026: tanpa dua hitungan unik
   * itu, gerbang FR-24 menuduh narasi deterministik sendiri sebagai "angka tak
   * ada" — penuduhan palsu yang akan menolak jawaban yang benar.
   */
  const angkaSistem = [
    opts.records.length,
    new Set(opts.records.map((r) => r.opds_nama_opd)).size,
    dasar.evidence.length,
    new Set(dasar.evidence.map((e) => e.opd)).size,
    new Set(dasar.evidence.map((e) => e.indikator)).size,
    dasar.hits.length,
    ...(opts.query.match(/\b(?:19|20)\d{2}\b/g) ?? []),
  ];

  // Corong keluaran: SETIAP jawaban (AI maupun deterministik) lewat sini.
  // Narasi yang DISAJIKAN dibersihkan dari karakter tak terlihat/arah tulis dan
  // kalimat berperan-perintah (FR-23 lapis tampilan). Pemeriksaan FR-24 di bawah
  // sengaja tetap memakai narasi ASLI — gerbang itu memeriksa apa yang ditulis
  // model, bukan apa yang tampil setelah dibersihkan.
  const selengkap = (m: AiMeta, response: HybridResponse): ComposeResult => ({
    response: { ...response, narasi: teksSajianAman(response.narasi) },
    evidence: dasar.evidence,
    pemeriksaan: ringkasPemeriksaan(
      periksaPasanganEntitas(response.narasi, dasar.evidence, {
        kecamatan: kosakataKecamatan,
        nilaiDiizinkan: angkaSistem,
      }),
    ),
    ai: m,
    matched: dasar.hits.length,
    aggregated: dasar.aggregated,
    opds: dasar.opds,
    diagnosa: klasifikasiSebab({
      jalur: dasar.diagnosa.jalur,
      jumlahBukti: dasar.evidence.length,
      konsepAsing: dasar.diagnosa.konsepAsing,
      skorSemantik: dasar.diagnosa.skorSemantik,
      mintaPerDesa: dasar.diagnosa.mintaPerDesa,
      pagar: dasar.diagnosa.jalur === 'sistem' ? 'sistem' : undefined,
      ai: {
        used: m.used,
        grounded: m.grounded,
        nilaiTambah: m.nilaiTambah,
        limitedBy: m.limitedBy,
      },
    }),
  });

  // ─── Toggle admin (menang atas env) ───
  // Dibaca SEBELUM cek env supaya keputusan pemilik aplikasi tidak bisa
  // ditimpa oleh AI_ENABLED/AI_SHADOW di Vercel.
  const aiToggleOn = await isAiToggleEnabled();
  const detToggleOn = await isDetToggleEnabled();
  /** true bila jawaban deterministik tidak boleh disajikan lagi. */
  const deterministikMati = !detToggleOn;

  const selesai = async (alasan?: string, limitedBy?: AiMeta['limitedBy'], errorMsg?: string): Promise<ComposeResult> => {
    meta.latencyMs = Date.now() - mulai;
    if (alasan) meta.reason = alasan;
    if (limitedBy) meta.limitedBy = limitedBy;
    if (errorMsg) meta.error = errorMsg.slice(0, 200);
    // "Deterministik" = jawaban template. Kalau dimatikan admin, jalur ini
    // (satu-satunya tempat jawaban template keluar) harus menolak menyajikannya.
    // Bila AI memang berhasil menjawab, jalur itu TIDAK lewat sini sehingga
    // jawaban AI tetap normal.
    if (deterministikMati) {
      meta.limitedBy = 'service-unavailable';
      // Bedakan sebabnya: tanpa evidence bukan berarti model gagal — pesan lama
      // menyalahkan model padahal modelnya tidak pernah dipanggil.
      meta.reason =
        limitedBy === 'no-evidence'
          ? 'Tidak ada data SAPA yang relevan untuk pertanyaan ini, dan jawaban deterministik dinonaktifkan oleh admin'
          : `${alasan ? `${alasan} — ` : ''}jawaban deterministik dan AI tidak menghasilkan jawaban`;
      meta.grounded = 'skipped';
      meta.used = false;
      return selengkap(meta, { ...dasar.response, narasi: meta.reason, rekomendasi: [] });
    }
    await recordMetrics('deterministic');
    return selengkap(meta, dasar.response);
  };

  // 1. Tanpa evidence → tidak ada yang bisa dirangkai. Hemat 100% panggilan model.
  if (dasar.evidence.length === 0) return selesai('evidence kosong — model tidak dipanggil', 'no-evidence');

  const cfg = getAiConfig();
  // Toggle admin menang: AI dinonaktifkan admin ⇒ tidak ada panggilan model,
  // apa pun isi AI_ENABLED/AI_SHADOW.
  const aktif = isAiEnabled(cfg) && aiToggleOn;
  const shadow = isAiShadow(cfg) && aiToggleOn;
  if (!aktif && !shadow) {
    return selesai(
      aiToggleOn ? (aiStatusReason(cfg) ?? 'AI nonaktif') : 'AI tidak aktif',
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
  // Router niat (deterministik) mengisi `intent` yang selama ini selalu
  // 'nilai_saat_ini' — terukur 10/10 permintaan pada penyedia tiruan.
  const { niat, pemicu } = deteksiNiat(dijaga.query);
  meta.intent = niat;
  // FR-23: prompt dibangun lewat jalur terperiksa supaya pembersihan data katalog
  // (karakter kendali, penanda peran, perintah dalam data, batas panjang) terlapor.
  const { system, user, pembersihan } = buildPromptTerperiksa({
    query: dijaga.query,
    intent: niat,
    evidence: dasar.evidence,
    statistik,
    // Peringatan hasil hitungan dibawa sebagai DATA, bukan diserahkan ke model:
    // tanpa ini narasi AI menghapus keterbatasan data (terukur pada penyedia
    // tiruan: peringatan "tidak ada data tahun 2025" hilang dari jawaban).
    catatanWajib: dasar.peringatan,
    draf: dasar.response.narasi,
  });
  if (pemicu.length) meta.intentPemicu = pemicu;
  meta.pembersihan = pembersihan;
  // FR-23 (lapis tampilan): `evidence` pada balasan sengaja dikutip APA ADANYA dari
  // SPLP — operator perlu melihat teks sumber yang asli untuk audit, jadi pembersih
  // prompt TIDAK menulis ulang data yang ditampilkan. Konsekuensinya baris bukti bisa
  // memuat karakter tak terlihat/penanda peran mentah. Daripada menyembunyikannya,
  // baris seperti itu DITANDAI supaya klien dapat menampilkan dengan aman (mis.
  // membuang karakter bidi yang bisa menyamarkan urutan angka).
  const barisMencurigakan = dasar.evidence
    .filter((e) => adaPenandaMencurigakan(`${e.indikator ?? ''} ${e.satuan ?? ''} ${e.opd ?? ''}`))
    .map((e) => ({ id: String(e.id), indikator: String(e.indikator ?? '').slice(0, 120) }));
  if (barisMencurigakan.length > 0) meta.penandaData = barisMencurigakan;
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
  let terurai = parseLlmAnswer(mentah);
  if (!terurai.ok) {
    console.error('[ai-error]', JSON.stringify({
      query: opts.query.slice(0, 120), tahap: 'parse', percobaan: 1,
      finishReason: finishReason ?? null, mentah: mentah.slice(0, 200),
    }));

    // Keluaran tidak sesuai skema bersifat SAMPLING, bukan sistematis: terukur
    // 19 Sep 2026 pada deepseek-v4.1-flash, 2 dari 8 query gagal parse dan
    // keduanya berhasil saat diulang. Satu percobaan ulang jauh lebih murah
    // daripada menolak pertanyaan pengguna.
    //
    // Sengaja NON-stream: token percobaan pertama mungkin sudah tampil di klien;
    // hasil percobaan kedua menggantikannya lewat event `result` (klien mereset
    // narasi live saat menerima `result`).
    //
    // Batas anggaran: hanya bila waktu terpakai masih kecil, dan percobaan kedua
    // dibatasi 25 dtk. Terburuk 15 + 25 = 40 dtk, masih di bawah 60 dtk platform
    // dan 55 dtk klien — percobaan ulang boleh, memotong anggaran tidak.
    const terpakaiMs = Date.now() - mulai;
    if (terpakaiMs < 15_000) {
      try {
        const cfgUlang = { ...cfg, timeoutMs: Math.min(cfg.timeoutMs, 25_000) };
        const ulang = await callLlmText(cfgUlang, pesan, opts.signal);
        mentah = ulang.text;
        finishReason = ulang.finishReason ?? finishReason;
        usage = ulang.usage ?? usage;
        terurai = parseLlmAnswer(mentah);
      } catch (e) {
        console.error('[ai-error]', JSON.stringify({
          query: opts.query.slice(0, 120), tahap: 'parse-ulang',
          galat: (e instanceof Error ? e.message : String(e)).slice(0, 200),
        }));
      }
    } else {
      console.error('[ai-error]', JSON.stringify({
        query: opts.query.slice(0, 120), tahap: 'parse-ulang-dilewati',
        terpakaiMs, alasan: 'anggaran waktu tidak cukup untuk percobaan kedua',
      }));
    }
  }

  if (!terurai.ok) {
    meta.model = cfg.model || null;
    meta.provider = cfg.provider;
    console.error('[ai-error]', JSON.stringify({
      query: opts.query.slice(0, 120), tahap: 'parse', percobaan: 2,
      finishReason: finishReason ?? null, mentah: mentah.slice(0, 200),
    }));
    return selesai(terurai.error, undefined, terurai.error);
  }

  // 8. Eject token {{id}} → nilai asli dari evidence.
  const ejected = ejectTokens(terurai.data.narasi, dasar.evidence);
  meta.unknownTokens = ejected.unknown.length;

  const extraAllowedNumbers = [statistik.totalRecord, statistik.totalOpd, statistik.evidenceDihitung];
  const tahunDimintaGuard = (opts.query.match(/\b(?:19|20)\d{2}\b/g) ?? []).slice(0, 4);
  const opsiGrounding = { extraAllowedNumbers, tahunDiminta: tahunDimintaGuard };
  const rekomendasiAman = terurai.data.rekomendasi.filter((r) => isGroundedText(r, dasar.evidence, opsiGrounding).ok);
  const followUpsAman = terurai.data.followUps.filter((r) => isGroundedText(r, dasar.evidence, opsiGrounding).ok);

  let responsAi: HybridResponse = {
    narasi: dedupUnits(ejected.text, dasar.evidence),
    visualisasi: dasar.response.visualisasi, // visualisasi tetap ditentukan aturan deterministik
    rekomendasi: rekomendasiAman.length > 0 ? rekomendasiAman : dasar.response.rekomendasi,
    dataSource: dasar.response.dataSource,
    timestamp: new Date().toISOString(),
    ...(followUpsAman.length > 0 ? { followUps: followUpsAman } : {}),
  } as HybridResponse & { followUps?: string[] };

  // 9. Grounding lapis kedua (lapis pertama = narasi ber-token), lalu
  //    GERBANG NILAI-TAMBAH: AI hanya disajikan bila terbukti tidak kalah dari
  //    jawaban deterministik.
  //
  //    Dua syarat, keduanya terukur (21 Sep 2026, penyedia tiruan):
  //      (a) seluruh CATATAN_WAJIB masih tercermin di narasi — tanpa syarat ini,
  //          AI menghapus "tidak ada data untuk tahun 2025" lalu menyajikan tahun
  //          lain seolah menjawab: lebih rapi, tetapi menyesatkan;
  //      (b) sitasi (jumlah nilai bukti di narasi) tidak lebih sedikit daripada
  //          kepala jawaban deterministik (maks 3 baris pertama yang selalu
  //          ditampilkan). Tanpa syarat ini, AI menukar isi dengan kehalusan:
  //          terukur 2,50 vs 2,60 sitasi — tidak menambah apa pun.
  //
  //    Bila salah satu gagal, yang disajikan adalah jawaban deterministik LENGKAP
  //    (`dasar.response`), bukan narasi tereduksi hasil penyusunan ulang. Versi
  //    lama membangun ulang narasi dari 3 bukti pertama → pengguna mode AI justru
  //    menerima jawaban yang LEBIH MISKIN daripada mode deterministik (terukur:
  //    432 char vs 1014 char pada pertanyaan penduduk). Itu akar keluhan
  //    "AI aktif malah kalah dari deterministik".
  const tahunDiminta = (opts.query.match(/\b(?:19|20)\d{2}\b/g) ?? []).slice(0, 4);
  const cek = isGrounded(responsAi, dasar.evidence, { extraAllowedNumbers, tahunDiminta });
  const sitasiAi = hitungSitasi(responsAi.narasi, dasar.evidence);
  const sitasiDeterministik = hitungSitasi(dasar.response.narasi, dasar.evidence);
  meta.sitasiAi = sitasiAi;
  meta.sitasiDeterministik = sitasiDeterministik;

  if (!cek.ok) {
    responsAi = dasar.response;
    meta.grounded = 'replaced';
    meta.reason = cek.reasons.join('; ');
    meta.nilaiTambah = 'ditolak-grounding';
  } else {
    meta.grounded = 'pass';
    const jaga = catatanTerjaga(responsAi.narasi, dasar.peringatan);
    const ambangSitasi = Math.min(sitasiDeterministik, 3);
    if (!jaga.ok) {
      // Model memarafrasekan peringatan ("tidak ada indikator … memuat seluruh
      // kata kunci") sehingga maknanya masih ada tetapi FRASA bakunya hilang —
      // dan frasa baku itulah yang membuat pengguna langsung paham datanya tidak
      // tersedia. Membuang seluruh narasi AI karena ini berlebihan: yang
      // diperbaiki adalah kalimatnya, bukan jawabannya. Peringatan sistem (lahir
      // dari hitungan, bukan dari model) DISISIPKAN apa adanya di depan narasi
      // AI — dijalankan setelah pemeriksaan grounding, dan isinya bukan klaim
      // baru sehingga tidak perlu diverifikasi ulang.
      const sisip = jaga.hilang.length ? jaga.hilang : dasar.peringatan;
      responsAi = {
        ...responsAi,
        narasi: `${sisip.join(' ')} ${responsAi.narasi}`.replace(/\s{2,}/g, ' ').trim(),
      };
      meta.nilaiTambah = 'dipakai-dengan-catatan';
      meta.catatanDisisipkan = sisip;
      meta.reason = `peringatan sistem disisipkan: ${sisip.join(' | ').slice(0, 160)}`;
    } else if (sitasiAi < ambangSitasi) {
      responsAi = dasar.response;
      meta.nilaiTambah = 'ditolak-tidak-menambah';
      meta.reason = `narasi AI menyitir ${sitasiAi} bukti, deterministik ${sitasiDeterministik} (ambang ${ambangSitasi}) — AI tidak menambah informasi`;
    } else {
      meta.nilaiTambah = 'dipakai';
    }
  }
  // ── 10. GERBANG FR-24: pasangan entitas ─────────────────────────────────────
  //
  //    Gerbang grounding di atas memastikan setiap angka ADA di daftar bukti.
  //    Yang belum tertutup: angka yang benar tetapi DIPASANGKAN ke indikator,
  //    wilayah, atau satuan milik baris lain ("deceptive grounding"). Kalimat
  //    seperti "Produksi kopi 29.019 Jiwa menurut Dinas Kesehatan" lolos semua
  //    pemeriksaan sebelumnya karena 29.019 memang ada di bukti.
  //
  //    Ditempatkan SETELAH penolakan grounding (supaya alasan penolakan yang
  //    lebih dulu tetap yang dilaporkan) dan SEBELUM format presentasi (supaya
  //    yang diperiksa adalah teks akhir yang dilihat pengguna).
  if (meta.grounded === 'pass' && !shadow) {
    const pasangan = periksaPasanganEntitas(responsAi.narasi, dasar.evidence, {
      kecamatan: kosakataKecamatan,
      nilaiDiizinkan: angkaSistem,
    });
    meta.pasanganEntitas = {
      ok: pasangan.ok,
      keras: pasangan.keras,
      lunak: pasangan.lunak,
      jumlahNilai: pasangan.jumlahNilai,
      jumlahKalimat: pasangan.jumlahKalimat,
    };
    if (!pasangan.ok) {
      // Narasi model ditolak; pengguna menerima narasi deterministik LENGKAP
      // (bukan potongan hasil perbaikan) — sama seperti penolakan grounding.
      responsAi = dasar.response;
      meta.nilaiTambah = 'ditolak-pasangan-entitas';
      meta.reason = penjelasanPemeriksaan(pasangan) ?? 'pasangan entitas salah';
      meta.alasanPasangan = pasangan.temuan
        .filter((t) => t.keras)
        .slice(0, 4)
        .map((t) => `${t.jenis}:${t.nilai}${t.diklaim ? `→${t.diklaim}` : ''}`);
    }
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
    // Mode shadow juga mengirim jawaban template — bila deterministik dimatikan
    // admin, jalur ini pun harus menolak (kalau tidak, template tetap bocor).
    if (deterministikMati) {
      return selesai('mode shadow — jawaban template tidak diizinkan admin', 'service-unavailable');
    }
    await recordMetrics('deterministic');
    return selengkap(meta, dasar.response);
  }

  await cacheSet(cacheKey, { response: responsAi, ai: meta }, CACHE_TTL_MS);
  await recordMetrics('llm');
  return selengkap(meta, responsAi);
}
