#!/usr/bin/env node
// ─── EV-05: pemeriksa perluasan set evaluasi ke 120 item + akurasi niat ───────
//
// MENGAPA HARNESS INI ADA
//   Uji unit `eval-set.test.ts` menjaga BENTUK data (id unik, regex sah, alasan
//   terisi). Yang tidak dapat dijamin uji unit adalah hal yang justru menjadi
//   kriteria terima EV-05:
//
//     "≥ 3 item baru per niat LULUS"
//
//   Lulus hanya bisa diukur dengan MENJALANKAN kueri ke aplikasi sungguhan.
//   Harness ini menjalankan `scripts/eval-run.mjs` (satu-satunya penilai yang
//   juga dipakai gerbang rilis), lalu memeriksa dump mesinnya — bukan prosanya.
//
// YANG DIPERIKSA
//   A. set berisi 120 item, versi 3, 9 niat, tiap niat ≥ 3 item baru
//   B. tiap niat: ≥ 3 item baru LULUS (kriteria terima EV-05)
//   C. tiap niat punya bukti yang KUAT: minimal satu item mode `jawab`
//      (untuk personal: `defleksi`, untuk sebab: `jujur`) — supaya lulus bukan
//      karena mode yang lunak
//   D. akurasi niat router ≥ 90 % pada 30 item ber-`niat`
//   E. tidak ada pelanggaran invarians (halu/token/jargon/sumber/NIK)
//   F. tidak ada jawaban MENYESATKAN pada item mana pun
//   G. kontrol negatif `--sabotase`: dump dirusak buatan, pemeriksa WAJIB gagal
//
// Pakai (aplikasi harus hidup; lihat kit serah terima):
//   SAPA_EVAL_URL=http://127.0.0.1:3181 node scripts/uji-eval-120.mjs
//   SAPA_EVAL_URL=... node scripts/uji-eval-120.mjs --sabotase            # wajib exit 1
//   SAPA_EVAL_URL=... node scripts/uji-eval-120.mjs --dump=verifikasi/eval120-produksi.json
//   node scripts/uji-eval-120.mjs --tanpa-jalan                          # periksa dump lama saja
//
// Keluar: 0 = LULUS, 1 = ada pelanggaran, 2 = prasyarat tidak terpenuhi.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const ada = (n) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const val = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : d;
};

const SABOTASE = ada('sabotase');
const TANPA_JALAN = ada('tanpa-jalan');
const BASE = (process.env.SAPA_EVAL_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const DUMP = val('dump', path.join(root, 'verifikasi', 'eval120-produksi.json'));
const SET_PATH = path.join(root, 'data', 'eval-set.json');

const NIAT = ['nilai_saat_ini', 'tren', 'perbandingan', 'peringkat', 'komposisi', 'distribusi', 'meta_katalog', 'sebab', 'personal'];
const MODE_KUAT = { personal: 'defleksi', sebab: 'jujur' };
const MIN_LULUS_PER_NIAT = 3;
const MIN_AKURASI_NIAT = 0.9;

const masalah = [];
const baik = [];
const ok = (t) => baik.push(t);
const gagal = (t) => masalah.push(t);

// ── 1. Jalankan penilai (atau pakai dump yang ada) ───────────────────────────
if (!TANPA_JALAN) {
  if (SABOTASE) {
    console.log('[info] mode sabotase: TIDAK menjalankan penilai; dump lama dipakai lalu dirusak buatan.');
  } else {
    console.log(`[info] menjalankan penilai eval-120 terhadap ${BASE} …`);
    if (!fs.existsSync(DUMP)) fs.mkdirSync(path.dirname(DUMP), { recursive: true });
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'eval-run.mjs'), `--json=${DUMP}`], {
      cwd: root,
      env: { ...process.env, SAPA_EVAL_URL: BASE },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0 && !fs.existsSync(DUMP)) {
      console.error('[GAGAL] penilai tidak dapat dijalankan (aplikasi hidup?):');
      console.error((r.stderr ?? '').slice(-800));
      process.exit(2);
    }
    console.log('[info] penilai selesai; dump:', path.relative(root, DUMP));
  }
}
if (!fs.existsSync(DUMP)) {
  console.error(`[GAGAL] tidak menemukan dump ${DUMP}`);
  process.exit(2);
}
let dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'));

// ── 2. Kontrol negatif: rusak dump buatan ───────────────────────────────────
if (SABOTASE) {
  dump = JSON.parse(JSON.stringify(dump));
  let rusak = 0;
  for (const h of dump.item) {
    if (h.grup === 'niat-distribusi' && rusak < 3) { h.lulus = false; h.cara = 'menjawab TANPA evidence relevan'; rusak += 1; }
  }
  for (const h of dump.item) {
    if (h.grup === 'niat-tren' && rusak < 4) { h.niatServer = 'nilai_saat_ini'; rusak += 1; }
  }
  dump.item[0].inv = ['angka di luar evidence'];
  console.log(`[sabotase] dump dirusak buatan: 3 item distribusi gagal, niat tren dialihkan, 1 pelanggaran invarians.\n`);
}

// ── 3. Data set ─────────────────────────────────────────────────────────────
const set = JSON.parse(fs.readFileSync(SET_PATH, 'utf8'));
const itemSet = set.item;
const baru = itemSet.filter((i) => /^E\d+$/.test(i.id));
const perNiat = new Map(NIAT.map((n) => [n, { item: [], baru: [] }]));
for (const it of itemSet) {
  const cocok = /^niat-(.+)$/.exec(it.grup ?? '');
  if (cocok && perNiat.has(cocok[1])) perNiat.get(cocok[1]).item.push(it);
  if (/^E\d+$/.test(it.id) && it.niat && perNiat.has(it.niat)) perNiat.get(it.niat).baru.push(it);
}

console.log(`── A. Bentuk set evaluasi ──`);
if (itemSet.length === 120) ok(`set berisi 120 item (versi ${set.versi})`);
else gagal(`set berisi ${itemSet.length} item, seharusnya 120`);
if (baru.length === 30) ok(`30 item baru EV-05 (E01–E30)`);
else gagal(`item baru EV-05: ${baru.length}, seharusnya 30`);
for (const n of NIAT) {
  const j = perNiat.get(n).baru.length;
  if (j >= MIN_LULUS_PER_NIAT) ok(`niat ${n.padEnd(15)} ${j} item baru`);
  else gagal(`niat ${n} hanya ${j} item baru (< ${MIN_LULUS_PER_NIAT})`);
}

// ── 4. Hasil ────────────────────────────────────────────────────────────────
const hasil = new Map(dump.item.map((h) => [h.id, h]));
const BENAR_NIAT = (h) =>
  h.niatServer === h.niatHarapan ||
  (h.niatHarapan === 'meta_katalog' && (h.jalur === 'meta' || (h.evOpd ?? []).includes('Seluruh katalog SAPA')));

console.log(`\n── B/C. Lulus per niat + kekuatan mode ──`);
for (const n of NIAT) {
  const ids = perNiat.get(n).baru.map((i) => i.id);
  const baris = ids.map((id) => hasil.get(id)).filter(Boolean);
  const lulus = baris.filter((h) => h.lulus);
  if (lulus.length >= MIN_LULUS_PER_NIAT) ok(`niat ${n.padEnd(15)} lulus ${lulus.length}/${ids.length}`);
  else gagal(`niat ${n}: hanya ${lulus.length} item baru lulus (< ${MIN_LULUS_PER_NIAT}) → ${ids.filter((id) => !hasil.get(id)?.lulus).join(', ')}`);

  const modeKuat = MODE_KUAT[n];
  const kuat = baris.filter((h) => (modeKuat ? h.harus === modeKuat : h.harus === 'jawab'));
  if (kuat.length === 0) gagal(`niat ${n}: tidak punya item mode ${modeKuat ?? 'jawab'}`);
  else if (kuat.every((h) => h.lulus)) ok(`niat ${n.padEnd(15)} bukti kuat: ${kuat.length}× mode ${modeKuat ?? 'jawab'} lulus semua`);
  else gagal(`niat ${n}: item mode ${modeKuat ?? 'jawab'} gagal → ${kuat.filter((h) => !h.lulus).map((h) => h.id).join(', ')}`);
}

console.log(`\n── D. Akurasi niat router ──`);
const berNiat = dump.item.filter((h) => h.niatHarapan);
const benar = berNiat.filter(BENAR_NIAT);
const akurasi = berNiat.length ? benar.length / berNiat.length : 0;
if (berNiat.length === 30 && akurasi >= MIN_AKURASI_NIAT) ok(`niat tepat ${benar.length}/${berNiat.length} (${(akurasi * 100).toFixed(1)} %) ≥ ${MIN_AKURASI_NIAT * 100} %`);
else gagal(`akurasi niat ${benar.length}/${berNiat.length} (${(akurasi * 100).toFixed(1)} %) — di bawah ambang atau jumlah item ber-niat bukan 30`);
const menyimpang = berNiat.filter((h) => !BENAR_NIAT(h));
if (menyimpang.length) console.log(`   menyimpang: ${menyimpang.map((h) => `${h.id}(${h.niatHarapan}→${h.niatServer})`).join(', ')}`);

console.log(`\n── E/F. Invarians & jawaban menyesatkan ──`);
const inv = dump.item.filter((h) => (h.inv ?? []).length > 0);
if (inv.length === 0) ok(`0 pelanggaran invarians pada ${dump.item.length} keluaran`);
else gagal(`pelanggaran invarians: ${inv.map((h) => `${h.id}[${h.inv.join('; ')}]`).join(', ')}`);
const menyesatkan = dump.item.filter((h) => /menyesatkan|TANPA evidence|padahal data (ADA|tidak ada)/i.test(h.cara ?? ''));
if (menyesatkan.length === 0) ok('0 jawaban menyesatkan');
else gagal(`jawaban menyesatkan: ${menyesatkan.map((h) => `${h.id}(${h.cara})`).join(', ')}`);

// ── 5. Ringkasan ────────────────────────────────────────────────────────────
const lulusTotal = dump.item.filter((h) => h.lulus).length;
console.log(`\n${'─'.repeat(46)}`);
console.log(`  item diperiksa     : ${dump.item.length} (dump ${path.relative(root, DUMP)})`);
for (const n of NIAT) {
  const j = perNiat.get(n).baru.map((i) => i.id).map((id) => hasil.get(id)).filter(Boolean);
  process.stdout.write(`  ${n.padEnd(16)} lulus ${String(j.filter((h) => h.lulus).length).padStart(2)}/${String(j.length).padEnd(2)}`);
  const kuat = j.filter((h) => (MODE_KUAT[n] ? h.harus === MODE_KUAT[n] : h.harus === 'jawab'));
  console.log(` · mode kuat ${kuat.filter((h) => h.lulus).length}/${kuat.length}`);
}
console.log(`  total lulus        : ${lulusTotal}/${dump.item.length}`);
console.log(`  niat tepat         : ${benar.length}/${berNiat.length}`);
console.log(`  pemeriksaan lulus  : ${baik.length}`);
if (masalah.length) {
  console.log(`\n  ✗ GAGAL — ${masalah.length} pemeriksaan tidak terpenuhi:`);
  for (const m of masalah) console.log(`    · ${m}`);
  process.exit(1);
}
console.log(`\n  ✓ LULUS — 120 item tuntas, tiap niat punya ≥ ${MIN_LULUS_PER_NIAT} item baru lulus dengan bukti kuat, akurasi niat ${(akurasi * 100).toFixed(0)} %.`);
process.exit(0);
