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

  // ── 2. Ukuran katalog: jumlah record / baris data / indikator ──
  const polaRecord =
    /\b(?:total|jumlah|banyak)\b[^a-z]{0,16}\b(?:data|record|baris)\b/;
  const polaIndikator =
    /\b(?:total|jumlah|banyak|berapa|brapa)\b[^a-z]{0,16}\bindikator\b/;
  const polaPortal = /\b(?:di|pada)\s+(?:portal|aplikasi|sistem)\s+sapa\b/;
  if ((polaRecord.test(q) || polaIndikator.test(q) || polaPortal.test(q)) && !sebutSubjek) {
    return { jenis: 'katalog', pemicu: polaIndikator.test(q) ? 'jumlah indikator' : 'ukuran katalog' };
  }

  // ── 3. Sebaran menurut tahun ──
  // Catatan: pola sebelumnya memakai `[^a-z]{0,20}` yang menuntut tak ada huruf
  // di antara "sebaran" dan "tahun" — sehingga "sebaran DATA MENURUT tahun"
  // (justru bentuk paling lazim) tidak tertangkap. Sekarang celahnya dibatasi
  // panjang, bukan jenis karakter.
  const polaTahun =
    /\b(?:sebaran|distribusi|persebaran)\b.{0,30}\btahun\b|\bmenurut\s+tahun\b/;
  if (polaTahun.test(q) && !sebutSubjek) {
    return { jenis: 'tahun', pemicu: 'sebaran menurut tahun' };
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
