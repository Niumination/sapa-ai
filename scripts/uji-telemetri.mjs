// ─── Uji ujung-ke-ujung telemetri per tahap (NFR-07) ────────────────────────
//
// Mengapa harness ini MENJALANKAN APLIKASINYA SENDIRI.
// Telemetri hanya berarti bila angkanya benar. Untuk memeriksa itu, kita butuh
// tiga hal sekaligus: (a) baris log yang benar-benar keluar, (b) angka yang
// dilaporkan API, dan (c) sampel mentah untuk MENGHITUNG ULANG angka itu.
// Hanya aplikasi yang kita kendalikan sendiri (stdout ditangkap, environment
// kita tentukan) yang bisa memberi ketiganya dalam satu jalan. Aplikasi yang
// sudah jalan di luar punya riwayat permintaan sendiri, sehingga "n = 10" tidak
// bisa dibedakan antara 10 permintaan uji ini atau 10 permintaan orang lain.
//
// SATU PERINTAH, DUA KALI UKUR:
//   • positif  — aplikasi normal: tiap permintaan menulis satu baris `[gen_ai]`,
//                agregatnya bisa dihitung ulang dari log, dan `?rekap=1` menulis
//                p95 per tahap ke log;
//   • negatif  — aplikasi kedua dengan `SAPA_TELEMETRI=off`: tetap menjawab
//                normal, tetapi NOL baris `[gen_ai]`. Tanpa ini, "ada baris log"
//                tidak membuktikan apa pun (bisa saja ada dari sumber lain).
//
// Cara pakai (butuh stub SPLP yang sudah jalan, mis. verifikasi/stub-splp.mjs):
//   node scripts/uji-telemetri.mjs --splp=http://127.0.0.1:9911/sapa/1.0/api
//
// Yang diperiksa (semuanya bisa GAGAL):
//   1. jumlah baris `[gen_ai]` = jumlah permintaan (tidak ada baris hilang/ganda);
//   2. lima tahap wajib ada: retrieval, prompt, model, grounding, gerbang;
//   3. jumlah durasi tahap ≤ total (bukti tidak ada pengukuran ganda);
//   4. p95/p50 yang dilaporkan = p95/p50 yang DIHITUNG ULANG dari sampel mentah;
//   5. sampel di endpoint admin sama persis dengan durasi di log (berurutan);
//   6. `?rekap=1` menulis baris `[gen_ai-rekap]` identik dengan balasan API;
//   7. endpoint admin fail-closed (tanpa token → ditolak);
//   8. privasi: kata canary dari pertanyaan TIDAK pernah muncul di baris `[gen_ai]`
//      (telemetri hanya metadata — tidak ada isi pertanyaan);
//   9. kontrol negatif: `SAPA_TELEMETRI=off` → nol baris, aplikasi tetap normal.

import { envUji, catatanLingkungan } from './lingkungan-uji.mjs';
import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** 'auto' = harness menyalakan stub SPLP sendiri (tanpa prasyarat apa pun). */
const SPLP_ARG = arg('splp', 'auto');
const PORT_SPLP = Number(arg('port-splp', '3161'));
const PORT_MOCK = Number(arg('port-mock', '3151'));
const MODEL = arg('model', 'mock-pintar');
const PORT = Number(arg('port', '3141'));
const PORT_NEGATIF = Number(arg('port-negatif', String(PORT + 1)));
const N = Number(arg('n', '10'));
const TOKEN = arg('token', process.env.ADMIN_TOKEN ?? 'token-uji-123');
const JEDA_MS = Number(arg('jeda', '1200'));
const TIMEOUT_S = Number(arg('timeout', '120'));
const SIMPAN = arg('simpan', '');
const LOG = arg('log', '/tmp/uji-telemetri-app.log');
const LOG_NEGATIF = arg('log-negatif', '/tmp/uji-telemetri-app-negatif.log');

const CANARY = `zqcanary${Math.random().toString(36).slice(2, 8)}`;

let lulus = 0;
let gagal = 0;
const ringkasan = [];
const ok = (t) => {
  lulus += 1;
  ringkasan.push(`  ✓ ${t}`);
  console.log(`  ✓ ${t}`);
};
const no = (t) => {
  gagal += 1;
  ringkasan.push(`  ✗ ${t}`);
  console.log(`  ✗ ${t}`);
};
function info(t) {
  ringkasan.push(`  · ${t}`);
  console.log(`  · ${t}`);
}
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const hitungPersentil = (sampel, p) => {
  if (!sampel.length) return 0;
  const urut = [...sampel].sort((a, b) => a - b);
  return urut[Math.min(urut.length - 1, Math.max(0, Math.ceil((p / 100) * urut.length) - 1))];
};

// ─── Pertanyaan: acak dari korpus yang sama dengan stub SPLP ────────────────
// Sengaja berbeda tiap kali: jawaban yang BERHASIL di-cache tidak melewati
// tahap model lagi, sehingga pertanyaan yang sama berulang akan menghasilkan
// baris log tanpa tahap `model` — dan p95 model dari beberapa sampel saja.

function daftarPertanyaan(jumlah) {
  const berkas = join(AKAR, 'verifikasi', 'korpus-uji-besar.json');
  try {
    const mentah = JSON.parse(readFileSync(berkas, 'utf8'));
    const data = Array.isArray(mentah) ? mentah : (mentah.data ?? []);
    const kandidat = data
      .filter((r) => r && r.kode_indikator_nama_indikator && r.opds_nama_opd)
      .map((r) => `Berapa ${r.kode_indikator_nama_indikator} di ${r.opds_nama_opd}?`);
    if (kandidat.length >= jumlah) {
      return [...kandidat].sort(() => Math.random() - 0.5).slice(0, jumlah);
    }
  } catch {
    /* jatuh ke cadangan */
  }
  return [
    'Berapa jumlah ASN di Aceh Tengah?',
    'Berapa jumlah penduduk Kabupaten Aceh Tengah?',
    'Berapa produksi kopi arabika Aceh Tengah?',
    'Berapa angka stunting Aceh Tengah?',
    'Berapa nilai IPM Aceh Tengah?',
    'Berapa jumlah tenaga kesehatan di Aceh Tengah?',
    'Berapa panjang jalan kabupaten?',
    'Berapa jumlah siswa SMA di Aceh Tengah?',
    'Berapa luas lahan pertanian?',
    'Berapa jumlah desa di Aceh Tengah?',
  ].slice(0, jumlah);
}

// ─── Menjalankan aplikasi di bawah kendali harness ──────────────────────────

/**
 * Jalankan `npx next start` pada port tertentu.
 *
 * `detached: true` disengaja: tanpa grup proses sendiri, SIGTERM pada `npx`
 * tidak menjangkau proses `next` anaknya, dan server uji akan tertinggal
 * memegang port (pengalaman nyata di sandbox ini: port 3131 tetap terpakai
 * setelah proses induk mati).
 */
function jalankanApp(port, tambahanEnv, berkasLog) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  const anak = spawn('npx', ['next', 'start', '-p', String(port)], {
    cwd: AKAR,
    // Lingkungan BERSIH: saklar telemetri & mode AI ditentukan harness, bukan shell.
    env: envUji({ SAPA_SPLP_BASE_URL: SPLP, ADMIN_TOKEN: TOKEN, ...tambahanEnv }).env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  anak.stdout.pipe(aliran);
  anak.stderr.pipe(aliran);
  return anak;
}

function hentikanApp(anak) {
  try {
    process.kill(-anak.pid, 'SIGTERM');
  } catch {
    try {
      anak.kill('SIGTERM');
    } catch {
      /* sudah mati */
    }
  }
}

async function tungguSiap(url, batasMs) {
  const sampai = Date.now() + batasMs;
  while (Date.now() < sampai) {
    try {
      const r = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(20_000) });
      if (r.ok) return await r.json();
    } catch {
      /* belum siap */
    }
    await tidur(700);
  }
  return null;
}

// ─── Klien ──────────────────────────────────────────────────────────────────

async function tanyaJson(base, pertanyaan) {
  const r = await fetch(`${base}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: pertanyaan }),
    signal: AbortSignal.timeout(60_000),
  });
  const badan = await r.json().catch(() => ({}));
  return { status: r.status, badan };
}

/** Baca SSE sampai ada `event: result`/`error`, kembalikan jenis akhirnya. */
async function tanyaStream(base, pertanyaan) {
  const r = await fetch(`${base}/api/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: pertanyaan }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok || !r.body) return { status: r.status, akhir: 'http-galat' };
  const teks = await r.text();
  const akhir = /^event: result$/m.test(teks) ? 'result' : /^event: error$/m.test(teks) ? 'error' : 'tanpa-akhir';
  return { status: r.status, akhir, bita: teks.length };
}

async function admin(base, qs = '') {
  const r = await fetch(`${base}/api/admin/telemetri?token=${encodeURIComponent(TOKEN)}${qs ? `&${qs}` : ''}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const badan = await r.json().catch(() => ({}));
  return { status: r.status, badan };
}

// ─── Pemeriksaan ────────────────────────────────────────────────────────────

function bacaBarisGenAi(berkasLog) {
  let isi = '';
  try {
    isi = readFileSync(berkasLog, 'utf8');
  } catch {
    return { gen: [], rekap: [], mentah: '' };
  }
  const gen = [];
  const rekap = [];
  for (const baris of isi.split('\n')) {
    const t = baris.trim();
    const i = t.indexOf('[gen_ai] ');
    if (i >= 0) {
      try {
        gen.push(JSON.parse(t.slice(i + 9)));
      } catch {
        gen.push({ _rusak: t.slice(0, 200) });
      }
      continue;
    }
    const j = t.indexOf('[gen_ai-rekap] ');
    if (j >= 0) {
      try {
        rekap.push(JSON.parse(t.slice(j + 15)));
      } catch {
        rekap.push({ _rusak: t.slice(0, 200) });
      }
    }
  }
  return { gen, rekap, mentah: isi };
}

const TAHAP_WAJIB = ['retrieval', 'prompt', 'model', 'grounding', 'gerbang'];

/** Rekomputasi durasi per tahap dari baris log (urut kemunculan). */
function sampelDariLog(gen) {
  const perTahap = {};
  for (const baris of gen) {
    const tahap = baris.tahap ?? {};
    for (const [nama, nilai] of Object.entries(tahap)) {
      (perTahap[nama] ??= []).push(nilai.ms);
    }
  }
  return perTahap;
}

// ─── Jalannya uji ───────────────────────────────────────────────────────────

const BASE = `http://127.0.0.1:${PORT}`;
const BASE_NEGATIF = `http://127.0.0.1:${PORT_NEGATIF}`;
const pertanyaan = daftarPertanyaan(N);
const LOG_SPLP = join('/tmp', 'uji-telemetri-splp.log');
const LOG_MOCK = join('/tmp', 'uji-telemetri-mock.log');
let SPLP = SPLP_ARG;

/** Jalankan proses Node pendamping (stub SPLP / penyedia model tiruan). */
function jalankanPendamping(berkas, argumen, berkasLog, env = {}) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  const anak = spawn('node', [join(AKAR, berkas), ...argumen], {
    cwd: AKAR,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  anak.stdout.pipe(aliran);
  anak.stderr.pipe(aliran);
  return anak;
}

console.log('══ Uji NFR-07: telemetri per tahap ══');
console.log(`   aplikasi  : ${BASE} (dijalankan harness ini)`);
console.log(`   permintaan: ${N} (campuran JSON & streaming) · canary: ${CANARY}`);

// Stub SPLP: dinyalakan sendiri bila tidak ditunjuk dari luar. Tanpa katalog,
// pertanyaan tidak punya bukti dan tahap model tidak akan pernah berjalan —
// uji ini akan lulus secara palsu.
let pendampingSplp = null;
if (SPLP_ARG === 'auto') {
  SPLP = `http://127.0.0.1:${PORT_SPLP}/sapa/1.0/api`;
  pendampingSplp = jalankanPendamping('verifikasi/stub-splp.mjs', [String(PORT_SPLP), join(AKAR, 'verifikasi', 'korpus-uji-besar.json')], LOG_SPLP);
  console.log(`   stub SPLP : ${SPLP} (dinyalakan harness)`);
} else {
  console.log(`   stub SPLP : ${SPLP} (dari argumen)`);
}

// Penyedia model tiruan: WAJIB. Tanpa AI aktif, tahap prompt/model/grounding
// tidak pernah berjalan — dan uji yang tidak pernah menyentuh tahap yang
// diukurnya adalah uji yang menipu diri sendiri.
const pendampingMock = jalankanPendamping('verifikasi/mock-llm.mjs', [String(PORT_MOCK)], LOG_MOCK);
console.log(`   model tiruan: http://127.0.0.1:${PORT_MOCK}/v1 (${MODEL}, dinyalakan harness)`);
console.log('');

// Beri pendamping waktu mengikat port.
await tidur(1200);

console.log('  ── bagian 1: aplikasi normal (telemetri aktif) ──');

const envAi = {
  AI_ENABLED: 'true',
  AI_PROVIDER: 'custom',
  AI_BASE_URL: `http://127.0.0.1:${PORT_MOCK}/v1`,
  AI_API_KEY: 'mock-uji',
  AI_MODEL: MODEL,
  // Rekap otomatis tiap 5 permintaan supaya jalur itu benar-benar terbukti pada
  // N yang kecil; nilai bawaan (20) dijaga uji unit.
  SAPA_TELEMETRI_REKAP_N: '5',
  // Jendela diperkecil agar uji jendela ikut terbukti di jalur nyata, dan agar
  // sampel yang dilaporkan API = seluruh permintaan uji ini.
  SAPA_TELEMETRI_JENDELA: String(Math.max(N, 5)),
};
const app = jalankanApp(PORT, envAi, LOG);
const bukti = { waktu: new Date().toISOString(), app: BASE, splp: SPLP, canary: CANARY, permintaan: [], gen: [], rekap: [], negatif: null };

try {
  const statusAwal = await tungguSiap(BASE, TIMEOUT_S * 1000);
  if (!statusAwal) throw new Error(`aplikasi tidak siap di ${BASE} dalam ${TIMEOUT_S} dtk (lihat ${LOG})`);
  const jumlahRecord = statusAwal?.sapa?.records ?? 0;
  console.log(`   siap: ${jumlahRecord} record · ai.state=${statusAwal?.ai?.state} · telemetri: aktif=${statusAwal?.telemetri?.aktif}`);
  if (!['active', 'shadow'].includes(statusAwal?.ai?.state)) {
    no(`jalur AI tidak menyala (ai.state=${statusAwal?.ai?.state}) — tahap prompt/model/grounding tidak akan terukur`);
  } else {
    ok(`jalur AI menyala (ai.state=${statusAwal?.ai?.state}) — seluruh tahap benar-benar berjalan`);
  }
  if ((statusAwal?.telemetri?.aktif ?? false) !== true) no('telemetri TIDAK aktif pada aplikasi normal');
  else ok('telemetri aktif pada aplikasi normal');
  if (jumlahRecord < 1) throw new Error('stub SPLP kosong — pertanyaan tidak akan punya bukti');

  // Nolkan agregat supaya jendela HANYA berisi permintaan uji ini.
  await admin(BASE, 'nolkan=1');

  // ── Kirim permintaan (berselang, agar tidak kena batas 30/menit) ──
  let suksesHttp = 0;
  for (let i = 0; i < N; i++) {
    const q = i % 3 === 2 ? `${pertanyaan[i]} (${CANARY})` : pertanyaan[i];
    const stream = i % 2 === 1;
    const hasil = stream ? await tanyaStream(BASE, q) : await tanyaJson(BASE, q);
    bukti.permintaan.push({ i: i + 1, stream, status: hasil.status, akhir: hasil.akhir ?? null, pertanyaan: q });
    if (hasil.status === 200) suksesHttp += 1;
    console.log(`     #${String(i + 1).padStart(2)} ${stream ? 'stream' : 'json  '} → HTTP ${hasil.status}${hasil.akhir ? ` (${hasil.akhir})` : ''}`);
    await tidur(JEDA_MS);
  }

  if (suksesHttp === N) ok(`semua ${N} permintaan dijawab HTTP 200`);
  else no(`hanya ${suksesHttp}/${N} permintaan dijawab HTTP 200 — kemungkinan kena batas laju; uji ini jadi tidak lengkap`);

  await tidur(500); // beri ruang penulisan agregat terakhir

  // ── (1) satu baris per permintaan ──
  const { gen, rekap } = bacaBarisGenAi(LOG);
  bukti.gen = gen;
  bukti.rekap = rekap;
  if (gen.length === N) ok(`${gen.length} baris [gen_ai] untuk ${N} permintaan (tidak ada yang hilang/ganda)`);
  else no(`jumlah baris [gen_ai] = ${gen.length}, seharusnya ${N}`);
  const rusak = gen.filter((g) => g._rusak).length;
  if (rusak) no(`${rusak} baris [gen_ai] tidak dapat di-parse sebagai JSON`);

  // ── (2) tahap wajib ada ──
  const kurangTahap = gen.filter((g) => !TAHAP_WAJIB.every((t) => g.tahap && g.tahap[t]));
  if (kurangTahap.length === 0) ok(`kelima tahap wajib (${TAHAP_WAJIB.join(', ')}) ada di SETIAP baris`);
  else {
    no(`${kurangTahap.length} baris kehilangan tahap wajib — contoh: ${JSON.stringify(kurangTahap[0].tahap ?? {})}`);
  }
  const tokenLengkap = gen.filter(
    (g) => typeof g.tahap?.model?.token_masuk === 'number' && typeof g.tahap?.model?.token_keluar === 'number',
  ).length;
  const denganModel = gen.filter((g) => g.tahap?.model?.sukses === true).length;
  if (denganModel >= Math.ceil(N * 0.5)) ok(`model benar-benar dipanggil pada ${denganModel}/${N} permintaan (uji tidak vakum)`);
  else no(`model hanya dipanggil ${denganModel}/${N} kali — sampel p95 tahap model terlalu sedikit`);
  if (tokenLengkap === denganModel && denganModel > 0) ok(`token masuk/keluar tercatat pada semua ${tokenLengkap} panggilan model yang berhasil`);
  else no(`token hanya tercatat pada ${tokenLengkap}/${denganModel} panggilan model yang berhasil`);
  const promptTerukur = gen.filter((g) => (g.tahap?.prompt?.panjang_system ?? 0) > 0).length;
  if (promptTerukur === gen.length) ok(`panjang prompt tercatat pada setiap baris (tahap prompt nyata, bukan 0 ms kosong)`);
  else no(`panjang prompt kosong pada ${gen.length - promptTerukur} baris`);

  // ── (3) jumlah tahap ≤ total ──
  const lebihTotal = gen.filter((g) => (g.jumlah_tahap_ms ?? 0) > (g.total_ms ?? 0));
  if (lebihTotal.length === 0) ok('jumlah durasi tahap ≤ total pada setiap baris (tidak ada pengukuran ganda)');
  else no(`${lebihTotal.length} baris dengan jumlah tahap > total — pengukuran ganda`);

  // ── (4) p95 dilaporkan = p95 dihitung ulang dari log ──
  const dariLog = sampelDariLog(gen);
  const status = await (await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(30_000) })).json();
  const tel = status?.telemetri ?? {};
  bukti.statusTelemetri = tel;
  const tahapUmum = Object.keys(dariLog).filter((t) => TAHAP_WAJIB.includes(t));
  let beda = [];
  for (const nama of tahapUmum) {
    const sampel = dariLog[nama];
    const dilaporkan = tel.tahap?.[nama];
    if (!dilaporkan) {
      beda.push(`${nama}: tidak dilaporkan`);
      continue;
    }
    const p95 = hitungPersentil(sampel, 95);
    const p50 = hitungPersentil(sampel, 50);
    if (dilaporkan.n !== sampel.length) beda.push(`${nama}: n ${dilaporkan.n} ≠ ${sampel.length}`);
    if (dilaporkan.p95 !== p95) beda.push(`${nama}: p95 ${dilaporkan.p95} ≠ ${p95}`);
    if (dilaporkan.p50 !== p50) beda.push(`${nama}: p50 ${dilaporkan.p50} ≠ ${p50}`);
  }
  if (beda.length === 0) ok(`p50/p95 yang dilaporkan = hasil hitung ulang dari log (${tahapUmum.length} tahap, n = ${tahapUmum.map((t) => dariLog[t].length).join('/')})`);
  else no(`angka dilaporkan tidak cocok dengan hitung ulang: ${beda.slice(0, 4).join('; ')}`);

  // ── (5) sampel admin identik dengan log ──
  const adm = await admin(BASE);
  let bedaSampel = [];
  for (const nama of tahapUmum) {
    const dariApi = adm.badan?.sampel?.[nama]?.ms ?? [];
    if (JSON.stringify(dariApi) !== JSON.stringify(dariLog[nama])) {
      bedaSampel.push(`${nama}: ${dariApi.length} vs ${dariLog[nama].length} sampel`);
    }
  }
  if (bedaSampel.length === 0) ok('sampel mentah di endpoint admin sama persis dengan durasi di log');
  else no(`sampel berbeda: ${bedaSampel.join('; ')}`);

  // ── (6) ?rekap=1 → baris [gen_ai-rekap] di log, identik dengan balasan API ──
  const rk = await admin(BASE, 'rekap=1');
  await tidur(300);
  const setelah = bacaBarisGenAi(LOG);
  const rekapTerakhir = setelah.rekap[setelah.rekap.length - 1];
  if (!rk.badan?.rekap) no('endpoint admin tidak mengembalikan isi rekap');
  else if (!rekapTerakhir) no('tidak ada baris [gen_ai-rekap] di log setelah ?rekap=1');
  else {
    const sama = ['tahap', 'jumlah', 'jendela'].every(
      (k) => JSON.stringify(rk.badan.rekap[k]) === JSON.stringify(rekapTerakhir[k]),
    );
    if (sama) ok('baris [gen_ai-rekap] di log identik dengan balasan API (p95 per tahap benar-benar terlihat di log)');
    else no('baris [gen_ai-rekap] di log BERBEDA dengan balasan API');
    const p95Model = rekapTerakhir.tahap?.model?.p95;
    info(`p95 per tahap (rekap manual): ${Object.entries(rekapTerakhir.tahap ?? {}).map(([k, v]) => `${k} ${v.p95}ms`).join(' · ')}${p95Model != null ? ` (model p95 = ${p95Model} ms)` : ''}`);
  }
  const rekapOtomatis = setelah.rekap.filter((r) => String(r.sebab ?? '').startsWith('otomatis'));
  if (rekapOtomatis.length >= 1) ok(`${rekapOtomatis.length} baris rekap OTOMATIS muncul di log (setiap ${tel.rekapSetiap} permintaan)`);
  else no('tidak ada baris rekap otomatis — p95 tidak akan terlihat di log tanpa diminta manual');

  // ── (7) fail-closed ──
  const rTanpaToken = await fetch(`${BASE}/api/admin/telemetri`, { signal: AbortSignal.timeout(20_000) });
  const badanTanpa = await rTanpaToken.json().catch(() => ({}));
  if ([401, 503].includes(rTanpaToken.status)) ok(`endpoint admin telemetri fail-closed tanpa token (HTTP ${rTanpaToken.status})`);
  else no(`endpoint admin telemetri TIDAK menolak permintaan tanpa token (HTTP ${rTanpaToken.status}) ${JSON.stringify(badanTanpa).slice(0, 80)}`);

  // ── (8) privasi: canary tidak pernah muncul di baris [gen_ai] ──
  const bocor = gen.filter((g) => JSON.stringify(g).includes(CANARY));
  const kunciTerlarang = ['query', 'pertanyaan', 'narasi', 'messages', 'content'];
  const adaKunciIsi = gen.filter((g) => {
    const datar = JSON.stringify(g);
    return kunciTerlarang.some((k) => new RegExp(`"${k}"\\s*:`).test(datar));
  });
  if (bocor.length === 0) ok(`kata canary "${CANARY}" tidak muncul di satu pun baris [gen_ai] (telemetri = metadata saja)`);
  else no(`canary ditemukan di ${bocor.length} baris [gen_ai] — isi pertanyaan masuk log`);
  if (adaKunciIsi.length === 0) ok('tidak ada medan isi (query/narasi/content) pada baris [gen_ai]');
  else no(`ada medan isi pada ${adaKunciIsi.length} baris [gen_ai]`);
} catch (e) {
  no(`harness berhenti: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  hentikanApp(app);
  await tidur(1500);
}

// ─── Bagian 2: kontrol negatif (SAPA_TELEMETRI=off) ─────────────────────────

console.log('');
console.log('  ── bagian 2: kontrol negatif (SAPA_TELEMETRI=off) ──');
let appNegatif = null;
try {
  appNegatif = jalankanApp(PORT_NEGATIF, { SAPA_TELEMETRI: 'off' }, LOG_NEGATIF);
  const statusN = await tungguSiap(BASE_NEGATIF, TIMEOUT_S * 1000);
  if (!statusN) {
    no(`aplikasi negatif tidak siap di ${BASE_NEGATIF} (lihat ${LOG_NEGATIF})`);
  } else {
    const telN = statusN?.telemetri ?? {};
    if (telN.aktif === false) ok('aplikasi negatif melaporkan telemetri NONAKTIF (saklar jujur)');
    else no('aplikasi negatif masih melaporkan telemetri aktif');

    let ok2 = 0;
    for (let i = 0; i < 3; i++) {
      const hasil = await tanyaJson(BASE_NEGATIF, pertanyaan[i] ?? pertanyaan[0]);
      if (hasil.status === 200) ok2 += 1;
      await tidur(400);
    }
    if (ok2 === 3) ok('aplikasi negatif tetap menjawab normal (mematikan telemetri tidak merusak layanan)');
    else no(`aplikasi negatif hanya menjawab ${ok2}/3`);

    await tidur(500);
    const n = bacaBarisGenAi(LOG_NEGATIF);
    if (n.gen.length === 0 && n.rekap.length === 0) ok('NOL baris [gen_ai]/[gen_ai-rekap] saat telemetri dimatikan (kontrol negatif sah)');
    else no(`kontrol negatif gagal: ${n.gen.length} baris [gen_ai] + ${n.rekap.length} rekap tetap muncul`);

    bukti.negatif = {
      telemetriAktif: telN.aktif,
      dijawab: ok2,
      barisGenAi: n.gen.length,
      barisRekap: n.rekap.length,
    };
  }
} catch (e) {
  no(`bagian kontrol negatif bermasalah: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  if (appNegatif) hentikanApp(appNegatif);
  await tidur(1000);
}

hentikanApp(pendampingMock);
if (pendampingSplp) hentikanApp(pendampingSplp);
await tidur(600);

console.log('');
console.log(`   log aplikasi positif : ${LOG}`);
console.log(`   log aplikasi negatif : ${LOG_NEGATIF}`);
console.log(`   ringkasan: ${lulus} ✓ / ${gagal} ✗`);
console.log(gagal === 0 ? '   HASIL: LULUS' : '   HASIL: GAGAL');

if (SIMPAN) {
  try {
    writeFileSync(SIMPAN, `${JSON.stringify({ ...bukti, ringkasan, lulus, gagal }, null, 2)}\n`);
    console.log(`   bukti disimpan: ${SIMPAN}`);
  } catch (e) {
    console.log(`   ! gagal menyimpan bukti: ${e instanceof Error ? e.message : String(e)}`);
  }
}

setTimeout(() => process.exit(gagal === 0 ? 0 : 1), 200);
