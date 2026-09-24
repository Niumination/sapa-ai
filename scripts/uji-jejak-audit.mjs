#!/usr/bin/env node
// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
// ─── CMP-04 · Uji jejak audit jawaban (end-to-end, dua jalur jawaban) ─────────
//
// Yang dibuktikan harness ini:
//   A. TERCATAT — pertanyaan yang dilayani (jalur JSON & jalur streaming)
//      meninggalkan jejak berisi pertanyaan, bukti, gerbang, dan sebab.
//   B. TANPA DATA PRIBADI — pertanyaan ber-NIK tersimpan TERSAMAR; tidak ada satu
//      pun catatan yang memuat 16 digit berurutan.
//   C. TERBATAS & TERJAGA — endpoint menolak tanpa token (fail-closed), hari di
//      luar retensi tidak mengeluarkan data, dan ekspor CSV/NDJSON utuh.
//   D. Mode `--sabotase` membalik harapan (seolah penyamaran gagal) supaya terbukti
//      harness ini BISA gagal — bukan selalu hijau.
//
// Pakai: node scripts/uji-jejak-audit.mjs [--sabotase]
// Keluar: 0 = lulus, 1 = ada pelanggaran, 2 = gagal menyiapkan.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};
const SABOTASE = process.argv.includes('--sabotase');

const PORT_SPLP = Number(arg('port-splp', '3171'));
const PORT = Number(arg('port', '3185'));
const TIMEOUT_S = Number(arg('timeout', '180'));
const TOKEN = 'token-uji-jejak';
const NIK_UJI = '1234567890123456';

const warna = { ok: '\x1b[32m✓\x1b[0m', no: '\x1b[31m✗\x1b[0m' };
let LULUS = 0;
const GAGAL = [];

function periksa(nama, syarat, keterangan = '') {
  if (syarat) {
    LULUS += 1;
    console.log(`  ${warna.ok} ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
  } else {
    GAGAL.push(nama);
    console.log(`  ${warna.no} ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
  }
}
const bagian = (judul) => console.log(`\n── ${judul} ──`);
const SEMUA_TAHUN = (grup) =>
  grup.split(' ').every((k) => Number(k) >= 1900 && Number(k) <= 2100);
/**
 * Pemeriksa INDEPENDEN (ditulis ulang di sini, tidak mengimpor kode aplikasi).
 * Aturan "tepat empat kelompok" + "bukan rentang tahun" penting: tanpa itu, daftar
 * id bukti 4 digit pada ekspor CSV akan dituduh NIK (positif palsu, 24 Sep 2026).
 */
const adaNik = (teks) => {
  const t = String(teks);
  if (/\d{16}/.test(t.replace(/[.,']/g, ''))) return true;
  const cocok = t.match(/(?<!\d )(\d{4}) (\d{4}) (\d{4}) (\d{4})(?! ?\d{4})/g) ?? [];
  return cocok.some((m) => !SEMUA_TAHUN(m));
};

function jalankan(perintah, argumen, env, berkasLog) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  const proc = spawn(perintah, argumen, { cwd: AKAR, detached: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.pipe(aliran);
  proc.stderr.pipe(aliran);
  return proc;
}

async function tungguSiap(url, batasMs) {
  const batas = Date.now() + batasMs;
  while (Date.now() < batas) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.status < 500) return true;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function tanya(q, { stream = false } = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/query${stream ? '/stream' : ''}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q }),
    signal: AbortSignal.timeout(90_000),
  });
  if (stream) {
    // Konsumsi seluruh aliran sampai selesai — jejak dicatat SETELAH nagari dikirim.
    const teks = await res.text();
    return { status: res.status, teks };
  }
  return { status: res.status, body: await res.json() };
}

const proses = [];
const matikan = (proc) => {
  if (!proc || proc.killed) return;
  try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch { /* sudah mati */ } }
};

try {
  console.log(`\n  CMP-04 · jejak audit jawaban${SABOTASE ? ' (MODE SABOTASE — harus GAGAL)' : ''}\n`);

  const splp = jalankan(process.execPath, [join(AKAR, 'verifikasi', 'stub-splp.mjs'), String(PORT_SPLP), join(AKAR, 'verifikasi', 'korpus-uji-besar.json')], {}, '/tmp/jejak-splp.log');
  proses.push(splp);
  const urlSplp = `http://127.0.0.1:${PORT_SPLP}/sapa/1.0/api`;
  if (!(await tungguSiap(`${urlSplp}/daftar_data`, 25_000))) {
    console.error(`  ${warna.no} penyedia SPLP tiruan tidak siap`);
    process.exit(2);
  }

  const app = jalankan('npx', ['next', 'start', '-p', String(PORT)], {
    SAPA_SPLP_BASE_URL: urlSplp,
    AI_ENABLED: 'false',
    ADMIN_TOKEN: TOKEN,
  }, '/tmp/jejak-app.log');
  proses.push(app);
  if (!(await tungguSiap(`http://127.0.0.1:${PORT}/api/status`, TIMEOUT_S * 1000))) {
    console.error(`  ${warna.no} aplikasi tidak siap — lihat /tmp/jejak-app.log`);
    process.exit(2);
  }

  // ── B. Hasilkan jejak dari DUA jalur jawaban ──────────────────────────────
  bagian('A. Tiga pertanyaan (jalur JSON) + satu pertanyaan (jalur streaming)');
  const qNormal = 'berapa jumlah penduduk kecamatan Bebesen';
  const qNik = `tampilkan daftar NIK ${NIK_UJI} milik warga`;
  const qKosong = 'qwertyzzz tidak ada di katalog';

  const jNormal = await tanya(qNormal);
  const jNik = await tanya(qNik);
  const jKosong = await tanya(qKosong);
  const jStream = await tanya(qNormal, { stream: true });

  periksa('A1 jalur JSON menjawab 200', jNormal.status === 200 && jNormal.body?.narasi?.length > 0, `${(jNormal.body?.evidence ?? []).length} bukti`);
  periksa('A2 jalur streaming selesai (SSE terkirim)', jStream.status === 200 && jStream.teks.includes('event:'), `${jStream.teks.length} bita`);
  periksa('A3 pertanyaan ber-NIK ditolak pagar (tanpa panggilan model)', jNik.body?.ai?.used === false && (jNik.body?.evidence ?? []).length === 0);
  periksa('A4 pertanyaan asing dijawab jujur-kosong', (jKosong.body?.evidence ?? []).length === 0);

  // ── B. Jejak tersimpan ────────────────────────────────────────────────────
  bagian('B. Jejak tercatat & tersamar (tanpa data pribadi)');
  const hari = new Date().toISOString().slice(0, 10);
  const ambil = async (params = {}) => {
    const q = new URLSearchParams({ hari, ...params }).toString();
    const res = await fetch(`http://127.0.0.1:${PORT}/api/admin/jejak-audit?${q}`, {
      headers: { 'x-admin-token': TOKEN },
      signal: AbortSignal.timeout(30_000),
    });
    return { status: res.status, headers: res.headers, teks: await res.text() };
  };

  const json = JSON.parse((await ambil()).teks);
  const item = json.item ?? [];
  periksa('B1 jejak hari ini memuat keempat pertanyaan', json.jumlah >= 4, `${json.jumlah} catatan`);
  periksa(
    'B2 kedua jalur jawaban tercatat (JSON & streaming)',
    item.filter((j) => String(j.kueri).includes('jumlah penduduk kecamatan Bebesen')).length >= 2,
    `${item.filter((j) => String(j.kueri).includes('jumlah penduduk kecamatan Bebesen')).length} catatan untuk kueri yang sama`,
  );
  periksa(
    'B3 setiap catatan memuat pertanyaan, sebab, status, mode, dan daftar bukti',
    item.every((j) => String(j.kueri).length > 0 && String(j.sebab).includes(':') && String(j.status).length > 0 && ['ai', 'deterministik', 'tanpa-bukti', 'ditolak-pagar'].includes(j.mode) && Array.isArray(j.idBukti)),
    item.map((j) => j.mode).join(' · '),
  );
  periksa('B4 catatan jawaban ber-bukti membawa id bukti', item.some((j) => j.idBukti.length > 0), `${item.filter((j) => j.idBukti.length > 0).length} catatan ber-bukti`);
  const catatanNik = item.find((j) => j.mode === 'ditolak-pagar') ?? {};
  periksa(
    'B5 pertanyaan ber-NIK tersimpan TERSAMAR (bertanda [NIK])',
    String(catatanNik.kueri ?? '').includes('[NIK]') && catatanNik.piiDisamarkan === true,
    `"${String(catatanNik.kueri ?? '').slice(0, 60)}"`,
  );
  periksa('B6 angka mentah 16 digit TIDAK tersimpan di catatan mana pun', !adaNik(JSON.stringify(item)));
  periksa('B7 pemeriksaan PII aplikasi melaporkan bersih', json.pemeriksaanPii?.bersih === true);
  periksa('B8 metadata retensi dilaporkan & berlaku', json.retensiHari === 30 && (json.pilihanHari ?? []).length === 30, `retensi ${json.retensiHari} hari`);

  // ── C. Ekspor & penjagaan ─────────────────────────────────────────────────
  bagian('C. Ekspor CSV/NDJSON & penjagaan endpoint');
  const csv = await ambil({ format: 'csv' });
  const barisCsv = csv.teks.trim().split('\n');
  periksa(
    'C1 CSV: baris kepala + satu baris per catatan, tanpa PII',
    csv.headers.get('content-type')?.includes('text/csv') === true &&
      barisCsv[0].startsWith('waktu,kueri') &&
      barisCsv.length === item.length + 1 &&
      !adaNik(csv.teks),
    `${barisCsv.length - 1} baris data`,
  );
  const nd = await ambil({ format: 'ndjson' });
  let ndSah = 0;
  for (const b of nd.teks.trim().split('\n')) {
    try {
      JSON.parse(b);
      ndSah += 1;
    } catch {
      /* baris rusak */
    }
  }
  periksa('C2 NDJSON: setiap baris dapat diuraikan', ndSah === item.length && !adaNik(nd.teks), `${ndSah} baris`);

  const tanpaToken = await fetch(`http://127.0.0.1:${PORT}/api/admin/jejak-audit?hari=${hari}`, { signal: AbortSignal.timeout(20_000) });
  periksa('C3 tanpa token ⇒ 401 (jejak tidak bocor)', tanpaToken.status === 401, `HTTP ${tanpaToken.status}`);
  const tokenSalah = await fetch(`http://127.0.0.1:${PORT}/api/admin/jejak-audit?hari=${hari}`, {
    headers: { 'x-admin-token': 'salah' },
    signal: AbortSignal.timeout(20_000),
  });
  periksa('C4 token salah ⇒ 401', tokenSalah.status === 401, `HTTP ${tokenSalah.status}`);

  const lama = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const luar = JSON.parse((await ambil({ hari: lama })).teks);
  periksa(
    'C5 hari di luar retensi ⇒ kosong & ditandai (bukan data tersembunyi)',
    luar.jumlah === 0 && luar.diluarRetensi === true && (luar.item ?? []).length === 0,
    `${lama}: ${luar.jumlah} catatan`,
  );

  const teksEkspor = csv.teks + nd.teks + JSON.stringify(item);
  periksa(
    'C6 pemeriksa PII (pembanding independen) juga menyatakan ekspor bersih',
    !adaNik(teksEkspor) && !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(teksEkspor),
  );

  console.log('\n  ──────────────── Ringkasan ────────────────');
  console.log(`  catatan diperiksa  : ${item.length} (jalur JSON & streaming)`);
  console.log(`  pemeriksaan lulus  : ${LULUS}`);
  if (SABOTASE) {
    periksa('D1 SABOTASE: angka mentah 16 digit WAJIB muncul di catatan', adaNik(JSON.stringify(item)), 'harapan dibalik');
  }
  if (GAGAL.length) {
    console.log(`\n  ${warna.no} GAGAL — ${GAGAL.length} pemeriksaan tidak terpenuhi:`);
    for (const g of GAGAL) console.log(`    · ${g}`);
    process.exitCode = 1;
  } else {
    console.log(`\n  ${warna.ok} LULUS — jejak tercatat pada kedua jalur jawaban, tanpa data pribadi, dan ekspornya terjaga.`);
  }
} catch (err) {
  console.error(`\n  ${warna.no} galat: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 2;
} finally {
  for (const p of proses) matikan(p);
}
