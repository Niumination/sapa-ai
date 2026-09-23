// ─── FR-24: Pemeriksa pasangan entitas (nilai ↔ indikator ↔ OPD ↔ wilayah) ───
//
// MASALAH YANG DISELESAIKAN — *deceptive grounding*
//
// Gerbang grounding yang sudah ada memeriksa satu hal: apakah angka di narasi
// ADA di daftar bukti. Itu menutup halusinasi, tetapi TIDAK menutup pasangan
// yang tertukar. Model (atau penyusun narasi apa pun) bisa menulis:
//
//   "Produksi kopi arabika 29.019 Jiwa menurut Dinas Kesehatan pada 2024"
//
// Setiap angka di kalimat itu ADA di daftar bukti — 29.019 memang produksi kopi,
// tetapi satuannya Ton/Tahun, OPD-nya Dinas Pertanian, dan tahunnya 2025.
// Jawaban seperti ini lolos grounding dan lolos anti-halu, padahal salah pada
// tiga hal sekaligus. Inilah *deceptive grounding*: benar angkanya, salah
// pasangannya.
//
// YANG DIPERIKSA (satu kalimat pada satu waktu — pasangan selalu lokal)
//
//   1. `nilai-tak-ada`        angka tidak dimiliki baris bukti mana pun (keras)
//   2. `entitas-bertabrakan`  kalimat menyebut kecamatan X, tetapi angka itu
//                             milik baris yang BUKAN X (termasuk baris tanpa
//                             wilayah = tingkat kabupaten) (keras)
//   3. `satuan-bertabrakan`   satuan yang tertulis adalah satuan milik baris
//                             LAIN di katalog (keras) — jadi bukan sekadar
//                             parafrase ("orang" vs "jiwa"), melainkan tertukar
//   4. `tahun-bertabrakan`    tahun di kalimat milik baris lain (lunak)
//   5. `nilai-ambigu`         angka muncul di banyak baris berbeda dan kalimat
//                             tidak menunjuk entitas mana pun (lunak)
//
// Keras = jawaban model DITOLAK dan diganti jawaban deterministik (FR-24 gate).
// Lunak = dilaporkan untuk ditinjau operator, jawaban tetap disajikan.
//
// MENGAPA ATURANNYA SENGAJA KAKU
//   Pemeriksa yang terlalu pintar (menebak maksud kalimat) justru berbahaya:
//   ia akan meloloskan pasangan yang salah ketika kalimatnya halus. Karena itu
//   setiap aturan di sini berbasis hal yang bisa dibuktikan dari teks + daftar
//   bukti: angka (ternormalisasi), nama kecamatan (kosakata tertutup dari
//   katalog), satuan (kosakata katalog), dan tahun.
//
// ATURAN ANGKA YANG DIPAKAI SAMA DENGAN UJI INVARIAN EVAL (`eval-run.mjs`):
//   titik = pemisah ribuan, koma = desimal ("2.065" → "2065", "31,4" → "31.4").
//   Kutipan pertanyaan, rujukan peraturan ("UU No. 27/2022"), dan kalimat
//   ketiadaan data ("Tidak ada data untuk tahun 1990 di SAPA") DIBUANG lebih
//   dulu — ketiganya bukan klaim sistem. Bila aturan ini diubah, ubah keduanya.
//
// DUA JENIS ANGKA YANG BUKAN KLAIM NILAI (perbaikan 23 Sep 2026 — terukur pada
// korpus PRODUKSI 2.065 record; sebelumnya keduanya MENUDUH jawaban yang benar):
//   1. HITUNGAN STRUKTURAL KATALOG — "…mencakup 15 indikator unik dari 8 OPD
//      (Badan Pengelolaan Keuangan; …)". Angka 15 dan 8 adalah ukuran daftar,
//      bukan nilai data; tetapi aturan OPD membacanya sebagai "8 diklaim milik
//      Badan Pengelolaan Keuangan" karena nama OPD pertama daftar itu muncul
//      sesudah tanda kurung. Enam item eval gagal karena pola ini.
//   2. ANGKA YANG MERUPAKAN BAGIAN DARI NAMA INDIKATOR — "Cakupan Penjaringan
//      Kesehatan siswa kelas 7 SMP/MTs 100 Persen": 7 berasal dari nama, bukan
//      nilai. Karena itu teks nama indikator dibuang lebih dulu dari kalimat
//      SALINAN yang dipakai mengekstrak angka (kalimat asli tetap dipakai untuk
//      pelaporan temuan). Nama OPD SENGAJA TIDAK dibuang: menyebut OPD adalah
//      cara utama pemeriksa ini menautkan angka ke pemiliknya.
// Keduanya dipisah menjadi fungsi yang dapat diuji (`angkaBukanKlaim`).

export interface BarisBukti {
  indikator: string;
  opd: string;
  nilai: string;
  satuan?: string | null;
  tahun?: string | null;
}

export type JenisTemuan =
  | 'nilai-tak-ada'
  | 'entitas-bertabrakan'
  | 'opd-bertabrakan'
  | 'satuan-bertabrakan'
  | 'tahun-bertabrakan'
  | 'nilai-ambigu';

/** Jenis temuan yang MEMBUAT narasi ditolak. Sisanya hanya dilaporkan. */
export const TEMUAN_KERAS: JenisTemuan[] = ['nilai-tak-ada', 'entitas-bertabrakan', 'opd-bertabrakan', 'satuan-bertabrakan'];

export interface Temuan {
  jenis: JenisTemuan;
  keras: boolean;
  /** Angka yang diperiksa, bentuk ternormalisasi ("29190"). */
  nilai: string;
  /** Kalimat tempat temuan berasal (dipotong agar tak membanjiri balasan). */
  kalimat: string;
  /** Yang tertulis di kalimat — wilayah/satuan/tahun yang bertabrakan. */
  diklaim?: string;
  /** Pemilik angka yang sebenarnya, dalam bentuk terbaca ("Kopi Arabika @ Dinas Pertanian"). */
  sebenarnya: string[];
}

export interface HasilPemeriksaan {
  ok: boolean;
  /** Jumlah angka berbeda yang benar-benar diperiksa (bukan angka yang dibuang). */
  jumlahNilai: number;
  jumlahKalimat: number;
  keras: number;
  lunak: number;
  temuan: Temuan[];
}

export interface OpsiPemeriksaan {
  /** Kosakata kecamatan tertutup dari katalog (lihat `daftarKecamatan`). */
  kecamatan?: string[];
  /**
   * Angka yang sah walau bukan nilai bukti — konstanta sistem yang sama dengan
   * yang dipakai gerbang grounding (jumlah record katalog, jumlah OPD, jumlah
   * baris bukti, tahun yang diminta pengguna, …). Tanpa ini, pemeriksa akan
   * menuduh "15 indikator terkait" sebagai angka tak ada.
   */
  nilaiDiizinkan?: Array<string | number>;
}

/** "2.065" → "2065"; "31,4" → "31.4"; "1.234,5" → "1234.5". */
export function normalisasiAngka(teks: string): string {
  return String(teks).replace(/\./g, '').replace(',', '.').trim();
}

/** Semua angka di teks, bentuk ternormalisasi. Cermin `angkaDiTeks` di uji eval. */
export function angkaDalamTeks(teks: string): string[] {
  return (teks.match(/\d[\d.,]*\d|\d/g) ?? []).map(normalisasiAngka).filter((s) => s !== '');
}

/**
 * Buang bagian teks yang BUKAN klaim sistem sebelum diperiksa: kutipan
 * pertanyaan, rujukan peraturan, dan kalimat ketiadaan data (yang mengutip tahun
 * dari pengguna untuk menyatakan datanya tidak ada).
 */
export function bersihkanNarasi(narasi: string): string {
  return narasi
    .replace(/"[^"]*"/g, ' ')
    .replace(/“[^”]*”/g, ' ')
    .replace(/\b(UU|PP|Perpres|Perbup|Permendagri|Permen)\s*(No\.?|Nomor)\s*[\d./]+/gi, ' ')
    .replace(/\bNo\.?\s*[\d./]+/gi, ' ')
    .replace(/Tidak ada data untuk tahun [^.]*di SAPA\.?/gi, ' ');
}

/**
 * Pecah narasi menjadi KLAUSA: titik, titik koma, dan koma yang diikuti spasi.
 *
 * Mengapa koma ikut: satu kalimat bisa memuat dua klausa yang berbeda pemilik
 * angkanya — "Jumlah Tenaga Kesehatan Puskesmas di Kecamatan Celala tercatat
 * 892,26 Orang, dengan rincian terbesar pada 8313 Orang". Memeriksa per kalimat
 * membuat angka 8313 dituduh milik Celala, padahal ia milik baris lain.
 * Terukur 23 Sep 2026 (3 dari 50 keluaran mode AI) — penuduhan palsu seperti ini
 * menolak jawaban yang benar, jadi harus dihilangkan di sumbernya.
 *
 * Koma DESIMAL tidak ikut memecah karena hanya koma YANG DIIKUTI SPASI yang
 * menjadi pemisah ("892,26" tetap utuh, "…, dengan…" terpecah).
 */
export function pecahKalimat(narasi: string): string[] {
  return narasi
    .split(/(?<=[.;!?])\s+|;\s+|,\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Angka yang muncul di LABEL katalog (mis. "Usia 7-12 Tahun", "JAB(5)") bukan klaim nilai. */
function angkaLabel(b: BarisBukti): string[] {
  return [...angkaDalamTeks(b.indikator ?? ''), ...angkaDalamTeks(b.opd ?? ''), ...angkaDalamTeks(b.satuan ?? '')];
}

/** Pemilik satu angka: baris yang nilai (atau rentang nilainya) memuat angka itu. */
export function pemilikAngka(angka: string, bukti: BarisBukti[]): BarisBukti[] {
  const hasil: BarisBukti[] = [];
  for (const b of bukti) {
    const nilai = String(b.nilai ?? '');
    const dimiliki = angkaDalamTeks(nilai).includes(angka);
    // Rentang ("2022–2026") = dua angka yang sah, keduanya milik baris ini.
    const dalamRentang =
      !dimiliki &&
      [...nilai.matchAll(/(\d[\d.,]*)\s*[–—-]\s*(\d[\d.,]*)/g)].some((m) =>
        [m[1], m[2]].map(normalisasiAngka).includes(angka),
      );
    if (dimiliki || dalamRentang) hasil.push(b);
  }
  return hasil;
}

/**
 * Ekor kalimat yang sering ikut tertangkap setelah nama kecamatan.
 * Tanpa pemangkasan ini, "Kecamatan Linge Tahun Anggaran" menghasilkan wilayah
 * karangan bernama "Linge Tahun Anggaran".
 */
const EKOR_BUKAN_WILAYAH = new Set([
  'tahun', 'di', 'dan', 'per', 'pada', 'jumlah', 'angka', 'tingkat', 'desa', 'kelurahan',
  'kabupaten', 'kecamatan', 'provinsi', 'dengan', 'yang', 'untuk', 'dari', 'serta',
  'persentase', 'indeks', 'prevalensi', 'rasio', 'rata', 'total', 'data', 'sasaran',
  'anggaran', 'penduduk', 'keluarga', 'laporan',
]);

/**
 * Kosakata nama KECAMATAN dari daftar NAMA INDIKATOR — daftar tertutup untuk
 * pemeriksa pasangan entitas (FR-24).
 *
 * Inilah satu-satunya implementasi pengambilan wilayah di sistem ini;
 * `daftarKecamatan(records)` di `sapa-client.ts` hanya membungkusnya agar
 * pemanggil yang memegang katalog tidak perlu tahu bentuk record.
 *
 * Dua hal yang membuat pengambilan ini aman:
 *   (a) kandidat diambil dari maksimal tiga kata berhuruf besar setelah kata
 *       "Kecamatan", lalu EKOR umum dipangkas ("Linge Tahun 2025" → "Linge");
 *   (b) kandidat harus muncul di MINIMAL DUA nama berbeda. Nama kecamatan
 *       selalu berulang (satu kecamatan punya banyak indikator), sedangkan ekor
 *       kalimat yang ikut tertangkap biasanya muncul sekali.
 */
export function daftarKecamatanDariIndikator(namaIndikator: string[]): string[] {
  const jumlah = new Map<string, number>();
  for (const nama of namaIndikator) {
    for (const m of String(nama ?? '').matchAll(/Kecamatan\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,2})/g)) {
      let kata = (m[1] ?? '').split(/\s+/).filter(Boolean);
      while (kata.length > 1 && EKOR_BUKAN_WILAYAH.has(kata[kata.length - 1].toLowerCase())) kata = kata.slice(0, -1);
      if (kata.length === 0) continue;
      const utuh = kata.join(' ');
      if (EKOR_BUKAN_WILAYAH.has(utuh.toLowerCase())) continue;
      jumlah.set(utuh, (jumlah.get(utuh) ?? 0) + 1);
    }
  }
  return [...jumlah.entries()].filter(([, n]) => n >= 2).map(([nama]) => nama).sort();
}

/**
 * Apakah angka ini adalah TAHUN yang dikenal bukti?
 *
 * Penting supaya tahun yang ditulis di narasi ("… (Dinas Pertanian, 2025)")
 * tidak dituduh sebagai angka karangan. Tahun adalah METADATA, bukan nilai
 * klaim — karena itu ia tidak diperiksa oleh aturan pasangan (wilayah/satuan),
 * melainkan hanya dipakai pembanding di aturan tahun.
 */
export function tahunDalamBukti(angka: string, bukti: BarisBukti[]): boolean {
  if (!/^(?:19|20)\d{2}$/.test(angka)) return false;
  return bukti.some((b) => String(b.tahun ?? '').trim() === angka);
}

/** Wilayah (kecamatan) yang disebut dalam sebuah indikator. */
export function kecamatanIndikator(indikator: string, kosakata: string[]): string[] {
  const t = normalisasiWilayah(indikator);
  return kosakata.filter((k) => t.includes(normalisasiWilayah(k)));
}

/** Samakan bentuk untuk pencocokan (huruf kecil, tanpa tanda baca ganda). */
export function normalisasiWilayah(teks: string): string {
  return ` ${String(teks).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

/**
 * Satuan yang tertulis TEPAT SESUDAH sebuah angka ("29.019 ton", "9.588 pegawai").
 * Sengaja tidak mencari satuan jauh dari angka: pasangan angka↔satuan harus
 * bersebelahan, kalau tidak pemeriksa akan menuduh kalimat yang menyebut dua
 * baris berbeda.
 */
export function satuanSetelahAngka(kalimat: string, angka: string): string | null {
  const pola = new RegExp(
    `${angka.replace('.', '[.,]')}(?:\\s*[.,]\\d+)?\\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ/\\-]{1,20})`,
    'i',
  );
  const m = kalimat.replace(/(\d)\.(\d{3})\b/g, '$1$2').match(pola);
  if (!m) return null;
  const kata = m[1].toLowerCase();
  // Kata sambung & kata kerja BUKAN satuan: "29.019 pada 2025" jangan dibaca
  // sebagai nilai bersatuan "pada" — kalau tidak, setiap kalimat bertahun akan
  // dituduh satuan bertabrakan.
  if (KATA_BUKAN_SATUAN.has(kata)) return null;
  return kata;
}

/** Kata yang sering muncul tepat setelah angka tetapi bukan satuan. */
const KATA_BUKAN_SATUAN = new Set([
  'pada', 'tahun', 'di', 'dan', 'atau', 'dengan', 'menurut', 'sebesar', 'sebanyak', 'sekitar',
  'dari', 'untuk', 'ini', 'itu', 'adalah', 'yang', 'mencapai', 'tercatat', 'naik', 'turun',
  // Kata besaran, bukan satuan. Satuan yang SALAH tetap tertangkap selama kata
  // itu ada di kosakata satuan katalog ("persen", "jiwa", "ton", "pegawai", …):
  // aturan satuan hanya menyala untuk kata yang memang dipakai katalog.
  'juta', 'ribu', 'miliar', 'triliun',
]);

/** Kata pertama satuan ("Ton/Tahun" → "ton", "Per 1000 Kelahiran" → "per"). */
export function kataSatuan(satuan?: string | null): string {
  const s = String(satuan ?? '').trim().toLowerCase();
  if (!s) return '';
  return s.split(/[\s/]+/)[0] ?? '';
}

/**
 * Kunci pencocokan nama OPD di dalam kalimat: nama OPD apa adanya, dalam bentuk
 * ternormalisasi ("Dinas Pendidikan dan Kebudayaan" → "dinas pendidikan dan kebudayaan").
 *
 * Mengapa BUKAN potongan kata inti: narasi menulis nama OPD secara utuh
 * ("(Dinas Pertanian, 2025)"), sehingga memotong kata umum ("Dinas") justru
 * membuat kunci tidak pernah cocok — terukur 23 Sep 2026 pada mode AI.
 *
 * Yang mencegah penuduhan palsu bukan pemotongan kata, melainkan syarat
 * ATRIBUSI (`atribusiOpd`): kata dalam nama OPD yang kebetulan berimpit dengan
 * nama indikator ("produksi komoditas perkebunan" ↔ "Dinas Perkebunan") tidak
 * dihitung sebagai penyebutan OPD.
 */
export function kunciOpd(nama: string): string {
  return normalisasiWilayah(nama).trim();
}

/**
 * Apakah kalimat benar-benar MENGAITKAN sebuah OPD (bukan sekadar menyebut
 * katanya)? Diperlukan karena nama OPD sering berimpit dengan nama indikator:
 * "Jumlah produksi komoditas perkebunan …" memuat kata "perkebunan", dan itu
 * BUKAN penyebutan OPD "Dinas Perkebunan".
 *
 * Terukur 23 Sep 2026: tanpa syarat ini, gerbang FR-24 menolak narasi model yang
 * sebenarnya benar pada 8 dari 50 keluaran — gejala khas pemeriksa entitas yang
 * mencocokkan kata terlalu longgar.
 *
 * CARA KERJA (sengaja tanpa regex rumit — dua kali salah cocok karena regex):
 *   1. seluruh teks disamakan bentuknya: huruf kecil, tanda baca → spasi tunggal;
 *   2. tanda kurung pembuka diganti penanda kata "parn" LEBIH DULU, supaya bentuk
 *      narasi baku "(Dinas X, tahun)" tetap terbaca setelah tanda baca dibuang;
 *   3. pencocokan dilakukan dengan `includes` atas frasa berpembatas spasi —
 *      jadi nama OPD bertanda pisah ("Dinas Kesehatan — Bidang Gizi") tetap
 *      cocok, sedangkan kata yang kebetulan berimpit tidak dihitung.
 */
export function atribusiOpd(kalimat: string, kunci: string): boolean {
  if (!kunci) return false;
  const teks = ` ${String(kalimat)
    .toLowerCase()
    .replace(/\(/g, ' parn ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
  const k = ` ${kunci} `;
  // Bentuk baku narasi: nama OPD di dalam tanda kurung — "(Dinas Pertanian, 2025)".
  if (teks.includes(` parn${k}`)) return true;
  // Kata sambung sebelum nama OPD — "menurut Dinas Kesehatan pada …".
  for (const kata of ['menurut', 'dari', 'oleh', 'sumber', 'penghasil', 'per', 'pada']) {
    if (teks.includes(` ${kata}${k}`)) return true;
  }
  // Kata kerja pelaporan sesudah nama OPD — "Dinas Pertanian melaporkan …".
  for (const kata of ['melaporkan', 'mencatat', 'menyebut', 'merilis', 'mengeluarkan', 'selaku', 'sebagai']) {
    if (teks.includes(`${k}${kata} `)) return true;
  }
  return false;
}

function labelBaris(b: BarisBukti): string {
  const wilayah = (b.indikator.match(/Kecamatan\s+[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)?/) ?? [])[0];
  const lahan = wilayah ? ` (${wilayah})` : '';
  return `${b.indikator.slice(0, 54)}${lahan} @ ${b.opd.slice(0, 32)}${b.tahun ? ` · ${b.tahun}` : ''}`;
}

/**
 * Inti pemeriksaan. Lihat daftar temuan di kepala berkas ini.
 *
 * Sengaja MURNI (tanpa I/O, tanpa efek samping) supaya bisa dipakai sebagai
 * gerbang di dalam penyusun jawaban, dilaporkan pada balasan API, dan diuji
 * dengan narasi yang sengaja dirusak.
 */
/**
 * Buang dari kalimat hal-hal yang BUKAN klaim nilai, supaya ekstraksi angka
 * tidak menuduh angka yang sebenarnya bukan data:
 *   • hitungan struktural katalog — "8 OPD", "15 indikator unik", "2.065 record",
 *     "… baris". Kata benda di sini sengaja TERBATAS pada kosakata statistik
 *     katalog: `desa`/`kecamatan`/`tahun` TIDAK termasuk, sebab ketiganya bisa
 *     menjadi satuan sah ("291 Desa") atau tahun data ("2025").
 *   • teks nama indikator dari daftar bukti — angka di dalamnya ("kelas 7") adalah
 *     bagian nama, bukan nilai. Nama OPD tidak dibuang (lihat catatan di atas).
 */
export function angkaBukanKlaim(kalimat: string, bukti: BarisBukti[]): string {
  let s = String(kalimat ?? '');
  // (1) hitungan struktural katalog
  s = s.replace(/\b\d[\d.,]*\s*(?:opd|indikator|record|baris)\b/gi, ' [katalog] ');
  // (2) nama indikator yang dikutip apa adanya (toleran spasi & besar-kecil huruf)
  for (const b of bukti) {
    const nama = String(b.indikator ?? '').trim();
    if (nama.length < 4) continue;
    const pola = new RegExp(
      nama
        .split(/\s+/)
        .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+'),
      'gi',
    );
    s = s.replace(pola, ' [nama] ');
  }
  return s;
}

export function periksaPasanganEntitas(
  narasi: string,
  bukti: BarisBukti[],
  opsi: OpsiPemeriksaan = {},
): HasilPemeriksaan {
  const bersih = bersihkanNarasi(narasi ?? '');
  const kalimat = pecahKalimat(bersih);
  const kosakata = opsi.kecamatan ?? [];
  const diizinkan = new Set(
    (opsi.nilaiDiizinkan ?? []).map((n) => normalisasiAngka(String(n))).filter((s) => s !== ''),
  );
  const labelDiizinkan = new Set(bukti.flatMap(angkaLabel));
  const temuan: Temuan[] = [];
  const diperiksa = new Set<string>();
  const satuanKatalog = new Set(bukti.map((b) => kataSatuan(b.satuan)).filter(Boolean));
  const tahunKatalog = new Set(
    bukti.map((b) => String(b.tahun ?? '').trim()).filter((t) => /^(?:19|20)\d{2}$/.test(t)),
  );

  for (const s of kalimat) {
    // Angka diambil dari SALINAN kalimat yang sudah dibersihkan dari hitungan
    // struktural & nama indikator; `s` (asli) tetap dipakai untuk pelaporan.
    const angkaS = [...new Set(angkaDalamTeks(angkaBukanKlaim(s, bukti)))];
    for (const angka of angkaS) {
      const pemilik = pemilikAngka(angka, bukti);
      if (pemilik.length === 0) {
        if (diizinkan.has(angka) || labelDiizinkan.has(angka) || tahunDalamBukti(angka, bukti)) continue;
        diperiksa.add(angka);
        temuan.push({
          jenis: 'nilai-tak-ada',
          keras: true,
          nilai: angka,
          kalimat: s.slice(0, 160),
          sebenarnya: [],
        });
        continue;
      }
      diperiksa.add(angka);
      // Satu angka bisa melanggar LEBIH DARI SATU aturan sekaligus (angka benar,
      // OPD salah, DAN satuannya milik baris lain). Semua temuan dicatat: operator
      // perlu melihat gambaran penuhnya, dan penelusuran sebab pun jadi lebih cepat.
      // Yang dihindari hanya aturan LUNAK (tahun/ambigu) saat sudah ada temuan keras
      // untuk angka yang sama — itu hanya menambah derau.
      let adaKeras = false;
      const label = [...new Set(pemilik.map(labelBaris))];

      // ── (2) wilayah: kalimat menyebut kecamatan, angka milik baris mana? ──
      const kecKalimat = kosakata.filter((k) => normalisasiWilayah(s).includes(normalisasiWilayah(k)));
      if (kecKalimat.length > 0) {
        const cocok = pemilik.some((b) => kecamatanIndikator(b.indikator, kecKalimat).length > 0);
        if (!cocok) {
          const wilayahPemilik = [...new Set(pemilik.flatMap((b) => kecamatanIndikator(b.indikator, kosakata)))];
          temuan.push({
            jenis: 'entitas-bertabrakan',
            keras: true,
            nilai: angka,
            kalimat: s.slice(0, 160),
            diklaim: kecKalimat.join(', '),
            sebenarnya:
              wilayahPemilik.length > 0 ? wilayahPemilik.map((w) => `wilayah ${w}`) : ['angka tingkat kabupaten (tanpa wilayah)'],
          });
          adaKeras = true;
        }
      }

      // ── (2b) OPD: kalimat menyebut SATU OPD, angka milik OPD lain? ──
      //
      //    Aturan sengaja hanya menyala bila kalimat menyebut TEPAT SATU OPD
      //    katalog. Bila kalimat menyebut beberapa OPD (daftar perbandingan),
      //    angka mana milik OPD mana tidak dapat dipastikan dari teks — dan
      //    menuduh pada ketidakpastian justru menolak jawaban yang benar.
      // Dihitung per NAMA OPD (satu OPD bisa punya banyak baris bukti di sini) —
      // kalau dihitung per baris, satu OPD dengan dua baris akan terbaca sebagai
      // "dua OPD disebut" dan aturan ini tidak pernah menyala.
      const opdDisebut = [...new Set(bukti.map((b) => b.opd))].filter(
        (opd) => kunciOpd(opd) && atribusiOpd(s, kunciOpd(opd)),
      );
      if (opdDisebut.length === 1) {
        const opdKalimat = opdDisebut[0];
        if (!pemilik.some((b) => b.opd === opdKalimat)) {
          temuan.push({
            jenis: 'opd-bertabrakan',
            keras: true,
            nilai: angka,
            kalimat: s.slice(0, 160),
            diklaim: opdKalimat,
            sebenarnya: [...new Set(pemilik.map((b) => `penghasil ${b.opd}`))],
          });
          adaKeras = true;
        }
      }

      // ── (3) satuan: kata satuan tertulis milik baris LAIN? ──
      const sat = satuanSetelahAngka(s, angka);
      if (sat && !pemilik.some((b) => kataSatuan(b.satuan) === sat || String(b.satuan ?? '').toLowerCase().includes(sat))) {
        if (satuanKatalog.has(sat)) {
          temuan.push({
            jenis: 'satuan-bertabrakan',
            keras: true,
            nilai: angka,
            kalimat: s.slice(0, 160),
            diklaim: sat,
            sebenarnya: [...new Set(pemilik.map((b) => `satuan ${b.satuan ?? 'tanpa satuan'}`))],
          });
          adaKeras = true;
        }
      }

      // ── (4) tahun: tahun tertulis milik baris lain? (lunak) ──
      const tahunS = [...new Set(angkaDalamTeks(s))].filter((n) => /^(?:19|20)\d{2}$/.test(n) && n !== angka);
      const tahunPemilik = pemilik.map((b) => String(b.tahun ?? '').trim()).filter((t) => /^(?:19|20)\d{2}$/.test(t));
      if (!adaKeras && tahunS.length > 0 && tahunPemilik.length > 0) {
        const cocokTahun = tahunS.some((t) => tahunPemilik.includes(t));
        const tahunAsing = tahunS.filter((t) => !tahunPemilik.includes(t) && tahunKatalog.has(t));
        if (!cocokTahun && tahunAsing.length > 0) {
          temuan.push({
            jenis: 'tahun-bertabrakan',
            keras: false,
            nilai: angka,
            kalimat: s.slice(0, 160),
            diklaim: tahunAsing.join(', '),
            sebenarnya: tahunPemilik.map((t) => `tahun ${t}`),
          });
        }
      }

      // ── (5) ambigu: angka dipakai banyak baris, kalimat tak menunjuk entitas ──
      const opdUnik = new Set(pemilik.map((b) => b.opd));
      const indUnik = new Set(pemilik.map((b) => b.indikator));
      if (!adaKeras && pemilik.length > 1 && opdUnik.size > 1 && indUnik.size > 1) {
        // Kalimat dianggap SUDAH menunjuk entitas bila menyebut kata khas dari
        // nama indikator ATAU dari nama OPD pemiliknya. Narasi baku memang
        // menulis "(OPD, tahun)" — tanpa pemeriksaan OPD ini, setiap baris
        // kabupaten yang direplikasi per kecamatan akan dilaporkan ambigu,
        // padahal kalimatnya menyebut OPD-nya dengan jelas (terukur 23 Sep 2026).
        const kataKhas = (teks: string, maks: number) =>
          teks
            .toLowerCase()
            .split(/\s+/)
            .map((w) => w.replace(/[^a-z0-9]/g, ''))
            .filter((w) => w.length >= 5)
            .slice(0, maks);
        const sRendah = s.toLowerCase();
        const sebutEntitas = pemilik.some((b) => {
          const kataInd = kataKhas(b.indikator, 4);
          const kataOpd = kataKhas(b.opd, 3);
          return kataInd.some((w) => sRendah.includes(w)) || kataOpd.some((w) => sRendah.includes(w));
        });
        if (!sebutEntitas) {
          temuan.push({
            jenis: 'nilai-ambigu',
            keras: false,
            nilai: angka,
            kalimat: s.slice(0, 160),
            sebenarnya: label.slice(0, 4),
          });
        }
      }
    }
  }

  const keras = temuan.filter((t) => t.keras).length;
  return {
    ok: keras === 0,
    jumlahNilai: diperiksa.size,
    jumlahKalimat: kalimat.length,
    keras,
    lunak: temuan.length - keras,
    temuan,
  };
}

/** Ringkas untuk balasan API (temuan dibatasi agar balasan tidak membengkak). */
export function ringkasPemeriksaan(h: HasilPemeriksaan, maks = 8): HasilPemeriksaan {
  return { ...h, temuan: h.temuan.slice(0, maks) };
}

/**
 * Kalimat penjelas untuk pengguna — WAJIB bebas angka (aturan FR-12/FR-20:
 * angka hidup di data terstruktur, bukan di prosa peringatan).
 */
export function penjelasanPemeriksaan(h: HasilPemeriksaan): string | null {
  if (h.ok) return null;
  return 'Narasi model ditolak: angka pada narasi itu ada di data katalog, tetapi dipasangkan ke indikator, wilayah, atau satuan milik baris lain. Jawaban disajikan dari data katalog secara langsung.';
}
