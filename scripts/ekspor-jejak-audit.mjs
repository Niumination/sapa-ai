#!/usr/bin/env node
// pii-gate: izinkan NIK sintetis uji — pola 16 digit di berkas ini hanya dipakai untuk MEMERIKSA ekspor, bukan data warga.
// ─── CMP-04 · Ekspor jejak audit dari luar aplikasi (untuk pemeriksaan) ───────
//
// Petugas pemeriksaan biasanya tidak membuka dasbor: ia butuh berkas. Skrip ini
// menarik jejak audit satu hari dari endpoint admin dan menuliskannya ke berkas,
// dengan DUA pengaman: (1) token wajib, (2) jaring terakhir — bila teks ekspor
// masih memuat pola data pribadi, berkas TIDAK ditulis dan skrip keluar dengan
// kode 1 (lebih baik gagal daripada menyebarkan data pribadi).
//
// Pakai:
//   ADMIN_TOKEN=... node scripts/ekspor-jejak-audit.mjs --url=http://127.0.0.1:3183 \
//     [--hari=YYYY-MM-DD] [--format=csv|ndjson|json] [--keluar=berkas]
//
// Keluar: 0 = berkas ditulis, 1 = PII terdeteksi / permintaan ditolak, 2 = galat.

import { writeFileSync } from 'node:fs';

const arg = (nama, bawaan = '') => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};

const url = arg('url', 'http://127.0.0.1:3000').replace(/\/+$/, '');
const hari = arg('hari', new Date().toISOString().slice(0, 10));
const format = arg('format', 'csv');
const token = process.env.ADMIN_TOKEN ?? arg('token');
const keluar = arg('keluar', `jejak-audit-${hari}.${format === 'json' ? 'json' : format}`);

if (!token) {
  console.error('  ✗ ADMIN_TOKEN belum diisi (env atau --token=…). Endpoint ini fail-closed.');
  process.exit(2);
}

/** Pola data pribadi — pembanding independen dari sisi aplikasi (jaring terakhir). */
const POLA = [
  { nama: 'NIK 16 digit', uji: (t) => /\d{16}/.test(t.replace(/[.,']/g, '')) },
  { nama: 'NIK berkelompok', uji: (t) => /\b\d{4} \d{4} \d{4} \d{4}\b/.test(t) },
  { nama: 'nomor telepon', uji: (t) => /(\+62|62|0)8[\d\s().-]{6,}\d/.test(t) },
  { nama: 'surel', uji: (t) => /[\w.+-]+@[\w-]+\.[\w.-]+/.test(t) },
];

try {
  const res = await fetch(`${url}/api/admin/jejak-audit?hari=${encodeURIComponent(hari)}&format=${encodeURIComponent(format)}`, {
    headers: { 'x-admin-token': token },
    signal: AbortSignal.timeout(30_000),
  });
  const teks = await res.text();
  if (!res.ok) {
    console.error(`  ✗ permintaan ditolak (HTTP ${res.status}): ${teks.slice(0, 200)}`);
    process.exit(1);
  }

  const temuan = POLA.filter((p) => p.uji(teks)).map((p) => p.nama);
  if (temuan.length) {
    console.error(`  ✗ EKSPOR DIBATALKAN — pola data pribadi terdeteksi: ${temuan.join(', ')}`);
    console.error('    Berkas TIDAK ditulis. Laporkan sebagai insiden penyamaran jejak audit.');
    process.exit(1);
  }

  writeFileSync(keluar, teks, 'utf8');
  const baris = teks.trim().split('\n').length;
  console.log(`  ✓ jejak hari ${hari} ditulis ke ${keluar} (format ${format}, ${baris} baris)`);
  console.log(`    retensi: ${res.headers.get('x-retensi-hari')} hari · pemeriksaan PII aplikasi: ${res.headers.get('x-pii-terdeteksi')}`);
} catch (err) {
  console.error(`  ✗ galat: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(2);
}
