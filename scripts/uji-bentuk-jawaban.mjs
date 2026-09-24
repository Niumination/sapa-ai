#!/usr/bin/env node
// ─── FR-18 · Uji bentuk jawaban per NIAT (end-to-end, mandiri) ───
//
// Kriteria terima dokumen 10: **≥ 3 item per niat lulus**.
//
// Harness ini menyalakan penyedia SPLP tiruan (korpus khusus bentuk) + aplikasi
// sendiri, lalu mengajukan ≥ 3 pertanyaan untuk SETIAP niat, dan memeriksa:
//   1. niat yang dikenali router,
//   2. bentuk yang dituntut niat (visual · urutan · batas · kolomTurunan),
//   3. urutan/isi baris bukti yang benar-benar dikirim API,
//   4. catatan kejujuran ketika bukti tidak cukup (tren satu tahun, tanpa total).
//
// Lalu KONTROL NEGATIF: aplikasi kedua dijalankan dengan `SAPA_BENTUK_NIAT=off`
// sehingga bentuk menjadi netral untuk semua niat. Harness WAJIB GAGAL di sana —
// kalau tidak, berarti pemeriksaannya tidak benar-benar bergantung pada bentuk.
//
// Pakai: node scripts/uji-bentuk-jawaban.mjs
// Keluar: 0 = lulus (+ kontrol negatif gagal seperti seharusnya), 1 = ada pelanggaran, 2 = gagal menyiapkan.

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT_SPLP = Number(arg('port-splp', '3164'));
const PORT = Number(arg('port', '3181'));
const PORT_NEG = Number(arg('port-negatif', String(PORT + 1)));
const TIMEOUT_S = Number(arg('timeout', '180'));
const LOG = arg('log', '/tmp/uji-bentuk-a.log');
const LOG_NEG = arg('log-negatif', '/tmp/uji-bentuk-negatif.log');
const LOG_SPLP = arg('log-splp', '/tmp/uji-bentuk-splp.log');

const warna = { ok: '\x1b[32m✓\x1b[0m', no: '\x1b[31m✗\x1b[0m', info: '\x1b[36m·\x1b[0m' };
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

// ── Pertanyaan uji: ≥ 3 per niat ───────────────────────────────────────────
const KASUS = [
  // TREN
  { niat: 'tren', q: 'tren prevalensi stunting 5 tahun terakhir', visual: 'garis', urutan: 'kronologis', batas: null },
  { niat: 'tren', q: 'bagaimana perkembangan prevalensi stunting', visual: 'garis', urutan: 'kronologis', batas: null },
  { niat: 'tren', q: 'prevalensi stunting naik atau turun dari tahun ke tahun', visual: 'garis', urutan: 'kronologis', batas: null },
  // PERINGKAT
  { niat: 'peringkat', q: '5 besar cakupan tertinggi', visual: 'batang', urutan: 'menurun', batas: 5 },
  { niat: 'peringkat', q: 'urutkan cakupan imunisasi dari yang tertinggi', visual: 'batang', urutan: 'menurun', batas: 5 },
  { niat: 'peringkat', q: 'cakupan mana yang terendah', visual: 'batang', urutan: 'menaik', batas: 5 },
  // KOMPOSISI
  { niat: 'komposisi', q: 'komposisi balita stunting', visual: 'komposisi', urutan: 'menurun', batas: 10, kolom: 'porsi' },
  { niat: 'komposisi', q: 'berapa porsi balita stunting dari total balita', visual: 'komposisi', urutan: 'menurun', batas: 10 },
  { niat: 'komposisi', q: 'proporsi balita imunisasi lengkap', visual: 'komposisi', urutan: 'menurun', batas: 10 },
  // DISTRIBUSI
  { niat: 'distribusi', q: 'sebaran penduduk per kecamatan', visual: 'batang', urutan: 'menurun', batas: 10 },
  { niat: 'distribusi', q: 'distribusi penduduk menurut kecamatan', visual: 'batang', urutan: 'menurun', batas: 10 },
  { niat: 'distribusi', q: 'persebaran penduduk kecamatan Bebesen', visual: 'batang', urutan: 'menurun', batas: 10 },
  // PERBANDINGAN
  { niat: 'perbandingan', q: 'bandingkan angka partisipasi sekolah jenjang SMA', visual: 'tabel', urutan: 'tetap', batas: 5 },
  { niat: 'perbandingan', q: 'perbedaan angka partisipasi sekolah antar OPD', visual: 'tabel', urutan: 'tetap', batas: 5 },
  { niat: 'perbandingan', q: 'selisih cakupan imunisasi dasar lengkap dan cakupan ASI eksklusif', visual: 'tabel', urutan: 'tetap', batas: 5 },
  // NILAI SAAT INI
  { niat: 'nilai_saat_ini', q: 'berapa IPM Aceh Tengah', visual: 'metric', urutan: 'tetap', batas: 5 },
  { niat: 'nilai_saat_ini', q: 'nilai produksi kopi arabika', visual: 'metric', urutan: 'tetap', batas: 5 },
  { niat: 'nilai_saat_ini', q: 'jumlah penduduk kecamatan Bebesen', visual: 'metric', urutan: 'tetap', batas: 5 },
];

// Kasus kejujuran: bentuk diminta, bukti tidak cukup → catatan WAJIB ada.
const KASUS_JUJUR = [
  { nama: 'tren dengan satu tahun → catatan "satu titik data"', q: 'tren produksi kopi arabika', pola: /satu titik data/i },
];

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

/**
 * Pagar anti-server-basi: PORT harus benar-benar bebas sebelum kita menyalakan
 * aplikasi sendiri. Tanpa ini, sisa proses dari jalannya uji sebelumnya akan
 * melayani permintaan, dan hasil uji menjadi tidak sah (pernah terjadi:
 * keluaran identik dua kali padahal kode sudah berubah).
 */
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
    console.error(`  ${warna.no} port ${nyala.join(', ')} sudah dipakai proses lain — hentikan dulu agar uji tidak menabrak server basi`);
    return false;
  }
  return true;
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

/** Pemeriksaan satu jawaban terhadap kontrak bentuknya. */
function periksaJawaban(kasus, body, awalan) {
  const bentuk = body.bentuk ?? {};
  const semuaBukti = Array.isArray(body.evidence) ? body.evidence : [];
  // Yang diperiksa adalah URUTAN YANG DISAJIKAN (`urutanBukti`), bukan urutan
  // audit `evidence` — pengguna melihat panel, bukan daftar bukti.
  const urutan = Array.isArray(body.urutanBukti) ? body.urutanBukti : null;
  const petaBukti = new Map(semuaBukti.map((b) => [String(b.id), b]));
  const bukti = urutan ? urutan.map((id) => petaBukti.get(String(id))).filter(Boolean) : semuaBukti;
  periksa(`${awalan} niat dikenali`, body.niat === kasus.niat, `niat=${body.niat}`);
  periksa(`${awalan} visual=${kasus.visual}`, bentuk.visual === kasus.visual, `dapat ${bentuk.visual}`);
  periksa(`${awalan} urutan=${kasus.urutan}`, bentuk.urutan === kasus.urutan, `dapat ${bentuk.urutan}`);
  periksa(`${awalan} batas=${kasus.batas}`, bentuk.batas === kasus.batas, `dapat ${bentuk.batas}`);
  if (kasus.kolom) periksa(`${awalan} kolom turunan "${kasus.kolom}"`, bentuk.kolomTurunan === kasus.kolom, `dapat ${bentuk.kolomTurunan}`);

  const angka = (t) => {
    const n = Number(String(t ?? '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  if (kasus.urutan === 'menurun' && bukti.length >= 2) {
    const nilai = bukti.map((b) => angka(b.nilai)).filter((n) => n !== null);
    const terurut = nilai.every((v, i) => i === 0 || nilai[i - 1] >= v);
    periksa(`${awalan} baris bukti benar-benar menurun`, terurut, `${nilai.slice(0, 4).join(' ≥ ')}`);
  }
  if (kasus.urutan === 'menaik' && bukti.length >= 2) {
    const nilai = bukti.map((b) => angka(b.nilai)).filter((n) => n !== null);
    const terurut = nilai.every((v, i) => i === 0 || nilai[i - 1] <= v);
    periksa(`${awalan} baris bukti benar-benar menaik`, terurut, `${nilai.slice(0, 4).join(' ≤ ')}`);
  }
  if (kasus.urutan === 'kronologis' && bukti.length >= 2) {
    const tahun = bukti.map((b) => String(b.tahun ?? '').trim()).filter((t) => t && t !== '—');
    const terurut = tahun.every((t, i) => i === 0 || tahun[i - 1].localeCompare(t) <= 0);
    periksa(`${awalan} tahun naik secara kronologis`, terurut, `${tahun.slice(0, 5).join(' → ')}`);
  }
  if (kasus.batas !== null && bukti.length > 0) {
    periksa(`${awalan} baris SAJIAN dipotong ≤ ${kasus.batas}`, bukti.length <= kasus.batas, `${bukti.length} baris (bukti audit ${semuaBukti.length})`);
  }
  periksa(`${awalan} urutan sajian dikirim API (urutanBukti)`, urutan !== null, urutan ? `${urutan.length} id` : 'tidak ada');

  if (kasus.kolom === 'porsi') {
    // Porsi HANYA sah bila totalnya ada di bukti; kalau tidak ada, catatan
    // kejujuran wajib muncul dan porsi memang tidak boleh dikarang.
    const porsi = body.porsi && typeof body.porsi === 'object' ? body.porsi : null;
    const adaTotal = semuaBukti.some((b) => /\b(total|jumlah|keseluruhan|akumulasi|seluruh)\b/i.test(String(b.indikator ?? '')));
    if (adaTotal) {
      periksa(`${awalan} porsi dihitung dari total yang ada`, Boolean(porsi), porsi ? Object.entries(porsi).slice(0, 2).map(([k, v]) => `${k}=${v}%`).join(' ') : 'tidak ada porsi');
    } else {
      periksa(`${awalan} tanpa total di bukti → TIDAK mengarang porsi + catatan jujur`, !porsi && /total keseluruhan tidak ada/i.test(String(bentuk.catatan ?? '')), String(bentuk.catatan ?? '').slice(0, 80));
    }
  }
  return Boolean(bentuk.visual === kasus.visual && bentuk.urutan === kasus.urutan && bentuk.batas === kasus.batas);
}

// ── Jalan ─────────────────────────────────────────────────────────────────
let splp = null;
let app = null;
let appNeg = null;
const ringkas = [];

function matikan(proc) {
  if (!proc || proc.killed) return;
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    try { proc.kill('SIGKILL'); } catch { /* sudah mati */ }
  }
}

try {
  console.log(`\n  FR-18 · bentuk jawaban per niat (end-to-end)\n`);

  if (!(await pastikanPortBebas([PORT, PORT_NEG]))) process.exit(2);

  splp = jalankanPendamping('verifikasi/stub-splp.mjs', [String(PORT_SPLP), join(AKAR, 'verifikasi', 'korpus-bentuk.json')], LOG_SPLP);
  const urlSplp = `http://127.0.0.1:${PORT_SPLP}/sapa/1.0/api`;
  const splpHidup = await tungguSiap(`${urlSplp}/daftar_data`, 25_000);
  if (!splpHidup) {
    console.error(`  ${warna.no} penyedia SPLP tiruan tidak siap (lihat ${LOG_SPLP})`);
    process.exit(2);
  }

  app = jalankanApp(PORT, { SAPA_SPLP_BASE_URL: urlSplp, AI_ENABLED: 'false' }, LOG);
  if (!(await tungguSiap(`http://127.0.0.1:${PORT}/api/status`, TIMEOUT_S * 1000))) {
    console.error(`  ${warna.no} aplikasi tidak siap (lihat ${LOG})`);
    process.exit(2);
  }

  // Korpus harus benar-benar terbaca sebelum uji dijalankan.
  const status = await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json();
  const jumlahRecord = status?.sapa?.records ?? 0;
  periksa('korpus tiruan terbaca (25 record)', jumlahRecord === 25, `${jumlahRecord} record`);
  if (jumlahRecord !== 25) {
    console.error(`  ${warna.no} korpus tidak sesuai — hentikan agar uji tidak menyesatkan`);
    process.exit(2);
  }

  bagian('Bentuk per niat (≥ 3 item per niat)');
  const perNiat = new Map();
  for (const kasus of KASUS) {
    const body = await tanya(PORT, kasus.q);
    const cocok = periksaJawaban(kasus, body, `[${kasus.niat}] "${kasus.q.slice(0, 42)}"`);
    const catatan = perNiat.get(kasus.niat) ?? { total: 0, lulus: 0 };
    catatan.total += 1;
    if (cocok) catatan.lulus += 1;
    perNiat.set(kasus.niat, catatan);
  }
  ringkas.push(...[...perNiat.entries()].map(([niat, c]) => ({ niat, ...c })));

  bagian('Catatan kejujuran saat bukti tidak cukup');
  for (const kasus of KASUS_JUJUR) {
    const body = await tanya(PORT, kasus.q);
    const catatan = body.bentuk?.catatan ?? '';
    periksa(kasus.nama, kasus.pola.test(catatan), catatan ? `catatan: ${catatan.slice(0, 90)}` : 'tidak ada catatan');
  }

  // ── Kontrol negatif ─────────────────────────────────────────────────────
  bagian('Kontrol negatif — SAPA_BENTUK_NIAT=off (harus GAGAL)');
  appNeg = jalankanApp(PORT_NEG, { SAPA_SPLP_BASE_URL: urlSplp, AI_ENABLED: 'false', SAPA_BENTUK_NIAT: 'off' }, LOG_NEG);
  const negatifSiap = await tungguSiap(`http://127.0.0.1:${PORT_NEG}/api/status`, TIMEOUT_S * 1000);
  if (!negatifSiap) {
    console.error(`  ${warna.no} aplikasi kontrol negatif tidak siap (lihat ${LOG_NEG})`);
    process.exit(2);
  }
  let pelanggaranNegatif = 0;
  let diperiksaNegatif = 0;
  for (const kasus of KASUS.filter((k) => ['peringkat', 'tren', 'komposisi'].includes(k.niat))) {
    const body = await tanya(PORT_NEG, kasus.q);
    const bentuk = body.bentuk ?? {};
    diperiksaNegatif += 1;
    const cocokKontrak = bentuk.visual === kasus.visual && bentuk.urutan === kasus.urutan && bentuk.batas === kasus.batas;
    if (!cocokKontrak) pelanggaranNegatif += 1;
  }
  periksa(
    'bentuk netral terdeteksi sebagai pelanggaran',
    pelanggaranNegatif === diperiksaNegatif && diperiksaNegatif > 0,
    `${pelanggaranNegatif}/${diperiksaNegatif} item menyimpang dari kontrak`,
  );

  matikan(appNeg);
  appNeg = null;

  // ── Ringkasan ───────────────────────────────────────────────────────────
  const totalKasus = KASUS.length;
  const niatDenganTiga = ringkas.filter((r) => r.lulus >= 3).length;
  console.log('\n  ──────────────── Ringkasan ────────────────');
  console.log(`  niat diuji          : ${ringkas.map((r) => `${r.niat} ${r.lulus}/${r.total}`).join(' · ')}`);
  console.log(`  kriteria dok 10     : ≥ 3 item per niat lulus → ${niatDenganTiga}/${ringkas.length} niat terpenuhi`);
  console.log(`  item diperiksa      : ${totalKasus}`);
  console.log(`  pemeriksaan lulus   : ${LULUS}`);
  console.log(`  kontrol negatif     : ${pelanggaranNegatif}/${diperiksaNegatif} item menyimpang (harus semuanya)`);

  if (GAGAL.length) {
    console.log(`\n  ${warna.no} GAGAL — ${GAGAL.length} pemeriksaan tidak terpenuhi:`);
    for (const g of GAGAL) console.log(`    · ${g}`);
    process.exitCode = 1;
  } else {
    console.log(`\n  ${warna.ok} LULUS — setiap niat punya bentuk sendiri (≥ 3 item/niat), catatan kejujuran muncul saat bukti tidak cukup, dan kontrol negatif gagal seperti seharusnya.`);
  }
} catch (err) {
  console.error(`\n  ${warna.no} galat: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 2;
} finally {
  matikan(appNeg);
  matikan(app);
  matikan(splp);
}
