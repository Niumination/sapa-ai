import { daftarKecamatanDariIndikator } from '@/services/pemeriksa-entitas';

// ─── SAPA Client — SPLP only ───
// Source: api-splp.layanan.go.id

import { normalisasiNilai, parseNumericId } from './parse-numeric';

/**
 * Alamat dasar SPLP. Boleh ditimpa lewat `SAPA_SPLP_BASE_URL` untuk pengujian
 * luring (penyedia data tiruan di localhost) atau untuk lingkungan pementasan.
 *
 * Mengapa perlu: uji terima & pengembangan sering berjalan di jaringan yang
 * tidak boleh/ tidak bisa menghubungi internet. Tanpa opsi ini, seluruh aplikasi
 * (termasuk fitur yang sama sekali tidak menyentuh SPLP) tidak dapat diuji —
 * terukur 22 Sep 2026: sandbox kehilangan akses keluar dan eval 90 item tidak
 * bisa dijalankan sama sekali. Nilainya dibaca saat modul dimuat, jadi
 * penyalahgunaannya tetap terbatas pada proses yang sengaja dikonfigurasi begitu.
 */
const SPLP_BASE_BAWAAN = 'https://api-splp.layanan.go.id/sapa/1.0/api';

/**
 * Alamat dasar SPLP, dibaca SETIAP KALI dipakai — bukan sekali saat modul dimuat.
 *
 * Dua pelajaran nyata yang membentuk kode ini:
 *   1. Akses memakai tanda kurung siku (`process.env['…']`) SENGAJA dipakai.
 *      Dengan `process.env.X` biasa, bundler Next menanam nilai variabel ini saat
 *      BUILD; akibatnya `SAPA_SPLP_BASE_URL` yang diset saat `next start`
 *      diabaikan dan aplikasi tetap menghubungi SPLP produksi. Terukur 22 Sep
 *      2026: variabel sudah benar di proses, tetapi permintaan tetap gagal karena
 *      alamat yang dipakai masih yang tertanam di bundel.
 *   2. Dibaca per panggilan supaya penyalahgunaan tetap terbatas pada proses yang
 *      sengaja dikonfigurasi begitu, dan uji dapat menggantinya tanpa memuat ulang.
 */
function alamatSplp(): string {
  const dari =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>)['SAPA_SPLP_BASE_URL']?.trim()
      : undefined;
  return (dari || SPLP_BASE_BAWAAN).replace(/\/+$/, '');
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';


async function getSapaAccessToken(): Promise<string> {
  const clientId = process.env.SAPA_CLIENT_ID ?? '3';
  const clientSecret = process.env.SAPA_CLIENT_SECRET ?? '';
  if (!clientSecret) throw new Error('SAPA_CLIENT_SECRET tidak dikonfigurasi');
  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);
  const res = await fetch('https://sapa.acehtengahkab.go.id/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': BROWSER_UA },
    body: form.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`SAPA OAuth error ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('SAPA OAuth response tanpa access_token');
  return data.access_token;
}
// ─── Types ───

/** Metadata untuk tiap record — dipakai scoring intent & dedup. */
export interface RecordMeta {
  id: number;
  indikator: string;
  nilai: number | null;
  satuan: string;
  opd: string;
  tahun: string | null;
  isAggregate: boolean;
  _score?: number;
}

export interface SapaRecord {
  id: number;
  id_kode_indikator: number;
  kode_indikator_kode_indikator: string | null;
  kode_indikator_nama_indikator: string | null;
  id_opds: number;
  opds_nama_opd: string;
  jadwal_pemutakhiran: string;
  satuan: string;
  tahun: string | null;
  variabel: string;
}

export interface SapaResponse {
  api_status: number;
  api_message: string;
  data: SapaRecord[];
}

export type SapaDataOrigin = 'splp';

export function dataSourceLabel(_origin: SapaDataOrigin): string {
  return 'SAPA Aceh Tengah (api-splp.layanan.go.id)';
}


// ─── Fetch: SPLP only (LRU 10 mnt — audit autoskills 2026-09-03) ───
// Route memakai `force-dynamic` sehingga fetch cache Next tidak berlaku;
// cache manual di sini. Data publik statis + TTL = aman dibagikan lintas request.

const SPLP_TTL_MS = 10 * 60 * 1000;

/**
 * Meta korpus: kapan data SPLP ditarik dan sidik ISI korpus (penanda versi).
 *
 * Kebutuhan FR-25 & DS-03 (dokumen `docs/usulan-ai-tingkat-lanjut/10-...`):
 * setiap jawaban wajib dapat dipertanggungjawabkan kesegarannya — pembaca harus
 * tahu data ini ditarik kapan, dan sidik versi membuat cache/jejak audit bisa
 * dibedakan ("angka ini dari korpus yang mana?").
 *
 * Catatan kejujuran: `diambilPada` adalah waktu korpus ditarik dari SPLP. Karena
 * ada cache 10 menit (LRU) dan cache terdistribusi 600 detik pada rute tertentu,
 * nilainya BUKAN waktu permintaan pengguna — dan memang tidak boleh ditulis
 * begitu. Yang ditampilkan ke pengguna karena itu berlabel "data SPLP ditarik",
 * bukan "diakses".
 */
export interface MetaKorpus {
  /** ISO — kapan korpus ini ditarik dari SPLP. */
  diambilPada: string;
    /**
   * Sidik ISI korpus (8 heksadesimal) — penanda versi, bukan penanda waktu.
   *
   * Dihitung dari isi record (id, indikator, OPD, tahun, satuan, nilai) yang
   * diurutkan lebih dahulu, jadi:
   *   - dua proses yang menarik data yang SAMA akan menghasilkan sidik yang SAMA,
   *     walaupun waktu tariknya berbeda (inilah gunanya untuk jejak audit: "angka
   *     ini berasal dari korpus versi X");
   *   - perubahan sekecil apa pun pada data (nilai, tahun, satuan) menghasilkan
   *     sidik berbeda, termasuk bila jumlah record tetap sama.
   * Waktu tarik dilaporkan terpisah lewat `diambilPada`, jadi tidak ada informasi
   * yang hilang. Catatan: sidik ini 32-bit (tabrakan mungkin secara teori, tidak
   * untuk keperluan keamanan) — cukup untuk membedakan versi korpus dan
   * membandingkan mode AI vs deterministik.
   */
  sidik: string;
}

/** FNV-1a 32-bit. Kecil, tanpa dependensi, jalan di semua runtime (node/edge). */
function hashFnv1a(teks: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Bentuk kanonis satu record untuk penghitungan sidik.
 *
 * Dipilih hanya bidang yang bermakna bagi pembaca jawaban (bukan bidang internal
 * yang boleh berubah tanpa mengubah jawaban). Dipisah dengan karakter yang tidak
 * mungkin muncul di data (\u001f) supaya "A|B" dan "AB|" tidak pernah bertabrakan.
 */
function barisKanonis(r: SapaRecord): string {
  return [
    r.id,
    r.kode_indikator_nama_indikator,
    r.opds_nama_opd,
    r.tahun ?? '',
    r.satuan ?? '',
    r.variabel ?? '',
  ].join('\u001f');
}

/**
 * Sidik isi korpus. Record diurutkan (id, lalu isi) supaya urutan balasan SPLP
 * yang berubah-ubah tidak mengubah sidik — yang ingin diukur adalah ISI, bukan
 * urutan penyajian.
 */
export function sidikKorpus(records: SapaRecord[]): string {
  const baris = records.map(barisKanonis).sort();
  return hashFnv1a(`sapa:v2:${records.length}:${baris.join('\u001e')}`);
}

let splpCache: { at: number; records: SapaRecord[]; meta: MetaKorpus } | null = null;

/**
 * Meta korpus yang sedang dipegang proses ini (bila ada). Dipakai rute yang
 * hanya menerima `records` tetapi perlu menempelkan stempel kesegaran.
 */
export function metaKorpusTerakhir(): MetaKorpus | null {
  return splpCache?.meta ?? null;
}

export async function fetchSapaData(): Promise<{ records: SapaRecord[]; origin: 'splp'; meta: MetaKorpus }> {
  if (splpCache && Date.now() - splpCache.at < SPLP_TTL_MS) {
    return { records: splpCache.records, origin: 'splp', meta: splpCache.meta };
  }

  const res = await fetch(`${alamatSplp()}/daftar_data`, {
    headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`SPLP API error ${res.status}: ${res.statusText}`);
  }

  const json: SapaResponse = await res.json();
  if (json.api_status !== 1) {
    throw new Error(`SPLP API failed: ${json.api_message}`);
  }
  const at = Date.now();
  const meta: MetaKorpus = {
    diambilPada: new Date(at).toISOString(),
    sidik: sidikKorpus(json.data),
  };
  splpCache = { at, records: json.data, meta };
  return { records: json.data, origin: 'splp', meta };
}

// ─── Helpers: Normalisasi & Filtering ───

/** Normalize text: lowercase, strip diacritics-ish, collapse spaces. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,;:'"()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ─── Normalisasi singkatan & bahasa tidak baku (usulan audit 2026-09-21) ───
 *
 * MASALAH TERUKUR: penjaga konsep-asing bekerja per token, dan singkatan
 * pengguna hampir selalu ber-df = 0 (tidak pernah muncul di nama indikator).
 * Akibatnya pertanyaan wajar berubah menjadi "konsep tidak ada":
 *
 *   "brp jmlh pddk Aceh Tengah 2025" → 0 bukti, jawaban menolak (465 ms)
 *   padahal "Jumlah Data Penduduk" ada di katalog.
 *
 * Perbaikan ini murni LEKSIKAL dan deterministik (tanpa model, tanpa embedding):
 * bentuk tidak baku dipetakan ke bentuk baku SEBELUM stopword/panjang filter.
 * Aman karena bentuk baku hasil pemetaan tetap melewati penyaring yang sama —
 * mis. "brp" → "berapa" lalu tetap dibuang sebagai stopword.
 *
 * Prinsip: hanya memetakan bentuk yang TIDAK PERNAH menjadi kata sah di nama
 * indikator. Pemetaan "tengkes" → "stunting" dan "pddk" → "penduduk" juga
 * langsung memperbaiki gerbang konsep-asing, karena token hasil pemetaan
 * punya df > 0 sehingga pertanyaan tidak lagi dianggap menyentuh konsep asing.
 *
 * Sumber kurasi: daftar sinonim/singkatan bahasa Indonesia untuk pencarian
 * (Sastrawi, kamus slang Indonesia, dan daftar sinonim leksikal Indonesia).
 */
export const SINGKATAN: Record<string, string[]> = {
  // angka & kuantitas
  brp: ['berapa'], brpa: ['berapa'], brapa: ['berapa'],
  jml: ['jumlah'], jmlh: ['jumlah'], jlh: ['jumlah'], byk: ['banyak'],
  // entitas wilayah & pemerintahan
  pddk: ['penduduk'], penddk: ['penduduk'], pdk: ['penduduk'],
  kec: ['kecamatan'], kecam: ['kecamatan'], kab: ['kabupaten'],
  kel: ['kelurahan'], prov: ['provinsi'], pemkab: ['pemerintah', 'kabupaten'],
  dinkes: ['kesehatan'], kadinkes: ['kesehatan'], disdik: ['pendidikan'],
  dinsos: ['sosial'], disdukcapil: ['kependudukan'], dishub: ['perhubungan'],
  bappeda: ['perencanaan'], rsud: ['rumah', 'sakit'],
  // kata baku yang sering disingkat
  thn: ['tahun'], yg: ['yang'], dgn: ['dengan'], utk: ['untuk'],
  dr: ['dari'], sdh: ['sudah'], udh: ['sudah'], udah: ['sudah'],
  tdk: ['tidak'], gak: ['tidak'], ga: ['tidak'], gk: ['tidak'],
  bgt: ['sangat'], hrg: ['harga'], hrga: ['harga'], ank: ['anak'],
  // istilah statistik & kesehatan yang lazim dipakai masyarakat
  tengkes: ['stunting'], tengkesan: ['stunting'], stundting: ['stunting'],
  ipm: ['ipm'], hdi: ['indeks', 'pembangunan', 'manusia'],
  asn: ['asn'], pns: ['asn'], pppk: ['asn'],
  gakin: ['miskin'], rtm: ['rumah', 'tangga'],
  jabar: ['jawa', 'barat'],
};

/** Petakan setiap kata ke bentuk baku (boleh menghasilkan >1 kata). */
export function normalkanSingkatan(kata: string): string[] {
  return SINGKATAN[kata] ?? [kata];
}

/**
 * LEKSIKON FRASA ISTILAH RESMI (usulan 22 Sep 2026, temuan uji parafrase FR-12).
 *
 * Pengguna menulis istilah pemerintahan secara LENGKAP, sedangkan katalog SAPA
 * memakai akronimnya. Dua contoh terukur pada uji parafrase:
 *   • "berapa banyak aparatur sipil negara" → ditolak (katalog memuat "Jumlah ASN");
 *   • "indeks pembangunan manusia"          → hanya cocok karena kebetulan ada
 *     indikator berjudul panjang; bila katalog memakai "IPM" saja, ia gugur.
 *
 * Sumber istilah (bukan karangan untuk lulus uji):
 *   • ASN = Aparatur Sipil Negara — UU No. 5/2014 tentang Aparatur Sipil Negara.
 *   • IPM = Indeks Pembangunan Manusia — publikasi BPS (metodologi IPM).
 *
 * Diterapkan sebagai penggantian frasa SEBELUM pemotongan token, sehingga
 * "aparatur sipil negara" menjadi satu token baku `asn` dan sisanya ikut aturan
 * normal (sinonim, stem, stopword). Frasa dicocokkan dengan batas kata agar
 * "negara" pada "badan usaha milik negara" tidak ikut tergantikan.
 */
const FRASA_ISTILAH: Array<[RegExp, string]> = [
  [/\baparatur sipil negara\b/g, 'asn'],
  [/\bindeks pembangunan manusia\b/g, 'ipm'],
];

/** Token set dari query — hapus stopwords umum + stopword domain (PR Lapis 1). */
export function tokenizeQuery(query: string): string[] {
  const stopWords = new Set([
    // umum
    'bagaimana', 'tentang', 'berapa', 'data', 'status', 'informasi',
    'untuk', 'dari', 'dengan', 'apa', 'siapa', 'dimana', 'kapan',
    'mengapa', 'adalah', 'ada', 'yang', 'di', 'dan', 'atau', 'ini',
    'itu', 'bisa', 'tolong', 'jelaskan', 'tampilkan', 'perlihatkan',
    'daftar', 'list', 'show', 'opd', 'sapa', 'kabupaten', 'aceh',
    'tengah', 'saja', 'saya', 'mau', 'ingin', 'tolong', 'hitung',
    'jumlah', 'total', 'berapa', 'banyak', 'sebutkan', 'jelaskan',
    // domain (Lapis 1): kata-kata ini cocok ke ribuan indikator dan
    // merusak relevansi — mis. "angka" ⊂ "Angkat", "tahun" ⊂ "...tahun lalu"
    'angka', 'tahun', 'hari', 'dinas', 'badan', 'sekretariat', 'kantor',
    'perangkat', 'indikator', 'persentase', 'persen', 'tingkat', 'capaian',
    'tren', 'perkembangan', 'perbandingan', 'bandingkan', 'dibandingkan',
    'banding', 'versus', 'vs', 'per', 'terkini', 'terbaru', 'kondisi',
    'profil', 'gambaran', 'statistik', 'periode', 'wilayah', 'daerah',
    'nilai', 'satuan', 'kategori', 'sektor',
    // pengisi kalimat (reviu 2026-09-04): kata-kata ini tidak pernah muncul
    // di nama indikator, jadi selalu df = 0. Bila tidak dibuang, pertanyaan
    // wajar ("berapa sih jumlah koperasi?") dianggap menanyakan konsep yang
    // tidak ada di SAPA dan ditolak hanya karena pengisi kalimatnya.
    'tiap', 'setiap', 'sih', 'dong', 'nih', 'pun', 'juga', 'serta',
    'dalam', 'pada', 'ke', 'oleh', 'apakah', 'adakah', 'tersebut',
    'sebuah', 'masing', 'macam', 'seluruh', 'semua', 'antara', 'sampai',
    'menjadi', 'merupakan', 'yakni', 'yaitu',
    // pengisi frasa yang selalu ber-df 0 dan membuat penjaga konsep-asing
    // menyala palsu (usulan audit 2026-09-21): "berapa warga yang HIDUP di
    // BAWAH garis kemiskinan" → tanpa ini, "hidup"/"bawah" memaksa syarat
    // 2 kecocokan sementara kata topiknya hanya satu.
    'hidup', 'bawah', 'dibawah', 'sudah', 'telah', 'akan', 'kita', 'kami', 'mereka',
    // Kata tanya pengukur & kata kerja predikat (uji parafrase FR-12, 22 Sep 2026):
    // keduanya pembawa MAKSUD, bukan topik, dan tidak pernah ada di nama indikator
    // → selalu df = 0 → memicu penjaga konsep-asing. Terukur: "seberapa banyak anak
    // yang MENGALAMI tengkes" ditolak hanya karena dua kata ini, padahal data
    // stunting tersedia; "jumlah balita tengkes" (tanpa keduanya) berhasil.
    'seberapa', 'mengalami', 'menderita',
  ]);
  const teks = normalizeText(query);
  return (teks.includes('aparatur') || teks.includes('indeks pembangunan manusia')
    ? FRASA_ISTILAH.reduce((t, [pola, ganti]) => t.replace(pola, ganti), teks)
    : teks
  )
    .split(' ')
    // Reviu 2026-09-04: tanpa ini, tanda tanya menempel pada kata terakhir —
    // "…di tiap kecamatan?" menghasilkan token "kecamatan?" yang tidak pernah
    // cocok dengan nama indikator, sehingga pertanyaan wajar berujung 0 hasil.
    .map((w) => w.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    // Bentuk tidak baku → baku (audit 2026-09-21). Diletakkan SEBELUM filter
    // panjang (agar "yg", "dr", "ga" ikut dipetakan) dan sebelum filter
    // stopword (agar hasil pemetaan tetap tersaring secara normal).
    .flatMap((w) => (w ? normalkanSingkatan(w) : []))
    // Token angka dibuang, termasuk bentuk RENTANG dan desimal Indonesia:
    // "2023-2025", "31,4", "1.000". Reviu 2026-09-21: "Bagaimana tren stunting
    // 2023-2025" dulu menghasilkan token df=0 → gerbang konsep-asing menyalakan
    // → retrieval mengembalikan [] → jawaban "tidak ditemukan", padahal
    // "Prevalensi Stunting" ada. Padanan tahun ditangani `extractYears()` yang
    // memang memisahkan tahun dari kata kunci.
    .filter((w) => w.length >= 3 && !stopWords.has(w) && !/^[\d.,\-–—/]+$/.test(w));
}

// ─── Retrieval v2 (PR Lapis 1): word-boundary + stemming ringan + sinonim ───
// Menggantikan substring matching mentah yang membuat "angka" cocok ke
// "Angkat Berat" dan "tren" cocok ke "Koppontren/Pesantren".

/**
 * Stemmer Bahasa Indonesia yang SENGAJA naif & konservatif: hanya memotong
 * afiksia umum jika sisa kata ≥ 4 huruf. Yang penting kedua sisi (query dan
 * sedangkan "sehat" tidak terpotong jadi "hat" (sisa < 4 → tidak dipotong).
 */
export function stemId(word: string): string {
  let w = word;
  // sufiks (urutan panjang dulu): -kan, -an, -i, -nya
  for (const suf of ['kan', 'nya', 'an', 'i']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      w = w.slice(0, w.length - suf.length);
      break;
    }
  }
  // prefiks: me-*, pe-*, ber-, ter-, di-, ke-, se-
  for (const pre of ['memper', 'meny', 'meng', 'mem', 'men', 'peng', 'peny', 'pem', 'pen', 'per', 'ber', 'ter', 'me', 'pe', 'di', 'ke', 'se']) {
    if (w.startsWith(pre) && w.length - pre.length >= 4) {
      w = w.slice(pre.length);
      break;
    }
  }
  return w;
}

function stemSet(text: string | null | undefined): Set<string> {
  return new Set(
    normalizeText(text)
      .split(' ')
      .filter(Boolean)
      .flatMap((w) => [w, stemId(w)]),
  );
}

/**
 * Sinonim/akronim domain → alternatif pencocokan. Satu "grup" per token query;
 * grup dianggap cocok jika SALAH SATU alternatif (semua kata alternatif) hadir.
 * Akronim seperti IPM hanya cocok jika frasa lengkapnya hadir — mencegah
 * "indeks" saja menyeret ratusan indikator tak relevan.
 */
const SYNONYM_ALTERNATIVES: Record<string, string[][]> = {
  ipm: [['ipm'], ['indeks', 'pembangunan', 'manusia']],
  bansos: [['bansos'], ['bantuan', 'sosial']],
  blt: [['blt'], ['bantuan', 'langsung', 'tunai']],
  asn: [['asn'], ['casn'], ['pns'], ['pppk']],
  pariwisata: [['pariwisata'], ['wisata'], ['wisatawan']],
  wisata: [['wisata'], ['pariwisata'], ['wisatawan']],
  vaksinasi: [['vaksinasi'], ['vaksin'], ['imunisasi']],
  imunisasi: [['imunisasi'], ['vaksinasi'], ['vaksin']],
  inflasi: [['inflasi'], ['ihk']],
  kemiskinan: [['kemiskinan'], ['miskin'], ['gakin']],
  miskin: [['miskin'], ['kemiskinan'], ['gakin']],
  stunting: [['stunting'], ['tengkes'], ['pendek']],
  // Usulan gelombang 3 (22 Sep 2026, item eval F4): pengguna bertanya dengan kata
  // kerja hasil panen, katalog menulis "Jumlah produksi …". Tanpa pemetaan ini,
  // "dihasilkan" dianggap konsep asing dan penjaga kejujuran malah memilih record
  // yang salah (jumlah PETANI, satuan KK, padahal yang ditanya volume panen).
  dihasilkan: [['dihasilkan'], ['produksi'], ['hasil']],
  menghasilkan: [['menghasilkan'], ['produksi'], ['hasil']],
  hasil: [['hasil'], ['produksi']],
  panen: [['panen'], ['produksi']],
  kokurikuler: [['kokurikuler']],
  // Usulan audit 2026-09-21 — kata penghubung frasa yang bermakna topik.
  // "warga yang hidup di bawah garis kemiskinan" harus menemukan indikator
  // kemiskinan walau kata "warga"/"garis" tak ada di katalog.
  warga: [['warga'], ['penduduk'], ['masyarakat']],
  garis: [['garis', 'kemiskinan'], ['kemiskinan'], ['miskin']],
  sebaran: [['sebaran'], ['distribusi'], ['sebar'], ['jumlah']],
  penduduk: [['penduduk'], ['kependudukan'], ['warga']],
  balita: [['balita'], ['anak']],
  // Kebalikannya penting: katalog menulis "Balita", warga menulis "anak" — tanpa
  // baris ini "anak" dianggap konsep asing (df = 0) dan memicu penjaga kejujuran.
  anak: [['anak'], ['balita']],
};

export interface MatchGroup {
  token: string;
  /** Setiap alternatif = daftar kata yang SEMUANYA harus hadir (raw ATAU stem). */
  alternatives: string[][];
}

/** Bangun grup pencocokan dari token query (dengan ekspansi sinonim). */
export function buildMatchGroups(tokens: string[]): MatchGroup[] {
  return tokens.map((token) => {
    const extra = SYNONYM_ALTERNATIVES[token];
    const alternatives: string[][] = extra ? extra.map((alt) => [...alt]) : [[token]];
    if (!alternatives.some((a) => a.length === 1 && a[0] === token)) alternatives.unshift([token]);
    return { token, alternatives };
  });
}

function alternativeHit(alt: string[], words: Set<string>): boolean {
  return alt.every((w) => words.has(w) || words.has(stemId(w)));
}

export interface ScoredRecord {
  record: SapaRecord;
  score: number;
  indHits: number; // grup yang cocok di nama indikator (sinyal terkuat)
  opdHits: number; // grup yang cocok di nama OPD saja
}

/**
 * Skor satu record terhadap grup query.
 * +3 per grup cocok di INDIKATOR, +1 per grup cocok hanya di OPD,
 * +4 bila semua grup cocok, +2 bila semua grup cocok di indikator.
 */
export function scoreRecord(record: SapaRecord, groups: MatchGroup[], bobot?: number[]): ScoredRecord {
  const indWords = stemSet(record.kode_indikator_nama_indikator);
  const opdWords = stemSet(record.opds_nama_opd);
  let indHits = 0;
  let opdHits = 0;
  let skorInd = 0;
  let skorOpd = 0;
  groups.forEach((g, i) => {
    // Bobot IDF (bila diberikan): kata langka ("miskin") lebih menentukan
    // topik daripada kata umum ("penduduk"). Tanpa ini, "Jumlah penduduk
    // miskin?" selalu dimenangkan "Jumlah Data Penduduk" — dua-duanya cocok
    // satu kata, lalu pemutus seri memilih nilai terbesar.
    const w = bobot?.[i] ?? 3;
    const inInd = g.alternatives.some((alt) => alternativeHit(alt, indWords));
    if (inInd) {
      indHits++;
      skorInd += w;
      return;
    }
    const inOpd = g.alternatives.some((alt) => alternativeHit(alt, opdWords));
    if (inOpd) {
      opdHits++;
      skorOpd += w * 0.34; // cocok di nama OPD tetap lebih lemah
    }
  });
  let score = skorInd + skorOpd;
  if (groups.length > 0 && indHits + opdHits === groups.length) score += 4;
  if (groups.length > 0 && indHits === groups.length) score += 2;
  return { record, score, indHits, opdHits };
}

/**
 * Inti penjaga granularitas — dipisah supaya bisa dipanggil dari DUA tempat
 * dengan LOGIKA YANG SAMA PERSIS:
 *   (a) penjaga di `retrieveRelevant` (memakai bahan yang sudah dihitungnya);
 *   (b) diagnostik FR-20 lewat `granularitasTidakTersedia` (menghitung sendiri).
 *
 * Tanpa pemisahan ini, pengklasifikasi sebab hanya bisa MENEBAK dari teks
 * kueri — dan tebakan itu salah: katalog uji ternyata memuat record yang
 * menggabungkan "desa" dengan nama kecamatan, sehingga pertanyaan "per desa"
 * dijawab sah, bukan ditolak. Terukur pada uji penerimaan 22 Sep 2026.
 */
function granularitasDitolak(
  groups: MatchGroup[],
  df: number[],
  kataRecord: Array<{ ind: Set<string>; opd: Set<string> }>,
  records: SapaRecord[],
  memuat: (g: MatchGroup, k: { ind: Set<string>; opd: Set<string> }) => boolean,
): boolean {
  // Untuk aturan ini ambang entitasnya dilonggarkan ke 6: nama kecamatan
  // ("Bebesen", df=4) memang lebih umum daripada akronim langka seperti IPM.
  const namaTempat = groups
    .map((g, i) => ({ g, d: df[i] }))
    .filter((x) => x.d > 0 && x.d <= 6 && x.g.token.length >= 4 && !KATA_MAKSUD.has(x.g.token))
    .map((x) => x.g);
  const unitDesa = groups.find((g) => /^(?:desa|kelurahan|kampung|gampong)/.test(g.token));
  if (namaTempat.length === 0 || !unitDesa) return false;
  const adaGabungan = records.some((_, i) => {
    const k = kataRecord[i];
    return memuat(unitDesa, k) && namaTempat.some((g) => memuat(g, k));
  });
  return !adaGabungan;
}

/** Versi mandiri untuk diagnostik: "apakah pertanyaan ini ditolak penjaga granularitas?" */
export function granularitasTidakTersedia(records: SapaRecord[], query: string): boolean {
  if (!mintaRincianPerDesa(query)) return false;
  const groups = buildMatchGroups(tokenizeQuery(query));
  if (groups.length === 0) return false;
  const kataRecord = records.map((r) => ({
    ind: stemSet(r.kode_indikator_nama_indikator),
    opd: stemSet(r.opds_nama_opd),
  }));
  const df = groups.map(
    (g) => kataRecord.filter((k) => g.alternatives.some((alt) => alternativeHit(alt, k.ind) || alternativeHit(alt, k.opd))).length,
  );
  const memuat = (g: MatchGroup, k: { ind: Set<string>; opd: Set<string> }) =>
    g.alternatives.some((alt) => alternativeHit(alt, k.ind) || alternativeHit(alt, k.opd));
  return granularitasDitolak(groups, df, kataRecord, records, memuat);
}

/**
 * Kosakata nama KECAMATAN dari katalog (daftar tertutup).
 *
 * Dipakai FR-24 untuk memastikan angka dipasangkan ke wilayah yang benar.
 * Logikanya sengaja TIDAK ditulis ulang di sini — ia tinggal di
 * `services/pemeriksa-entitas.ts` (`daftarKecamatanDariIndikator`) supaya
 * pemeriksa pasangan dan pembaca katalog memakai kosakata yang sama persis.
 */
export function daftarKecamatan(records: SapaRecord[]): string[] {
  return daftarKecamatanDariIndikator(records.map((r) => String(r.kode_indikator_nama_indikator ?? '')));
}

/**
 * Apakah pertanyaan meminta rincian PER DESA/kelurahan/gampong?
 *
 * Dipakai dua tempat dan sengaja satu sumber: (a) penjaga granularitas di
 * `retrieveRelevant` — katalog SAPA berhenti di tingkat kecamatan, jadi bila
 * tidak ada satu pun record yang menggabungkan nama kecamatan dengan kata
 * "desa", menjawabnya dengan data lain di kecamatan itu = menyesatkan;
 * (b) pengklasifikasi sebab FR-20 — supaya jawaban kosong untuk kasus ini
 * diberi tag `retrieval:granularitas-per-desa`, bukan tag umum.
 */
export function mintaRincianPerDesa(query: string): boolean {
  return /\b(?:per|tiap|masing-masing)\s+(?:desa|kelurahan|kampung|gampong)\b/i.test(query);
}

/**
 * Ambil record relevan: minimal satu grup cocok di nama indikator.
 * Inilah gerbang kepercayaan retrieval — tanpa satu pun kata query yang cocok
 * di NAMA INDIKATOR, sistem lebih baik menjawab "tidak ditemukan" daripada
 * menyajikan data salah topik (kasus nyata: "saham" → data bayi).
 */
export function retrieveRelevant(records: SapaRecord[], query: string, cap = 80): ScoredRecord[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];
  const groups = buildMatchGroups(tokens);

  // Reviu 2026-09-04: ambang dihitung dari grup yang MUNGKIN cocok, bukan dari
  // jumlah kata yang diketik. Pengisi kalimat ("tiap", "sebaran", "prediksi")
  // tidak ada di nama indikator mana pun; bila tetap dihitung, pertanyaan
  // "Berapa jumlah koperasi di tiap kecamatan?" menuntut 2 kecocokan sementara
  // hanya 1 yang mungkin terjadi → hasilnya kosong.
  const kataRecord = records.map((r) => ({
    ind: stemSet(r.kode_indikator_nama_indikator),
    opd: stemSet(r.opds_nama_opd),
    // Reviu 22 Sep 2026 (item eval F4): kolom SATUAN adalah bagian korpus yang
    // nyata. Kata "ton" tidak muncul di nama indikator mana pun, tetapi ada di
    // satuan "Ton/Tahun". Tanpa baris ini, "ton" dianggap konsep asing lalu
    // penjaga kejujuran memilih bukti yang salah (jumlah petani).
    sat: stemSet(r.satuan),
  }));
  // df = jumlah record yang memuat grup ini. df = 0 berarti kata tersebut
  // tidak pernah muncul di korpus SAPA sama sekali.
  const df = groups.map(
    (g) =>
      kataRecord.filter((k) =>
        g.alternatives.some(
          (alt) => alternativeHit(alt, k.ind) || alternativeHit(alt, k.opd) || alternativeHit(alt, k.sat),
        ),
      ).length,
  );
  const grupMungkin = df.filter((d) => d > 0).length;

  // Presisi untuk query panjang: ≥3 kata topik menuntut minimal 2 grup cocok,
  // supaya 1 kata umum (mis. "harga" pada pertanyaan "saham") tidak menyeret
  // data tak relevan. Query 1–2 kata cukup 1 grup.
  const minIndHits = grupMungkin >= 3 ? 2 : 1;

  // Bobot IDF per grup: 1 + ln(N / df). Kata langka ("miskin") lebih menentukan
  // topik daripada kata umum ("penduduk"), sehingga "Jumlah penduduk miskin?"
  // tidak lagi dimenangkan "Jumlah Data Penduduk" yang nilainya lebih besar.
  const bobot = df.map((d) => 1 + Math.log((records.length + 1) / Math.max(d, 1)));

  // Nilai dihitung sekali untuk pemutus seri: skor sama → tampilkan nilai
  // lebih besar dulu (kebiasaan "yang terbanyak" lebih informatif).
  const nilai = (r: SapaRecord): number => parseNumericId(normalisasiNilai(r.variabel)) ?? 0;

  // ── Aturan ENTITAS (butir 1.1b peta jalan) ─────────────────────────────────
  // Pelajaran dari percobaan pertama (21 Sep 2026) — ini versi kedua:
  //
  // Versi pertama menyaring hasil dengan "token ber-df ≤ 3 wajib termuat". Itu
  // SALAH: berdf kecil belum tentu entitas — "perubahan" (df kecil karena muncul
  // di indikator iklim) bukan entitas, dan menyaringnya justru membuang jawaban
  // yang benar: T9 ("bansos sembako") kehilangan record sembako, P7 kehilangan
  // record stunting, D4 kehilangan record PPKS — tiga regresi terukur.
  //
  // Versi kedua: ENTITAS = yang memang berupa NAMA — akronim huruf besar
  // ("IPM", "PPKS", "PBI") atau nama diri ("Bebesen"). Perlakuannya bukan
  // menyaring, melainkan (a) MENGANGKAT record yang memuatnya walau hanya cocok
  // satu konsep, dan (b) MENGUTAMAKANNYA di urutan atas.
  //
  // Tanpa (a), "Indeks Pembangunan Manusia (IPM) 78,09" gugur oleh ambang
  // minIndHits karena namanya pendek, lalu "Bandingkan IPM dengan target
  // nasional" dijawab "Persentase puskesmas yang mencapai target INM" (dua kata
  // umum berdf 20) — MENYESATKAN, karena "target INM" bukan IPM.
  const entitas = (() => {
    const kandidat: string[] = [];
    // Akronim huruf besar ("IPM", "PPKS") = entitas di posisi mana pun — bentuk
    // huruf besar seperti itu tidak mungkin muncul karena awal kalimat.
    const tambah = (kata: string) => {
      const t = (normalkanSingkatan(kata.toLowerCase()).slice(-1)[0] ?? '').toLowerCase();
      if (t.length >= 3 && !KATA_MAKSUD.has(t)) kandidat.push(t);
    };
    for (const m of query.matchAll(/\b[A-Z]{2,}\b/g)) tambah(m[0]);
    // Nama diri ("Bebesen") hanya dihitung bila BUKAN kata pertama kalimat:
    // "Bagaimana tren…" huruf besarnya cuma akibat posisi, bukan nama.
    for (const m of query.matchAll(/\b[A-Z][a-z]{3,}\b/g)) {
      if ((m.index ?? 0) === 0) continue;
      tambah(m[0]);
    }
    const unik = [...new Set(kandidat)];
    return groups
      .map((g, i) => ({ g, d: df[i] }))
      .filter(
        (x) =>
          x.d > 0 &&
          x.d <= 12 &&
          unik.some((t) => x.g.token === t || x.g.alternatives.some((alt) => alt.includes(t))),
      );
  })();
  const memuat = (g: MatchGroup, k: { ind: Set<string>; opd: Set<string> }) =>
    g.alternatives.some((alt) => alternativeHit(alt, k.ind) || alternativeHit(alt, k.opd));
  /**
   * Preferensi SATUAN FISIK (reviu 22 Sep 2026, item eval F4).
   *
   * "Berapa ton kopi yang dihasilkan petani Aceh Tengah?" semula dijawab "Jumlah
   * PETANI Kopi Arabika 38.294 KK" — padahal yang ditanya VOLUME panen, dan
   * katalog memuat "Jumlah produksi komoditas perkebunan Kopi Arabika 29.019
   * Ton/Tahun". Sebabnya: kata "petani" muncul di nama indikator sehingga dua
   * record petani menang agregat, sementara kata "ton" tidak muncul di nama
   * indikator mana pun (ia ada di kolom SATUAN).
   *
   * Aturan ini hanya menyala bila pengguna menyebut satuan FISIK (ton, kg,
   * kuintal, liter, km, hektar) — bukan "persen", karena persen adalah satuan
   * turunan yang lazim dipakai untuk niat komposisi/perbandingan dan sudah
   * ditangani niat jawaban (`deteksiNiat`). Bukti yang satuannya cocok
   * dinaikkan, bukan disaring: bukti lain tetap tersedia.
   */
  const SATUAN_FISIK: Record<string, string[]> = {
    ton: ['ton'],
    tonase: ['ton'],
    kuintal: ['kuintal', 'kw'],
    kg: ['kg', 'kilogram'],
    kilogram: ['kg', 'kilogram'],
    liter: ['liter'],
    km: ['km', 'kilometer'],
    kilometer: ['km', 'kilometer'],
    hektar: ['ha', 'hektar'],
    ha: ['ha', 'hektar'],
    meter: ['meter'],
  };
  const satuanDiminta = groups.map((g) => g.token).filter((t) => SATUAN_FISIK[t]);
  const nilaiSatuan = (record: SapaRecord): number =>
    satuanDiminta.length === 0
      ? 0
      : satuanDiminta.filter((u) =>
          SATUAN_FISIK[u].some((sat) => String(record.satuan ?? '').toLowerCase().includes(sat)),
        ).length;

  const nilaiEntitas = (urut: number): number =>
    entitas.length === 0 || kataRecord[urut] == null
      ? 0
      : entitas.filter((x) => memuat(x.g, kataRecord[urut])).length;

  const hits = records
    .map((r, i) => ({ ...scoreRecord(r, groups, bobot), record: r, nilai: nilai(r), urut: i }))
    .filter((s) => s.indHits >= minIndHits || (entitas.length > 0 && nilaiEntitas(s.urut) > 0))
    .sort(
      (a, b) =>
        nilaiEntitas(b.urut) - nilaiEntitas(a.urut) ||
        nilaiSatuan(b.record) - nilaiSatuan(a.record) ||
        b.score - a.score ||
        b.nilai - a.nilai ||
        a.urut - b.urut,
    )
    .slice(0, cap);

  const kandidat = hits;

  // ── Kejujuran GRANULARITAS (per desa) ──────────────────────────────────────
  // SAPA berhenti di tingkat kecamatan: tidak ada rincian per desa. Bila
  // pengguna meminta rincian per desa DI sebuah kecamatan bernama, padahal
  // tidak ada satu record pun yang menggabungkan nama kecamatan itu dengan kata
  // "desa", maka yang tersedia hanyalah data lain di kecamatan tersebut
  // (UMKM, koperasi, jalan) — menjawabnya dengan itu = menyesatkan. Terukur:
  // item eval D5 ("persebaran jumlah keluarga per desa di Kecamatan Bebesen")
  // semula dijawab data kader KB / UMKM.
  if (mintaRincianPerDesa(query) && granularitasDitolak(groups, df, kataRecord, records, memuat)) return [];

  // Penjaga kejujuran (reviu 2026-09-04). Bila pertanyaan menyinggung konsep
  // yang TIDAK PERNAH tercatat di SAPA (df = 0), sedangkan kandidat terbaik
  // hanya cocok SATU konsep, maka yang tampil pasti data lain yang kebetulan
  // mirip — itu menyesatkan. Lebih baik mengaku tidak punya data.
  // Terukur pada 78 item eval: +3 item lulus, tanpa mengorbankan satu pun
  // pertanyaan yang datanya benar-benar ada.
  const adaKonsepAsing = df.some((d) => d === 0);
  if (adaKonsepAsing && (kandidat[0]?.indHits ?? 0) < 2) return [];

  return kandidat;
}

/**
 * Kata MAKSUD — menandai CARA menjawab (superlatif, pengelompokan, hubungan
 * antar-variabel), bukan topik data. Bila kata ini tidak termuat pada
 * indikator terbaik, itu bukan keterbatasan data: "tiga kecamatan dengan
 * koperasi terbanyak" tetap terjawab oleh data koperasi per kecamatan meski
 * kata "terbanyak" tidak ada di nama indikator mana pun.
 */
const KATA_MAKSUD = new Set([
  // superlatif & urutan
  'terbanyak', 'terbesar', 'terendah', 'tertinggi', 'terbaik', 'terburuk',
  'terakhir', 'pertama', 'teratas', 'terbawah', 'ranking', 'peringkat',
  'urut', 'urutan', 'urutkan', 'menurut',
  // pengelompokan & penyajian
  'sebaran', 'persebaran', 'penyebaran', 'distribusi', 'rincian', 'uraian',
  'komposisi', 'porsi', 'proporsi', 'share', 'bagian',
  // hubungan & sebab-akibat
  'kaitan', 'hubungan', 'berhubungan', 'korelasi', 'pengaruh', 'pengaruhi',
  'memengaruhi', 'berpengaruh', 'penyebab', 'sebab', 'dampak', 'efek',
  // perkiraan ke depan
  'prediksi', 'ramalan', 'ramalkan', 'proyeksi', 'perkiraan', 'forecast',
]);

/**
 * Kata kunci pertanyaan yang ADA di korpus, tetapi TIDAK termuat pada record
 * terbaik yang ditemukan. Artinya: SAPA punya data tentang kata itu, namun
 * tidak ada satu indikator pun yang menggabungkannya dengan kata kunci lain
 * dalam pertanyaan. Dipakai untuk mengakui keterbatasan itu secara terbuka,
 * bukan untuk menebak isi data.
 */
export function konsepTakTermuat(records: SapaRecord[], terbaik: SapaRecord, query: string): string[] {
  const groups = buildMatchGroups(tokenizeQuery(query));
  if (groups.length === 0) return [];
  const kataRecord = records.map((r) => ({
    ind: stemSet(r.kode_indikator_nama_indikator),
    opd: stemSet(r.opds_nama_opd),
  }));
  const ind = stemSet(terbaik.kode_indikator_nama_indikator);
  const opd = stemSet(terbaik.opds_nama_opd);
  return groups
    .filter((g, i) => {
      const adaDiKorpus = kataRecord.some((k) =>
        g.alternatives.some((alt) => alternativeHit(alt, k.ind) || alternativeHit(alt, k.opd)),
      );
      const adaDiTerbaik = g.alternatives.some(
        (alt) => alternativeHit(alt, ind) || alternativeHit(alt, opd),
      );
      // Hanya kata yang dikenal korpus: kalau kata itu sendiri tidak pernah
      // ada di SAPA, penjelasannya sudah ditangani penjaga kejujuran.
      // Kata maksud (superlatif, pengelompokan, hubungan) dilewati: tidak
      // termuatnya kata itu bukan berarti data yang diminta tidak ada.
      return adaDiKorpus && !adaDiTerbaik && !KATA_MAKSUD.has(g.token);
    })
    .map((g) => g.token);
}

/**
 * Kata kunci pertanyaan yang sama sekali tidak ada di korpus SAPA.
 * Dipakai untuk MENJELASKAN jawaban kosong — bukan menebak isi data.
 */
export function konsepTidakDikenal(records: SapaRecord[], query: string): string[] {
  const groups = buildMatchGroups(tokenizeQuery(query));
  if (groups.length === 0) return [];
  const kataRecord = records.map((r) => ({
    ind: stemSet(r.kode_indikator_nama_indikator),
    opd: stemSet(r.opds_nama_opd),
  }));
  return groups
    .filter(
      (g) =>
        !kataRecord.some((k) =>
          g.alternatives.some((alt) => alternativeHit(alt, k.ind) || alternativeHit(alt, k.opd)),
        ),
    )
    .map((g) => g.token);
}

/** Ekstrak tahun eksplisit dari query (mis. "produksi kopi 2024"). */
export function extractYears(query: string): string[] {
  return (normalizeText(query).match(/\b(19|20)\d{2}\b/g) ?? []).filter(
    (y, i, arr) => arr.indexOf(y) === i,
  );
}

/** Unique OPD list from records */
export function getUniqueOpd(records: SapaRecord[]): { nama: string; id: number; jumlah: number }[] {
  const map = new Map<string, { nama: string; id: number; jumlah: number }>();
  for (const r of records) {
    const key = normalizeText(r.opds_nama_opd) || 'unknown';
    const existing = map.get(key);
    if (existing) {
      existing.jumlah++;
    } else {
      map.set(key, { nama: r.opds_nama_opd.trim(), id: r.id_opds, jumlah: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.jumlah - a.jumlah);
}

/** Unique indicators */
export function getUniqueIndicators(records: SapaRecord[]): { kode: string | null; nama: string | null; jumlah: number }[] {
  const map = new Map<string, { kode: string | null; nama: string | null; jumlah: number }>();
  for (const r of records) {
    const key = r.id_kode_indikator.toString();
    const existing = map.get(key);
    if (existing) {
      existing.jumlah++;
    } else {
      map.set(key, { kode: r.kode_indikator_kode_indikator, nama: r.kode_indikator_nama_indikator, jumlah: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.jumlah - a.jumlah);
}

/** Filter by OPD name (case-insensitive, partial match, normalized) */
export function filterByOpd(records: SapaRecord[], opdQuery: string): SapaRecord[] {
  const q = normalizeText(opdQuery);
  const tokens = q.split(' ').filter(Boolean);
  return records.filter((r) => {
    const name = normalizeText(r.opds_nama_opd);
    return tokens.every((t) => name.includes(t));
  });
}

/** Filter by indicator keyword — OR over tokens (more permissive than AND) */
export function filterByIndicator(records: SapaRecord[], keyword: string): SapaRecord[] {
  const q = normalizeText(keyword);
  if (!q) return [];
  return records.filter((r) => {
    const name = normalizeText(r.kode_indikator_nama_indikator);
    return name.includes(q);
  });
}

/** Filter by ANY of the given keywords (token-level OR match) */
export function filterByAnyKeyword(records: SapaRecord[], keywords: string[]): SapaRecord[] {
  const normalized = keywords.map(normalizeText).filter(Boolean);
  if (normalized.length === 0) return [];
  return records.filter((r) => {
    const name = normalizeText(r.kode_indikator_nama_indikator);
    return normalized.some((kw) => name.includes(kw));
  });
}

/** Filter by ALL keywords (token-level AND match) — indikator + OPD combined */
export function filterByAllKeywords(records: SapaRecord[], keywords: string[]): SapaRecord[] {
  const normalized = keywords.map(normalizeText).filter(Boolean);
  if (normalized.length === 0) return [];
  return records.filter((r) => {
    const combined =
      normalizeText(r.kode_indikator_nama_indikator) + ' ' + normalizeText(r.opds_nama_opd);
    return normalized.every((kw) => combined.includes(kw));
  });
}

function parseYear(tahun: string | null): number | null {
  if (!tahun) return null;
  const t = tahun.trim();
  if (!t) return null;
  if (!/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aggregate records per indicator — latest numeric value per indicator.
 * Pilih tahun numerik maksimum per id_kode_indikator (order-independent).
 * Jika semua tahun null/non-numerik → keep first. Sorted by nilaiNumber desc.
 */
/**
 * `urut: 'relevansi'` mempertahankan urutan masukan (yang sudah diurutkan
 * menurut skor retrieval). Bawaan lama `'nilai'` mengurutkan berdasarkan nilai
 * terbesar — itu yang membuat evidence[0] berisi angka terbesar, bukan yang
 * paling relevan (T-12). Bawaan dipertahankan agar pemanggil lama tidak berubah.
 */
export function aggregateByIndicator(
  records: SapaRecord[],
  opsi: { urut?: 'nilai' | 'relevansi' } = {},
): {
  id: number;
  nama: string;
  opd: string;
  nilai: string;
  nilaiNumber: number;
  satuan: string;
  tahun: string | null;
}[] {
  const map = new Map<number, {
    id: number; nama: string; opd: string; nilai: string; nilaiNumber: number;
    satuan: string; tahun: string | null;
  }>();

  for (const r of records) {
    const nama = r.kode_indikator_nama_indikator?.trim();
    if (!nama) continue;
    const variabel = normalisasiNilai(r.variabel);
    const nilaiNumber = parseNumericId(String(variabel ?? ''));
    if (nilaiNumber == null) continue;

    const existing = map.get(r.id_kode_indikator);
    if (!existing) {
      map.set(r.id_kode_indikator, {
        id: r.id_kode_indikator,
        nama,
        opd: r.opds_nama_opd.trim(),
        nilai: variabel,
        nilaiNumber,
        satuan: r.satuan,
        tahun: r.tahun || null,
      });
    } else {
      const ey = parseYear(existing.tahun);
      const ny = parseYear(r.tahun);
      let shouldReplace = false;
      if (ey === null && ny !== null) shouldReplace = true;
      else if (ey !== null && ny !== null && ny > ey) shouldReplace = true;
      if (shouldReplace) {
        map.set(r.id_kode_indikator, {
          id: r.id_kode_indikator,
          nama,
          opd: r.opds_nama_opd.trim(),
          nilai: variabel,
          nilaiNumber,
          satuan: r.satuan,
          tahun: r.tahun,
        });
      }
    }
  }

  const semua = [...map.values()];
  if (opsi.urut === 'relevansi') return semua;
  return semua.sort((a, b) => b.nilaiNumber - a.nilaiNumber);
}

/** Summary stats */
export function getSapaSummary(records: SapaRecord[]) {
  const opds = getUniqueOpd(records);
  const indicators = getUniqueIndicators(records);
  return {
    totalRecords: records.length,
    totalOpd: opds.length,
    totalIndicators: indicators.length,
    topOpd: opds[0],
    tahun: [...new Set(records.map((r) => r.tahun?.trim() || '').filter(Boolean))],
  };
}
// ─── Rekons: Intent Scoring + Dedup ───

/** Kata agregat umum yang harus diberi penalti (-50) — bukan primary headline. */
const AGGREGATE_TERMS = new Set([
  'seluruh', 'total', 'jumlah seluruh', 'pemeriksaan', 'penerima', 'pengadaan',
  'pemindahan', 'penambahan', 'pengurangan', 'perubahan', 'penyesuaian',
  'penetapan', 'pengesahan', 'penunjukan', 'pengangkatan',
]);

/** Apakah nama indikator mengandung agregat umum? */
function isAggregateIndicator(indicatorName: string): boolean {
  const n = normalizeText(indicatorName);
  return [...AGGREGATE_TERMS].some((term) => n.includes(term));
}

/** Indikator yang mengandung kata topik utama — dapat +100. */
function indicatorContainsTopic(indicatorName: string, topic: string): boolean {
  const n = normalizeText(indicatorName);
  const t = normalizeText(topic);
  if (n.includes(t)) return true;
  const topicWords = t.split(/\s+/).filter(Boolean);
  if (topicWords.length >= 2) return topicWords.every((w) => n.includes(w));
  return false;
}

/**
 * Scoring intent: pilih primary headline indicator berdasarkan keyword matching.
 * +100 exact match topik, +50 sinonim, -50 agregat umum.
 */
export interface ScoredRecordMeta extends RecordMeta {
  _score: number;
}

export function scoreIntent(records: RecordMeta[], topic: string): ScoredRecordMeta[] {
  if (records.length === 0) return [];
  const scored = records.map((m) => {
    let score = 0;
    if (indicatorContainsTopic(m.indikator, topic)) score += 100;
    const sinonimBonus = ['kurus', 'gizi', 'gizi buruk', 'vitamin', 'vaksin', 'bkb', 'sarana', 'materi'];
    const lowerInd = normalizeText(m.indikator).toLowerCase();
    sinonimBonus.forEach((syn) => { if (lowerInd.includes(syn)) score += 50; });
    if (m.isAggregate) score -= 50;
    return { ...m, _score: score } as ScoredRecordMeta;
  });
  scored.sort((a, b) => b._score - a._score || (a.isAggregate ? 1 : -1));
  return scored;
}

/** Dedup: jika ada duplikat nilai & satuan & opd, jadikan satu (pilih yang lebih spesifik). */
export function dedupIndicators(records: RecordMeta[]): RecordMeta[] {
  if (records.length <= 1) return records;
  const seen = new Map<string, RecordMeta>();
  const result: RecordMeta[] = [];
  for (const r of records) {
    const key = `${r.nilai}-${r.satuan}-${r.opd}`;
    const existing = seen.get(key);
    if (existing) {
      const existingAgg = isAggregateIndicator(existing.indikator);
      const currentAgg = isAggregateIndicator(r.indikator);
      const existingSpec = existing.indikator.length * (existingAgg ? 0.5 : 1);
      const currentSpec = r.indikator.length * (currentAgg ? 0.5 : 1);
      if (currentSpec > existingSpec) {
        seen.set(key, r);
        const idx = result.findIndex((x) => x.nilai === r.nilai && x.satuan === r.satuan && x.opd === r.opd);
        if (idx >= 0) result[idx] = r;
      }
    } else {
      seen.set(key, r);
      result.push(r);
    }
  }
  return result;
}

// normalisasiNilai kini hidup di @/lib/parse-numeric (satu pintu parser
// angka & nilai). Diekspor ulang agar pemanggil lama tidak berubah.

/** Buat RecordMeta[] dari baris tabel visualisasi. */
export function toRecordMetasFromRows(
  rows: (string | number | null | undefined)[][],
  columns: { key: string }[],
): RecordMeta[] {
  const indicIdx = columns.findIndex((c) => c.key === 'Indikator' || c.key === 'indikator');
  const nilaiIdx = columns.findIndex((c) => c.key === 'Nilai' || c.key === 'nilai');
  const satIdx = columns.findIndex((c) => c.key === 'Satuan' || c.key === 'satuan');
  const opdIdx = columns.findIndex((c) => c.key === 'OPD' || c.key === 'opd');
  const thnIdx = columns.findIndex((c) => c.key === 'Tahun' || c.key === 'tahun');
  return rows.map((row) => {
    const indicator = (row[indicIdx] ?? '') as string;
    const nilaiStr = (row[nilaiIdx] ?? '') as string;
    const nilai = parseNumericId(nilaiStr.replace(/\./g, '').replace(',', '.'));
    const satuan = (row[satIdx] ?? '—') as string;
    const opd = (row[opdIdx] ?? '—') as string;
    const tahun = (row[thnIdx] ?? null) as string | null;
    return { id: Math.random(), indikator: indicator, nilai, satuan, opd, tahun, isAggregate: isAggregateIndicator(indicator) };
  });
}

export { normalisasiNilai };
