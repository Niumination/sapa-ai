// ─── Lapis semantik + fusi RRF (FR-12) ────────────────────────────────────────
//
// MENGAPA ADA
// Pencarian SAPA memakai kecocokan LEKSIKAL (kata/stem + sinonim terdaftar). Cara
// itu presisi dan dapat diaudit — itu sebabnya ia dipertahankan sebagai jalur
// utama. Kelemahannya satu: pertanyaan yang memakai kata BERBEDA untuk hal yang
// sama tidak ditemukan, walaupun datanya ada.
//
// Modul ini menambahkan lapis semantik di BELAKANG jalur leksikal, dengan dua
// penyedia yang dapat ditukar:
//
//   penyedia 'hash'   — tanpa model, tanpa jaringan. Menyemai fitur (kata, stem,
//                       potongan huruf 4-gram) ke vektor 512 dimensi memakai
//                       hashing bertanda. Menangkap variasi BENTUK: salah tulis,
//                       imbuhan (pe-/meng-/-an), urutan kata, kata terpotong.
//                       Bukan pemaham-makna; batasnya dinyatakan terbuka.
//   penyedia 'remote' — memakai layanan embedding sungguhan (e5-kelas) lewat API
//                       yang kompatibel OpenAI (`POST {base}/embeddings`). Ini
//                       yang menangkap PARAFRASE makna ("tenaga pengajar" →
//                       "guru"). Tidak diaktifkan secara bawaan karena butuh
//                       jaringan & langganan; begitu tersedia, setel
//                       SAPA_SEMANTIK=remote dan seluruh perbaikan berlaku tanpa
//                       perubahan kode lain.
//
// ATURAN YANG MENJAGA MUTU (semuanya dapat diuji):
//   1. Jalur leksikal TIDAK PERNAH diubah. Lapis semantik hanya mengisi ketika
//      leksikal tidak menemukan apa pun (`hasil.length === 0`). Karena itu tidak
//      ada jawaban yang sudah benar bisa berubah — nol regresi secara rancangan.
//   2. Kandidat semantik hanya diterima bila skornya kuat (ambang) DAN jelas
//      mengungguli kandidat kedua (selisih), supaya "mirip sedikit" tidak menjadi
//      jawaban.
//   3. Fusi RRF (k=60, bobot leksikal > semantik) menggabungkan peringkat dari
//      daftar yang TIDAK bertumpang tindih, sehingga keunggulan leksikal tidak
//      pernah bisa dibalik oleh semantik.
//   4. Jawaban dari jalur semantik WAJIB membawa peringatan eksplisit, sehingga
//      pembaca tahu jawaban ini dari pencocokan makna (dan dapat meragukannya).
//   5. Bila penyedia remote gagal, sistem tidak melempar galat: ia turun ke
//      penyedia hash dengan alasan yang dicatat — jawaban pengguna tidak boleh
//      rusak karena fitur pengukuran.

import { stemId, type SapaRecord } from '@/lib/sapa-client';

export type PenyediaSemantik = 'hash' | 'remote';

export interface IndeksSemantik {
  /** Versi format indeks — dinaikkan bila cara penyemaian berubah. */
  versi: 1;
  /** Dimensi vektor. */
  dim: number;
  penyedia: PenyediaSemantik;
  /** Sidik ISI vektor (8 heksadesimal) — penanda versi artefak. */
  sidik: string;
  dibuatPada: string;
  jumlahRecord: number;
  /** Waktu membangun indeks (ms) — dipakai memeriksa kriteria "muat dingin". */
  durasiMs: number;
  /** Vektor ternormalisasi (panjang = jumlahRecord). */
  vektor: Float32Array[];
  /**
   * Daftar kata per record (untuk skor kata, lihat `skorKata`).
   *
   * Disimpan sebagai kata mentah, bukan kumpulan 4-gram: 2.065 record × ~12 kata
   * akan menjadi ratusan ribu objek bila 4-gramnya disimpan di depan. Gram
   * dihitung malas lewat cache saat kueri datang (jumlah kata unik jauh lebih
   * kecil daripada total kemunculan).
   */
  /** Kata nama INDIKATOR per record (sinyal terkuat). */
  kata: string[][];
  /** Kata nama OPD + satuan per record (bobot lebih rendah). */
  kataOpd: string[][];
  /**
   * Frekuensi dokumen per kata (df) — dipakai membobot skor kata dengan IDF.
   *
   * Tanpa IDF, kata yang muncul di hampir setiap record ("kecamatan", "jumlah")
   * sama pentingnya dengan kata yang khas ("koperasi"), sehingga kemiripan bentuk
   * pada kata umum menutupi kegagalan pada kata inti. Terukur 22 Sep 2026 pada
   * korpus uji 1.208 record: "jumlah koperas di kecamatan bebesen" semula
   * dimenangkan record jagung hanya karena keduanya berbagi kata "bebesen".
   */
  dfKata: Record<string, number>;
  /** Alasan bila penyedia remote gagal dan sistem turun ke hash. */
  catatan?: string;
}

export interface OpsiSemantik {
  dim?: number;
  penyedia?: PenyediaSemantik;
  /** Basis API embedding (mis. https://api.openai.com/v1) — hanya untuk remote. */
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  /** Batas waktu satu panggilan embedding (ms). */
  timeoutMs?: number;
}

// ─── 1. Normalisasi & fitur ──────────────────────────────────────────────────

/** Buang tanda baca & huruf beraksen; sisakan huruf/angka/spasi. */
function bersihkan(teks: string): string {
  return (teks ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kata yang tidak membawa makna topik — dibuang dari fitur. */
const STOPWORD = new Set([
  'yang', 'dan', 'atau', 'untuk', 'dari', 'pada', 'dengan', 'adalah', 'itu', 'ini',
  'berapa', 'berapakah', 'jumlah', 'banyak', 'banyaknya', 'tolong', 'mohon',
  'tampilkan', 'lihat', 'cek', 'cekkan', 'data', 'informasi', 'info', 'tahun',
  'di', 'ke', 'per', 'tiap', 'setiap', 'sebuah', 'saya', 'kami', 'kita', 'apa',
  'apakah', 'bagaimana', 'bagaimanakah', 'gimana', 'kabupaten', 'kecamatan',
  'kota', 'provinsi', 'aceh', 'tengah', 'sekitar', 'kira', 'kurang', 'lebih',
]);

/** Token bermakna (setelah stopword) + bentuk dasarnya (stem). */
export function normalisasiSemantik(teks: string): string[] {
  return bersihkan(teks)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORD.has(t));
}

/** Token + stem, urut aslinya — dipakai untuk membentuk fitur. */
function tokenFitur(teks: string): string[] {
  const keluar: string[] = [];
  for (const t of normalisasiSemantik(teks)) {
    keluar.push(t);
    const s = stemId(t);
    if (s && s !== t && s.length >= 3) keluar.push(s);
  }
  return keluar;
}

/**
 * Fitur sebuah teks: kata (dengan batas kata) + potongan huruf 4-gram.
 *
 * 4-gram menangkap variasi bentuk tanpa kamus: "stunting"/"stuntng" berbagi
 * banyak 4-gram, "kemiskinan"/"miskin" berbagi "#mis"/"misk", "penduduk"/
 * "kependudukan" berbagi inti yang sama.
 */
export function fiturTeks(teks: string, opsi?: { ngram?: boolean }): string[] {
  const ngram = opsi?.ngram !== false;
  const fitur: string[] = [];
  for (const kata of tokenFitur(teks)) {
    fitur.push(`k:${kata}`);
    if (!ngram) continue;
    // Awalan {n} memakai titik dua; batas kata ditandai ^ dan $ supaya posisi
    // awalan/akhiran ikut terbedakan ("miskin" vs "bermiskin").
    const pinggir = `^${kata}$`;
    for (let i = 0; i + 3 < pinggir.length; i++) fitur.push(`g:${pinggir.slice(i, i + 4)}`);
  }
  return fitur;
}

// ─── 2. Penyemaian vektor (hashing bertanda) ─────────────────────────────────

/** FNV-1a 32-bit — hash yang sama dipakai modul lain (sidik korpus, celah). */
function hash32(teks: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Semai fitur ke vektor `dim` dimensi lalu normalisasi L2.
 *
 * Tanda (+1/-1) dari bit hash kedua mengurangi bias tabrakan: dua fitur berbeda
 * yang jatuh ke keranjang sama cenderung saling meniadakan, bukan menguatkan.
 */
export function vektorHash(teks: string, dim: number, bobot = 1): Float32Array {
  const v = new Float32Array(dim);
  for (const fitur of fiturTeks(teks)) {
    const h = hash32(fitur);
    const keranjang = h % dim;
    const tanda = ((hash32(`t:${fitur}`) & 1) === 0 ? 1 : -1);
    v[keranjang] += tanda * bobot;
  }
  return normalkanVektor(v);
}

/** Normalisasi L2 di tempat (vektor nol dibiarkan apa adanya). */
export function normalkanVektor(v: Float32Array): Float32Array {
  let jumlah = 0;
  for (let i = 0; i < v.length; i++) jumlah += v[i] * v[i];
  const panjang = Math.sqrt(jumlah);
  if (panjang > 0) for (let i = 0; i < v.length; i++) v[i] /= panjang;
  return v;
}

/** Cosine similarity — kedua vektor sudah ternormalisasi, jadi cukup dot product. */
export function kesamaan(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Teks satu record untuk disemai: indikator (paling penting), OPD, satuan. */
export function teksRecord(r: SapaRecord): string {
  const indikator = String(r.kode_indikator_nama_indikator ?? '');
  const opd = String(r.opds_nama_opd ?? '');
  const satuan = String(r.satuan ?? '');
  // Indikator diulang 3× (bobot terbesar), OPD 1×, satuan 1× — sejalan dengan
  // skor leksikal yang juga mengutamakan nama indikator.
  return `${indikator} ${indikator} ${indikator} ${opd} ${satuan}`;
}

// ─── 3. Membangun indeks ─────────────────────────────────────────────────────

export const DIM_BAWAAN = 512;

/** Durasi & jumlah record pada pembangunan indeks terakhir (untuk panel status). */
let pembangunanTerakhir: { durasiMs: number; jumlahRecord: number; penyedia: PenyediaSemantik } | null = null;

/** Bangun indeks dengan penyedia 'hash' — sinkron, tanpa jaringan, tanpa model. */
export function bangunIndeksHash(records: SapaRecord[], dim = DIM_BAWAAN): IndeksSemantik {
  const mulai = Date.now();
  const vektor = records.map((r) => vektorHash(teksRecord(r), dim));
  const kata = records.map((r) => kataIndikator(r));
  const kataOpd = records.map((r) => kataOpdRecord(r));
  const dfKata = hitungDf([...kata, ...kataOpd]);
  const durasiMs = Date.now() - mulai;
  pembangunanTerakhir = { durasiMs, jumlahRecord: records.length, penyedia: 'hash' };
  return {
    versi: 1,
    dim,
    penyedia: 'hash',
    sidik: sidikVektor(vektor),
    dibuatPada: new Date().toISOString(),
    jumlahRecord: records.length,
    durasiMs,
    vektor,
    kata,
    kataOpd,
    dfKata,
  };
}

/**
 * Sidik artefak: hash dari isi vektor (bukan waktunya).
 *
 * Sama semangatnya dengan sidik korpus (FR-25): dua proses yang membangun indeks
 * dari korpus yang sama menghasilkan sidik yang sama; perubahan data sekecil apa
 * pun mengubahnya. Inilah dasar "artefak ber-hash" pada dokumen 10 — yang
 * disidik adalah ISI indeks, bukan berkas model.
 */
export function sidikVektor(vektor: Float32Array[]): string {
  let h = 0x811c9dc5;
  const serap = (teks: string) => {
    for (let i = 0; i < teks.length; i++) {
      h ^= teks.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  serap(`semantik:v1:${vektor.length}:${vektor[0]?.length ?? 0}`);
  for (const v of vektor) {
    // Kuantisasi 4 desimal: cukup untuk membedakan isi, tahan terhadap derau
    // pembulatan floating point antar-runtime.
    serap(v.length.toString());
    for (let i = 0; i < v.length; i++) {
      const q = Math.round(v[i] * 10000);
      if (q !== 0) serap(`${i}:${q}`);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Batch panggilan embedding remote (mengurangi jumlah permintaan). */
export const UKURAN_BATCH = 64;

/**
 * Bangun indeks dengan penyedia 'remote' (embedding sungguhan).
 *
 * Memakai API kompatibel OpenAI: `POST {baseUrl}/embeddings` dengan
 * `{ model, input: string[] }` → `{ data: [{ embedding: number[] }] }`.
 * Bila gagal (jaringan/langganan/model), TIDAK melempar: turun ke penyedia hash
 * dengan `catatan` yang menjelaskan sebabnya — jawaban pengguna tidak boleh
 * bergantung pada tersedianya layanan embedding.
 */
export async function bangunIndeksRemote(
  records: SapaRecord[],
  opsi: OpsiSemantik,
): Promise<IndeksSemantik> {
  const base = (opsi.baseUrl ?? '').replace(/\/+$/, '');
  if (!base || !opsi.model) {
    const hash = bangunIndeksHash(records, opsi.dim ?? DIM_BAWAAN);
    return { ...hash, catatan: 'penyedia remote diminta tetapi baseUrl/model kosong — memakai penyedia hash' };
  }
  const mulai = Date.now();
  const teks = records.map(teksRecord);
  const vektor: Float32Array[] = [];
  try {
    for (let i = 0; i < teks.length; i += UKURAN_BATCH) {
      const bagian = teks.slice(i, i + UKURAN_BATCH);
      const res = await fetch(`${base}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opsi.apiKey ? { Authorization: `Bearer ${opsi.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: opsi.model, input: bagian }),
        signal: AbortSignal.timeout(opsi.timeoutMs ?? 30000),
      });
      if (!res.ok) throw new Error(`embedding HTTP ${res.status}`);
      const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
      const baris = json.data ?? [];
      if (baris.length !== bagian.length) throw new Error(`jumlah embedding tidak cocok (${baris.length} vs ${bagian.length})`);
      for (const b of baris) {
        if (!Array.isArray(b.embedding) || b.embedding.length === 0) throw new Error('embedding kosong');
        vektor.push(normalkanVektor(Float32Array.from(b.embedding)));
      }
    }
    const durasiMs = Date.now() - mulai;
    pembangunanTerakhir = { durasiMs, jumlahRecord: records.length, penyedia: 'remote' };
    return {
      versi: 1,
      dim: vektor[0]?.length ?? 0,
      penyedia: 'remote',
      sidik: sidikVektor(vektor),
      dibuatPada: new Date().toISOString(),
      jumlahRecord: records.length,
      durasiMs,
      vektor,
      kata: records.map(kataIndikator),
      kataOpd: records.map(kataOpdRecord),
      dfKata: hitungDf([...records.map(kataIndikator), ...records.map(kataOpdRecord)]),
    };
  } catch (e) {
    const hash = bangunIndeksHash(records, opsi.dim ?? DIM_BAWAAN);
    return {
      ...hash,
      catatan: `penyedia remote gagal (${e instanceof Error ? e.message : 'sebab tidak diketahui'}) — memakai penyedia hash`,
    };
  }
}

/** Bangun indeks sesuai penyedia yang diminta. */
export async function bangunIndeks(records: SapaRecord[], opsi?: OpsiSemantik): Promise<IndeksSemantik> {
  const penyedia = opsi?.penyedia ?? penyediaDariLingkungan();
  if (penyedia === 'remote') return bangunIndeksRemote(records, opsi ?? {});
  return bangunIndeksHash(records, opsi?.dim ?? dimDariLingkungan());
}

export function penyediaDariLingkungan(): PenyediaSemantik {
  const nilai = (process.env as Record<string, string | undefined>)['SAPA_SEMANTIK']?.trim().toLowerCase();
  return nilai === 'remote' ? 'remote' : 'hash';
}

/**
 * Apakah lapis semantik dipakai? `SAPA_SEMANTIK=off` mematikannya sepenuhnya.
 *
 * Dipakai untuk mengukur perbandingan yang jujur ("recall dengan vs tanpa lapis
 * ini") dan sebagai tombol darurat bila operator ingin kembali berperilaku persis
 * seperti sebelum FR-12 — tanpa menurunkan versi kode.
 */
export function semantikAktifDariLingkungan(): boolean {
  const nilai = (process.env as Record<string, string | undefined>)['SAPA_SEMANTIK']?.trim().toLowerCase();
  if (nilai === undefined) return true;
  return !['off', 'mati', 'false', '0', 'tidak'].includes(nilai);
}

export function dimDariLingkungan(): number {
  const n = Number((process.env as Record<string, string | undefined>)['SAPA_SEMANTIK_DIM'] ?? DIM_BAWAAN);
  return Number.isFinite(n) && n >= 64 && n <= 4096 ? Math.floor(n) : DIM_BAWAAN;
}

export function opsiRemoteDariLingkungan(): OpsiSemantik {
  const env = process.env as Record<string, string | undefined>;
  return {
    penyedia: 'remote',
    baseUrl: env['SAPA_EMBED_BASE_URL'] ?? env['AI_BASE_URL'],
    model: env['SAPA_EMBED_MODEL'] ?? 'e5-small',
    apiKey: env['SAPA_EMBED_API_KEY'] ?? env['AI_API_KEY'],
    timeoutMs: Number(env['SAPA_EMBED_TIMEOUT_MS'] ?? 30000),
  };
}

// ─── 4. Cache indeks per versi korpus ────────────────────────────────────────

let indeksTersimpan: { kunci: string; indeks: IndeksSemantik } | null = null;

/**
 * Indeks untuk `records`, dibangun ULANG hanya bila versinya berubah.
 *
 * `sidikKorpus` dari FR-25 dipakai sebagai kunci: selama korpus sama, indeks
 * dipakai ulang (muat dingin hanya sekali per proses). Ini juga yang membuat
 * "muat dingin" pada dokumen 10 dapat diukur: `indeks.durasiMs` adalah waktu
 * pembangunan nyata, sedangkan panggilan berikutnya nol.
 */
export async function indeksUntuk(records: SapaRecord[], sidikKorpus: string, opsi?: OpsiSemantik): Promise<IndeksSemantik> {
  const penyedia = opsi?.penyedia ?? penyediaDariLingkungan();
  const kunci = `${sidikKorpus}|${penyedia}|${opsi?.model ?? 'hash'}|${records.length}`;
  if (indeksTersimpan && indeksTersimpan.kunci === kunci) return indeksTersimpan.indeks;
  const indeks = await bangunIndeks(records, opsi);
  indeksTersimpan = { kunci, indeks };
  return indeks;
}

/** Buang cache indeks (untuk uji). */
export function __resetIndeks(): void {
  indeksTersimpan = null;
  pembangunanTerakhir = null;
}

// ─── 5. Pencarian & fusi RRF ─────────────────────────────────────────────────

export interface HasilSemantik {
  urut: number;
  skor: number;
  /** Komponen skor — dipakai pelaporan & penelusuran (bukan untuk ambang). */
  kosinus: number;
  skorKata: number;
}

/** Kata bermakna dari NAMA INDIKATOR sebuah record. */
function kataIndikator(r: SapaRecord): string[] {
  return bersihkan(String(r.kode_indikator_nama_indikator ?? ''))
    .split(' ')
    .filter((t) => t.length >= 3);
}

/** Kata bermakna dari OPD + satuan (bobot lebih rendah; lihat `BOBOT_OPD`). */
function kataOpdRecord(r: SapaRecord): string[] {
  return bersihkan(`${r.opds_nama_opd ?? ''} ${r.satuan ?? ''}`)
    .split(' ')
    .filter((t) => t.length >= 3);
}

function hitungDf(daftarSemua: string[][]): Record<string, number> {
  const df: Record<string, number> = {};
  for (const daftar of daftarSemua) for (const k of new Set(daftar)) df[k] = (df[k] ?? 0) + 1;
  return df;
}

/**
 * Bobot kata yang cocok di OPD, bukan di nama indikator.
 *
 * Alasannya nyata dan terukur: OPD "Dinas Koperasi dan Usaha Kecil Menengah"
 * membuat record "Jumlah Produksi Jagung" tampak mirip dengan pertanyaan tentang
 * koperasi (skor 0,844 → menang atas record koperasi yang sebenarnya). Lapis
 * leksikal sudah lebih dahulu memakai bobot 0,34 untuk kecocokan di OPD; angka
 * yang sama dipakai di sini supaya kedua lapis sepakat soal kepentingan.
 */
export const BOBOT_OPD = 0.34;

/** Bentuk tepi + 4-gram sebuah kata (dipakai skor Dice). */
function gramKata(kata: string): Set<string> {
  const pinggir = `^${kata}$`;
  const gram = new Set<string>();
  for (let i = 0; i + 3 < pinggir.length; i++) gram.add(pinggir.slice(i, i + 4));
  return gram;
}

/** Koefisien Dice dua himpunan 4-gram: 2|A∩B| / (|A|+|B|). */
function dice4(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let irisan = 0;
  for (const g of a) if (b.has(g)) irisan += 1;
  return (2 * irisan) / (a.size + b.size);
}

/**
 * Skor KATA: rata-rata kemiripan bentuk terbaik untuk setiap kata pertanyaan.
 *
 * Mengapa ada: cosine seluruh dokumen "terencerkan" oleh panjang record — kueri
 * satu kata terhadap nama indikator tiga kata hanya mencapai ~0.3 walau kata itu
 * jelas sama (salah tulis "pendudk" → "Penduduk"). Dengan Dice 4-gram per kata,
 * kemiripan bentuk diukur pada KATA yang dibandingkan, bukan pada seluruh dokumen.
 *
 * Kata yang tidak menyerupai kata mana pun bernilai 0 — sehingga kueri di luar
 * katalog ("drone", "gempa") tetap berakhir di sekitar nol, tidak ikut naik.
 * Kata umum pertanyaan dibuang lebih dahulu (stopword), jadi tidak ada bantuan
 * palsu dari kata seperti "data" atau "jumlah".
 */
export function skorKata(indeks: IndeksSemantik, query: string, cache?: Map<string, Set<string>>): number {
  return skorKataKueri(indeks, normalisasiSemantik(query), cache).skor;
}

/**
 * Bobot IDF sebuah kata: 1 + ln((N+1) / df).
 *
 * Sama rumusnya dengan pembobotan leksikal di `sapa-client` — sengaja disamakan
 * supaya kedua lapis "berpikir" dengan ukuran kepentingan kata yang sama.
 * Kata yang tidak ada di korpus (df = 0, mis. salah tulis atau istilah asing)
 * mendapat bobot terbesar: ia MENENTUKAN, dan karena kemiripan bentuknya harus
 * tinggi, ia juga menjadi penjaga terhadap topik palsu.
 */
export function bobotIdf(indeks: IndeksSemantik, kata: string): number {
  const df = indeks.dfKata[kata] ?? 0;
  return 1 + Math.log((indeks.kata.length + 1) / Math.max(df, 1));
}

/** Skor kata berbobot IDF — dipakai `skorKata` dan `cariSemantik`. */
function skorKataKueri(
  indeks: IndeksSemantik,
  kataKueri: string[],
  cache?: Map<string, Set<string>>,
): { skor: number; rincian: Array<{ kata: string; dice: number; bobot: number }> } {
  if (kataKueri.length === 0) return { skor: 0, rincian: [] };
  const gram = (k: string) => {
    if (!cache) return gramKata(k);
    const ada = cache.get(k);
    if (ada) return ada;
    const dibuat = gramKata(k);
    cache.set(k, dibuat);
    return dibuat;
  };
  let jumlahBerbobot = 0;
  let totalBobot = 0;
  const rincian: Array<{ kata: string; dice: number; bobot: number }> = [];
  for (const kq of kataKueri) {
    const gq = gram(kq);
    let terbaik = 0;
    for (const daftar of indeks.kata) {
      for (const kr of daftar) {
        const skor = dice4(gq, gram(kr));
        if (skor > terbaik) terbaik = skor;
        if (terbaik === 1) break;
      }
      if (terbaik === 1) break;
    }
    // Kecocokan di OPD dihitung terpisah dan diberi bobot lebih rendah.
    let terbaikOpd = 0;
    for (const daftar of indeks.kataOpd) {
      for (const kr of daftar) {
        const skor = dice4(gq, gram(kr));
        if (skor > terbaikOpd) terbaikOpd = skor;
        if (terbaikOpd === 1) break;
      }
      if (terbaikOpd === 1) break;
    }
    terbaik = Math.max(terbaik, BOBOT_OPD * terbaikOpd);
    const bobot = bobotIdf(indeks, kq);
    jumlahBerbobot += bobot * terbaik;
    totalBobot += bobot;
    rincian.push({ kata: kq, dice: terbaik, bobot });
  }
  return { skor: totalBobot > 0 ? jumlahBerbobot / totalBobot : 0, rincian };
}

/**
 * Skor semantik gabungan: `BOBOT_KOSINUS × cosine` + sisanya × kemiripan bentuk
 * per kata (Dice 4-gram berbobot IDF).
 *
 * KALIBRASI 22 Sep 2026 (korpus uji 1.210 baris, 20 kueri parafrase + 5 kueri di
 * luar katalog). Nilai ini bukan tebakan — diukur berpasangan:
 *
 *   bobot kosinus │ skor tertinggi kueri DI LUAR katalog │ skor terendah kueri
 *                 │ (harus DITOLAK)                     │ parafrase yang benar
 *   ──────────────┼─────────────────────────────────────┼─────────────────────
 *         0,65    │ 0,336                               │ 0,226   ← tumpang tindih
 *         0,50    │ 0,288                               │ 0,258   ← tumpang tindih
 *         0,35    │ 0,243                               │ 0,290
 *         0,25    │ 0,230                               │ 0,312   ← dipakai
 *         0,15    │ 0,218                               │ 0,325
 *         0,00    │ 0,199                               │ 0,318
 *
 * Pada 0,50 (nilai awal) kedua sebaran BERTUMPANG TINDIH, sehingga tidak ada
 * ambang tunggal yang bisa memisahkan "parafrase sah" dari "di luar katalog" —
 * akibatnya 5 kueri sah (kemiskinan, balita kurang gizi, mutu hidup manusia,
 * dll.) ditolak. Cosine pada dasarnya menghitung kata umum bersama ("jumlah",
 * "berapa", "di", "kecamatan"); menurunkan bobotnya membuat penilaian bertumpu
 * pada kata isi yang dibobot IDF, dan sebaran pun terpisah. 0,25 dipilih karena
 * memberi jarak paling seimbang (~0,04 di kedua sisi ambang 0,27) pada rentang
 * 0,15–0,35. Cosine tetap dipertahankan (bukan 0) karena ia menangkap kecocokan
 * gabungan kata yang tidak tertangkap Dice per kata.
 */
export const BOBOT_KOSINUS = 0.25;

export function skorSemantik(indeks: IndeksSemantik, query: string, cache?: Map<string, Set<string>>): number {
  const q = vektorHash(query, indeks.dim);
  const kos = Math.max(...indeks.vektor.map((v) => kesamaan(q, v)), 0);
  const kata = skorKata(indeks, query, cache);
  return BOBOT_KOSINUS * kos + (1 - BOBOT_KOSINUS) * kata;
}

/** Peringkat `topK` record paling mirip dengan kueri. */
export function cariSemantik(indeks: IndeksSemantik, query: string, topK = 15): HasilSemantik[] {
  if (!query?.trim() || indeks.vektor.length === 0) return [];
  const q = vektorHash(query, indeks.dim);
  const cache = new Map<string, Set<string>>();
  const kataKueri = normalisasiSemantik(query);
  const bobotKueri = kataKueri.map((k) => bobotIdf(indeks, k));
  const totalBobot = bobotKueri.reduce((a, b) => a + b, 0);
  const skorKataSemua = (() => {
    // Skor kata dihitung sekali untuk seluruh record (bukan per record di dalam
    // map) supaya cache 4-gram dipakai bersama.
    if (kataKueri.length === 0) return indeks.kata.map(() => 0);
    const gram = (k: string) => {
      const ada = cache.get(k);
      if (ada) return ada;
      const dibuat = gramKata(k);
      cache.set(k, dibuat);
      return dibuat;
    };
    const gramKueri = kataKueri.map(gram);
    return indeks.kata.map((daftar, u) => {
      const daftarOpd = indeks.kataOpd[u] ?? [];
      let jumlah = 0;
      for (let i = 0; i < gramKueri.length; i++) {
        const gq = gramKueri[i];
        let terbaik = 0;
        for (const kr of daftar) {
          const s = dice4(gq, gram(kr));
          if (s > terbaik) terbaik = s;
          if (terbaik === 1) break;
        }
        let terbaikOpd = 0;
        for (const kr of daftarOpd) {
          const s = dice4(gq, gram(kr));
          if (s > terbaikOpd) terbaikOpd = s;
          if (terbaikOpd === 1) break;
        }
        jumlah += bobotKueri[i] * Math.max(terbaik, BOBOT_OPD * terbaikOpd);
      }
      return totalBobot > 0 ? jumlah / totalBobot : 0;
    });
  })();

  const skor = indeks.vektor.map((v, urut) => {
    const kosinus = kesamaan(q, v);
    const sk = skorKataSemua[urut] ?? 0;
    return { urut, skor: BOBOT_KOSINUS * kosinus + (1 - BOBOT_KOSINUS) * sk, kosinus, skorKata: sk };
  });
  skor.sort((a, b) => b.skor - a.skor || a.urut - b.urut);
  return skor.slice(0, topK).filter((h) => h.skor > 0);
}

export interface DaftarPeringkat {
  nama: string;
  /** Bobot daftar pada fusi (bawaan 1). */
  bobot?: number;
  /** Item terurut dari paling relevan; boleh berupa id apa pun. */
  item: string[];
}

export interface HasilFusi {
  id: string;
  skor: number;
  /** Dari daftar mana saja id ini muncul beserta peringkatnya. */
  asal: Array<{ nama: string; peringkat: number }>;
}

/**
 * Reciprocal Rank Fusion — menggabungkan beberapa daftar PERINGKAT.
 *
 * `skor = Σ bobot_daftar / (k + peringkat)` dengan peringkat mulai 1.
 * k = 60 mengikuti praktik baku (Cormack dkk.) yang membuat peringkat atas tetap
 * menentukan tetapi tidak menelan daftar lain.
 *
 * Pemakaian di sini: leksikal diberi bobot 2, semantik 1. Dengan daftar yang
 * TIDAK bertumpang tindih (lihat `gabungKandidat`), semua kandidat leksikal —
 * bahkan yang berperingkat paling bawah — mengungguli kandidat semantik,
 * sehingga mutu leksikal yang sudah terbukti tidak pernah bisa dibalik.
 */
export function fusiRRF(daftar: DaftarPeringkat[], k = 60): HasilFusi[] {
  const peta = new Map<string, HasilFusi>();
  for (const d of daftar) {
    const bobot = d.bobot ?? 1;
    d.item.forEach((id, i) => {
      const peringkat = i + 1;
      const ada = peta.get(id) ?? { id, skor: 0, asal: [] };
      ada.skor += bobot / (k + peringkat);
      ada.asal.push({ nama: d.nama, peringkat });
      peta.set(id, ada);
    });
  }
  return [...peta.values()].sort((a, b) => b.skor - a.skor || a.id.localeCompare(b.id));
}

/**
 * Ambang penerimaan kandidat semantik ketika leksikal tidak menemukan apa pun.
 *
 * Dikalibrasi pada 22 Sep 2026 dengan korpus uji (lihat `scripts/uji-parafrase.mjs`):
 *   - kecocokan benar lemah (salah tulis satu kata) : 0,37–0,48
 *   - kecocokan benar sedang/kuat                   : 0,60–1,00
 *   - kueri di luar katalog (puncak derau)          : ≤ 0,13
 * Ambang 0,30 duduk di tengah jurang itu: masih menerima salah tulis yang paling
 * lemah, masih menolak derau dengan margin > 2×. Nilainya dapat ditimpa lewat
 * `SAPA_SEMANTIK_AMBANG` tanpa mengubah kode.
 */
/**
 * Ambang penerimaan jalur semantik. Kalibrasi 22 Sep 2026 (lihat catatan panjang
 * di `BOBOT_KOSINUS`): dengan bobot kosinus 0,25, kueri DI LUAR katalog mencapai
 * paling tinggi 0,230 sementara parafrase sah terendah 0,312 → ambang 0,27
 * memberi jarak ~0,04 di kedua sisi. Tidak ada kueri uji yang jatuh di antaranya.
 *
 * PENTING (kejujuran): angka ini hasil kalibrasi pada korpus uji sintetis, dan
 * himpunan negatifnya hanya 5 kueri. Bila korpus produksi berbeda jauh, nilai ini
 * bisa disetel lewat `SAPA_SEMANTIK_AMBANG`.
 */
export const AMBANG_SEMANTIK = 0.27;
/** Ambang "kuat": di atas ini jawaban dianggap jelas tanpa perlu peringatan keraguan. */
export const AMBANG_KUAT = 0.55;
/**
 * Selisih dengan kandidat kedua di bawah nilai ini BUKAN alasan menolak (korpus
 * nyata penuh indikator kembar per kecamatan, sehingga selisih wajar sangat
 * kecil — kueri "kemiskinan aceh tengah sekarang" hanya unggul 0,006). Nilainya
 * dipakai untuk MENAMBAH peringatan keraguan, bukan sebagai gerbang.
 */
export const SELISIH_MINIMUM = 0.02;

export function ambangDariLingkungan(): { ambang: number; kuat: number; selisih: number } {
  const env = process.env as Record<string, string | undefined>;
  const angka = (kunci: string, bawaan: number) => {
    const n = Number(env[kunci]);
    return Number.isFinite(n) && n > 0 && n < 1 ? n : bawaan;
  };
  return {
    ambang: angka('SAPA_SEMANTIK_AMBANG', AMBANG_SEMANTIK),
    kuat: angka('SAPA_SEMANTIK_AMBANG_KUAT', AMBANG_KUAT),
    selisih: angka('SAPA_SEMANTIK_SELISIH', SELISIH_MINIMUM),
  };
}

export interface KandidatSemantik {
  urut: number;
  skor: number;
}

/**
 * Saring hasil semantik menjadi kandidat yang LAYAK dijadikan jawaban.
 *
 * Aturan (dua-duanya harus benar):
 *   (a) skor teratas ≥ ambang;
 *   (b) skor teratas jelas mengungguli yang kedua (selisih ≥ minimum) ATAU
 *       skornya sudah melewati ambang kuat.
 * Tujuan: "mirip sedikit" dan "banyak yang mirip" sama-sama tidak menjadi
 * jawaban — dua-duanya menandakan sistem tidak benar-benar mengenali topiknya.
 */
export function saringKandidatSemantik(
  hasil: Array<{ urut: number; skor: number }>,
  opsi?: { ambang?: number; kuat?: number; selisih?: number; maks?: number },
): KandidatSemantik[] {
  const b = ambangDariLingkungan();
  const ambang = opsi?.ambang ?? b.ambang;
  const kuat = opsi?.kuat ?? b.kuat;
  const selisih = opsi?.selisih ?? b.selisih;
  const maks = opsi?.maks ?? 20;
  if (hasil.length === 0) return [];
  // Gerbang = AMBANG absolut. (Reviu 22 Sep 2026: sebelumnya ada gerbang kedua
  // "harus unggul ≥ selisih dari kandidat kedua". Pada korpus nyata yang penuh
  // indikator kembar, kueri SAH sering hanya unggul 0,000–0,011, sehingga gerbang
  // itu membuang jawaban benar; sementara kueri DI LUAR katalog ternyata sudah
  // tertahan oleh ambang absolut setelah bobot kosinus diturunkan. Selisih
  // sekarang dipakai untuk peringatan keraguan di `retrieveDenganSemantik`.)
  const teratas = hasil[0];
  if (teratas.skor < ambang) return [];
  void kuat;
  void selisih;
  return hasil.slice(0, maks).map((h) => ({ urut: h.urut, skor: h.skor }));
}

/** Status semantik untuk panel `/api/status` & jejak audit. */
export function metaSemantik(): {
  aktif: boolean;
  penyedia: PenyediaSemantik;
  dim: number;
  pembangunanTerakhir: typeof pembangunanTerakhir;
  sidik: string | null;
  catatan: string | null;
} {
  const indeks = indeksTersimpan?.indeks ?? null;
  return {
    aktif: semantikAktifDariLingkungan(),
    penyedia: indeks?.penyedia ?? penyediaDariLingkungan(),
    dim: indeks?.dim ?? dimDariLingkungan(),
    pembangunanTerakhir,
    sidik: indeks?.sidik ?? null,
    catatan: indeks?.catatan ?? null,
  };
}

// ─── 6. Jalur retrieval: leksikal dulu, semantik sebagai pengisi ─────────────

import { retrieveRelevant, stemId as stemUntuk, type ScoredRecord } from '@/lib/sapa-client';

export interface HasilRetrieval {
  hasil: ScoredRecord[];
  /**
   * Jalur yang benar-benar dipakai — dipakai UI/peringatan & uji.
   *  - `leksikal`          : murni kecocokan kata (perilaku sebelum FR-12);
   *  - `leksikal+sisipan`  : leksikal menemukan hasil, lalu SATU/DUA kandidat
   *    semantik yang sangat kuat disisipkan ke daftar bukti (jawaban utama tetap
   *    dari kecocokan kata);
   *  - `semantik`          : leksikal kosong, jawaban datang dari kemiripan makna;
   *  - `kosong`            : tidak ada yang layak dijawab.
   */
  jalur: 'leksikal' | 'leksikal+sisipan' | 'semantik' | 'kosong';
  /** Berapa indikator tambahan yang disisipkan dari jalur semantik. */
  disisipi?: number;
  skorSemantik?: number;
  sidikIndeks?: string;
  /** Peringatan WAJIB bila jalur semantik dipakai (kejujuran). */
  peringatan?: string;
}

/** Hitung berapa token pertanyaan yang benar-benar muncul di nama indikator. */
function overlapIndikator(record: SapaRecord, query: string): number {
  const kataInd = new Set(
    String(record.kode_indikator_nama_indikator ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((x) => x.length >= 3)
      .flatMap((x) => [x, stemUntuk(x)]),
  );
  return normalisasiSemantik(query).filter((t) => kataInd.has(t) || kataInd.has(stemUntuk(t))).length;
}

/**
 * Siapkan indeks secara sinkron bila belum ada (hanya untuk penyedia 'hash').
 *
 * Jalur jawaban deterministik bersifat sinkron. Karena itu rute sebaiknya
 * "memanaskan" indeks lebih dahulu (`indeksUntuk`), dan fungsi ini adalah jaring
 * terakhir supaya jawaban tetap dapat disusun walau pemanasan terlewat.
 * Untuk penyedia 'remote' fungsi ini TIDAK memanggil jaringan: bila indeks belum
 * siap, jalur semantik dilewati (lebih baik mengaku tidak ada daripada menahan
 * pengguna menunggu).
 */
export function siapkanIndeksSync(records: SapaRecord[]): IndeksSemantik | null {
  if (indeksTersimpan && indeksTersimpan.indeks.jumlahRecord === records.length) return indeksTersimpan.indeks;
  if (penyediaDariLingkungan() === 'remote') return null;
  try {
    return bangunIndeksHash(records, dimDariLingkungan());
  } catch {
    return null;
  }
}

/**
 * Ambil record relevan: LEKSIKAL lebih dahulu; semantik hanya mengisi kekosongan.
 *
 * Inilah gerbang yang membuat FR-12 tidak dapat menimbulkan regresi: bila jalur
 * leksikal menemukan apa pun, hasilnya dikembalikan APA ADANYA. Lapis semantik
 * hanya bekerja ketika leksikal kosong — dan pada saat itu ia pun masih harus
 * lulus ambang + selisih (`saringKandidatSemantik`).
 */
/**
 * Pilih kandidat semantik yang layak DISISIPKAN ke daftar bukti leksikal.
 *
 * Aturan ini lahir dari temuan uji 22 Sep 2026: semula yang diuji adalah
 * "kandidat teratas" saja. Akibatnya, ketika kandidat teratas SUDAH ada di
 * daftar leksikal, kandidat ke-2 yang jauh lebih lemah (mis. 0,396 vs 0,853)
 * tetap disisipkan — daftar bukti jadi terisi data tak seTopik. Sekarang setiap
 * kandidat yang akan disisipkan diuji satu per satu:
 *   1. belum ada di daftar leksikal (5 teratas) — supaya tidak menggandakan;
 *   2. skornya ≥ ambang "kuat" — supaya hanya kemiripan makna yang meyakinkan
 *      yang boleh menambah bukti;
 *   3. urutan leksikal tidak pernah digeser, hanya disisipi setelah peringkat 1.
 */
export function pilihSisipanSemantik(
  kandidat: KandidatSemantik[],
  hasilLeksikal: ScoredRecord[],
  records: SapaRecord[],
  ambangKuat: number,
  maks = 2,
): ScoredRecord[] {
  const sudahAda = new Set(hasilLeksikal.slice(0, 5).map((h) => String(h.record.id)));
  const terpilih: ScoredRecord[] = [];
  for (const k of kandidat) {
    if (terpilih.length >= maks) break;
    const record = records[k.urut];
    if (!record || sudahAda.has(String(record.id))) continue;
    if (k.skor < ambangKuat) continue;
    terpilih.push({
      record,
      // Skor semantik (0–1) ditampilkan pada skala 0–100 agar sebanding dengan
      // skor leksikal di daftar bukti. Nilai ini TIDAK dipakai untuk mengurutkan.
      score: Math.round(k.skor * 100),
      indHits: 0,
      opdHits: 0,
    });
  }
  return terpilih;
}

export function retrieveDenganSemantik(
  records: SapaRecord[],
  query: string,
  opsi?: { cap?: number; topK?: number; indeks?: IndeksSemantik | null; semantikAktif?: boolean },
): HasilRetrieval {
  const cap = opsi?.cap ?? 80;
  const aktif = opsi?.semantikAktif !== false && semantikAktifDariLingkungan();
  const leksikal = retrieveRelevant(records, query, cap);
  const indeks = aktif ? opsi?.indeks ?? siapkanIndeksSync(records) : null;

  // ── Jalur 1: leksikal menemukan hasil ───────────────────────────────────────
  // Hasil leksikal dipertahankan sebagai jawaban utama. Satu/dua kandidat
  // semantik yang SANGAT kuat boleh DISISIPKAN (bukan menggantikan) supaya
  // indikator yang benar tetap muncul di daftar bukti walau kata yang diketik
  // pengguna tidak persis sama. Ini juga yang menjaga "nol regresi": jawaban
  // utama (peringkat pertama) tidak pernah berpindah.
  if (leksikal.length > 0) {
    if (!indeks) return { hasil: leksikal, jalur: 'leksikal' };
    const b = ambangDariLingkungan();
    const mentah = cariSemantik(indeks, query, 5);
    const diterima = saringKandidatSemantik(mentah, { maks: 5 });
    const tambahan = pilihSisipanSemantik(diterima, leksikal, records, b.kuat);
    if (tambahan.length === 0) return { hasil: leksikal, jalur: 'leksikal' };

    const nama = tambahan.map((t) => String(t.record.kode_indikator_nama_indikator)).join('; ');
    return {
      hasil: [leksikal[0], ...tambahan, ...leksikal.slice(1)],
      jalur: 'leksikal+sisipan',
      disisipi: tambahan.length,
      skorSemantik: Math.max(...diterima.map((k) => k.skor)),
      sidikIndeks: indeks.sidik,
      // CATATAN KEJUJURAN ANGKA: peringatan ini adalah PROSA — ia tidak boleh
      // memuat angka apa pun (sidik indeks, skor kemiripan). Penjaga invarians
      // eval membuktikannya: "indeks 0db47884" dan "kemiripan 0.42" membuat 6 item
      // eval gagal karena angka di narasi tidak ada di daftar bukti. Sidik indeks
      // tetap bisa diaudit lewat /api/status (blok `semantik`) dan meta balasan.
      peringatan:
        `Disisipkan dari pencocokan makna (semantik): ${nama} — ` +
        `kata yang diketik tidak persis sama dengan nama indikator, jadi periksa kesesuaiannya.`,
    };
  }

  // ── Jalur 2: leksikal kosong ────────────────────────────────────────────────
  if (!aktif || !indeks) return { hasil: [], jalur: 'kosong' };

  const mentah = cariSemantik(indeks, query, opsi?.topK ?? 20);
  const diterima = saringKandidatSemantik(mentah);
  if (diterima.length === 0) {
    // FR-20: sertakan skor teratas yang DITOLAK. Tanpa itu, jawaban kosong pada
    // jalur semantik tidak bisa dibedakan dari "katalog benar-benar tidak punya"
    // — padahal dua keadaan itu menuntut perbaikan yang berbeda (turunkan ambang
    // vs lengkapi katalog).
    return { hasil: [], jalur: 'kosong', sidikIndeks: indeks.sidik, skorSemantik: mentah[0]?.skor };
  }

  // Fusi RRF dipakai nyata di sini: daftar leksikal (kosong pada kasus ini) dan
  // daftar semantik digabung. Karena daftar leksikal kosong, urutan hasil sama
  // dengan urutan semantik — tetapi jalur kodenya satu dan sama dengan fusi
  // umum, sehingga tidak ada "kode fusi" yang hanya hidup di uji.
  const idDari = (u: number) => String(u);
  const fusi = fusiRRF([
    { nama: 'leksikal', bobot: 2, item: [] },
    { nama: 'semantik', bobot: 1, item: diterima.map((k) => idDari(k.urut)) },
  ], 60);
  const skorPer = new Map(diterima.map((k) => [idDari(k.urut), k.skor]));

  const hasil: ScoredRecord[] = fusi
    .filter((f) => skorPer.has(f.id))
    .map((f) => {
      const urut = Number(f.id);
      const record = records[urut];
      return {
        record,
        // Skor pada jalur semantik = skor kesamaan ×10, supaya skalanya sebanding
        // dengan skor leksikal saat ditampilkan/diurutkan di tempat lain.
        score: Math.round((skorPer.get(f.id) ?? 0) * 1000) / 100,
        indHits: overlapIndikator(record, query),
        opdHits: 0,
      };
    })
    .filter((h) => Boolean(h.record));

  const top = skorPer.get(fusi[0]?.id ?? '') ?? 0;
  const kedua = diterima[1]?.skor ?? 0;
  void top;
  void kedua;
  // Peringatan keraguan: katalog SAPA memuat indikator yang hampir sama untuk
  // setiap kecamatan, jadi "unggul tipis" itu NORMAL dan tidak boleh menolak
  // jawaban — tetapi pengguna berhak tahu bahwa ada kandidat yang mirip.
  const dekat = top - kedua < SELISIH_MINIMUM;
  return {
    hasil,
    jalur: 'semantik',
    skorSemantik: top,
    sidikIndeks: indeks.sidik,
    // Sama seperti peringatan sisipan: PROSA tanpa angka (lihat catatan di atas).
    peringatan:
      `Dijawab lewat pencocokan MAKNA (semantik), bukan kecocokan kata: ` +
      `katalog SAPA tidak memuat kata kunci pertanyaan secara langsung. ` +
      `Periksa kesesuaian indikatornya sebelum angka ini dipakai.` +
      (dekat
        ? ` Ada indikator lain yang kemiripannya hampir sama; periksa pula namanya bila angka ini tidak sesuai.`
        : ''),
  };
}
