#!/usr/bin/env node
// ─── Pembuat korpus uji sintetis (untuk mengukur lapis semantik FR-12) ───────
//
// MENGAPA ADA
// Mengukur recall lapis semantik di atas korpus 10 record tidak bermakna: derau
// pencocokan baru muncul ketika katalog berisi ribuan nama indikator yang mirip
// satu sama lain (inilah kondisi korpus produksi: 2.065 record / 1.791 indikator).
//
// Korpus ini SINTETIS dan berlabel jelas:
//   - nama indikator dirangkai dari pola administrasi yang nyata (OPD, kecamatan,
//     tema) sehingga mirip korpus sungguhan tetapi TIDAK berisi data produksi;
//   - nilai dibuat deterministik (benih tetap) sehingga hasil uji dapat diulang;
//   - angka kunci dashboard yang memang kita ketahui (stunting 31,4%; IPM 78,09;
//     ASN 9.610; kemiskinan 12,29%; kopi 29.019 ton; penduduk 236.866) dimasukkan
//     agar kueri parafrase yang menargetkan indikator itu benar-benar ada.
//
// Pakai:
//   node scripts/buat-korpus-uji.mjs verifikasi/korpus-uji-besar.json 1200
//   node verifikasi/stub-splp.mjs 9911 verifikasi/korpus-uji-besar.json

import { writeFileSync } from 'node:fs';

const keluar = process.argv[2] ?? 'verifikasi/korpus-uji-besar.json';
const jumlah = Number(process.argv[3] ?? 1200);

/** PRNG deterministik (mulberry32) supaya korpus dapat diulang apa adanya. */
function prng(benih) {
  return function () {
    benih |= 0;
    benih = (benih + 0x6d2b79f5) | 0;
    let t = Math.imul(benih ^ (benih >>> 15), 1 | benih);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const acak = prng(20260922);

const OPD = [
  'Dinas Kependudukan dan Pencatatan Sipil',
  'Dinas Kesehatan',
  'Dinas Pendidikan',
  'Dinas Pekerjaan Umum dan Penataan Ruang',
  'Dinas Perkebunan',
  'Dinas Pertanian',
  'Dinas Sosial',
  'Dinas Koperasi dan Usaha Kecil Menengah',
  'Badan Perencanaan Pembangunan Daerah',
  'Badan Kepegawaian dan Pengembangan Sumber Daya Manusia',
  'Dinas Pemberdayaan Masyarakat dan Kampung',
  'Dinas Lingkungan Hidup',
  'Dinas Perhubungan',
  'Dinas Kesehatan — Bidang Gizi',
  'Rumah Sakit Umum Daerah Datu Beru',
  'Dinas Komunikasi dan Informatika',
  'Sekretariat Daerah',
  'Dinas Ketahanan Pangan',
  'Dinas Perikanan',
  'Dinas Pariwisata Pemuda dan Olahraga',
];

const KECAMATAN = [
  'Bebesen', 'Bies', 'Pegasing', 'Silih Nara', 'Ketol', 'Linge', 'Bintang',
  'Jagong Jeget', 'Atu Lintang', 'Rusip Antara', 'Lut Tawar', 'Kebayakan',
  'Celala', 'Kute Panang', 'Bebesen', 'Pegasing', 'Bies', 'Silih Nara',
];

const TEMA = [
  ['Jumlah', 'Data Penduduk', 'Jiwa'],
  ['Prevalensi', 'Stunting', 'Persen'],
  ['Indeks Pembangunan Manusia', 'IPM', 'Poin'],
  ['Jumlah', 'ASN', 'Pegawai'],
  ['Jumlah produksi komoditas perkebunan', 'Kopi Arabika', 'Ton/Tahun'],
  ['Jumlah petani komoditas perkebunan', 'Kopi Arabika', 'KK'],
  ['tingkat', 'Kemiskinan', 'Persen'],
  ['Jumlah', 'Koperasi', 'Unit'],
  ['Jumlah Keluarga Penerima Bantuan Sosial', 'Sembako', 'Keluarga'],
  ['Jumlah Panjang Jalan', 'Kabupaten', 'Km'],
  ['Angka Partisipasi Sekolah', 'SMA', 'Persen'],
  ['Angka Melek Huruf', 'Penduduk Dewasa', 'Persen'],
  ['Jumlah Sekolah Dasar', 'SD Negeri', 'Unit'],
  ['Jumlah Guru', 'Sekolah Dasar', 'Orang'],
  ['Jumlah Tenaga Kesehatan', 'Puskesmas', 'Orang'],
  ['Angka Kematian Bayi', 'AKB', 'Per 1000 Kelahiran'],
  ['Jumlah Balita', 'Stunting', 'Balita'],
  ['Jumlah Posyandu', 'Aktif', 'Unit'],
  ['Jumlah Rumah Tangga', 'Air Bersih', 'Keluarga'],
  ['Jumlah Desa', 'Penerima Dana Desa', 'Kampung'],
  ['Jumlah Produksi', 'Padi Sawah', 'Ton/Tahun'],
  ['Jumlah Produksi', 'Jagung', 'Ton/Tahun'],
  ['Populasi Ternak', 'Sapi', 'Ekor'],
  ['Jumlah Kelompok Tani', 'Aktif', 'Kelompok'],
  ['Jumlah Pasar', 'Rakyat', 'Unit'],
  ['Jumlah Pelaku UMKM', 'Terdaftar', 'Unit'],
  ['Jumlah Sarana Ibadah', 'Terdata', 'Unit'],
  ['Jumlah Rumah', 'Layak Huni', 'Unit'],
  ['Luas Lahan Pertanian', 'Sawah', 'Hektar'],
  ['Luas Kawasan Hutan', 'Lindung', 'Hektar'],
  ['Jumlah Kendaraan', 'Bermotor', 'Unit'],
  ['Panjang Jalan', 'Rusak Ringan', 'Km'],
  ['Jumlah Jembatan', 'Kabupaten', 'Unit'],
  ['Jumlah Penumpang Angkutan', 'Umum', 'Orang/Tahun'],
  ['Jumlah Sampah Terangkut', 'Harian', 'Ton/Hari'],
  ['Jumlah Bank Sampah', 'Aktif', 'Unit'],
  ['Jumlah Rumah Tangga', 'Listrik PLN', 'Keluarga'],
  ['Jumlah Akses Internet', 'Desa', 'Kampung'],
  ['Jumlah Arsip', 'Tertata', 'Berkas'],
  ['Jumlah Perkara', 'Diselesaikan', 'Perkara'],
  ['Jumlah Izin Usaha', 'Diterbitkan', 'Izin'],
];

const NILAI_KHUSUS = {
  'Data Penduduk': ['236866', '236866', '237104'],
  Stunting: ['31,4', '31,2', '30,7'],
  IPM: ['78,09', '77,85', '77,42'],
  ASN: ['9610', '9602', '9588'],
  'Kopi Arabika': ['29019', '28930', '28774'],
  Kemiskinan: ['12,29', '12,41', '12,66'],
  Sembako: ['13101', '13012', '12988'],
  Koperasi: ['159', '158', '156'],
  Kabupaten: ['2156,28', '2140,55', '2133,10'],
};

function nilai(temaKedua, i) {
  const khusus = NILAI_KHUSUS[temaKedua];
  if (khusus) return khusus[i % khusus.length];
  const tipe = acak();
  if (tipe < 0.3) return (acak() * 900 + 10).toFixed(2).replace('.', ',');
  if (tipe < 0.6) return String(Math.floor(acak() * 9000) + 12);
  if (tipe < 0.8) return String(Math.floor(acak() * 300) + 1);
  return (acak() * 100).toFixed(2).replace('.', ',');
}

const data = [];
let id = 1;
for (let i = 0; i < jumlah; i++) {
  const [awal, tengah, satuan] = TEMA[i % TEMA.length];
  const opd = OPD[Math.floor(acak() * OPD.length)];
  const pakaiKecamatan = acak() < 0.45;
  const kecamatan = pakaiKecamatan ? ` di Kecamatan ${KECAMATAN[Math.floor(acak() * KECAMATAN.length)]}` : '';
  const tahun = acak() < 0.15 ? null : String(2023 + Math.floor(acak() * 4));
  // Nama indikator: pola "awal tengah (kecamatan)" — sama seperti korpus nyata
  // yang memuat varian per kecamatan.
  const nama = [awal, tengah].filter(Boolean).join(' ') + kecamatan;
  data.push({
    id,
    id_kode_indikator: 1000 + id,
    kode_indikator_kode_indikator: `X.${id}`,
    kode_indikator_nama_indikator: nama,
    id_opds: OPD.indexOf(opd) + 1,
    opds_nama_opd: opd,
    jadwal_pemutakhiran: 'Tahunan',
    satuan,
    tahun,
    variabel: nilai(tengah, i),
  });
  id += 1;
}

// Pastikan beberapa indikator kunci muncul PERSIS seperti korpus produksi
// (tanpa varian kecamatan) supaya kueri parafrase punya sasaran yang jelas.
const kunci = [
  ['Jumlah Data Penduduk', 'Dinas Kependudukan dan Pencatatan Sipil', 'Jiwa', '236866', null],
  ['Prevalensi Stunting', 'Dinas Kesehatan — Bidang Gizi', 'Persen', '31,4', '2025'],
  ['Indeks Pembangunan Manusia (IPM)', 'Badan Perencanaan Pembangunan Daerah', 'Poin', '78,09', '2025'],
  ['Jumlah ASN', 'Badan Kepegawaian dan Pengembangan Sumber Daya Manusia', 'Pegawai', '9610', '2026'],
  ['Jumlah produksi komoditas perkebunan Kopi Arabika', 'Dinas Perkebunan', 'Ton/Tahun', '29019', '2025'],
  ['tingkat Kemiskinan', 'Badan Perencanaan Pembangunan Daerah', 'Persen', '12,29', '2025'],
  ['Jumlah Keluarga Penerima Bantuan Sosial Sembako', 'Dinas Sosial', 'Keluarga', '13101', '2026'],
  ['Jumlah Panjang Jalan Kabupaten', 'Dinas Pekerjaan Umum dan Penataan Ruang', 'Km', '2156,28', '2022–2026'],
  ['Jumlah Koperasi di Kecamatan Bebesen', 'Dinas Koperasi dan Usaha Kecil Menengah', 'Unit', '159', '2026'],
  ['Jumlah Balita Stunting', 'Dinas Kesehatan — Bidang Gizi', 'Balita', '730', '2025'],
];
for (const [nama, opd, satuan, variabel, tahun] of kunci) {
  data.push({
    id,
    id_kode_indikator: 1000 + id,
    kode_indikator_kode_indikator: `K.${id}`,
    kode_indikator_nama_indikator: nama,
    id_opds: OPD.indexOf(opd) + 1,
    opds_nama_opd: opd,
    jadwal_pemutakhiran: 'Tahunan',
    satuan,
    tahun,
    variabel,
  });
  id += 1;
}

writeFileSync(keluar, JSON.stringify({ api_status: 1, api_message: 'ok', data }, null, 0));
console.log(`[buat-korpus-uji] ${data.length} record sintetis → ${keluar}`);
console.log(`[buat-korpus-uji] ${new Set(data.map((d) => d.opds_nama_opd)).size} OPD · ${new Set(data.map((d) => d.kode_indikator_nama_indikator)).size} nama indikator unik`);
