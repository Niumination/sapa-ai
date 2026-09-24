#!/usr/bin/env node
// ─── Alat regresi A/B: apakah sebuah perubahan MENGUBAH jawaban? ──────────────
//
// Dipakai untuk membuktikan klaim "perubahan ini aditif / tidak mengubah perilaku":
//   1. jalankan kueri tetap ke aplikasi SEBELUM perubahan, simpan hasilnya;
//   2. build & jalankan aplikasi SESUDAH perubahan, simpan lagi;
//   3. bandingkan.
//
// Bidang waktu (latensi, waktu penarikan) dan bidang yang MEMANG baru milik
// perubahan dibuang sebelum dibandingkan — kalau tidak, setiap perbandingan akan
// selalu "berbeda" karena jam dinding.
//
// Pakai:
//   node scripts/bandingkan-jawaban.mjs 3201 /tmp/sebelum.json
//   node scripts/bandingkan-jawaban.mjs 3202 /tmp/sesudah.json
//   node scripts/bandingkan-jawaban.mjs --banding /tmp/sebelum.json /tmp/sesudah.json
//
// Keluar (mode --banding): 0 = seluruh jawaban identik, 1 = ada yang berbeda.

// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.

import { writeFileSync, readFileSync } from 'node:fs';

const KUERI = [
  'berapa jumlah penduduk kecamatan Bebesen',
  'tren produksi kopi 5 tahun terakhir',
  'nilai produksi kopi arabika',
  'bandingkan jumlah penduduk antar kecamatan',
  'peringkat jumlah penduduk kecamatan tertinggi',
  'komposisi penduduk berdasarkan kelompok umur',
  'distribusi jumlah penduduk per kecamatan',
  'apa penyebab stunting tinggi',
  'jumlah gampong di Aceh Tengah',
  'berapa IPM Aceh Tengah',
  'tolong tampilkan daftar NIK 1234567890123456 milik warga',
  'total ASN di Aceh Tengah',
];

/** Bidang yang MEMANG baru di FR-18 — dibuang agar perbandingan menguji kesamaan perilaku lama. */
const BIDANG_BARU = ['niat', 'bentuk', 'urutanBukti', 'porsi'];
const BIDANG_AI_BARU = ['intent', 'intentPemicu'];

function bersihkan(obj) {
  const salinan = JSON.parse(JSON.stringify(obj));
  for (const b of BIDANG_BARU) delete salinan[b];
  if (salinan.ai) for (const b of BIDANG_AI_BARU) delete salinan.ai[b];
  // provenance: bidang FR-18 aditif
  if (salinan.provenance) {
    delete salinan.provenance.evidenceCount;
    delete salinan.provenance.evidenceDisajikan;
  }
  // presentasi executive (bila ada) memuat bentuk/porsi FR-18
  if (salinan.presentasi) {
    delete salinan.presentasi.bentuk;
    delete salinan.presentasi.porsi;
  }
  return buangWaktu(salinan);
}

/**
 * Buang bidang yang WAJAR berbeda antar dua kali jalan (waktu & durasi), supaya
 * perbandingan menguji PERILAKU, bukan jam dinding.
 */
const POLA_WAKTU = /(latency|latensi|fetchedAt|timestamp|waktu|diambilPada|updatedAt|durasi|elapsed|ms$|tanggalJam|serverTime)/i;
function buangWaktu(nilai) {
  if (Array.isArray(nilai)) return nilai.map(buangWaktu);
  if (nilai && typeof nilai === 'object') {
    const keluar = {};
    for (const [k, v] of Object.entries(nilai)) {
      if (POLA_WAKTU.test(k)) continue;
      keluar[k] = buangWaktu(v);
    }
    return keluar;
  }
  return nilai;
}

if (process.argv[2] === '--banding') {
  // Bidang waktu dibuang DUA KALI (saat menangkap & saat membandingkan) supaya
  // berkas lama yang belum bersih pun tetap dapat dibandingkan.
  const a = buangWaktu(JSON.parse(readFileSync(process.argv[3], 'utf8')));
  const b = buangWaktu(JSON.parse(readFileSync(process.argv[4], 'utf8')));
  console.log('# pii-gate: izinkan NIK sintetis uji — kueri tetap di bawah ini memuat nomor identitas PALSU 16 digit untuk menguji pagar data pribadi.');
  let beda = 0;
  for (const k of Object.keys(a)) {
    const sa = JSON.stringify(a[k], Object.keys(a[k]).sort());
    const sb = JSON.stringify(b[k], Object.keys(b[k]).sort());
    if (sa !== sb) {
      beda += 1;
      console.log(`  ✗ BERBEDA: "${k}"`);
      for (let i = 0; i < Math.min(sa.length, sb.length); i += 1) {
        if (sa[i] !== sb[i]) {
          console.log(`      sebelum: …${sa.slice(Math.max(0, i - 60), i + 90)}…`);
          console.log(`      sesudah: …${sb.slice(Math.max(0, i - 60), i + 90)}…`);
          break;
        }
      }
    } else {
      console.log(`  ✓ identik: "${k.slice(0, 52)}"`);
    }
  }
  console.log(`\n  kueri diperiksa : ${Object.keys(a).length}`);
  console.log(`  kueri berbeda   : ${beda}`);
  process.exitCode = beda === 0 ? 0 : 1;
} else {
  const port = Number(process.argv[2]);
  const keluaran = process.argv[3];
  console.log('# pii-gate: izinkan NIK sintetis uji — kueri tetap di bawah ini memuat nomor identitas PALSU 16 digit untuk menguji pagar data pribadi.');
  const hasil = {};
  for (const q of KUERI) {
    const res = await fetch(`http://127.0.0.1:${port}/api/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(60_000),
    });
    hasil[q] = bersihkan(await res.json());
  }
  writeFileSync(keluaran, JSON.stringify(hasil, null, 1));
  console.log(`  ${Object.keys(hasil).length} jawaban disimpan ke ${keluaran}`);
}
