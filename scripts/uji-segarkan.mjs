#!/usr/bin/env node
// ─── Uji ujung-ke-ujung penyegaran cache terjadwal (OPS-03) ──────────────────
//
// Mengapa harness ini MENJALANKAN APLIKASINYA SENDIRI.
// Kriteria terima OPS-03 adalah "cache segar harian; endpoint tetap
// fail-closed". Dua-duanya hanya bisa dibuktikan dengan mengukur perilaku
// sungguhan:
//   • "segar" harus terlihat pada DATA, bukan hanya pada catatan pembukuan:
//     kita membaca /api/stats DUA KALI (nilai sama → memang di-cache), lalu
//     menyegarkan, lalu membaca lagi dan menuntut cap waktu `lastFetched`
//     benar-benar berubah. Tanpa langkah ketiga, penyegaran hanya "diklaim".
//   • "fail-closed" harus dibuktikan pada aplikasi KEDUA yang dijalankan TANPA
//     REVALIDATE_SECRET di mode produksi: penjadwal harus GAGAL dengan kategori
//     `endpoint-tertutup` dan kode keluar 3 — bukan diam-diam "sukses".
//
// SATU PERINTAH, DUA APLIKASI:
//   A (:3171) — punya rahasia: penyegaran berhasil, kesegaran terbukti.
//   B (:3172) — tanpa rahasia: endpoint tertutup, kegagalan tercatat & terkabar.
//
// Cara pakai (semua prasyarat dinyalakan sendiri):
//   node scripts/uji-segarkan.mjs
//   node scripts/uji-segarkan.mjs --splp=http://127.0.0.1:9911/sapa/1.0/api
//
// Kode keluar 0 hanya bila seluruh pemeriksaan lulus.

import { envUji, catatanLingkungan } from './lingkungan-uji.mjs';
import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPLP_ARG = arg('splp', 'auto');
const PORT_SPLP = Number(arg('port-splp', '3163'));
const PORT = Number(arg('port', '3171'));
const PORT_B = Number(arg('port-b', String(PORT + 1)));
const TOKEN = arg('token', process.env.ADMIN_TOKEN ?? 'token-uji-123');
const RAHASIA = arg('rahasia', 'segarkan-uji-123');
const TIMEOUT_S = Number(arg('timeout', '180'));
const SIMPAN = arg('simpan', '');
const LOG = arg('log', '/tmp/uji-segarkan-a.log');
const LOG_B = arg('log-b', '/tmp/uji-segarkan-b.log');
const LOG_SPLP = arg('log-splp', '/tmp/uji-segarkan-splp.log');

const dibuangShell = [];
let LULUS = 0;
const GAGAL = [];
const CATATAN = [];

function periksa(nama, syarat, keterangan = '') {
  if (syarat) {
    LULUS += 1;
    console.log(`  \x1b[32m✓\x1b[0m ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
  } else {
    GAGAL.push(nama);
    console.log(`  \x1b[31m✗\x1b[0m ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
  }
}

function bagian(judul) {
  console.log(`\n── ${judul} ──`);
}

// ── Proses pendamping ────────────────────────────────────────────────────────

function jalankanPendamping(berkas, argumen, berkasLog) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  const proc = spawn(process.execPath, [join(AKAR, berkas), ...argumen], {
    cwd: AKAR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.pipe(aliran);
  proc.stderr.pipe(aliran);
  return proc;
}

function jalankanApp(port, tambahanEnv, berkasLog) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  // Lingkungan BERSIH: aplikasi B memang harus TANPA REVALIDATE_SECRET, jadi
  // rahasia yang ada di shell operator tidak boleh ikut (lihat lingkungan-uji.mjs).
  const { env, dibuang } = envUji({ PORT: String(port), ...tambahanEnv });
  if (dibuang.length) dibuangShell.push(...dibuang);
  const proc = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: AKAR,
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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

function hentikan(proc) {
  if (!proc || proc.killed) return;
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* sudah mati */
    }
  }
}

const dasarUrl = (port) => `http://127.0.0.1:${port}`;

async function ambilStats(port) {
  const res = await fetch(`${dasarUrl(port)}/api/stats`, { signal: AbortSignal.timeout(60_000) });
  const badan = await res.json();
  return { httpStatus: res.status, lastFetched: badan?.overview?.lastFetched ?? null, jumlah: badan?.overview?.totalRecords ?? null };
}

async function ambilStatus(port) {
  const res = await fetch(`${dasarUrl(port)}/api/status`, { signal: AbortSignal.timeout(30_000) });
  const badan = await res.json();
  return { httpStatus: res.status, segarkanCache: badan?.segarkanCache ?? null };
}

async function postRevalidate(port, badan, headers = {}) {
  const res = await fetch(`${dasarUrl(port)}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(badan),
    signal: AbortSignal.timeout(30_000),
  });
  const teks = await res.text();
  let json = null;
  try {
    json = JSON.parse(teks);
  } catch {
    /* biarkan null */
  }
  return { httpStatus: res.status, json, teks };
}

/** Jalankan penjadwal (scripts/segarkan-cache.mjs) seperti cron akan menjalankannya. */
async function jalankanPenjadwal(extra = [], envExtra = {}) {
  const out = `/tmp/uji-segarkan-jadwal-${Math.random().toString(36).slice(2, 8)}.log`;
  const aliran = createWriteStream(out, { flags: 'w' });
  const proc = spawn('node', [join(AKAR, 'scripts', 'segarkan-cache.mjs'), ...extra], {
    cwd: AKAR,
    // Lingkungan BERSIH: penjadwal juga benda yang dinilai (kode keluar & kategori),
    // jadi konfigurasinya harus datang dari argumen harness — bukan dari shell.
    env: envUji(envExtra).env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.pipe(aliran);
  proc.stderr.pipe(aliran);
  const kode = await new Promise((r) => proc.on('close', r));
  await new Promise((r) => setTimeout(r, 60));
  const teks = existsSync(out) ? readFileSync(out, 'utf8') : '';
  const baris = teks
    .split('\n')
    .filter((l) => l.includes('[segarkan]') && l.includes('{'))
    .map((l) => {
      try {
        return JSON.parse(l.slice(l.indexOf('{')));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { kode, teks, baris, terakhir: baris[baris.length - 1] ?? null };
}

// ── Jalankan ─────────────────────────────────────────────────────────────────

let pendampingSplp = null;
let appA = null;
let appB = null;

async function bersihkan() {
  hentikan(appA);
  hentikan(appB);
  hentikan(pendampingSplp);
  await new Promise((r) => setTimeout(r, 200));
}

try {
  let SPLP = SPLP_ARG;
  if (SPLP_ARG === 'auto') {
    pendampingSplp = jalankanPendamping('verifikasi/stub-splp.mjs', [String(PORT_SPLP), join(AKAR, 'verifikasi', 'korpus-uji-besar.json')], LOG_SPLP);
    SPLP = `http://127.0.0.1:${PORT_SPLP}/sapa/1.0/api`;
    if (!(await tungguSiap(`${SPLP}/daftar_data`, 20_000))) {
      console.error('Stub SPLP tidak siap — hentikan.');
      process.exit(2);
    }
  }

  console.log('═══ Uji ujung-ke-ujung: penyegaran cache terjadwal (OPS-03) ═══');
  console.log(`SPLP: ${SPLP}`);

  appA = jalankanApp(
    PORT,
    { SAPA_SPLP_BASE_URL: SPLP, ADMIN_TOKEN: TOKEN, REVALIDATE_SECRET: RAHASIA },
    LOG,
  );
  appB = jalankanApp(PORT_B, { SAPA_SPLP_BASE_URL: SPLP, ADMIN_TOKEN: TOKEN }, LOG_B);

  bagian('1. Kesiapan aplikasi');
  if (dibuangShell.length) console.log(`  · ${catatanLingkungan([...new Set(dibuangShell)])}`);
  periksa('aplikasi A siap', await tungguSiap(`${dasarUrl(PORT)}/api/status`, TIMEOUT_S * 1000));
  periksa('aplikasi B siap (tanpa REVALIDATE_SECRET)', await tungguSiap(`${dasarUrl(PORT_B)}/api/status`, TIMEOUT_S * 1000));

  bagian('2. Bukti cache bekerja (prasyarat mutlak)');
  const s1 = await ambilStats(PORT);
  const s2 = await ambilStats(PORT);
  periksa('aplikasi A menjawab /api/stats', s1.httpStatus === 200 && s1.lastFetched !== null, `record=${s1.jumlah}`);
  periksa(
    '/api/stats memang di-cache (dua bacaan → cap waktu sama)',
    s1.lastFetched === s2.lastFetched,
    `lastFetched=${s1.lastFetched}`,
  );

  bagian('3. Aplikasi B tanpa rahasia → fail-closed 503 (dan tercatat)');
  const anonB = await postRevalidate(PORT_B, { tag: 'all' });
  periksa('POST anonim ke aplikasi B ditolak 503 (bukan 200)', anonB.httpStatus === 503, `HTTP ${anonB.httpStatus}`);
  periksa(
    'balasan menjelaskan penyebabnya + cara memperbaiki',
    typeof anonB.json?.error === 'string' && /REVALIDATE_SECRET/.test(anonB.json.error),
    anonB.json?.kategori ? `kategori=${anonB.json.kategori}` : '',
  );
  periksa('kategori balasan = endpoint-tertutup', anonB.json?.kategori === 'endpoint-tertutup');
  const statusB = await ambilStatus(PORT_B);
  periksa('aplikasi B melaporkan cache belum pernah disegarkan (segar=false)', statusB.segarkanCache?.segar === false);
  periksa('aplikasi B melaporkan kegagalan tercatat (jumlahGagal ≥ 1)', (statusB.segarkanCache?.jumlahGagal ?? 0) >= 1, `jumlahGagal=${statusB.segarkanCache?.jumlahGagal}`);

  const jadwalB = await jalankanPenjadwal(['--url=' + dasarUrl(PORT_B), '--tag=all', '--ulang=1'], { REVALIDATE_SECRET: RAHASIA, SAPA_SEGARKAN_SUMBER: 'uji-jadwal' });
  periksa('penjadwal pada aplikasi B keluar dengan kode 3 (endpoint tertutup)', jadwalB.kode === 3, `kode=${jadwalB.kode}`);
  periksa('penjadwal melaporkan kategori endpoint-tertutup (bukan sekadar "gagal")', jadwalB.terakhir?.kategori === 'endpoint-tertutup', jadwalB.terakhir?.kategori ?? '');
  periksa('penjadwal TIDAK mencoba ulang untuk kegagalan konfigurasi', jadwalB.terakhir?.percobaan === 1, `percobaan=${jadwalB.terakhir?.percobaan}`);

  bagian('4. Rahasia salah → 401, cache TIDAK disentuh, tidak menulis pembukuan');
  const sebelumSalah = await ambilStatus(PORT);
  const salah = await postRevalidate(PORT, { tag: 'all' }, { 'x-revalidate-secret': 'rahasia-yang-salah' });
  periksa('rahasia salah ditolak 401', salah.httpStatus === 401, `HTTP ${salah.httpStatus}`);
  periksa('kategori = rahasia-salah', salah.json?.kategori === 'rahasia-salah');
  const sesudahSalah = await ambilStats(PORT);
  periksa('cache TIDAK dibatalkan oleh percobaan gagal', sesudahSalah.lastFetched === s2.lastFetched, `lastFetched tetap ${sesudahSalah.lastFetched}`);
  const statusSalah = await ambilStatus(PORT);
  periksa(
    'percobaan 401 TIDAK menulis ke penyimpanan bersama (anti pemborosan kuota)',
    (statusSalah.segarkanCache?.jumlahGagal ?? 0) === (sebelumSalah.segarkanCache?.jumlahGagal ?? 0),
    `jumlahGagal=${statusSalah.segarkanCache?.jumlahGagal}`,
  );

  const jadwalSalah = await jalankanPenjadwal(['--url=' + dasarUrl(PORT), '--tag=all', '--ulang=3'], { REVALIDATE_SECRET: 'rahasia-yang-salah' });
  periksa('penjadwal dengan rahasia salah keluar kode 2', jadwalSalah.kode === 2, `kode=${jadwalSalah.kode}`);
  periksa('penjadwal tidak mencoba ulang 401 (tidak ada gunanya)', jadwalSalah.terakhir?.percobaan === 1, `percobaan=${jadwalSalah.terakhir?.percobaan}`);

  bagian('5. Penyegaran sungguhan → cap waktu data berubah (bukti "segar")');
  const sebelum = await ambilStats(PORT);
  const jadwal = await jalankanPenjadwal(['--url=' + dasarUrl(PORT), '--tag=stats', '--ulang=2', '--simpan=/tmp/uji-segarkan-artefak.json'], {
    REVALIDATE_SECRET: RAHASIA,
    SAPA_SEGARKAN_SUMBER: 'uji-jadwal',
  });
  periksa('penjadwal keluar 0', jadwal.kode === 0, `kode=${jadwal.kode}`);
  periksa('penjadwal melaporkan hasil ok + kesegaran terkonfirmasi', jadwal.terakhir?.hasil === 'ok' && jadwal.terakhir?.kesegaran?.segar === true);
  const sesudah = await ambilStats(PORT);
  periksa(
    'cache BENAR-BENAR dihitung ulang (lastFetched berubah)',
    sebelum.lastFetched !== sesudah.lastFetched && new Date(sesudah.lastFetched) > new Date(sebelum.lastFetched),
    `${sebelum.lastFetched} → ${sesudah.lastFetched}`,
  );

  bagian('6. Pembukuan & kesegaran terlihat dari aplikasi');
  const statusA = await ambilStatus(PORT);
  periksa('/api/status memuat segarkanCache', statusA.segarkanCache !== null);
  periksa('segar = true setelah penyegaran', statusA.segarkanCache?.segar === true);
  periksa('umur < 1 jam', typeof statusA.segarkanCache?.umurJam === 'number' && statusA.segarkanCache.umurJam < 1, `umurJam=${statusA.segarkanCache?.umurJam}`);
  periksa('tidak terlewat', statusA.segarkanCache?.terlewat === false);
  periksa('gagalBerturut kembali 0 setelah keberhasilan', statusA.segarkanCache?.gagalBerturut === 0);
  periksa(
    'bukti tidak memuat rahasia apa pun',
    !JSON.stringify(statusA.segarkanCache).includes(RAHASIA),
    'kunci hanya waktu/tag/jumlah',
  );

  bagian('7. Endpoint admin (fail-closed) + uji kering');
  const admTanpa = await fetch(`${dasarUrl(PORT)}/api/admin/segarkan`, { signal: AbortSignal.timeout(20_000) });
  periksa('admin tanpa token ditolak', admTanpa.status === 401 || admTanpa.status === 503, `HTTP ${admTanpa.status}`);
  const adm = await fetch(`${dasarUrl(PORT)}/api/admin/segarkan`, { headers: { 'x-admin-token': TOKEN }, signal: AbortSignal.timeout(20_000) });
  const admJson = await adm.json();
  periksa('admin dengan token menampilkan kesegaran + riwayat', adm.status === 200 && Array.isArray(admJson.riwayat) && admJson.riwayat.length >= 1, `riwayat=${admJson.riwayat?.length}`);
  periksa('riwayat mencatat sumber jadwal (bukan "tak-diketahui")', admJson.riwayat?.some((r) => r.sumber === 'uji-jadwal'));
  const sebelumKering = await ambilStats(PORT);
  const admKering = await fetch(`${dasarUrl(PORT)}/api/admin/segarkan?sekarang=1&kering=1&tag=stats`, { headers: { 'x-admin-token': TOKEN }, signal: AbortSignal.timeout(20_000) });
  const admKeringJson = await admKering.json();
  const sesudahKering = await ambilStats(PORT);
  periksa('uji kering diterima dan dilaporkan', admKering.status === 200 && admKeringJson.aksi === 'kering');
  periksa('uji kering TIDAK membatalkan cache', sebelumKering.lastFetched === sesudahKering.lastFetched);
  const admSekarang = await fetch(`${dasarUrl(PORT)}/api/admin/segarkan?sekarang=1&tag=kpi`, { headers: { 'x-admin-token': TOKEN }, signal: AbortSignal.timeout(20_000) });
  const admSekarangJson = await admSekarang.json();
  periksa('penyegaran manual lewat admin berhasil', admSekarang.status === 200 && admSekarangJson.aksi === 'disegarkan', `tag=${JSON.stringify(admSekarangJson.tag)}`);
  const admTagSalah = await fetch(`${dasarUrl(PORT)}/api/admin/segarkan?sekarang=1&tag=entah`, { headers: { 'x-admin-token': TOKEN }, signal: AbortSignal.timeout(20_000) });
  periksa('tag tak dikenal ditolak 400 (bukan "sukses" palsu)', admTagSalah.status === 400);
  const postTagSalah = await postRevalidate(PORT, { tag: 'entah' }, { 'x-revalidate-secret': RAHASIA });
  periksa('tag tak dikenal lewat /api/revalidate juga 400 dengan kategori tag-salah', postTagSalah.httpStatus === 400 && postTagSalah.json?.kategori === 'tag-salah');

  bagian('8. Mode periksa penjadwal');
  const periksaJadwal = await jalankanPenjadwal(['--url=' + dasarUrl(PORT), '--periksa=1']);
  periksa('--periksa keluar 0 saat cache segar', periksaJadwal.kode === 0, `kode=${periksaJadwal.kode}`);
  const periksaJadwalB = await jalankanPenjadwal(['--url=' + dasarUrl(PORT_B), '--periksa=1']);
  periksa('--periksa keluar 5 saat cache belum pernah disegarkan (sinyal "penjadwal mati")', periksaJadwalB.kode === 5, `kode=${periksaJadwalB.kode}`);

  bagian('9. Regresi seluruh tag, batas laju & kebersihan log');
  // PENTING: urutan diperhitungkan. Penyegaran 'all' diuji SEBELUM batas laju
  // (di bawah) dipicu, karena batas laju sengaja menghitung SEMUA permintaan
  // bertanda rahasia yang sah — termasuk pemeriksaan di bagian 5–7.
  const regresi = await postRevalidate(PORT, { tag: 'all' }, { 'x-revalidate-secret': RAHASIA });
  periksa(
    'penyegaran seluruh tag (all) berhasil',
    regresi.httpStatus === 200 && Array.isArray(regresi.json?.revalidated) && regresi.json.revalidated.length === 4,
    `tag=${JSON.stringify(regresi.json?.revalidated)}`,
  );

  let kodeTerakhir = 0;
  let badanTerakhir = null;
  for (let i = 0; i < 21; i += 1) {
    const r = await postRevalidate(PORT, { tag: 'stats' }, { 'x-revalidate-secret': RAHASIA });
    kodeTerakhir = r.httpStatus;
    badanTerakhir = r.json;
    if (r.httpStatus === 429) {
      CATATAN.push(`batas laju aktif pada percobaan ke-${i + 1} dari bagian ini`);
      break;
    }
  }
  periksa('batas laju aktif (429) setelah 20 permintaan/menit', kodeTerakhir === 429, CATATAN[CATATAN.length - 1] ?? 'tidak tercapai');
  periksa('balasan 429 membawa kategori yang bisa ditindaklanjuti', badanTerakhir?.kategori === 'dibatasi', `kategori=${badanTerakhir?.kategori}`);

  const logA = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
  const barisLog = logA.split('\n').filter((l) => l.includes('[segarkan]'));
  periksa('setiap penyegaran menulis satu baris log [segarkan]', barisLog.length >= 3, `${barisLog.length} baris`);
  const contoh = barisLog.filter((l) => l.includes('"kategori":"ok"')).pop() ?? '';
  periksa(
    'baris log memuat tag/mode/kategori/durasi + kesegaran',
    /"tag":\[/.test(contoh) && /"mode":"/.test(contoh) && /"durasiMs":/.test(contoh) && /"segar":/.test(contoh),
  );
  periksa('RAHASIA tidak pernah muncul di log aplikasi', !logA.includes(RAHASIA), 'diperiksa dengan pencarian harfiah');
  periksa('rahasia tidak muncul di keluaran penjadwal', !jadwal.teks.includes(RAHASIA));

  bagian('10. Artefak');
  if (SIMPAN) {
    writeFileSync(
      SIMPAN,
      JSON.stringify(
        {
          waktu: new Date().toISOString(),
          lulus: LULUS,
          gagal: GAGAL,
          catatan: CATATAN,
          contohBarisLog: contoh,
          contohStatus: statusA.segarkanCache,
          buktiKesegaran: { sebelum: sebelum.lastFetched, sesudah: sesudah.lastFetched },
        },
        null,
        2,
      ),
    );
  }
  periksa(
    'aplikasi tetap sehat setelah seluruh uji (termasuk penolakan)',
    (await ambilStatus(PORT)).httpStatus === 200,
    `proses pendamping dikelola: ${[pendampingSplp, appA, appB].filter(Boolean).length}`,
  );

  console.log(`\n   ringkasan: ${LULUS} ✓ / ${GAGAL.length} ✗`);
  if (GAGAL.length > 0) console.log(`   gagal: ${GAGAL.join(' · ')}`);
  console.log(`   HASIL: ${GAGAL.length === 0 ? 'LULUS' : 'GAGAL'}`);
} catch (e) {
  console.error('Harness berhenti karena galat:', e);
  GAGAL.push('galat harness: ' + (e instanceof Error ? e.message : String(e)));
} finally {
  await bersihkan();
}

process.exit(GAGAL.length === 0 ? 0 : 1);
