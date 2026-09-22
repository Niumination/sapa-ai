#!/usr/bin/env node
// ─── Stub SPLP: penyedia data SAPA tiruan untuk pengujian LURING ──────────────
//
// Gunanya: menjalankan uji terima & evaluasi 90 item pada jaringan yang tidak
// dapat menghubungi api-splp.layanan.go.id (sandbox, ruang kelas, CI tanpa
// internet). Bentuk balasan sengaja IDENTIK dengan SPLP yang asli
// ({ api_status, api_message, data: [...] }) sehingga yang diuji tetap jalur
// kode yang nyata — bukan cabang khusus uji.
//
// Pakai:
//   node verifikasi/stub-splp.mjs 9911 data/korpus-uji.json
//   SAPA_SPLP_BASE_URL=http://127.0.0.1:9911/sapa/1.0/api npx next start -p 3116
//
// Bila berkas korpus tidak ada, dipakai korpus bawaan yang kecil namun mencakup
// semua bentuk data penting: nilai angka, nilai persen ber-koma, tahun kosong,
// rentang tahun, satuan beragam, dan dua OPD berbeda.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const port = Number(process.argv[2] || 9911);
const berkas = process.argv[3];

const BAWAAN = [
  { id: 1, id_kode_indikator: 101, kode_indikator_kode_indikator: 'A.1', kode_indikator_nama_indikator: 'Jumlah Data Penduduk', id_opds: 1, opds_nama_opd: 'Dinas Kependudukan dan Pencatatan Sipil', jadwal_pemutakhiran: 'Tahunan', satuan: 'Jiwa', tahun: null, variabel: '236866' },
  { id: 2, id_kode_indikator: 102, kode_indikator_kode_indikator: 'A.2', kode_indikator_nama_indikator: 'Prevalensi Stunting', id_opds: 2, opds_nama_opd: 'Dinas Kesehatan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Persen', tahun: '2025', variabel: '31,4' },
  { id: 3, id_kode_indikator: 103, kode_indikator_kode_indikator: 'A.3', kode_indikator_nama_indikator: 'Indeks Pembangunan Manusia (IPM)', id_opds: 3, opds_nama_opd: 'Badan Perencanaan Pembangunan Daerah', jadwal_pemutakhiran: 'Tahunan', satuan: 'Poin', tahun: '2025', variabel: '78,09' },
  { id: 4, id_kode_indikator: 104, kode_indikator_kode_indikator: 'A.4', kode_indikator_nama_indikator: 'Jumlah ASN', id_opds: 4, opds_nama_opd: 'Badan Kepegawaian dan Pengembangan SDM', jadwal_pemutakhiran: 'Tahunan', satuan: 'Pegawai', tahun: '2026', variabel: '9610' },
  { id: 5, id_kode_indikator: 105, kode_indikator_kode_indikator: 'A.5', kode_indikator_nama_indikator: 'Jumlah produksi komoditas perkebunan Kopi Arabika', id_opds: 5, opds_nama_opd: 'Dinas Perkebunan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Ton/Tahun', tahun: '2025', variabel: '29019' },
  { id: 6, id_kode_indikator: 106, kode_indikator_kode_indikator: 'A.6', kode_indikator_nama_indikator: 'Jumlah petani komoditas perkebunan Kopi Arabika', id_opds: 5, opds_nama_opd: 'Dinas Perkebunan', jadwal_pemutakhiran: 'Tahunan', satuan: 'KK', tahun: '2025', variabel: '38294' },
  { id: 7, id_kode_indikator: 107, kode_indikator_kode_indikator: 'A.7', kode_indikator_nama_indikator: 'tingkat Kemiskinan', id_opds: 3, opds_nama_opd: 'Badan Perencanaan Pembangunan Daerah', jadwal_pemutakhiran: 'Tahunan', satuan: 'Persen', tahun: '2025', variabel: '12,29' },
  { id: 8, id_kode_indikator: 108, kode_indikator_kode_indikator: 'A.8', kode_indikator_nama_indikator: 'Jumlah Koperasi di Kecamatan Bebesen', id_opds: 6, opds_nama_opd: 'Dinas Koperasi dan UKM', jadwal_pemutakhiran: 'Tahunan', satuan: 'Unit', tahun: '2026', variabel: '159' },
  { id: 9, id_kode_indikator: 109, kode_indikator_kode_indikator: 'A.9', kode_indikator_nama_indikator: 'Jumlah Keluarga Penerima Bantuan Sosial Sembako', id_opds: 7, opds_nama_opd: 'Dinas Sosial', jadwal_pemutakhiran: 'Tahunan', satuan: 'Keluarga', tahun: '2026', variabel: '13101' },
  { id: 10, id_kode_indikator: 110, kode_indikator_kode_indikator: 'A.10', kode_indikator_nama_indikator: 'Jumlah Panjang Jalan Kabupaten', id_opds: 8, opds_nama_opd: 'Dinas Pekerjaan Umum', jadwal_pemutakhiran: 'Tahunan', satuan: 'Km', tahun: '2022–2026', variabel: '2156,28' },
];

const data = berkas
  ? JSON.parse(readFileSync(berkas, 'utf8'))
  : BAWAAN;
const daftar = Array.isArray(data) ? data : (data.data ?? BAWAAN);

const server = createServer((req, res) => {
  if (req.url?.includes('/daftar_data')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ api_status: 1, api_message: 'ok', data: daftar }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ api_status: 0, api_message: 'tidak ditemukan', data: [] }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[stub-splp] siap di http://127.0.0.1:${port}/sapa/1.0/api/daftar_data — ${daftar.length} record${berkas ? ` (dari ${berkas})` : ' (korpus bawaan)'}`);
});
