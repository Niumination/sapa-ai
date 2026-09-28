// ─── Gerbang niat "meta katalog" (usulan audit 2026-09-21) ───
//
// MASALAH TERUKUR. Pertanyaan tentang SKALA KATALOG, bukan tentang isi data,
// dijawab dengan pencocokan kata apa adanya:
//   "Berapa OPD yang melaporkan data?"  →  "Frekuensi laporan isu publik 807",
//   "Jumlah Keg. PPKBD (Pencatatan dan Pelaporan) 348", "Kasus TBC… 302".
// Kata "melaporkan" dicocokkan ke kata "laporan" di nama indikator, sehingga
// jawabannya menyesatkan — padahal jawaban benar (38 OPD) hanya perlu dibaca
// dari katalog yang sedang dipegang sistem.
//
// Repo ini SUDAH punya mesinnya (`getSapaSummary`, `getUniqueOpd`,
// `getUniqueIndicators`) tetapi tidak pernah dipakai di jalur kueri. Modul ini
// tidak menambah mesin baru: ia hanya memutuskan KAPAN mesin itu dipakai.
//
// Prinsip keselamatan (kenapa gerbangnya sengaja picik):
//  - Hanya menangkap pertanyaan yang memang menanyakan UKURAN katalog.
//  - Menolak bila pertanyaannya menyebut OPD tertentu atau subjek data tertentu
//    ("Berapa jumlah pegawai Dinas Kesehatan?" bukan pertanyaan meta).
//  - Kata "persen" dikecualikan: "berapa persen record tanpa tahun" butuh
//    perhitungan, bukan sekadar pembacaan metadata.
//  - Bila ragu → kembalikan null dan biarkan jalur retrieval biasa bekerja.
//    Salah-menangkap lebih mahal daripada tidak menangkap.

import { normalkanSingkatan } from '@/lib/sapa-client';

export type MetaJenis = 'opd' | 'katalog' | 'tahun';

export interface MetaIntent {
  jenis: MetaJenis;
  /** Kata pemicu yang cocok — dipakai untuk log & penjelasan, bukan untuk jawaban. */
  pemicu: string;
}

/** Subjek data: bila muncul, pertanyaannya tentang ISI data, bukan ukuran katalog. */
const SUBJEK_DATA = [
  'pegawai', 'pns', 'pppk', 'asn', 'guru', 'siswa', 'murid', 'sekolah', 'pasien',
  'balita', 'stunting', 'tengkes', 'ipm', 'kemiskinan', 'penduduk', 'warga',
  'kopi', 'pdrb', 'jalan', 'anggaran', 'dana', 'pajak', 'retribusi', 'sampah',
  'puskesmas', 'posyandu', 'kader', 'desa', 'kampung', 'kecamatan', 'rumah',
  'air', 'listrik', 'kesehatan', 'pendidikan', 'pertanian', 'peternakan',
];

/** Kata yang menandakan pertanyaan UKURAN (bukan penjelasan/sebaran isi). */
const KATA_UKURAN = /(berapa|brapa|jumlah|banyak|total|banyaknya)/;

/**
 * Deteksi niat meta katalog.
 *
 * @param query     pertanyaan pengguna apa adanya
 * @param namaOpd   daftar nama OPD di katalog — dipakai untuk MENOLAK pertanyaan
 *                  yang menyebut OPD tertentu (butuh katalog yang sedang dipakai,
 *                  bukan daftar tetap di kode).
 */
/**
 * Normalisasi teks setingkat kalimat.
 * `normalkanSingkatan()` bekerja PER KATA (satu kata → boleh >1 kata), jadi ia
 * harus dipetakan kata demi kata, bukan dipanggil pada seluruh kalimat.
 */
function normalkanTeks(teks: string): string {
  return teks
    .split(/\s+/)
    .flatMap((w) => {
      const bersih = w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
      return bersih ? normalkanSingkatan(bersih) : [];
    })
    .join(' ');
}

export function deteksiMetaIntent(query: string, namaOpd: string[] = []): MetaIntent | null {
  const q = normalkanTeks(query);
  if (!q) return null;

  // Pembatasan umum: panjang wajar & bukan pertanyaan perhitungan.
  if (q.split(' ').length > 14) return null;
  if (/\bpersen\b|\b%/.test(q)) return null;

  const sebutOpdTerentu = namaOpd.some((n) => n && q.includes(n.toLowerCase()));
  if (sebutOpdTerentu) return null;

  const sebutSubjek = SUBJEK_DATA.some((s) => q.includes(s));

  // ── 1. Jumlah OPD / perangkat daerah pelapor ──
  //    "berapa opd yang melaporkan data", "jumlah opd pelapor", "total perangkat
  //    daerah yang mengirim data". Subjek "data" bersifat umum di sini, jadi
  //    sebutSubjek tidak menggugurkan.
  const polaOpd =
    /\b(?:berapa|brapa|jumlah|banyak|banyaknya|total)\b[^a-z]{0,24}\b(?:opd|perangkat daerah|dinas)\b/;
  const polaOpdBalik =
    /\b(?:opd|perangkat daerah)\b[^a-z]{0,24}\b(?:melapor|mengirim|kirim|lapor|terdaftar|aktif|ada|jumlahnya|berapa|brapa)\b/;
  if ((polaOpd.test(q) || polaOpdBalik.test(q)) && !sebutSubjek) {
    return { jenis: 'opd', pemicu: polaOpd.test(q) ? 'jumlah OPD' : 'OPD melapor' };
  }

  // ── 2. Sebaran menurut tahun (DIPERIKSA SEBELUM ukuran katalog) ──
  // TEMUAN EV-05 (24 Sep 2026): pertanyaan "Bagaimana sebaran jumlah record SAPA
  // menurut tahun?" memuat kata "jumlah record", sehingga dulu jatuh ke cabang
  // UKURAN KATALOG dan dijawab dengan ringkasan ("2.065 record, 38 OPD") —
  // padahal katalog menyimpan pecahan per tahun dan pengguna justru memintanya.
  // Karena itu cabang `tahun` naik ke atas: bila pengguna menyebut tahun
  // secara eksplisit, jawaban yang lebih rinci (dan benar) yang dipilih.
  // Catatan: pola sebelumnya memakai `[^a-z]{0,20}` yang menuntut tak ada huruf
  // di antara "sebaran" dan "tahun" — sehingga "sebaran DATA MENURUT tahun"
  // (justru bentuk paling lazim) tidak tertangkap. Sekarang celahnya dibatasi
  // panjang, bukan jenis karakter.
  const polaTahun =
    /\b(?:sebaran|distribusi|persebaran)\b.{0,30}\btahun\b|\bmenurut\s+tahun\b/;
  if (polaTahun.test(q) && !sebutSubjek) {
    return { jenis: 'tahun', pemicu: 'sebaran menurut tahun' };
  }

  // ── 3. Ukuran katalog: jumlah record / baris data / indikator ──
  const polaRecord =
    /\b(?:total|jumlah|banyak)\b[^a-z]{0,16}\b(?:data|record|baris)\b/;
  const polaIndikator =
    /\b(?:total|jumlah|banyak|berapa|brapa)\b[^a-z]{0,16}\bindikator\b/;
  const polaPortal = /\b(?:di|pada)\s+(?:portal|aplikasi|sistem)\s+sapa\b/;
  if ((polaRecord.test(q) || polaIndikator.test(q) || polaPortal.test(q)) && !sebutSubjek) {
    return { jenis: 'katalog', pemicu: polaIndikator.test(q) ? 'jumlah indikator' : 'ukuran katalog' };
  }

  return null;
}

/**
 * Apakah pertanyaan ini menanyakan ketersediaan tahun tertentu.
 * Dipakai hanya untuk memutuskan penyebutan periode, bukan untuk menjawab nilai.
 */
export function tahunDalamQuery(query: string): string[] {
  return (normalkanTeks(query).match(/\b(19|20)\d{2}\b/g) ?? []).slice(0, 4);
}

// ─── Router NIAT (bentuk jawaban), bukan sekadar gerbang meta ───
//
// MASALAH TERUKUR: `PromptContext.intent` ada di `prompt.ts` tetapi TIDAK PERNAH
// diisi — 10 dari 10 permintaan ke penyedia tiruan (21 Sep 2026) memakai
// `intent: 'nilai_saat_ini'`, termasuk pertanyaan tren dan perbandingan. Akibatnya
// prompt menyuruh bentuk jawaban yang selalu sama, dan model tidak pernah tahu
// pengguna menanyakan arah perubahan, urutan, atau selisih.
//
// Router ini deterministik (pola kata + penanda), murah, dan dapat diuji. Ia
// SENGAJA memakai label yang sama dengan `grup` di `data/eval-set.json` supaya
// hasil eval bisa dipakai untuk mengukur akurasi niat, bukan sekadar lulus/gagal.

export type NiatJawaban =
  | 'tren'
  | 'perbandingan'
  | 'peringkat'
  | 'komposisi'
  | 'distribusi'
  | 'meta_katalog'
  | 'sebab'
  | 'personal'
  | 'nilai_saat_ini';

export interface HasilNiat {
  niat: NiatJawaban;
  /** Kata/frasa pemicu — untuk log dan penjelasan, bukan untuk jawaban. */
  pemicu: string[];
}

const POLA_NIAT: { niat: NiatJawaban; pola: RegExp; nama: string }[] = [
  // Urutan penting: yang paling spesifik lebih dulu.
  // EV-05 (24 Sep 2026): pola ini dulu hanya mengenali "nama warga/orang/pegawai
  // tertentu" sehingga "Siapa nama penerima PKH…" dan "Sebutkan NIK dan alamat
  // petani…" TIDAK terbaca sebagai permintaan per-orang — padahal pagar data
  // pribadi menolaknya. Akibatnya jawaban penolakan disajikan dengan bentuk
  // "Nilai saat ini" (bentuk untuk pertanyaan capaian), bukan bentuk
  // "Tidak tersedia (data per orang)". Pola kini diselaraskan dengan kelas
  // permintaan yang ditolak `cekPermintaanPerOrang()`.
  {
    niat: 'personal',
    pola: /\bnik\b|\bnik-?\d|\bdata (per|perorangan)\b|\bsiapa\s+nama\b|\bdaftar\s+nama\b|\bnama\s+(penerima|warga|penduduk|orang|mustahik|pegawai)\b|\balamat\s+(lengkap\s+)?(petani|penerima|warga|penduduk|kepala desa|mustahik)\b|\bidentitas\s+(penerima|warga|penduduk|mustahik)\b|\balamat warga/i,
    nama: 'data per-orang',
  },
  { niat: 'sebab', pola: /\b(kenapa|mengapa|penyebab|disebabkan|faktor (penyebab|utama)|sebab|hubungan|kaitan|korelasi|memengaruhi|mempengaruhi|pengaruh|dampak|berhubungan|berkaitan)\b/i, nama: 'sebab-akibat' },
  { niat: 'tren', pola: /\b(tren|trend|perkembangan|menurun|menaik|naik|turun|fluktuasi|dari tahun ke tahun|antar ?tahun|time ?series|3 tahun|lima tahun|5 tahun)\b/i, nama: 'arah perubahan' },
  { niat: 'perbandingan', pola: /\b(bandingkan|dibandingkan|banding|versus|\bvs\b|selisih|lebih (tinggi|rendah|baik|besar|kecil)|perbedaan|dibanding)\b/i, nama: 'perbandingan' },
  { niat: 'peringkat', pola: /\b(tertinggi|terendah|terbanyak|tersedikit|terbesar|terkecil|ranking|peringkat|5 besar|lima besar|top\s?\d|urutkan|peringkatnya)\b/i, nama: 'peringkat' },
  { niat: 'komposisi', pola: /\b(komposisi|proporsi|porsi|pangsa|share|persentase dari|kontribusi terhadap|seberapa besar bagian)\b/i, nama: 'komposisi' },
  { niat: 'distribusi', pola: /\b(sebaran|distribusi|persebaran|penyebaran|per kecamatan|per desa|per opd|per kategori|menurut (kecamatan|desa|opd|kategori|jenis|usia|jenis kelamin))\b/i, nama: 'sebaran' },
];

/** Deteksi bentuk jawaban yang pantas untuk sebuah pertanyaan. */
export function deteksiNiat(query: string): HasilNiat {
  const q = normalkanTeks(query);
  if (!q) return { niat: 'nilai_saat_ini', pemicu: [] };

  const pemicu: string[] = [];
  for (const { niat, pola, nama } of POLA_NIAT) {
    const m = q.match(pola);
    if (m) {
      pemicu.push(`${nama}:"${m[0]}"`);
      // Satu niat dominan: yang pertama cocok menurut urutan spesifik.
      return { niat, pemicu };
    }
  }
  return { niat: 'nilai_saat_ini', pemicu };
}

/** Instruksi bentuk jawaban per niat — dipakai prompt AI & penjelasan UI. */
export const PANDUAN_NIAT: Record<NiatJawaban, string> = {
  tren: 'Sebutkan arah perubahan antarperiode yang ADA di evidence (tahun ke tahun). Jangan menyimpulkan tren dari satu titik data; bila tahun yang diminta tidak ada, katakan terus terang.',
  perbandingan: 'Sebutkan dua atau lebih nilai yang dibandingkan beserta tahunnya, lalu jelaskan bahwa perbandingan hanya sah bila definisi, satuan, dan OPD penghasilnya sebanding. Jangan menghitung selisih/persen baru.',
  peringkat: 'Sebutkan urutan dari yang terbesar/terkecil sesuai pertanyaan, maksimal 3 baris teratas, dengan nama indikator dan nilainya.',
  komposisi: 'Sebutkan bagian yang diminta terhadap keseluruhan HANYA bila angka keseluruhannya ada di evidence; bila tidak ada, katakan bahwa totalnya tidak tersedia.',
  distribusi: 'Sebutkan sebaran per kelompok (kecamatan/OPD/kategori) sesuai yang ada di evidence, dan sebutkan bila hanya sebagian kelompok yang tersedia.',
  meta_katalog: 'Jawab dari statistik katalog (jumlah record/OPD/indikator). Tegaskan bahwa ini keterangan tentang katalog, bukan capaian kinerja.',
  sebab: 'SAPA menyimpan angka, bukan sebab. Jangan menduga penyebab atau menyimpulkan korelasi sebagai kausalitas: susun angka terdekat sebagai konteks topik, beri sitasi per klaim, lalu nyatakan batas bahwa analisis sebab/hubungan memerlukan kajian OPD/akademik.',
  personal: 'Tolak dengan sopan: SAPA tidak menyajikan data per orang. Tawarkan versi agregatnya.',
  nilai_saat_ini: 'Sebutkan nilai utama beserta satuan, OPD, dan tahun data; sebutkan bila tahun tidak tercantum.',
};
