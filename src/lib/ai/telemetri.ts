// ─── NFR-07: telemetri terstruktur per tahap (retrieval · prompt · model · grounding · gerbang) ───
//
// MASALAH
// Sebelum modul ini, sistem tahu satu angka: `latencyMs` total. Itu cukup untuk
// menyimpulkan "lambat", tetapi tidak untuk mengetahui SIAPA yang lambat. Pada
// 21–23 Sep 2026 pertanyaan seperti "mengapa jawaban ini 11 detik?" hanya bisa
// dijawab dengan menebak: apakah retrieval-nya yang berat, prompt-nya yang
// panjang, modelnya yang lambat, atau gerbangnya yang mengulang pekerjaan?
// Tanpa pemecahan per tahap, satu-satunya cara menjawabnya adalah menambah
// console.time secara manual — dan itu hilang begitu masalahnya selesai.
//
// SOLUSI
// Dua lapis, disengaja terpisah:
//   1. SATU baris log JSON per permintaan, berawalan `[gen_ai]`, memuat durasi
//      tiap tahap + medan bernama sesuai OpenTelemetry GenAI semantic
//      conventions (`gen_ai.*`). Medan konvensi dipakai supaya log ini bisa
//      diserap backend observabilitas apa pun tanpa penerjemahan.
//   2. AGREGAT bergulir (jendela N sampel terakhir per tahap) yang disimpan di
//      penyimpanan bersama, sehingga p50/p95 tetap terbaca setelah log platform
//      kedaluwarsa (Vercel Hobby hanya menyimpan log 1 jam — terukur). Agregat
//      juga muncul di log sebagai baris `[gen_ai-rekap]`, sehingga pertanyaan
//      "p95 per tahap terlihat di log?" dijawab YA, bukan "buka dasbor dulu".
//
// KEPUTUSAN YANG DIPEGANG
//   • TIDAK ADA isi permintaan di log. Yang dicatat hanya metadata: id anonim,
//     jumlah bukti, niat yang terdeteksi, durasi, token. Ini sejalan dengan
//     anjuran semconv "content capture opt-in only" — dan berarti telemetri
//     tidak bisa menjadi jalur baru bagi PII masuk ke log.
//   • Tidak pernah melempar dan tidak pernah menahan jawaban. Penulisan agregat
//     bersifat best-effort (gagal senyap); pengukuran selalu `Date.now()` yang
//     murah, tanpa I/O di jalur kritis.
//   • Konvensi `gen_ai.*` masih pra-stabil (v1.42.0, Jun 2026 memindahkannya ke
//     repo tersendiri; belum ada 1.0). Karena itu medan internal kita memakai
//     nama sendiri (`tahap.*`) dan `gen_ai.*` DITURUNKAN darinya — bila
//     konvensi berubah nama, cukup satu berkas ini yang disesuaikan, dan log
//     lama tetap terbaca.
//   • Dapat dimatikan: `SAPA_TELEMETRI=off` (untuk pembanding A/B dan untuk
//     lingkungan yang tidak ingin tambahan log).

import { AsyncLocalStorage } from 'node:async_hooks';
import { activeBackend, cacheGet, cacheSet } from '@/lib/store';

/** Tahap yang diukur. Lima pertama adalah kriteria NFR-07 di dokumen 10. */
export type TahapTelemetri =
  | 'pengambilan_data' // ambil katalog dari SPLP (route)
  | 'indeks_semantik' // panaskan indeks FR-12 (route)
  | 'retrieval' // skor leksikal + semantik → jawaban dasar (compose)
  | 'prompt' // bangun prompt terperiksa (FR-23)
  | 'model' // panggilan penyedia model (llm-client)
  | 'grounding' // isGrounded + catatan wajib terjaga
  | 'gerbang'; // gerbang nilai-tambah + pemeriksa pasangan entitas (FR-24)

/** Urutan pelaporan tetap — supaya log bisa dibaca mata tanpa diurutkan. */
export const TAHAP_URUT: TahapTelemetri[] = [
  'pengambilan_data',
  'indeks_semantik',
  'retrieval',
  'prompt',
  'model',
  'grounding',
  'gerbang',
];

interface CatatanTahap {
  /** Total milidetik tahap ini (bila dipanggil berkali-kali, dijumlahkan). */
  ms: number;
  /** Berapa kali tahap ini berjalan (mis. pemeriksa pasangan bisa >1 kali). */
  dipanggil: number;
  /** Medan tambahan khas tahap (model: token, selesai: finish reason, …). */
  tambahan: Record<string, unknown>;
}

interface KonteksTelemetri {
  id: string;
  jalan: string;
  mulai: number;
  tahap: Partial<Record<TahapTelemetri, CatatanTahap>>;
  hasil: Record<string, unknown>;
  /**
   * true = konteks ini yang WAJIB menutup episode (menulis log). Konteks yang
   * hanya menumpang tidak menulis apa pun, sehingga satu permintaan = satu baris.
   */
  pemilik: boolean;
}

const als = new AsyncLocalStorage<KonteksTelemetri>();

const KEY = 'sapa:telemetri:v1';
/** TTL panjang: agregat adalah riwayat operasional, bukan cache. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function envOff(nama: string, bawaan: boolean): boolean {
  const raw = process.env[nama];
  if (raw == null || raw === '') return bawaan;
  return /^(1|true|yes|ya|on)$/i.test(raw.trim());
}

function angkaEnv(nama: string, bawaan: number): number {
  const n = Number(process.env[nama]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : bawaan;
}

/** Telemetri aktif? `SAPA_TELEMETRI=off` mematikannya sepenuhnya. */
export function telemetriAktif(): boolean {
  const raw = process.env['SAPA_TELEMETRI'];
  return !(raw != null && /^(off|0|false|no|tidak|mati)$/i.test(raw.trim()));
}

/** Jumlah sampel yang ditahan per tahap (jendela agregat). */
export function jendelaTelemetri(): number {
  return angkaEnv('SAPA_TELEMETRI_JENDELA', 200);
}

/** Setiap berapa permintaan baris rekap p50/p95 ditulis ke log. */
export function rekapSetiap(): number {
  return angkaEnv('SAPA_TELEMETRI_REKAP_N', 20);
}

// ─── Konteks per permintaan ──────────────────────────────────────────────────

/** Id anonim pendek untuk mengaitkan baris log dengan permintaan. Tanpa PII. */
function idPermintaan(): string {
  const acak = Math.random().toString(36).slice(2, 8);
  return `q-${Date.now().toString(36)}-${acak}`;
}

export interface MetaPermintaan {
  /** 'json' | 'stream' | 'uji' | bebas. */
  jalan: string;
  /** Medan awal hasil (mis. mode, ip-hash tidak dipakai — jangan pernah isi PII). */
  hasil?: Record<string, unknown>;
}

/**
 * Jalankan `fn` di dalam konteks telemetri.
 *
 * Bila sudah ada konteks berjalan (mis. route membuka konteks, lalu memanggil
 * composeAnswer), konteks itu DIPAKAI ULANG — tidak ada konteks bersarang dan
 * tidak ada baris log ganda. Yang membuka konteks pertamalah yang menulis log.
 */
export async function denganTelemetri<T>(meta: MetaPermintaan, fn: () => Promise<T>): Promise<T> {
  if (!telemetriAktif()) return fn();

  const ada = als.getStore();
  if (ada) return fn(); // menumpang: konteks luar yang akan menutup

  const konteks: KonteksTelemetri = {
    id: idPermintaan(),
    jalan: meta.jalan,
    mulai: Date.now(),
    tahap: {},
    hasil: { ...(meta.hasil ?? {}) },
    pemilik: true,
  };

  try {
    return await als.run(konteks, fn);
  } finally {
    // Ditulis di `finally`: permintaan yang berakhir dengan galat pun tetap
    // meninggalkan jejak durasi tahapnya — justru itu yang paling dibutuhkan.
    try {
      tutupKonteks(konteks);
    } catch {
      /* telemetri tidak boleh menggagalkan permintaan */
    }
  }
}

/** Catat durasi satu tahap. Aman dipanggil di luar konteks (diam saja). */
export function catatTahap(nama: TahapTelemetri, ms: number, tambahan?: Record<string, unknown>): void {
  const k = als.getStore();
  if (!k) return;
  const ada = k.tahap[nama] ?? { ms: 0, dipanggil: 0, tambahan: {} };
  k.tahap[nama] = {
    ms: ada.ms + Math.max(0, Math.round(ms)),
    dipanggil: ada.dipanggil + 1,
    tambahan: tambahan ? { ...ada.tambahan, ...tambahan } : ada.tambahan,
  };
}

/** Ukur pemanggilan fungsi sinkron/async sebagai satu tahap. */
export function ukurTahap<T>(nama: TahapTelemetri, fn: () => T, tambahan?: () => Record<string, unknown>): T {
  const t0 = Date.now();
  try {
    const hasil = fn();
    catatTahap(nama, Date.now() - t0, tambahan?.());
    return hasil;
  } catch (e) {
    catatTahap(nama, Date.now() - t0, { ...(tambahan?.() ?? {}), galat: true });
    throw e;
  }
}

/** Bentuk `ukurTahap` untuk fungsi async (mis. panggilan jaringan). */
export async function ukurTahapAsync<T>(
  nama: TahapTelemetri,
  fn: () => Promise<T>,
  tambahan?: () => Record<string, unknown>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const hasil = await fn();
    catatTahap(nama, Date.now() - t0, tambahan?.());
    return hasil;
  } catch (e) {
    catatTahap(nama, Date.now() - t0, { ...(tambahan?.() ?? {}), galat: true });
    throw e;
  }
}

export interface InfoModel {
  sukses: boolean;
  model?: string | null;
  penyedia?: string | null;
  tokenMasuk?: number;
  tokenKeluar?: number;
  finishReason?: string | null;
  /** Milidetik sampai potongan pertama (hanya jalur streaming). */
  ttfbMs?: number;
  galat?: string | null;
}

/**
 * Catat panggilan model — dipanggil dari llm-client (kedua jalur: JSON & SSE).
 * Nama medannya mengikuti semconv: token MASUK/KELUAR, bukan prompt/completion.
 */
export function catatModel(ms: number, info: InfoModel): void {
  catatTahap('model', ms, {
    sukses: info.sukses,
    model: info.model ?? null,
    penyedia: info.penyedia ?? null,
    ...(info.sukses
      ? {
          token_masuk: info.tokenMasuk ?? null,
          token_keluar: info.tokenKeluar ?? null,
          finish_reason: info.finishReason ?? null,
        }
      : {}),
    ...(info.ttfbMs != null ? { ttfb_ms: info.ttfbMs } : {}),
    ...(info.galat ? { galat: String(info.galat).slice(0, 120) } : {}),
  });
}

/** Catat ringkasan hasil (dipanggil dari corong keluaran composeAnswer). */
export function catatHasil(info: Record<string, unknown>): void {
  const k = als.getStore();
  if (!k) return;
  k.hasil = { ...k.hasil, ...info };
}

/** true bila sedang di dalam konteks telemetri (untuk uji & diagnosa). */
export function adaKonteks(): boolean {
  return Boolean(als.getStore());
}

// ─── Bentuk baris log ───────────────────────────────────────────────────────

/** Persentil dengan metode nearest-rank (deterministik, tidak menebak). */
export function hitungPersentil(sampel: number[], p: number): number {
  if (!sampel.length) return 0;
  const urut = [...sampel].sort((a, b) => a - b);
  const posisi = Math.min(urut.length - 1, Math.max(0, Math.ceil((p / 100) * urut.length) - 1));
  return urut[posisi];
}

/**
 * Medan bernama sesuai OTel GenAI semantic conventions (v1.42.0, Jun 2026).
 * Semuanya pra-stabil — lihat catatan di kepala berkas ini.
 */
function turunkanGenAi(jalan: string, hasil: Record<string, unknown>, tahap: KonteksTelemetri['tahap']): Record<string, unknown> {
  const model = tahap.model;
  const t = model?.tambahan ?? {};
  const gen: Record<string, unknown> = {
    'gen_ai.operation.name': 'chat',
    'gen_ai.provider.name': t.penyedia ?? null,
    'gen_ai.request.model': t.model ?? null,
    // Konvensi: finish_reasons berupa ARRAY (satu respons bisa punya >1 pilihan).
    'gen_ai.response.finish_reasons': t.finish_reason ? [t.finish_reason] : [],
  };
  if (typeof t.token_masuk === 'number') gen['gen_ai.usage.input_tokens'] = t.token_masuk;
  if (typeof t.token_keluar === 'number') gen['gen_ai.usage.output_tokens'] = t.token_keluar;
  if (t.galat) gen['error.type'] = String(t.galat).slice(0, 60);
  // Milik sendiri (bukan semconv, disengaja): penanda jalan & mode supaya log
  // bisa dipilah tanpa harus tahu bentuk respons aplikasi.
  gen['sapa.jalan'] = jalan;
  gen['sapa.mode'] = hasil.mode ?? null;
  return gen;
}

function susunBaris(k: KonteksTelemetri, totalMs: number): Record<string, unknown> {
  const tahap: Record<string, unknown> = {};
  for (const nama of TAHAP_URUT) {
    const t = k.tahap[nama];
    if (!t) continue;
    tahap[nama] = { ms: t.ms, dipanggil: t.dipanggil, ...t.tambahan };
  }
  const jumlahTahap = TAHAP_URUT.reduce((n, nama) => n + (k.tahap[nama]?.ms ?? 0), 0);
  return {
    waktu: new Date().toISOString(),
    permintaan: k.id,
    jalan: k.jalan,
    total_ms: totalMs,
    jumlah_tahap_ms: jumlahTahap,
    tahap,
    hasil: k.hasil,
    gen_ai: turunkanGenAi(k.jalan, k.hasil, k.tahap),
  };
}

/** Tulis satu baris `[gen_ai]` ke log dan perbarui agregat (nirblokir). */
function tutupKonteks(k: KonteksTelemetri): void {
  const totalMs = Date.now() - k.mulai;
  const baris = susunBaris(k, totalMs);
  // Satu baris JSON — mudah di-grep, mudah di-parse backend.
  console.log('[gen_ai]', JSON.stringify(baris));
  void catatAgregat(k, totalMs).catch(() => {
    /* agregat best-effort */
  });
}

// ─── Agregat bergulir (p50/p95 per tahap) ───────────────────────────────────

export interface RingkasTahap {
  /** Jumlah sampel yang ditahan (≤ jendela). */
  n: number;
  p50: number;
  p95: number;
  maks: number;
  rata: number;
  /** Total kejadian sejak proses/agregat dimulai (tidak dipotong jendela). */
  kejadian: number;
}

export interface AgregatTelemetri {
  jendela: number;
  tahap: Record<string, { sampel: number[]; kejadian: number }>;
  jumlah: {
    permintaan: number;
    tahapLengkap: number;
    modelDipanggil: number;
    modelGagal: number;
    tanpaBukti: number;
    fallback: number;
  };
  logTerakhir: { waktu: string; totalMs: number } | null;
  backend: string;
  diperbaruiPada: string | null;
}

const KOSONG: Omit<AgregatTelemetri, 'backend'> = {
  jendela: 200,
  tahap: {},
  jumlah: { permintaan: 0, tahapLengkap: 0, modelDipanggil: 0, modelGagal: 0, tanpaBukti: 0, fallback: 0 },
  logTerakhir: null,
  diperbaruiPada: null,
};

/** Antrean tulis agregat, supaya dua permintaan paralel tidak saling menimpa. */
let rantaiTulis: Promise<void> = Promise.resolve();

async function catatAgregat(k: KonteksTelemetri, totalMs: number): Promise<void> {
  const jendela = jendelaTelemetri();
  const simpan = envOff('SAPA_TELEMETRI_SIMPAN', true);

  const jalan = async (): Promise<AgregatTelemetri> => {
    const lama: AgregatTelemetri | null = simpan ? await cacheGet<AgregatTelemetri>(KEY) : null;
    const ag: AgregatTelemetri = {
      ...KOSONG,
      ...(lama ?? {}),
      jendela,
      jumlah: { ...KOSONG.jumlah, ...(lama?.jumlah ?? {}) },
      tahap: { ...(lama?.tahap ?? {}) },
      backend: activeBackend(),
    };

    for (const nama of TAHAP_URUT) {
      const t = k.tahap[nama];
      if (!t) continue;
      const sel = ag.tahap[nama] ?? { sampel: [], kejadian: 0 };
      const sampel = [...sel.sampel, t.ms].slice(-jendela);
      ag.tahap[nama] = { sampel, kejadian: sel.kejadian + 1 };
    }

    ag.jumlah.permintaan += 1;
    const lengkap = ['retrieval', 'prompt', 'grounding', 'gerbang'].every((n) => Boolean(k.tahap[n as TahapTelemetri]));
    if (lengkap) ag.jumlah.tahapLengkap += 1;
    if (k.tahap.model?.tambahan.sukses === true) ag.jumlah.modelDipanggil += 1;
    if (k.tahap.model?.tambahan.sukses === false) ag.jumlah.modelGagal += 1;
    if (k.hasil.mode === 'tanpa-bukti' || k.hasil.mode === 'deterministik-tanpa-bukti') ag.jumlah.tanpaBukti += 1;
    if (k.hasil.fallback === true) ag.jumlah.fallback += 1;
    ag.logTerakhir = { waktu: new Date().toISOString(), totalMs };
    ag.diperbaruiPada = new Date().toISOString();
    ag.backend = activeBackend();

    if (simpan) {
      // Penyimpanan bersama: tanpa Redis, `cacheSet` hanya menulis ke memori
      // proses (murah); dengan Redis, dua perintah per permintaan — terukur
      // masih jauh di bawah kuota gratis Upstash pada lalu lintas SAPA.
      await cacheSet(KEY, { ...ag, backend: undefined }, TTL_MS);
    }
    return ag;
  };

  const hasil = rantaiTulis.then(jalan).catch(() => null);
  rantaiTulis = hasil.then(() => undefined);
  const ag = await hasil;
  if (!ag) return;

  // Baris rekap: p50/p95 per tahap MASUK LOG (kriteria NFR-07), tidak hanya
  // tersimpan di penyimpanan. Ditulis tiap `SAPA_TELEMETRI_REKAP_N` permintaan.
  const setiap = rekapSetiap();
  if (setiap > 0 && ag.jumlah.permintaan % setiap === 0) {
    console.log('[gen_ai-rekap]', JSON.stringify(ringkasUntukLog(ag, `otomatis-${setiap}`)));
  }
}

/** Ringkasan p50/p95 yang layak masuk log (tanpa sampel mentah). */
export function ringkasUntukLog(ag: AgregatTelemetri, sebab: string): Record<string, unknown> {
  const tahap: Record<string, RingkasTahap> = {};
  for (const nama of TAHAP_URUT) {
    const sel = ag.tahap[nama];
    if (!sel || !sel.sampel.length) continue;
    tahap[nama] = ringkasTahap(sel.sampel, sel.kejadian);
  }
  return {
    waktu: new Date().toISOString(),
    sebab,
    jendela: ag.jendela,
    jumlah: ag.jumlah,
    tahap,
    backend: ag.backend,
  };
}

export function ringkasTahap(sampel: number[], kejadian = sampel.length): RingkasTahap {
  const n = sampel.length;
  if (!n) return { n: 0, p50: 0, p95: 0, maks: 0, rata: 0, kejadian };
  const total = sampel.reduce((a, b) => a + b, 0);
  return {
    n,
    p50: hitungPersentil(sampel, 50),
    p95: hitungPersentil(sampel, 95),
    maks: Math.max(...sampel),
    rata: Math.round((total / n) * 10) / 10,
    kejadian,
  };
}

/**
 * Tunggu penulisan agregat yang tertunda.
 *
 * MEMBACA telemetri selalu melalui fungsi ini lebih dulu. Alasannya nyata:
 * penulisan agregat sengaja nirblokir (tidak boleh menahan jawaban warga),
 * sehingga pembaca yang datang terlalu cepat bisa melihat keadaan SATU
 * permintaan yang lalu. Itu bukan sekadar bikin bingung — uji otomatis akan
 * membandingkan p95 yang dilaporkan dengan p95 dari log, dan selisih satu
 * sampel saja sudah membuat perbandingan itu gagal. Menunggu di sisi PEMBACA
 * tidak menambah biaya apa pun di jalur permintaan.
 */
export async function tungguAgregatSelesai(): Promise<void> {
  await rantaiTulis.catch(() => undefined);
}

/** Baca agregat (untuk /api/status dan endpoint admin). Tidak pernah melempar. */
export async function bacaAgregat(): Promise<AgregatTelemetri> {
  await tungguAgregatSelesai();
  try {
    const tersimpan = await cacheGet<AgregatTelemetri>(KEY);
    return {
      ...KOSONG,
      ...(tersimpan ?? {}),
      jendela: tersimpan?.jendela ?? jendelaTelemetri(),
      jumlah: { ...KOSONG.jumlah, ...(tersimpan?.jumlah ?? {}) },
      tahap: { ...(tersimpan?.tahap ?? {}) },
      backend: activeBackend(),
    };
  } catch {
    return { ...KOSONG, backend: activeBackend() };
  }
}

/** Ringkasan siap-tampil (persentil dihitung dari sampel yang ditahan). */
export async function ringkasTelemetri(): Promise<{
  aktif: boolean;
  jendela: number;
  rekapSetiap: number;
  tahap: Record<string, RingkasTahap>;
  jumlah: AgregatTelemetri['jumlah'];
  backend: string;
  diperbaruiPada: string | null;
  logTerakhir: AgregatTelemetri['logTerakhir'];
}> {
  const ag = await bacaAgregat();
  const tahap: Record<string, RingkasTahap> = {};
  for (const nama of TAHAP_URUT) {
    const sel = ag.tahap[nama];
    if (!sel || !sel.sampel.length) continue;
    tahap[nama] = ringkasTahap(sel.sampel, sel.kejadian);
  }
  return {
    aktif: telemetriAktif(),
    jendela: ag.jendela,
    rekapSetiap: rekapSetiap(),
    tahap,
    jumlah: ag.jumlah,
    backend: ag.backend,
    diperbaruiPada: ag.diperbaruiPada,
    logTerakhir: ag.logTerakhir,
  };
}

/**
 * Tulis baris rekap SEKARANG (dipakai endpoint admin `?rekap=1`).
 * Mengembalikan baris yang ditulis supaya pemanggil bisa membandingkan apa yang
 * masuk log dengan apa yang dilaporkan API — bukti, bukan klaim.
 */
export async function tulisRekapSekarang(sebab = 'manual'): Promise<Record<string, unknown>> {
  const ag = await bacaAgregat();
  const baris = ringkasUntukLog({ ...ag, jendela: ag.jendela || jendelaTelemetri() }, sebab);
  console.log('[gen_ai-rekap]', JSON.stringify(baris));
  return baris;
}

/** Nolkan agregat (endpoint admin `?nolkan=1`) — untuk mengukur efek perubahan. */
export async function nolkanAgregat(): Promise<void> {
  await cacheSet(KEY, { ...KOSONG, diperbaruiPada: new Date().toISOString() }, TTL_MS);
}
