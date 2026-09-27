#!/usr/bin/env node
// ─── P5: anggaran kinerja (uang jaminan, bukan angka laporan) ────────────────
//
// MASALAH YANG DIPERBAIKI
//   p95 deterministik pernah diukur **107 ms** dan angka itu ditulis di dokumen.
//   Tetapi angka di dokumen tidak menjaga apa pun: tidak ada satu pun uji yang
//   GAGAL bila kinerjanya mundur sepuluh kali. Kelas kegagalan yang tidak
//   berbunyi ini sama dengan kesegaran (P3) dan sirkuit penyedia (OPS-04) —
//   baru terasa setelah warga menunggu.
//
// YANG DIUKUR
//   Waktu balas /api/query pada JALUR DETERMINISTIK (AI dimatikan; itu jalur
//   yang selalu tersedia sesuai NFR-03). Ukuran yang dilaporkan p50/p95/p99
//   dari N permintaan BERPENYEDIA TIRUAN yang korpusnya 2.065 record produksi —
//   bukan korpus kecil, supaya angka yang dijaga memang angka yang berarti.
//
// KENAPA BUDGET, BUKAN "BANDINGKAN DENGAN ANGKA LAMA"
//   Angka absolut mesin selalu berbeda (sandbox, laptop, Vercel). Yang bisa
//   dijaga lintas-mesin adalah AMBANG: bila p95 melewati anggaran, ada yang
//   benar-benar berubah (indeks hilang, kueri jadi kuadratik, cache mati).
//   Anggaran bawaan sengaja ~10x angka rujukan supaya tidak pernah gagal karena
//   bising mesin biasa — tetapi tetap menangkap kemunduran satu digit.
//
// Pakai:
//   node scripts/uji-kinerja.mjs                     # aplikasi sendiri + stub
//   SAPA_EVAL_URL=http://127.0.0.1:3117 node scripts/uji-kinerja.mjs --pakai-yang-ada
//   SAPA_ANGGARAN_P95_MS=1500 node scripts/uji-kinerja.mjs
// Keluar: 0 = LULUS, 1 = anggaran terlampaui, 2 = aplikasi tidak dapat dihubungi.

import { spawn } from 'node:child_process';
import { createWriteStream, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catatanLingkungan, envUji } from './lingkungan-uji.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAKAI_YANG_ADA = process.argv.includes('--pakai-yang-ada');
const STUB_PORT = Number(process.env.SAPA_STUB_PORT ?? 9971);
const APP_PORT = Number(process.env.SAPA_APP_PORT ?? 3161);
const KORPUS = process.env.SAPA_KORPUS ?? path.join(AKAR, 'verifikasi/korpus-produksi.json');
const JUMLAH = Number(process.env.SAPA_KINERJA_N ?? 40);
const PANAS = Number(process.env.SAPA_KINERJA_PANAS ?? 5);
const ANGGARAN = Number(process.env.SAPA_ANGGARAN_P95_MS ?? 1000);
const TULIS_BUKTI = process.env.SAPA_KINERJA_BUKTI ?? path.join(AKAR, 'verifikasi/uji-kinerja.json');

const TMP = mkdtempSync(path.join(tmpdir(), 'sapa-kinerja-'));
const APP = PAKAI_YANG_ADA ? (process.env.SAPA_EVAL_URL ?? `http://127.0.0.1:${APP_PORT}`).replace(/\/$/, '') : `http://127.0.0.1:${APP_PORT}`;

let stub = null;
let app = null;
const dibuangShell = [];

/** Kueri beragam: panjang kueri & jumlah kandidat berbeda itu bagian dari beban. */
const KUERI = [
  'berapa jumlah ASN',
  'tingkat kemiskinan',
  'indeks pembangunan manusia',
  'berapa produksi kopi arabika',
  'jumlah penduduk',
  'stunting',
  'jumlah koperasi di kecamatan bebesen',
  'berapa OPD yang ada',
  'indikator apa saja yang tersedia',
  'dana bantuan sosial sembako',
  'panjang jalan kabupaten',
  'jumlah guru SD',
];

function jalankan(berkas, argumen, env, berkasLog) {
  const aliran = createWriteStream(path.join(TMP, berkasLog), { flags: 'w' });
  const proc = spawn(process.execPath, [path.join(AKAR, berkas), ...argumen], {
    cwd: AKAR,
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.pipe(aliran);
  proc.stderr.pipe(aliran);
  return proc;
}

function jalankanApp() {
  const aliran = createWriteStream(path.join(TMP, 'app.log'), { flags: 'w' });
  const { env, dibuang } = envUji({
    PORT: String(APP_PORT),
    SAPA_SPLP_BASE_URL: `http://127.0.0.1:${STUB_PORT}/sapa/1.0/api`,
    AI_ENABLED: 'false',
  });
  if (dibuang.length) dibuangShell.push(...dibuang);
  const proc = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], {
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
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) return true;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function portTerpakai(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(1200) });
    return true;
  } catch {
    return false;
  }
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

/**
 * Satu permintaan, dengan IP klien yang BERBEDA tiap kali.
 *
 * Kenapa: /api/query membatasi 30 permintaan/menit PER IP. Mengirim 45
 * permintaan beruntun dari satu IP mengukur pembatas laju (429), bukan
 * kecepatan pelayanan — dan memang itu yang terjadi pada percobaan pertama
 * harness ini (15 kegagalan = 45 − 30, tepat). Lalu lintas nyata datang dari
 * banyak alamat, jadi sampel yang jujur untuk MENGUKUR LATENSI adalah banyak
 * klien. Namun bila 429 tetap muncul (mis. rotasi tidak bekerja), itu
 * dihitung sebagai kegagalan — bukan diabaikan, karena berarti yang diukur
 * bukan jalur pelayanan lagi.
 */
let urutanIp = 0;
async function tanya(query) {
  urutanIp += 1;
  const ip = `10.20.${Math.floor(urutanIp / 250) % 250}.${(urutanIp % 250) + 1}`;
  const mulai = performance.now();
  const res = await fetch(`${APP}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => null);
  return {
    ms: performance.now() - mulai,
    status: res.status,
    matched: body?.matched ?? null,
    dibatasi: res.status === 429,
  };
}

function persentil(angka, p) {
  if (angka.length === 0) return null;
  const urut = [...angka].sort((a, b) => a - b);
  const idx = Math.min(urut.length - 1, Math.max(0, Math.ceil((p / 100) * urut.length) - 1));
  return Math.round(urut[idx]);
}

async function main() {
  console.log('══ Uji kinerja (P5) — anggaran p95 jalur deterministik ══');
  console.log(`   anggaran p95: ${ANGGARAN} ms · jumlah permintaan: ${JUMLAH} (+${PANAS} pemanasan) · korpus: ${path.basename(KORPUS)}`);

  if (!PAKAI_YANG_ADA) {
    if (await portTerpakai(STUB_PORT) || await portTerpakai(APP_PORT)) {
      console.log(`\n  \x1b[31m✗ Port uji (${STUB_PORT}/${APP_PORT}) sudah terpakai — hasil tidak boleh datang dari proses lain\x1b[0m`);
      return 2;
    }
    stub = jalankan('verifikasi/stub-splp.mjs', [String(STUB_PORT), KORPUS], process.env, 'stub.log');
    if (!(await tungguSiap(`http://127.0.0.1:${STUB_PORT}/sapa/1.0/api/daftar_data`, 25_000))) {
      console.log('  \x1b[31m✗ SPLP tiruan tidak siap\x1b[0m');
      return 2;
    }
    app = jalankanApp();
  }

  if (!(await tungguSiap(`${APP}/api/status`, 120_000))) {
    console.log(`  \x1b[31m✗ aplikasi tidak siap di ${APP} (log: ${TMP})\x1b[0m`);
    return 2;
  }

  // Pemanasan: indeks semantik & cache LRU dibangun sekali; yang diukur adalah
  // keadaan pelayanan normal, bukan tarikan pertama (itu bukan kemunduran).
  for (let i = 0; i < PANAS; i++) await tanya(KUERI[i % KUERI.length]);

  const waktu = [];
  let gagal = 0;
  let tanpaBukti = 0;
  let dibatasi = 0;
  for (let i = 0; i < JUMLAH; i++) {
    const hasil = await tanya(KUERI[i % KUERI.length]);
    if (hasil.status !== 200) gagal += 1;
    if (hasil.dibatasi) dibatasi += 1;
    if (hasil.matched === 0) tanpaBukti += 1;
    waktu.push(hasil.ms);
  }

  const p50 = persentil(waktu, 50);
  const p95 = persentil(waktu, 95);
  const p99 = persentil(waktu, 99);
  const maks = Math.round(Math.max(...waktu));

  console.log(`\n  p50 ${p50} ms · p95 ${p95} ms · p99 ${p99} ms · maks ${maks} ms`);
  console.log(`  permintaan gagal: ${gagal} (di antaranya 429 pembatas laju: ${dibatasi}) · jawaban tanpa bukti: ${tanpaBukti}`);

  const bukti = {
    waktu: new Date().toISOString(),
    anggaranP95Ms: ANGGARAN,
    jumlahPermintaan: JUMLAH,
    korpus: path.basename(KORPUS),
    p50,
    p95,
    p99,
    maks,
    gagal,
    dibatasiLaju: dibatasi,
    tanpaBukti,
    lulus: p95 <= ANGGARAN && gagal === 0,
  };
  try {
    writeFileSync(TULIS_BUKTI, `${JSON.stringify(bukti, null, 2)}\n`, 'utf8');
    console.log(`  bukti mentah: ${path.relative(AKAR, TULIS_BUKTI)}`);
  } catch {
    /* bukti gagal ditulis bukan alasan menggagalkan uji */
  }

  if (dibuangShell.length) console.log(`  · ${catatanLingkungan([...new Set(dibuangShell)])}`);

  const pelanggaran = [];
  if (p95 > ANGGARAN) pelanggaran.push(`p95 ${p95} ms > anggaran ${ANGGARAN} ms`);
  if (gagal > 0) pelanggaran.push(`${gagal} permintaan gagal (harus 0)`);
  if (dibatasi > 0) pelanggaran.push(`${dibatasi} permintaan kena pembatas laju — sampel latensi tidak sah`);
  // Kontrol masuk akal: kalau SEMUA jawaban tanpa bukti, yang diukur bukan
  // retrieval melainkan jalur kosong — lulusnya tidak berarti apa-apa.
  if (tanpaBukti === JUMLAH) pelanggaran.push('seluruh jawaban tanpa bukti — yang diukur bukan jalur retrieval');

  console.log(`\n══ Ringkasan: ${pelanggaran.length === 0 ? 'LULUS' : 'GAGAL'} ══`);
  if (pelanggaran.length) {
    for (const p of pelanggaran) console.log(`  - ${p}`);
    return 1;
  }
  console.log(`LULUS — p95 ${p95} ms di bawah anggaran ${ANGGARAN} ms.`);
  return 0;
}

main()
  .then((kode) => {
    process.exitCode = kode;
  })
  .catch((e) => {
    console.error('Galat uji:', e);
    process.exitCode = 2;
  })
  .finally(() => {
    hentikan(app);
    hentikan(stub);
  });
