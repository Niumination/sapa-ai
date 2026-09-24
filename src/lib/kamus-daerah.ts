// ─── DS-05 · Kamus sinonim daerah & lapangan ───
//
// MASALAH. Sebagian pengguna SAPA menulis dengan istilah yang dipakai sehari-hari
// di Aceh ("gampong", "peukan", "padé", "krueng", "janda"/"bansos") sementara
// katalog SPLP memakai kata baku pemerintahan ("desa", "pasar", "padi", "sungai").
// Penelusuran leksikal deterministik mencocokkan TOKEN, jadi istilah daerah yang
// tidak ada di nama indikator akan berakhir sebagai "tidak ditemukan" — padahal
// datanya ada. Ini murni masalah kosakata, bukan masalah data.
//
// ATURAN UTAMA (sama dengan `SINGKATAN` di `sapa-client.ts`, dan ini yang menjaga
// keamanan): **hanya kata yang TIDAK PERNAH muncul di nama indikator katalog yang
// boleh dipetakan.** Kalau sebuah kata sudah ada di katalog (mis. "mustahik",
// "ppkbd", "dayah", "blang", "bumdes", "meugang"), memetakannya justru MERUSAK
// penelusuran: pengguna yang menyebut "meugang" memang menunjuk indikator
// "Santunan Hari Meugang", bukan indikator lain. Istilah seperti itu dicatat di
// `SUDAH_ADA_DI_KATALOG` beserta angka df-nya supaya tidak "diperbaiki" lagi.
//
// BUKTI UKUR (24 Sep 2026, dua korpus):
//   • katalog PRODUKSI 2.065 record / 1.791 nama indikator unik;
//   • korpus uji sandbox 1.210 record / 395 nama indikator unik.
// Untuk setiap entri: `dfProduksi` = jumlah nama indikator produksi yang memuat
// padanan itu (harus > 0, kalau tidak padanannya tidak akan pernah menemukan
// indikator), dan `terbuktiKorpusUji` = padanan itu juga ada di korpus uji sandbox
// sehingga dapat dibuktikan menembus end-to-end oleh
// `scripts/uji-kamus-daerah.mjs`.
//
// TINJAUAN BERKALA. Dokumen 10 meminta tinjauan **tiap 3 bulan**. Tanggal tinjauan
// disimpan di berkas ini; `statusTinjauan()` menghitung sisa hari, dan harness
// MENOLAK berjalan (exit 1) bila tenggatnya sudah lewat. Cara meninjau ulang:
// `node scripts/ukur-df-kamus.mjs <korpus.json>` → perbarui angka df, tanggal, dan
// daftar `SUDAH_ADA_DI_KATALOG`.
//
// Modul ini MURNI: tanpa jaringan, tanpa jam sistem kecuali bila pemanggil
// menyerahkan `hariIni`.

/** Satu entri kamus: kata daerah/lapangan → padanan baku di katalog SAPA. */
export interface EntriKamus {
  /** Kata yang ditulis pengguna (huruf kecil; boleh berfrasa). */
  kata: string;
  /** Padanan baku yang dipakai katalog. Minimal satu harus ber-df > 0. */
  padanan: string[];
  /** Arti dalam bahasa Indonesia — supaya tinjauan berikutnya tidak menebak. */
  arti: string;
  /** Sumber kurasi (bukan karangan untuk lulus uji). */
  sumber: string;
  /** Jumlah nama indikator PRODUKSI yang memuat tiap padanan (ukur 24 Sep 2026). */
  dfProduksi: Record<string, number>;
  /** Apakah padanan ini juga terbukti ada di korpus uji sandbox (untuk uji end-to-end). */
  terbuktiKorpusUji: boolean;
}

/**
 * Dua bentuk yang SENGAJA TIDAK dijadikan entri (temuan uji unit — jangan
 * ditambahkan kembali tanpa mengubah pembersih token):
 *   • "padé" — pembersih token membuang aksen di ujung kata, sehingga token yang
 *     benar-benar diuji adalah "pad"; sedangkan "pad" sudah ada di katalog
 *     produksi (df=3). Padanannya tercakup entri "pade".
 *   • "nanggroe" — padanan yang mungkin ("kabupaten", "daerah") keduanya stopword
 *     domain, sehingga entri tidak pernah menghasilkan token berguna.
 */
export const VERSI_KAMUS = '1.0.0';
export const DITINJAU_PADA = '2026-09-24';
export const TENGGAT_TINJAUAN_BULAN = 3;
export const TINJAUAN_BERIKUTNYA = '2026-12-24';

/** 57 entri hasil kurasi dua korpus (lihat angka ukur di tiap entri). */
export const KAMUS_DAERAH: EntriKamus[] = [
  { kata: 'gampong', padanan: ['desa'], arti: 'desa (satuan pemerintahan di Aceh)', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {desa: 37}, terbuktiKorpusUji: true },
  { kata: 'keuchik', padanan: ['kepala', 'desa'], arti: 'kepala desa/gampong', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {kepala: 3, desa: 37}, terbuktiKorpusUji: true },
  { kata: 'geuchik', padanan: ['kepala', 'desa'], arti: 'kepala desa (ejaan lain)', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {kepala: 3, desa: 37}, terbuktiKorpusUji: true },
  { kata: 'tuha peut', padanan: ['lembaga', 'desa'], arti: 'badan permusyawaratan gampong', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {lembaga: 5, desa: 37}, terbuktiKorpusUji: true },
  { kata: 'mukim', padanan: ['kecamatan', 'desa'], arti: 'gabungan beberapa gampong (pendekatan: kecamatan)', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {kecamatan: 63, desa: 37}, terbuktiKorpusUji: true },
  { kata: 'sagoe', padanan: ['kecamatan'], arti: 'wilayah adat di atas gampong (pendekatan: kecamatan)', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {kecamatan: 63}, terbuktiKorpusUji: true },
  { kata: 'pamong', padanan: ['desa'], arti: 'aparat pemerintahan desa', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {desa: 37}, terbuktiKorpusUji: true },
  { kata: 'rumoh', padanan: ['rumah'], arti: 'rumah', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {rumah: 66}, terbuktiKorpusUji: true },
  { kata: 'meunasah', padanan: ['masjid'], arti: 'surau/langgar gampong (pendekatan: masjid)', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {masjid: 9}, terbuktiKorpusUji: false },
  { kata: 'keude', padanan: ['pasar'], arti: 'pusat perdagangan/pasar', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {pasar: 3}, terbuktiKorpusUji: true },
  { kata: 'peukan', padanan: ['pasar'], arti: 'pasar', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {pasar: 3}, terbuktiKorpusUji: true },
  { kata: 'jurong', padanan: ['jalan'], arti: 'jalan/gang kampung', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {jalan: 26}, terbuktiKorpusUji: true },
  { kata: 'tanoh', padanan: ['tanah', 'lahan'], arti: 'tanah', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {tanah: 3, lahan: 2}, terbuktiKorpusUji: true },
  { kata: 'peutua', padanan: ['adat'], arti: 'tokoh/pemuka adat', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {adat: 6}, terbuktiKorpusUji: false },
  { kata: 'ureung', padanan: ['orang', 'penduduk'], arti: 'orang/penduduk', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {orang: 9, penduduk: 18}, terbuktiKorpusUji: true },
  { kata: 'aneuk', padanan: ['anak'], arti: 'anak', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {anak: 36}, terbuktiKorpusUji: false },
  { kata: 'inong', padanan: ['perempuan', 'ibu'], arti: 'perempuan', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {perempuan: 19, ibu: 31}, terbuktiKorpusUji: false },
  { kata: 'agam', padanan: ['laki'], arti: 'laki-laki', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {laki: 4}, terbuktiKorpusUji: false },
  { kata: 'pade', padanan: ['padi'], arti: 'padi', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {padi: 2}, terbuktiKorpusUji: true },
  { kata: 'banih', padanan: ['padi'], arti: 'benih/bibit padi', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {padi: 2}, terbuktiKorpusUji: true },
  { kata: 'umong', padanan: ['padi', 'lahan'], arti: 'sawah', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {padi: 2, lahan: 2}, terbuktiKorpusUji: true },
  { kata: 'lampoh', padanan: ['perkebunan'], arti: 'kebun', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {perkebunan: 62}, terbuktiKorpusUji: true },
  { kata: 'seuneubok', padanan: ['lahan', 'perkebunan'], arti: 'ladang/kebun', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {lahan: 2, perkebunan: 62}, terbuktiKorpusUji: true },
  { kata: 'kebun', padanan: ['perkebunan'], arti: 'kebun (kata baku)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {perkebunan: 62}, terbuktiKorpusUji: true },
  { kata: 'ladang', padanan: ['lahan', 'perkebunan'], arti: 'ladang (kata baku)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {lahan: 2, perkebunan: 62}, terbuktiKorpusUji: true },
  { kata: 'leumo', padanan: ['peternakan'], arti: 'sapi', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {peternakan: 1}, terbuktiKorpusUji: false },
  { kata: 'kameng', padanan: ['peternakan'], arti: 'kambing', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {peternakan: 1}, terbuktiKorpusUji: false },
  { kata: 'manok', padanan: ['peternakan'], arti: 'ayam', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {peternakan: 1}, terbuktiKorpusUji: false },
  { kata: 'itik', padanan: ['peternakan'], arti: 'itik/bebek', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {peternakan: 1}, terbuktiKorpusUji: false },
  { kata: 'keubeue', padanan: ['peternakan'], arti: 'kerbau', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {peternakan: 1}, terbuktiKorpusUji: false },
  { kata: 'kambing', padanan: ['peternakan'], arti: 'kambing (kata baku)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {peternakan: 1}, terbuktiKorpusUji: false },
  { kata: 'ayam', padanan: ['peternakan'], arti: 'ayam (kata baku)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {peternakan: 1}, terbuktiKorpusUji: false },
  { kata: 'poktan', padanan: ['tani'], arti: 'kelompok tani', sumber: 'akronim program lapangan (program BKKBN/PKK/Kementan), bukan kutipan hukum', dfProduksi: {tani: 1}, terbuktiKorpusUji: true },
  { kata: 'gapoktan', padanan: ['tani'], arti: 'gabungan kelompok tani', sumber: 'akronim program lapangan (program BKKBN/PKK/Kementan), bukan kutipan hukum', dfProduksi: {tani: 1}, terbuktiKorpusUji: true },
  { kata: 'krueng', padanan: ['sungai', 'air'], arti: 'sungai', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {sungai: 6, air: 14}, terbuktiKorpusUji: true },
  { kata: 'ie', padanan: ['air'], arti: 'air', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {air: 14}, terbuktiKorpusUji: true },
  { kata: 'laot', padanan: ['perikanan', 'ikan'], arti: 'laut', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {perikanan: 39, ikan: 23}, terbuktiKorpusUji: false },
  { kata: 'laut', padanan: ['perikanan', 'ikan'], arti: 'laut (kata baku)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {perikanan: 39, ikan: 23}, terbuktiKorpusUji: false },
  { kata: 'tambak', padanan: ['perikanan', 'ikan'], arti: 'tambak ikan', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {perikanan: 39, ikan: 23}, terbuktiKorpusUji: false },
  { kata: 'gle', padanan: ['gunung'], arti: 'gunung', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {gunung: 1}, terbuktiKorpusUji: false },
  { kata: 'saket', padanan: ['kesehatan', 'penyakit'], arti: 'sakit', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {kesehatan: 74, penyakit: 6}, terbuktiKorpusUji: true },
  { kata: 'pukesmas', padanan: ['puskesmas', 'kesehatan'], arti: 'puskesmas (ejaan lain)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {puskesmas: 48, kesehatan: 74}, terbuktiKorpusUji: true },
  { kata: 'jompo', padanan: ['lansia'], arti: 'lanjut usia', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {lansia: 9}, terbuktiKorpusUji: false },
  { kata: 'cacat', padanan: ['disabilitas'], arti: 'penyandang disabilitas (istilah lama)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {disabilitas: 10}, terbuktiKorpusUji: false },
  { kata: 'muzakki', padanan: ['zakat'], arti: 'pembayar zakat', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {zakat: 2}, terbuktiKorpusUji: false },
  { kata: 'sedekah', padanan: ['zakat', 'infaq'], arti: 'sedekah', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {zakat: 2, infaq: 2}, terbuktiKorpusUji: false },
  { kata: 'waqaf', padanan: ['wakaf'], arti: 'wakaf (ejaan lain)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {wakaf: 2}, terbuktiKorpusUji: false },
  { kata: 'khanduri', padanan: ['adat'], arti: 'kenduri', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {adat: 6}, terbuktiKorpusUji: false },
  { kata: 'kanduri', padanan: ['adat'], arti: 'kenduri (ejaan lain)', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {adat: 6}, terbuktiKorpusUji: false },
  { kata: 'peusijuek', padanan: ['adat'], arti: 'tradisi tepung tawar', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {adat: 6}, terbuktiKorpusUji: false },
  { kata: 'warung', padanan: ['umkm'], arti: 'usaha mikro/warung', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {umkm: 31}, terbuktiKorpusUji: true },
  { kata: 'warong', padanan: ['umkm'], arti: 'warung (ejaan lain)', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {umkm: 31}, terbuktiKorpusUji: true },
  { kata: 'bansos', padanan: ['bantuan', 'sosial'], arti: 'bantuan sosial', sumber: 'akronim program lapangan (program BKKBN/PKK/Kementan), bukan kutipan hukum', dfProduksi: {bantuan: 21, sosial: 16}, terbuktiKorpusUji: true },
  { kata: 'sinyal', padanan: ['internet'], arti: 'jaringan seluler/internet', sumber: 'sinonim baku Indonesia — KBBI daring', dfProduksi: {internet: 2}, terbuktiKorpusUji: true },
  { kata: 'boh', padanan: ['buah'], arti: 'buah', sumber: 'istilah Aceh — kurasi kosakata Aceh & pemakaian katalog SAPA', dfProduksi: {buah: 1}, terbuktiKorpusUji: false },
  { kata: 'dasawisma', padanan: ['kader'], arti: 'kelompok dasawisma (PKK)', sumber: 'akronim program lapangan (program BKKBN/PKK/Kementan), bukan kutipan hukum', dfProduksi: {kader: 8}, terbuktiKorpusUji: false },
  { kata: 'pokja', padanan: ['kader'], arti: 'kelompok kerja (PKK)', sumber: 'akronim program lapangan (program BKKBN/PKK/Kementan), bukan kutipan hukum', dfProduksi: {kader: 8}, terbuktiKorpusUji: false },
];


/**
 * Istilah yang SENGAJA TIDAK dipetakan karena sudah ada di katalog produksi.
 * Dicatat bersama df-nya supaya tinjauan berikutnya tidak menambahkannya kembali
 * (memetakan kata yang sudah ada di katalog = menyesatkan penelusuran).
 * Termasuk tiga contoh yang disebut dokumen 10 (meugang, mustahik, PPKBD).
 */
export const SUDAH_ADA_DI_KATALOG: Array<{ kata: string; dfProduksi: number; catatan: string }> = [
  { kata: 'meugang', dfProduksi: 2, catatan: 'katalog: "Santunan Hari Meugang Mustahik Fakir" — pengguna yang menyebut meugang memang menunjuk ini' },
  { kata: 'mustahik', dfProduksi: 8, catatan: 'katalog memuat banyak indikator ber-mustahik (pendidikan, santunan)' },
  { kata: 'ppkbd', dfProduksi: 7, catatan: 'katalog: "Keg. Yang dilaksanakan PPKBD (KIE)"' },
  { kata: 'dayah', dfProduksi: 10, catatan: 'katalog: "Jumlah Dayah dengan akreditasi B"' },
  { kata: 'bumdes', dfProduksi: 5, catatan: 'katalog: "BUMDes Kondisi Baik"' },
  { kata: 'blang', dfProduksi: 3, catatan: 'katalog: nama daerah irigasi "BLANG DELEM" — bukan kata umum "sawah"' },
  { kata: 'balai', dfProduksi: 4, catatan: 'katalog: "Jumlah Balai Penyuluhan Kkb"' },
  { kata: 'lpm', dfProduksi: 1, catatan: 'katalog: "Lantai Jemur dan Lumbung Pangan (LPM)"' },
  { kata: 'tani', dfProduksi: 1, catatan: 'katalog: kata dasarnya sudah dipakai ("kelompok tani")' },
  { kata: 'kolam', dfProduksi: 4, catatan: 'katalog: indikator perikanan memakai kata kolam' },
  { kata: 'klinik', dfProduksi: 3, catatan: 'katalog memuat klinik' },
  { kata: 'vaksin', dfProduksi: 6, catatan: 'katalog memuat vaksin' },
  { kata: 'kontrasepsi', dfProduksi: 6, catatan: 'katalog memuat kontrasepsi' },
  { kata: 'pemuda', dfProduksi: 8, catatan: 'katalog memuat pemuda' },
  { kata: 'fakir', dfProduksi: 7, catatan: 'katalog memuat fakir' },
  { kata: 'kud', dfProduksi: 1, catatan: 'katalog memuat KUD' },
  { kata: 'dagang', dfProduksi: 1, catatan: 'katalog memuat dagang' },
  { kata: 'lampu', dfProduksi: 1, catatan: 'katalog memuat lampu' },
  { kata: 'sapi', dfProduksi: 0, catatan: 'terukur df=29 pada korpus uji sandbox (Populasi Ternak Sapi) — memetakannya akan menimpa kata katalog' },
];

const PETA = new Map<string, string[]>(KAMUS_DAERAH.filter((e) => !e.kata.includes(' ')).map((e) => [e.kata, e.padanan]));

/** Frasa daerah (mis. "tuha peut") — dicocokkan dengan batas kata sebelum pemotongan token. */
const FRASA: Array<[RegExp, string]> = KAMUS_DAERAH
  .filter((e) => e.kata.includes(' '))
  .map((e) => [new RegExp(`\\b${e.kata.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), e.padanan.join(' ')]);

/**
 * Saklar kontrol negatif: `SAPA_KAMUS_DAERAH=off` mematikan SELURUH pemetaan
 * daerah tanpa mengubah kode lain. Dipakai harness untuk membuktikan bahwa
 * keberhasilan penelusuran benar-benar berasal dari kamus ini.
 */
export function kamusDimatikan(): boolean {
  return (process.env.SAPA_KAMUS_DAERAH ?? '').toLowerCase() === 'off';
}

/** Petakan satu token daerah ke bentuk baku (boleh >1 token). */
export function normalkanDaerah(kata: string): string[] {
  if (kamusDimatikan()) return [kata];
  return PETA.get(kata) ?? [kata];
}

/** Ganti frasa daerah pada seluruh teks (dipakai sebelum pemotongan token). */
export function terapkanFrasaDaerah(teks: string): string {
  if (kamusDimatikan()) return teks;
  return FRASA.reduce((t, [pola, ganti]) => t.replace(pola, ganti), teks);
}

export function entriKamus(): EntriKamus[] {
  return KAMUS_DAERAH;
}

export function jumlahEntri(): number {
  return KAMUS_DAERAH.length;
}

/** Selisih hari (dibulatkan) dari `hariIni` ke tanggal tinjauan berikutnya. */
export function statusTinjauan(hariIni: Date = new Date()): {
  ditinjauPada: string;
  tinjauanBerikutnya: string;
  tenggatBulan: number;
  hariTersisa: number;
  lewatTenggat: boolean;
} {
  const tenggat = new Date(`${TINJAUAN_BERIKUTNYA}T00:00:00Z`);
  const hariIniUtc = new Date(Date.UTC(hariIni.getUTCFullYear(), hariIni.getUTCMonth(), hariIni.getUTCDate()));
  const hariTersisa = Math.round((tenggat.getTime() - hariIniUtc.getTime()) / 86_400_000);
  return {
    ditinjauPada: DITINJAU_PADA,
    tinjauanBerikutnya: TINJAUAN_BERIKUTNYA,
    tenggatBulan: TENGGAT_TINJAUAN_BULAN,
    hariTersisa,
    lewatTenggat: hariTersisa < 0,
  };
}
