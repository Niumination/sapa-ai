#!/usr/bin/env node
// ─── P3 (DS-03 lanjutan): alarm kesegaran data — uji ujung-ke-ujung ──────────
//
// YANG DIUJI
//   Sebelum komit ini, kesegaran hanya TAMPILAN: "/api/query" menyebut kapan
//   korpus ditarik, tetapi tidak ada satu pun tempat yang MENYIMPULKAN apakah
//   angka yang sedang disajikan sudah terlalu tua. Harness ini membuktikan
//   simpulan itu benar-benar muncul — di `/api/status` (untuk operator) dan di
//   setiap jawaban `/api/query` (untuk pembaca).
//
// CARA MEMBUKTIKAN (dua keadaan yang BERBEDA, bukan satu keadaan yang diulang)
//   A. Korpus tahun BERJALAN (2026)  → tingkat `segar`, pesan kosong.
//   B. Korpus tahun TERTINGGAL (2019-2020) → tingkat `basi`/`perhatian` dengan
//      sebab `tahun-katalog-tertinggal` dan pesan yang menyebut selisih tahun.
//
//   Keadaan B adalah inti butir ini: korpus yang BARU DITARIK tetapi ISINYA tua
//   — persis kasus yang paling sering terjadi pada layanan statistik daerah dan
//   paling mudah menipu ("ditarik tadi pagi" terdengar segar).
//
//   Kontrol negatif ikut diperiksa: pada keadaan A, jawaban TIDAK BOLEH
//   mengembalikan tingkat basi. Tanpa itu, harness yang selalu bilang "basi"
//   akan lulus dengan sendirinya.
//
// Pakai:
//   node scripts/uji-kesegaran.mjs
// Keluar: 0 = LULUS, 1 = ada pelanggaran, 2 = aplikasi/SPLP tiruan tidak siap.

import { spawn } from 'node:child_process';
import { createWriteStream, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catatanLingkungan, envUji } from './lingkungan-uji.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JEDA_SIAP_MS = Number(process.env.SAPA_JEDA_SIAP_MS ?? 90_000);
const STUB_PORT = Number(process.env.SAPA_STUB_PORT ?? 9961);
const PORT_A = Number(process.env.SAPA_APP_PORT_A ?? 3153);
const PORT_B = Number(process.env.SAPA_APP_PORT_B ?? 3154);
const SPLP = `http://127.0.0.1:${STUB_PORT}/sapa/1.0/api`;
const TAHUN_INI = new Date().getUTCFullYear();

const LULUS = [];
const GAGAL = [];
const dibuangShell = [];

function ok(nama, keterangan) {
  LULUS.push(nama);
  console.log(`  \x1b[32m✓\x1b[0m ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
}
function no(nama, keterangan) {
  GAGAL.push(nama);
  console.log(`  \x1b[31m✗\x1b[0m ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
}
function bagian(judul) {
  console.log(`\n── ${judul} ──`);
}

// ── Korpus uji ───────────────────────────────────────────────────────────────

function rekod(id, nama, tahun, nilai) {
  return {
    id,
    id_kode_indikator: id + 100,
    kode_indikator_kode_indikator: `U.${id}`,
    kode_indikator_nama_indikator: nama,
    id_opds: 1,
    opds_nama_opd: 'Badan Perencanaan Pembangunan Daerah',
    jadwal_pemutakhiran: 'Tahunan',
    satuan: 'Poin',
    tahun,
    variabel: nilai,
  };
}

/** Keadaan A — isi katalog tahun berjalan. */
const KORPUS_SEGAR = {
  api_status: 1,
  api_message: 'ok',
  data: [
    rekod(1, 'Jumlah ASN', String(TAHUN_INI), '9610'),
    rekod(2, 'Indeks Pembangunan Manusia (IPM)', String(TAHUN_INI), '78,09'),
    rekod(3, 'Tingkat Kemiskinan', String(TAHUN_INI - 1), '12,29'),
  ],
};

/** Keadaan B — ditarik BARU, tetapi isi katalog tertinggal 6-7 tahun. */
const KORPUS_TUA = {
  api_status: 1,
  api_message: 'ok',
  data: [
    rekod(1, 'Jumlah ASN', String(TAHUN_INI - 7), '7100'),
    rekod(2, 'Indeks Pembangunan Manusia (IPM)', String(TAHUN_INI - 6), '71,20'),
    rekod(3, 'Tingkat Kemiskinan', `${TAHUN_INI - 7}–${TAHUN_INI - 6}`, '15,40'),
  ],
};

// ── Proses ───────────────────────────────────────────────────────────────────

function jalankanStub(berkas) {
  const aliran = createWriteStream(path.join(TMP, `stub-${path.basename(berkas)}.log`), { flags: 'w' });
  const proc = spawn(process.execPath, [path.join(AKAR, 'verifikasi/stub-splp.mjs'), String(STUB_PORT), berkas], {
    cwd: AKAR,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.pipe(aliran);
  proc.stderr.pipe(aliran);
  return proc;
}

function jalankanApp(port, berkasLog) {
  const aliran = createWriteStream(path.join(TMP, berkasLog), { flags: 'w' });
  const { env, dibuang } = envUji({
    PORT: String(port),
    SAPA_SPLP_BASE_URL: SPLP,
    AI_ENABLED: 'false',
  });
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

async function tungguSiap(url, batasMs = JEDA_SIAP_MS) {
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

const TMP = mkdtempSync(path.join(tmpdir(), 'sapa-kesegaran-'));

function berkasKorpus(nama, isi) {
  const p = path.join(TMP, nama);
  writeFileSync(p, JSON.stringify(isi), 'utf8');
  return p;
}

async function tanya(port, query) {
  const res = await fetch(`http://127.0.0.1:${port}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  return res.json();
}

/**
 * Pastikan port BENAR-BENAR bebas sebelum dipakai.
 *
 * Kejadian nyata yang melahirkan penjaga ini (percobaan kedua penulisannya):
 * jalankan pertama keluar lewat `process.exit(1)` sehingga blok pembersihan
 * tidak sempat berjalan; proses lama tetap hidup memegang port dengan korpus
 * keadaan B. Jalankan kedua TIDAK bisa membuka port itu, tetapi pemeriksaan
 * "siap" tetap lolos karena yang menjawab adalah proses LAMA — hasilnya
 * keadaan A melaporkan angka keadaan B, dan laporannya menyesatkan ke arah
 * yang salah. Uji yang bisa berbicara atas nama proses lain bukan uji.
 */
async function portBebas(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(1500) });
    return false; // ada yang menjawab → terpakai
  } catch {
    return true;
  }
}

async function pastikanPortBebas() {
  const terpakai = [];
  for (const p of [STUB_PORT, PORT_A, PORT_B]) {
    if (!(await portBebas(p))) terpakai.push(p);
  }
  if (terpakai.length) {
    console.log(`\n  \x1b[31m✗ Port sudah terpakai: ${terpakai.join(', ')} — matikan proses lama lebih dahulu\x1b[0m`);
    console.log('    (hasil uji tidak boleh datang dari proses yang bukan milik uji ini)');
    return false;
  }
  return true;
}

// ── Skenario ─────────────────────────────────────────────────────────────────

let stub = null;
let app = null;

async function jalankanKeadaan({ nama, korpus, port, logApp }) {
  bagian(nama);
  if (stub) {
    hentikan(stub);
    await new Promise((r) => setTimeout(r, 300));
  }
  const berkas = berkasKorpus(`korpus-${port}.json`, korpus);
  stub = jalankanStub(berkas);
  if (!(await tungguSiap(`${SPLP}/daftar_data`, 20_000))) {
    console.log(`  \x1b[31m✗\x1b[0m SPLP tiruan tidak siap di :${STUB_PORT}`);
    return null;
  }
  if (app) {
    hentikan(app);
    await new Promise((r) => setTimeout(r, 400));
  }
  app = jalankanApp(port, logApp);
  if (!(await tungguSiap(`http://127.0.0.1:${port}/api/status`))) {
    console.log(`  \x1b[31m✗\x1b[0m aplikasi tidak siap di :${port} (lihat ${TMP}/${logApp})`);
    return null;
  }
  const status = await (await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(60_000) })).json();
  return status;
}

async function main() {
  console.log('══ Uji kesegaran data (P3) — dua keadaan korpus ══');

  if (!(await pastikanPortBebas())) return 2;

  // ── Keadaan A: korpus tahun berjalan ──
  const statusA = await jalankanKeadaan({
    nama: `A. Korpus tahun berjalan (${TAHUN_INI}) — harap SEGAR`,
    korpus: KORPUS_SEGAR,
    port: PORT_A,
    logApp: 'app-a.log',
  });
  if (!statusA) {
    console.log('\n  \x1b[31mGAGAL: aplikasi A tidak dapat dijalankan\x1b[0m');
    return 2;
  }

  if (statusA?.kesegaranData?.tingkat === 'segar') ok('status A: tingkat = segar');
  else no('status A: tingkat = segar', `dapat ${statusA?.kesegaranData?.tingkat}`);
  if (statusA?.kesegaranData?.tahunTerbaru === TAHUN_INI) ok(`status A: tahun terbaru ${TAHUN_INI}`);
  else no(`status A: tahun terbaru ${TAHUN_INI}`, `dapat ${statusA?.kesegaranData?.tahunTerbaru}`);
  if (statusA?.kesegaranData?.pesan === '') ok('status A: pesan kosong (tidak ada peringatan palsu)');
  else no('status A: pesan kosong', `dapat "${statusA?.kesegaranData?.pesan}"`);
  if (typeof statusA?.kesegaranData?.umurJam === 'number' && statusA.kesegaranData.umurJam <= 1) {
    ok('status A: umur tarikan ≤ 1 jam', `${statusA.kesegaranData.umurJam} jam`);
  } else {
    no('status A: umur tarikan ≤ 1 jam', `dapat ${statusA?.kesegaranData?.umurJam}`);
  }

  const jawabA = await tanya(PORT_A, 'berapa jumlah ASN');
  if (jawabA?.dataKesegaran?.tingkat === 'segar') ok('jawaban A: tingkat = segar');
  else no('jawaban A: tingkat = segar', `dapat ${jawabA?.dataKesegaran?.tingkat}`);
  if (jawabA?.dataKesegaran?.pesan === '') ok('jawaban A: tanpa peringatan (kontrol negatif)');
  else no('jawaban A: tanpa peringatan', `dapat "${jawabA?.dataKesegaran?.pesan}"`);

  // ── Keadaan B: korpus ditarik baru, isi katalog tertinggal ──
  const statusB = await jalankanKeadaan({
    nama: `B. Korpus ditarik BARU tetapi tahun data ${TAHUN_INI - 7}–${TAHUN_INI - 6} — harap TIDAK segar`,
    korpus: KORPUS_TUA,
    port: PORT_B,
    logApp: 'app-b.log',
  });
  if (!statusB) {
    console.log('\n  \x1b[31mGAGAL: aplikasi B tidak dapat dijalankan\x1b[0m');
    return 2;
  }

  const kb = statusB?.kesegaranData;
  if (kb && kb.tingkat !== 'segar') ok(`status B: tingkat = ${kb.tingkat} (bukan segar)`);
  else no('status B: tingkat bukan segar', `dapat ${kb?.tingkat}`);
  if ((kb?.sebab ?? []).includes('tahun-katalog-tertinggal')) ok('status B: sebab tahun-katalog-tertinggal tercatat');
  else no('status B: sebab tahun-katalog-tertinggal', `sebab = ${JSON.stringify(kb?.sebab)}`);
  if (typeof kb?.lagTahun === 'number' && kb.lagTahun >= 6) ok('status B: lag tahun terukur', `${kb.lagTahun} tahun`);
  else no('status B: lag tahun terukur', `dapat ${kb?.lagTahun}`);
  if (kb?.pesan && kb.pesan.includes('tertinggal')) ok('status B: pesan menyebut selisih tahun', kb.pesan);
  else no('status B: pesan menyebut selisih tahun', `dapat "${kb?.pesan}"`);
  if (typeof kb?.umurJam === 'number' && kb.umurJam <= 1) {
    ok('status B: tarikannya memang BARU (≤ 1 jam) — bukti sebabnya bukan umur tarikan', `${kb.umurJam} jam`);
  } else {
    no('status B: tarikan baru', `dapat ${kb?.umurJam} jam`);
  }

  const jawabB = await tanya(PORT_B, 'berapa jumlah ASN');
  if (jawabB?.dataKesegaran?.tingkat && jawabB.dataKesegaran.tingkat !== 'segar') {
    ok(`jawaban B: tingkat = ${jawabB.dataKesegaran.tingkat} (pembaca diberi tahu)`);
  } else {
    no('jawaban B: tingkat bukan segar', `dapat ${jawabB?.dataKesegaran?.tingkat}`);
  }
  if ((jawabB?.dataKesegaran?.pesan ?? '').length > 0) ok('jawaban B: pesan peringatan terisi');
  else no('jawaban B: pesan peringatan terisi', 'kosong');

  if (dibuangShell.length) {
    console.log(`\n  · ${catatanLingkungan([...new Set(dibuangShell)])}`);
  }

  console.log(`\n══ Ringkasan: ${LULUS.length} ✓ · ${GAGAL.length} ✗ ══`);
  if (GAGAL.length) {
    console.log('GAGAL:');
    for (const g of GAGAL) console.log(`  - ${g}`);
    return 1;
  }
  console.log('LULUS — alarm kesegaran bekerja pada kedua keadaan.');
  return 0;
}

// Pembersihan HARUS jalan apa pun hasilnya — karena itu `process.exit()` tidak
// dipakai di dalam `main` (ia melewati blok `finally`, dan proses yang bocor
// membuat jalankan berikutnya membaca proses lama; lihat `pastikanPortBebas`).
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
