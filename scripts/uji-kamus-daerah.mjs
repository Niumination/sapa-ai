#!/usr/bin/env node
// ─── DS-05 · Uji kamus sinonim daerah (end-to-end + statis + kontrol negatif) ───
//
// Kriteria terima dokumen 10: **≥ 50 entri** dan **tiap 3 bulan ditinjau**.
// Harness ini membuktikan TIGA hal yang berbeda:
//
//   A. STATIS  — entri cukup & lengkap, tidak ada kata kamus yang sudah ada di
//      katalog (kalau ada, pemetaannya justru menyesatkan), dan tenggat tinjauan
//      3 bulan BELUM lewat (kalau lewat → exit 1, bukan peringatan).
//   B. END-TO-END — 8 kueri beristilah daerah dijalankan ke aplikasi nyata di atas
//      penyedia SPLP tiruan; jawabannya wajib memuat indikator yang cocok dengan
//      kata katalog hasil pemetaan.
//   C. KONTROL NEGATIF — aplikasi kedua dijalankan dengan `SAPA_KAMUS_DAERAH=off`.
//      Untuk kueri yang SAMA, hasilnya wajib BERBEDA (tidak lagi menemukan
//      indikator target). Kalau tidak berbeda, kamus tidak benar-benar bekerja.
//
// Pakai: node scripts/uji-kamus-daerah.mjs
// Keluar: 0 = lulus, 1 = ada pelanggaran, 2 = gagal menyiapkan.

import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT_SPLP = Number(arg('port-splp', '3166'));
const PORT = Number(arg('port', '3191'));
const PORT_OFF = Number(arg('port-off', String(PORT + 1)));
const TIMEOUT_S = Number(arg('timeout', '180'));
const LOG = arg('log', '/tmp/uji-kamus-a.log');
const LOG_OFF = arg('log-off', '/tmp/uji-kamus-off.log');
const LOG_SPLP = arg('log-splp', '/tmp/uji-kamus-splp.log');

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

/** Kueri beristilah daerah → pola indikator katalog yang HARUS muncul. */
const KASUS = [
  // Kueri SENGAJA hanya berisi istilah daerah: kalau ada kata katalog lain di
  // dalamnya (mis. "pasar rakyat", "kopi arabika"), penelusuran bisa berhasil
  // tanpa kamus — dan uji jadi tidak membuktikan apa pun.
  { q: 'jumlah gampong', target: /\bdesa\b/i, arti: 'gampong → desa' },
  { q: 'peukan', target: /\bpasar\b/i, arti: 'peukan → pasar' },
  { q: 'pade', target: /\bpadi\b/i, arti: 'pade → padi' },
  { q: 'jurong', target: /\bjalan\b/i, arti: 'jurong → jalan' },
  { q: 'keude', target: /\bpasar\b/i, arti: 'keude → pasar' },
  { q: 'jumlah ureung', target: /\bpenduduk\b/i, arti: 'ureung → penduduk' },
  { q: 'lampoh', target: /\bperkebunan\b/i, arti: 'lampoh → perkebunan' },
  { q: 'warung', target: /\bumkm\b/i, arti: 'warung → umkm' },
];

/** Kueri ini WAJIB gagal (tidak menemukan target) saat kamus dimatikan. */
const TANPA_KAMUS_HARUS_BERBEDA = 8;

// ── A. Statis ─────────────────────────────────────────────────────────────
async function bagianStatis() {
  const kamus = await import('../src/lib/kamus-daerah.ts').catch(() => null);
  if (kamus) {
    const { KAMUS_DAERAH, statusTinjauan, DITINJAU_PADA, TINJAUAN_BERIKUTNYA } = kamus;
    periksa('A1 entri ≥ 50 (kriteria dok 10)', KAMUS_DAERAH.length >= 50, `${KAMUS_DAERAH.length} entri`);
    const kata = KAMUS_DAERAH.map((e) => e.kata);
    periksa('A2 kata kunci unik', new Set(kata).size === kata.length);
    periksa(
      'A3 setiap entri punya padanan ber-df > 0',
      KAMUS_DAERAH.every((e) => Math.max(...Object.values(e.dfProduksi)) > 0),
    );
    const status = statusTinjauan(new Date());
    periksa(
      `A4 tenggat tinjauan 3 bulan BELUM lewat (ditinjau ${DITINJAU_PADA}, berikutnya ${TINJAUAN_BERIKUTNYA})`,
      !status.lewatTenggat,
      `${status.hariTersisa} hari tersisa`,
    );
  } else {
    // Node tidak dapat mengimpor TS langsung di semua versi — jatuh ke pembacaan teks.
    const teks = readFileSync(join(AKAR, 'src', 'lib', 'kamus-daerah.ts'), 'utf8');
    const jumlah = (teks.match(/^ {2}\{ kata: '/gm) ?? []).length;
    periksa('A1 entri ≥ 50 (kriteria dok 10)', jumlah >= 50, `${jumlah} baris entri (dibaca dari berkas)`);
    const tenggat = /TINJAUAN_BERIKUTNYA = '(\d{4}-\d{2}-\d{2})'/.exec(teks);
    periksa('A4 tenggat tinjauan terpasang & belum lewat', Boolean(tenggat) && new Date(tenggat[1]) >= new Date(), tenggat ? tenggat[1] : 'tidak ada');
  }

  const korpus = JSON.parse(readFileSync(join(AKAR, 'verifikasi', 'korpus-uji-besar.json'), 'utf8'));
  const nama = [...new Set(korpus.data.map((r) => String(r.kode_indikator_nama_indikator ?? '').trim()))];
  const kunciDariBerkas = [...readFileSync(join(AKAR, 'src', 'lib', 'kamus-daerah.ts'), 'utf8')
    .matchAll(/^ {2}\{ kata: '([^']+)', padanan:/gm)].map((m) => m[1]);
  const bentrok = kunciDariBerkas.filter((k) =>
    nama.some((n) => new RegExp(`(?<![a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(n)),
  );
  periksa('A5 tidak ada kata kamus yang sudah ada di katalog korpus uji', bentrok.length === 0, bentrok.join(', ') || 'bersih');
  return kunciDariBerkas.length;
}

// ── Proses ────────────────────────────────────────────────────────────────
function jalankanPendamping(berkas, argumen, berkasLog) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  const proc = spawn(process.execPath, [join(AKAR, berkas), ...argumen], { cwd: AKAR, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.pipe(aliran);
  proc.stderr.pipe(aliran);
  return proc;
}

function jalankanApp(port, tambahanEnv, berkasLog) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  const proc = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: AKAR,
    detached: true,
    env: { ...process.env, PORT: String(port), ...tambahanEnv },
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

async function pastikanPortBebas(port) {
  const nyala = [];
  for (const p of port) {
    try {
      const res = await fetch(`http://127.0.0.1:${p}/api/status`, { signal: AbortSignal.timeout(1200) });
      if (res.status < 500) nyala.push(p);
    } catch {
      /* bebas */
    }
  }
  if (nyala.length) {
    console.error(`  ${warna.no} port ${nyala.join(', ')} sudah dipakai — hentikan dulu agar uji tidak menabrak server basi`);
    return false;
  }
  return true;
}

async function tanya(port, q) {
  const res = await fetch(`http://127.0.0.1:${port}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const cocokTarget = (body, pola) => (body.evidence ?? []).some((e) => pola.test(String(e.indikator ?? '')));

let splp = null;
let app = null;
let appOff = null;

function matikan(proc) {
  if (!proc || proc.killed) return;
  try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch { /* sudah mati */ } }
}

try {
  console.log('\n  DS-05 · kamus sinonim daerah\n');
  bagian('A. Pemeriksaan statis (entri, keamanan, tenggat tinjauan)');
  const jumlahEntri = await bagianStatis();

  if (!(await pastikanPortBebas([PORT, PORT_OFF]))) process.exit(2);

  splp = jalankanPendamping('verifikasi/stub-splp.mjs', [String(PORT_SPLP), join(AKAR, 'verifikasi', 'korpus-uji-besar.json')], LOG_SPLP);
  const urlSplp = `http://127.0.0.1:${PORT_SPLP}/sapa/1.0/api`;
  if (!(await tungguSiap(`${urlSplp}/daftar_data`, 25_000))) {
    console.error(`  ${warna.no} penyedia SPLP tiruan tidak siap (lihat ${LOG_SPLP})`);
    process.exit(2);
  }

  app = jalankanApp(PORT, { SAPA_SPLP_BASE_URL: urlSplp, AI_ENABLED: 'false' }, LOG);
  if (!(await tungguSiap(`http://127.0.0.1:${PORT}/api/status`, TIMEOUT_S * 1000))) {
    console.error(`  ${warna.no} aplikasi tidak siap (lihat ${LOG})`);
    process.exit(2);
  }

  appOff = jalankanApp(PORT_OFF, { SAPA_SPLP_BASE_URL: urlSplp, AI_ENABLED: 'false', SAPA_KAMUS_DAERAH: 'off' }, LOG_OFF);
  if (!(await tungguSiap(`http://127.0.0.1:${PORT_OFF}/api/status`, TIMEOUT_S * 1000))) {
    console.error(`  ${warna.no} aplikasi kontrol negatif tidak siap (lihat ${LOG_OFF})`);
    process.exit(2);
  }

  bagian('B. End-to-end — istilah daerah menemukan indikator katalog');
  let beda = 0;
  for (const kasus of KASUS) {
    const hidup = await tanya(PORT, kasus.q);
    const mati = await tanya(PORT_OFF, kasus.q);
    const ketemuHidup = cocokTarget(hidup, kasus.target);
    const ketemuMati = cocokTarget(mati, kasus.target);
    periksa(`B "${kasus.q.slice(0, 44)}" (${kasus.arti})`, ketemuHidup, `${(hidup.evidence ?? []).length} bukti`);
    if (ketemuHidup !== ketemuMati) beda += 1;
  }

  bagian('C. Kontrol negatif — SAPA_KAMUS_DAERAH=off (harus berbeda)');
  for (const kasus of KASUS) {
    const hidup = await tanya(PORT, kasus.q);
    const mati = await tanya(PORT_OFF, kasus.q);
    const h = cocokTarget(hidup, kasus.target);
    const m = cocokTarget(mati, kasus.target);
    console.log(`     · "${kasus.q}": kamus AKTIF ${h ? 'menemukan' : 'TIDAK menemukan'} · kamus MATI ${m ? 'menemukan' : 'tidak menemukan'}`);
  }
  periksa(
    'C1 SEMUA kueri beristilah daerah berubah hasil saat kamus dimatikan',
    beda === KASUS.length,
    `${beda}/${KASUS.length} kueri berubah`,
  );
  periksa(
    'C2 jumlah kueri yang diuji sesuai rencana',
    KASUS.length === TANPA_KAMUS_HARUS_BERBEDA,
    `${KASUS.length} kueri`,
  );

  if (jumlahEntri < 50) GAGAL.push('jumlah entri');

  console.log('\n  ──────────────── Ringkasan ────────────────');
  console.log(`  entri kamus        : ${jumlahEntri}`);
  console.log(`  kueri diuji        : ${KASUS.length} (${beda} hasilnya berubah saat kamus dimatikan)`);
  console.log(`  pemeriksaan lulus  : ${LULUS}`);
  if (GAGAL.length) {
    console.log(`\n  ${warna.no} GAGAL — ${GAGAL.length} pemeriksaan tidak terpenuhi:`);
    for (const g of GAGAL) console.log(`    · ${g}`);
    process.exitCode = 1;
  } else {
    console.log(`\n  ${warna.ok} LULUS — kamus daerah aktif menemukan indikator katalog, dan mematikannya benar-benar mengubah hasil.`);
  }
} catch (err) {
  console.error(`\n  ${warna.no} galat: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 2;
} finally {
  matikan(appOff);
  matikan(app);
  matikan(splp);
}
