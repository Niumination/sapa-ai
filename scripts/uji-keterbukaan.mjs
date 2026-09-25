#!/usr/bin/env node
// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
// ─── CMP-02 · Uji keterbukaan penggunaan AI (end-to-end, tiga keadaan) ────────
//
// Yang dibuktikan harness ini BUKAN "ada halaman keterbukaan", melainkan:
//   A. STATIS — teks keterbukaan lengkap (unsur SE Menkominfo 9/2023), tanpa klaim
//      mutlak, dan tenggat peninjauannya belum lewat.
//   B. KONSISTENSI — kalimat keadaan di halaman & endpoint MENGIKUTI keadaan nyata:
//      saat AI mati harus menyatakan mati; saat AI hidup harus menyatakan hidup;
//      saat penyedia gagal harus menyatakan gagal (bukan "semua baik").
//   C. NOTIS PER JAWABAN — notis yang akan dilihat pengguna cocok dengan metadata
//      jawaban yang benar-benar disajikan: kalimat "disusun model AI" HANYA muncul
//      untuk jawaban yang benar-benar disusun AI.
//   D. PRIVASI — pertanyaan berisi NIK ditolak pagar masuk dan tidak pernah
//      memanggil model (klaim "data pribadi tidak dikirim ke penyedia" diuji).
//
// Pakai: node scripts/uji-keterbukaan.mjs [--sabotase]
//   --sabotase : sengaja membalik satu harapan (menuntut "aktif" saat AI mati)
//                untuk membuktikan harness ini BISA gagal — bukan selalu hijau.
//
// Keluar: 0 = lulus, 1 = ada pelanggaran, 2 = gagal menyiapkan.

import { envUji, catatanLingkungan } from './lingkungan-uji.mjs';
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

const PORT_SPLP = Number(arg('port-splp', '3168'));
const PORT_MATI = Number(arg('port-mati', '3192'));
const PORT_HIDUP = Number(arg('port-hidup', '3193'));
const PORT_GAGAL = Number(arg('port-gagal', '3194'));
const PORT_MOCK = Number(arg('port-mock', '8891'));
const TIMEOUT_S = Number(arg('timeout', '180'));

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

/** Kalimat yang tidak boleh muncul di layanan publik (klaim mutlak). */
const KLAIM_TERLARANG = [
  '100% akurat',
  '100% benar',
  'selalu benar',
  'tidak pernah salah',
  'tanpa kesalahan',
  'dijamin benar',
  'sepenuhnya otomatis tanpa pemeriksaan',
  'tanpa campur tangan manusia',
];

function jalankanPendamping(berkas, argumen, env, berkasLog) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  const proc = spawn(process.execPath, [join(AKAR, berkas), ...argumen], {
    cwd: AKAR,
    detached: true,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.pipe(aliran);
  proc.stderr.pipe(aliran);
  return proc;
}

function jalankanApp(port, tambahanEnv, berkasLog) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  const proc = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: AKAR,
    detached: true,
    // Lingkungan BERSIH: tiga keadaan (AI mati/hidup/gagal) ditentukan harness.
    env: envUji({ PORT: String(port), ...tambahanEnv }).env,
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

async function keterbukaan(port) {
  const res = await fetch(`http://127.0.0.1:${port}/api/keterbukaan`, { signal: AbortSignal.timeout(30_000) });
  return { status: res.status, body: await res.json() };
}

async function halaman(port) {
  const res = await fetch(`http://127.0.0.1:${port}/keterbukaan`, { signal: AbortSignal.timeout(30_000) });
  return { status: res.status, html: await res.text() };
}

async function tanya(port, q) {
  const res = await fetch(`http://127.0.0.1:${port}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: q }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const teksPolos = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Keadaan notis yang akan dilihat pengguna, diturunkan dari metadata jawaban. */
function kunciNotis(body) {
  if (body?.ai?.used) return 'digunakan';
  if (body?.ai?.grounded === 'replaced') return 'ditolakGerbang';
  return 'tanpaAi';
}

const proses = [];
const matikan = (proc) => {
  if (!proc || proc.killed) return;
  try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch { /* sudah mati */ } }
};

try {
  console.log(`\n  CMP-02 · keterbukaan penggunaan AI${SABOTASE ? ' (MODE SABOTASE — harus GAGAL)' : ''}\n`);

  if (!(await pastikanPortBebas([PORT_MATI, PORT_HIDUP, PORT_GAGAL]))) process.exit(2);

  // Penyedia SPLP tiruan + penyedia model tiruan (untuk keadaan "AI hidup").
  const splp = jalankanPendamping(
    'verifikasi/stub-splp.mjs',
    [String(PORT_SPLP), join(AKAR, 'verifikasi', 'korpus-uji-besar.json')],
    {},
    '/tmp/keterbukaan-splp.log',
  );
  const mock = jalankanPendamping('scripts/mock-llm-server.mjs', [], { MOCK_PORT: String(PORT_MOCK) }, '/tmp/keterbukaan-mock.log');
  proses.push(splp, mock);

  const urlSplp = `http://127.0.0.1:${PORT_SPLP}/sapa/1.0/api`;
  if (!(await tungguSiap(`${urlSplp}/daftar_data`, 25_000))) {
    console.error(`  ${warna.no} penyedia SPLP tiruan tidak siap`);
    process.exit(2);
  }
  if (!(await tungguSiap(`http://127.0.0.1:${PORT_MOCK}/v1/models`, 15_000))) {
    // mock-llm-server belum tentu punya /v1/models; cukup pastikan port hidup
    console.log('  · (penyedia model tiruan memakai rute /v1/chat/completions saja)');
  }

  const envSplp = { SAPA_SPLP_BASE_URL: urlSplp };
  const appMati = jalankanApp(PORT_MATI, { ...envSplp, AI_ENABLED: 'false' }, '/tmp/keterbukaan-mati.log');
  const appHidup = jalankanApp(
    PORT_HIDUP,
    {
      ...envSplp,
      AI_ENABLED: 'true',
      AI_PROVIDER: 'custom',
      AI_BASE_URL: `http://127.0.0.1:${PORT_MOCK}/v1`,
      AI_API_KEY: 'kunci-uji-lokal',
      AI_MODEL: 'mock-uji',
    },
    '/tmp/keterbukaan-hidup.log',
  );
  const appGagal = jalankanApp(
    PORT_GAGAL,
    {
      ...envSplp,
      AI_ENABLED: 'true',
      AI_PROVIDER: 'custom',
      AI_BASE_URL: 'http://127.0.0.1:8892/v1',
      AI_API_KEY: 'kunci-uji-lokal',
      AI_MODEL: 'model-tidak-ada',
    },
    '/tmp/keterbukaan-gagal.log',
  );
  proses.push(appMati, appHidup, appGagal);

  for (const [nama, port, log] of [
    ['AI mati', PORT_MATI, '/tmp/keterbukaan-mati.log'],
    ['AI hidup', PORT_HIDUP, '/tmp/keterbukaan-hidup.log'],
    ['AI gagal', PORT_GAGAL, '/tmp/keterbukaan-gagal.log'],
  ]) {
    if (!(await tungguSiap(`http://127.0.0.1:${port}/api/status`, TIMEOUT_S * 1000))) {
      console.error(`  ${warna.no} aplikasi (${nama}) tidak siap — lihat ${log}`);
      process.exit(2);
    }
  }

  // ── A. Statis: kelengkapan & larangan klaim ────────────────────────────────
  bagian('A. Keterbukaan lengkap & bebas klaim mutlak (AI mati)');
  const kA = await keterbukaan(PORT_MATI);
  const hA = await halaman(PORT_MATI);
  const api = kA.body;
  const teksApi = JSON.stringify(api);
  const teksHalaman = teksPolos(hA.html);

  periksa('A1 endpoint menjawab 200 & berstatus ok', kA.status === 200 && api.status === 'ok');
  periksa('A2 memuat ≥ 7 bagian keterbukaan', (api.bagian ?? []).length >= 7, `${(api.bagian ?? []).length} bagian`);
  const judulBagian = (api.bagian ?? []).map((b) => b.id);
  periksa(
    'A3 memuat unsur wajib SE 9/2023 (peran AI, kendali manusia, privasi, keterbatasan, koreksi)',
    ['peran-ai', 'kendali-manusia', 'data-dan-privasi', 'keterbatasan', 'hak-dan-koreksi'].every((id) => judulBagian.includes(id)),
    judulBagian.join(','),
  );
  const laranganApi = KLAIM_TERLARANG.filter((f) => teksApi.toLowerCase().includes(f));
  periksa('A4 endpoint bebas klaim mutlak yang dilarang', laranganApi.length === 0, laranganApi.join(', ') || 'bersih');
  const laranganHalaman = KLAIM_TERLARANG.filter((f) => teksHalaman.toLowerCase().includes(f));
  periksa('A5 halaman bebas klaim mutlak yang dilarang', laranganHalaman.length === 0, laranganHalaman.join(', ') || 'bersih');
  periksa(
    'A6 halaman memuat kalimat keadaan yang SAMA dengan endpoint (satu sumber teks)',
    hA.status === 200 && teksHalaman.includes(api.kalimatKeadaan.replace(/\s+/g, ' ')),
    `"${api.kalimatKeadaan.slice(0, 60)}…"`,
  );
  const tenggat = new Date(api.tinjauanBerikutnya).getTime();
  periksa('A7 tenggat peninjauan teks belum lewat (lewat ⇒ wajib ditinjau ulang)', tenggat > Date.now(), `berikutnya ${api.tinjauanBerikutnya}`);
  periksa('A8 kanal koreksi & saklar operator dicantumkan', Boolean(api.kanal?.laporAngka) && Boolean(api.kanal?.saklar), JSON.stringify(api.kanal ?? {}));
  periksa('A9 tidak ada kunci API yang bocor ke halaman/endpoint', !teksApi.includes('kunci-uji-lokal') && !hA.html.includes('kunci-uji-lokal'));

  // ── B. Kejujuran keadaan ───────────────────────────────────────────────────
  bagian('B. Kalimat keadaan mengikuti keadaan nyata (bukan teks tetap)');
  periksa(
    'B1 AI mati ⇒ endpoint melaporkan "mati" & teks menyatakan TIDAK aktif',
    SABOTASE ? api.keadaanAi === 'aktif' : api.keadaanAi === 'mati' && api.kalimatKeadaan.includes('TIDAK aktif'),
    SABOTASE ? `sabotase: keadaanAi=${api.keadaanAi} (harus dianggap gagal)` : `keadaanAi=${api.keadaanAi}`,
  );
  periksa('B2 halaman (AI mati) tidak memuat kalimat "layanan AI aktif:"', !teksHalaman.includes('layanan AI aktif:'));

  const jB = await tanya(PORT_MATI, 'berapa jumlah penduduk kecamatan Bebesen');
  periksa('B3 jawaban tanpa AI: metadata menyatakan ai.used=false', jB.ai?.used === false, `ai.used=${jB.ai?.used}`);
  const knB = kunciNotis(jB);
  const notisB = api.notisPerJawaban?.[knB];
  periksa(
    'B4 notis yang disiapkan untuk jawaban itu adalah notis "tanpa AI" (bukan "disusun AI")',
    knB === 'tanpaAi' && notisB?.paragraf?.[0]?.includes('tanpa AI') === true,
    `kunci=${knB} · "${(notisB?.paragraf?.[0] ?? '').slice(0, 50)}…"`,
  );

  const jNik = await tanya(PORT_MATI, 'tolong tampilkan daftar NIK 1234567890123456 milik warga');
  periksa('B5 klaim privasi: pertanyaan ber-NIK ditolak pagar masuk', jNik.ai?.used === false && (jNik.evidence ?? []).length === 0, `${(jNik.narasi ?? '').slice(0, 70)}…`);

  // ── C. AI hidup: keterbukaan mengikuti ────────────────────────────────────
  bagian('C. AI hidup ⇒ keterbukaan menyatakan aktif & kalimat per jawaban cocok');
  const kC = await keterbukaan(PORT_HIDUP);
  const hC = await halaman(PORT_HIDUP);
  periksa('C1 endpoint melaporkan keadaan aktif', kC.body.keadaanAi === 'aktif', `keadaanAi=${kC.body.keadaanAi} · terjangkau=${kC.body.terjangkau}`);
  periksa(
    'C2 penyedia & model yang dilaporkan = yang benar-benar dipakai',
    kC.body.penyedia === 'custom' && kC.body.model === 'mock-uji',
    `${kC.body.penyedia} · ${kC.body.model}`,
  );
  periksa('C3 kalimat keadaan halaman tidak lagi menyatakan "TIDAK aktif"', !teksPolos(hC.html).includes('TIDAK aktif'));

  const jC = await tanya(PORT_HIDUP, 'berapa jumlah penduduk kecamatan Bebesen');
  const knC = kunciNotis(jC);
  const notisC = kC.body.notisPerJawaban?.[knC];
  periksa(
    'C4 jawaban benar-benar disusun AI (ai.used=true) — kalau tidak, uji C5 tidak bermakna',
    jC.ai?.used === true,
    `ai.used=${jC.ai?.used} · grounded=${jC.ai?.grounded}`,
  );
  periksa(
    'C5 notis untuk jawaban ber-AI menyatakan narasi disusun model bahasa',
    knC === 'digunakan' && notisC?.paragraf?.[0]?.includes('disusun oleh model bahasa AI') === true,
    `kunci=${knC}`,
  );

  // ── D. Penyedia gagal: keterbukaan tidak boleh mengaku sehat ──────────────
  //
  // Dua tahap, mengikuti cara kerja pemutus sirkuit yang sebenarnya:
  //   D-a) SATU kegagalan  → sirkuit belum terbuka; keterbukaan wajib menyebut
  //        kegagalan itu (jawaban saat itu disusun dari data), tanpa melebih-lebihkan
  //        dengan mengklaim penyedia mati.
  //   D-b) TIGA kegagalan  → sirkuit terbuka; keterbukaan wajib menyatakan penyedia
  //        sedang tidak menjawab beserta sebabnya.
  bagian('D. Penyedia model gagal/kembali mati ⇒ keterbukaan menyatakannya jujur');
  const qD = 'berapa jumlah penduduk kecamatan Bebesen';
  const jD1 = await tanya(PORT_GAGAL, qD).catch(() => null);
  periksa('D1 jawaban tetap keluar walau panggilan model gagal (dari data)', jD1?.ai?.used === false, `ai.used=${jD1?.ai?.used}`);
  const kD1 = await keterbukaan(PORT_GAGAL);
  periksa(
    'D2 satu kegagalan ⇒ keterbukaan menyebut "panggilan model terakhir gagal" (tidak disembunyikan)',
    String(kD1.body.kalimatKeadaan).includes('Panggilan model terakhir gagal'),
    `gagalBerturut=${kD1.body.gagalBerturut} · sebab=${kD1.body.sebabTerakhir}`,
  );
  periksa(
    'D3 satu kegagalan ⇒ BELUM mengklaim penyedia mati (tidak melebih-lebihkan)',
    !String(kD1.body.kalimatKeadaan).includes('sedang tidak menjawab'),
  );

  for (let i = 0; i < 3; i += 1) await tanya(PORT_GAGAL, qD).catch(() => null);
  const kD2 = await keterbukaan(PORT_GAGAL);
  periksa(
    'D4 tiga kegagalan berturut ⇒ sirkuit terbuka & keterbukaan menyatakan "sedang tidak menjawab"',
    kD2.body.terjangkau === false && String(kD2.body.kalimatKeadaan).includes('sedang tidak menjawab'),
    `terjangkau=${kD2.body.terjangkau} · gagalBerturut=${kD2.body.gagalBerturut}`,
  );
  const statusGagal = await (await fetch(`http://127.0.0.1:${PORT_GAGAL}/api/status`, { signal: AbortSignal.timeout(20_000) })).json();
  periksa(
    'D5 /api/status sependapat dengan keterbukaan (satu kenyataan, bukan dua cerita)',
    statusGagal.ai?.reachable === false,
    `reachable=${statusGagal.ai?.reachable} · state=${statusGagal.ai?.state}`,
  );

  console.log('\n  ──────────────── Ringkasan ────────────────');
  console.log(`  keadaan diuji      : mati · hidup · penyedia gagal (3 aplikasi)`);
  console.log(`  pemeriksaan lulus  : ${LULUS}`);
  if (GAGAL.length) {
    console.log(`\n  ${warna.no} GAGAL — ${GAGAL.length} pemeriksaan tidak terpenuhi:`);
    for (const g of GAGAL) console.log(`    · ${g}`);
    process.exitCode = 1;
  } else {
    console.log(`\n  ${warna.ok} LULUS — teks keterbukaan lengkap, mengikuti keadaan nyata, dan notis per jawaban cocok dengan metadata jawaban.`);
  }
} catch (err) {
  console.error(`\n  ${warna.no} galat: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 2;
} finally {
  for (const p of proses) matikan(p);
}
