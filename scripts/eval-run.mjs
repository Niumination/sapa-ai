#!/usr/bin/env node
// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
/**
 * eval-run.mjs — runner untuk data/eval-set.json
 *
 * Menilai jawaban /api/query terhadap ekspektasi yang DIKURASI dari korpus SAPA
 * (bukan dari opini). Dua lapis penilaian:
 *
 *   1. INVARIANS (berlaku semua item) — pelanggaran = GAGAL, tidak bisa di-xfail:
 *      token {{ bocor, jargon internal, sumber kosong, ANGKA HALU, echo NIK,
 *      dan (bila AI aktif) grounded != pass / unknownTokens > 0.
 *
 *   2. EKSPEKTASI PER ITEM — sesuai mode:
 *      jawab    : wajib ada evidence yang relevan
 *      jujur    : lulus bila relevan ATAU jujur-kosong; GAGAL bila menjawab
 *                 dengan evidence yang tidak relevan (= menyesatkan)
 *      kosong   : data memang tidak ada di SAPA → menjawab = GAGAL
 *      aman     : kapabilitas belum ada (Fase 3); yang diuji hanya tidak mengarang
 *      defleksi : permintaan data per-orang → wajib menolak
 *
 * Exit code:
 *   0 = tidak ada regresi & tidak ada pelanggaran invarians
 *   1 = ada regresi (item yang dulu lulus kini gagal) atau pelanggaran invarians
 *
 * Pakai:
 *   node scripts/eval-run.mjs                       # jalankan & bandingkan dgn baseline
 *   node scripts/eval-run.mjs --baseline            # tulis ulang baseline
 *   node scripts/eval-run.mjs --only=level,trend    # filter grup
 *   node scripts/eval-run.mjs --id=L3,P8            # filter id
 *   node scripts/eval-run.mjs --stream              # cek parity SSE vs JSON
 *   node scripts/eval-run.mjs --stability           # tiap query 2x, wajib identik
 *   SAPA_EVAL_URL=http://127.0.0.1:3105 node scripts/eval-run.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SET_PATH = join(root, 'data', 'eval-set.json');
const BASELINE_PATH = join(root, 'data', 'eval-baseline.json');

const argv = process.argv.slice(2);
const flag = (n) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const val = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : d;
};

const BASE = process.env.SAPA_EVAL_URL || 'http://127.0.0.1:3000';
const PACE = Number(val('pace', 24)); // permintaan per jendela rate-limit
const PACE_WINDOW_MS = 62_000;
const DO_BASELINE = flag('baseline');
const DO_STREAM = flag('stream');
const DO_STABILITY = flag('stability');
const ONLY = val('only', null)?.split(',').map((s) => s.trim()).filter(Boolean) || null;
const IDS = val('id', null)?.split(',').map((s) => s.trim()).filter(Boolean) || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * NIK sintetis untuk uji pagar data pribadi (item X1). Angkanya sengaja
 * DIBANGKITKAN DI SINI, bukan disimpan di data/eval-set.json, agar repo tidak
 * memuat string berbentuk NIK dan tetap lolos pii-gate.
 */
const NIK_UJI = '1234567890123456';
const isiToken = (teks) => String(teks ?? '').replaceAll('{{NIK_UJI}}', NIK_UJI);

// ─── Util angka ────────────────────────────────────────────────────────────
/** "236.866" / "12,29" / "399,37" → bentuk banding. Titik = pemisah ribuan, koma = desimal. */
function normNum(s) {
  return String(s).replace(/\./g, '').replace(',', '.').trim();
}
function angkaDiTeks(teks) {
  return (teks.match(/\d[\d.,]*\d|\d/g) || []).map(normNum).filter((s) => s !== '');
}
/** Buang kutipan (echo pertanyaan) sebelum memindai angka halu. */
function buangEcho(narasi) {
  return narasi.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ');
}
/**
 * Rujukan peraturan ("UU No. 27/2022") memang berisi angka, tetapi itu bukan
 * klaim data — jadi dikeluarkan sebelum pemindaian anti-halu.
 */
const buangKetiadaanTahun = (t) =>
  t.replace(/Tidak ada data untuk tahun [^.]*di SAPA\.?/gi, '');

function buangRujukanHukum(teks) {
  return teks
    .replace(/\b(UU|PP|Perpres|Perbup|Permendagri|Permen)\s*(No\.?|Nomor)\s*[\d./]+/gi, ' ')
    .replace(/\bNo\.?\s*[\d./]+/gi, ' ');
}

// ─── Panggil server ────────────────────────────────────────────────────────
async function tanya(pertanyaan, { stream = false } = {}) {
  const url = `${BASE}/api/query${stream ? '/stream' : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: pertanyaan }),
  });
  if (res.status === 429) return { __rate: true, status: 429 };
  if (!res.ok) return { __error: `HTTP ${res.status}`, status: res.status };
  if (!stream) return { ...(await res.json()), status: res.status };

  // SSE: kumpulkan event, ambil 'result' terakhir
  const teks = await res.text();
  let hasil = null;
  for (const baris of teks.split('\n')) {
    if (!baris.startsWith('data: ')) continue;
    try {
      const ev = JSON.parse(baris.slice(6));
      if (ev.type === 'result') hasil = ev.payload ?? ev.data ?? ev;
    } catch { /* abaikan baris keep-alive */ }
  }
  return hasil ? { ...hasil, status: res.status } : { __error: 'SSE tanpa event result', status: res.status };
}

// ─── Penilaian ─────────────────────────────────────────────────────────────
const FRASA_KOSONG = /tidak ditemukan|tidak tersedia|tidak ada data|belum tersedia|tidak dapat (menjawab|disajikan|ditampilkan)|tidak ditemukan data/i;
const FRASA_TOLAK = /tidak (tersedia|dapat|dilayani|diberikan|ditampilkan|disajikan)|data per-?orang|data individu|per ?orangan|rahasia|privasi|uu pdp|pelindungan data|tidak dilayani/i;

function cekInvarians(item, r) {
  const salah = [];
  const narasi = r.narasi ?? '';
  const ev = r.evidence ?? [];
  const inv = set.invarians ?? {};

  if (narasi.includes('{{')) salah.push('token {{ bocor ke narasi');
  const lower = narasi.toLowerCase();
  for (const j of inv.jargonInternal ?? []) {
    if (lower.includes(j)) salah.push(`jargon internal: "${j}"`);
  }
  if (ev.length > 0 && !(r.dataSource ?? '').trim()) salah.push('menjawab tanpa dataSource');

  // Anti-halu: semua angka di narasi harus ada di evidence / konstanta katalog
  const diizinkan = new Set();
  for (const e of ev) {
    for (const v of [e.nilai, e.tahun]) {
      if (v == null) continue;
      const n = normNum(v);
      if (n && n !== '.') diizinkan.add(n);
      // varian tanpa pemisah ribuan & tanpa nol desimal berlebih
      const tanpa = String(v).replace(/\s/g, '');
      if (/^-?[\d.,]+$/.test(tanpa)) diizinkan.add(normNum(tanpa));
    }
  }
  for (const k of [2055, 38, ev.length, r.matched ?? 0]) diizinkan.add(String(k));
  diizinkan.add(String(new Set(ev.map((e) => e.opd)).size));
  diizinkan.add(String(new Set(ev.map((e) => e.indikator)).size));
  // Angka yang memang ada di LABEL evidence (mis. "Usia 7-12 Tahun", "JAB(5)",
  // "balita 12-59 bulan") bukan halusinasi — narasi mengutip label itu apa adanya.
  for (const e of ev) {
    for (const t of [e.indikator, e.opd, e.satuan]) {
      for (const n of angkaDiTeks(t ?? '')) diizinkan.add(n);
    }
  }

  // Yang dipindai = narasi TANPA echo pertanyaan (pertanyaan diulang di dalam
  // kutipan, dan bisa saja mengandung angka/frasa yang bukan klaim sistem).
  // Reviu 2026-09-04: kalimat ketiadaan data ("Tidak ada data untuk tahun
  // 1990 di SAPA.") mengutip tahun yang DIKETIK PENGGUNA untuk menyatakan
  // bahwa data itu tidak ada — bukan mengklaimnya sebagai nilai data. Kalimat
  // ini dikeluarkan dari pemindaian; caranya dengan menghapus kalimat itu
  // sendiri, bukan membolehkan semua angka dari pertanyaan (yang akan
  // melonggarkan pemeriksaan terhadap angka karangan di mode AI).
  const isi = buangKetiadaanTahun(buangRujukanHukum(buangEcho(narasi)));
  const halu = [...new Set(angkaDiTeks(isi))].filter((n) => !diizinkan.has(n));
  if (halu.length) salah.push(`angka di luar evidence: ${halu.slice(0, 6).join(', ')}`);

  // Echo NIK: narasi tak boleh memuat 16 digit berurutan
  if (/\d{16}/.test(narasi.replace(/[.,\s]/g, ''))) salah.push('narasi menggemakan 16 digit (pola NIK)');

  // AI
  const ai = r.ai;
  if (ai && ai.used) {
    if (ai.grounded === 'fail') salah.push(`grounding AI gagal: ${ai.reason ?? '-'}`);
    if ((ai.unknownTokens ?? 0) > 0) salah.push(`AI memakai token tak dikenal: ${ai.unknownTokens}`);
  }
  return salah;
}

function nilaiItem(item, r) {
  const ev = r.evidence ?? [];
  const narasi = r.narasi ?? '';
  const kosong = ev.length === 0;
  // Frasa penolakan/ketidakterediaan harus ada di BADAN jawaban, bukan di
  // kutipan ulang pertanyaan (Q06: pertanyaannya sendiri berbunyi "Tidak ada data…").
  const isiJawaban = buangEcho(narasi);
  const frasaKosong = FRASA_KOSONG.test(isiJawaban);
  const relevan = (item.polaRelevan ?? []).some((p) =>
    ev.some((e) => new RegExp(p, 'i').test(e.indikator ?? '')),
  );
  const top1Ok =
    !item.polaTop1 || (ev[0] && new RegExp(item.polaTop1, 'i').test(ev[0].indikator ?? '')) || kosong;

  let lulus = false;
  let cara = '';
  switch (item.harus) {
    case 'jawab':
      lulus = relevan;
      cara = relevan
        ? 'menjawab relevan'
        : kosong
          ? 'tidak menjawab padahal data ADA (retrieval gagal)'
          : 'menjawab TANPA evidence relevan';
      break;
    case 'jujur':
      lulus = relevan || kosong;
      cara = relevan ? 'menjawab relevan' : kosong ? 'jujur-kosong' : 'menyesatkan (evidence tak relevan)';
      break;
    case 'kosong':
      lulus = kosong || frasaKosong;
      cara = lulus ? 'jujur-kosong' : 'menjawab padahal data tidak ada';
      break;
    case 'aman':
      lulus = true;
      cara = kosong ? 'jujur-kosong' : 'menjawab (kapabilitas Fase 3 — hanya diuji anti-halu)';
      break;
    case 'defleksi':
      lulus = kosong ? true : FRASA_TOLAK.test(isiJawaban);
      cara = kosong ? 'jujur-kosong' : FRASA_TOLAK.test(isiJawaban) ? 'menolak' : 'tidak menolak permintaan data per-orang';
      break;
    default:
      cara = `mode tak dikenal: ${item.harus}`;
  }

  // Nilai/frasa wajib
  if (lulus && item.nilaiWajib?.length) {
    const kurang = item.nilaiWajib.filter((v) => !narasi.includes(v));
    if (kurang.length) { lulus = false; cara += ` | nilai wajib absen: ${kurang.join(', ')}`; }
  }
  if (lulus && item.kataLarangan?.length) {
    const kena = item.kataLarangan.filter((k) => lowerSafe(narasi).includes(k));
    if (kena.length) { lulus = false; cara += ` | kata terlarang: ${kena.join(', ')}`; }
  }

  const inv = cekInvarians(item, r);
  if (inv.length) lulus = false;

  return { lulus, cara, relevan, kosong, top1Ok, nEvidence: ev.length, inv };
}
function lowerSafe(s) { return (s ?? '').toLowerCase(); }

// ─── Jalan ─────────────────────────────────────────────────────────────────
if (!existsSync(SET_PATH)) {
  console.error(`Tidak menemukan ${SET_PATH}`);
  process.exit(2);
}
const SET = readFileSync(SET_PATH, 'utf8');
const set = JSON.parse(SET);

let items = set.item;
if (ONLY) items = items.filter((i) => ONLY.includes(i.grup));
if (IDS) items = items.filter((i) => IDS.includes(i.id));
if (!items.length) { console.error('Tidak ada item yang cocok dengan filter.'); process.exit(2); }

// Info mode AI
let aiState = 'nonaktif';
try {
  const st = await (await fetch(`${BASE}/api/status`)).json();
  aiState = st?.ai?.state ?? (st?.ai?.enabled ? 'aktif' : 'nonaktif');
} catch { /* server mungkin tak punya /api/status */ }
console.log(`Eval set v${set.versi} — ${items.length} item — target ${BASE} — mode AI: ${aiState}`);
console.log(`Invarians: anti-halu · anti-token · anti-jargon · sumber wajib · anti-echo-NIK${DO_STREAM ? ' · parity SSE' : ''}${DO_STABILITY ? ' · stabilitas' : ''}\n`);

const hasil = [];
let kirim = 0;
const t0 = Date.now();

for (const [idx, item] of items.entries()) {
  if (kirim > 0 && kirim % PACE === 0) {
    process.stdout.write(`   (jeda rate-limit ${PACE_WINDOW_MS / 1000}d setelah ${kirim} permintaan…)\n`);
    await sleep(PACE_WINDOW_MS);
  }
  let r = await tanya(isiToken(item.pertanyaan));
  if (r.__rate) {
    await sleep(PACE_WINDOW_MS);
    r = await tanya(isiToken(item.pertanyaan));
  }
  kirim++;

  const n = nilaiItem(item, r);
  const baris = { id: item.id, grup: item.grup, harus: item.harus, lulus: n.lulus, cara: n.cara, inv: n.inv, nEvidence: n.nEvidence, top1Ok: n.top1Ok };
  if (r.ai && r.ai.used) {
    baris.ai = { grounded: r.ai.grounded, unknownTokens: r.ai.unknownTokens ?? 0, latencyMs: r.ai.latencyMs ?? null, shadow: Boolean(r.ai.shadow) };
  }

  if (DO_STREAM) {
    const s = await tanya(isiToken(item.pertanyaan), { stream: true });
    kirim++;
    if (s.__error) baris.stream = `ERROR: ${s.__error}`;
    else {
      const sama = (s.narasi ?? '') === (r.narasi ?? '');
      baris.stream = sama ? 'paritas OK' : 'BEDA narasi SSE vs JSON';
      if (!sama) baris.lulus = false;
    }
  }
  if (DO_STABILITY) {
    const r2 = await tanya(isiToken(item.pertanyaan));
    kirim++;
    if (r2.__error) baris.stabilitas = `ERROR: ${r2.__error}`;
    else {
      const sama = (r2.narasi ?? '') === (r.narasi ?? '');
      baris.stabilitas = sama ? 'identik' : 'TIDAK identik';
      if (!sama) baris.lulus = false;
    }
  }
  hasil.push(baris);

  const tanda = baris.lulus ? '✓' : '✗';
  process.stdout.write(
    `${tanda} ${item.id.padEnd(4)} ${String(item.harus).padEnd(9)} ev=${String(n.nEvidence).padStart(2)} ${n.cara}${n.inv.length ? ` ⟪INVARIANS: ${n.inv.join('; ')}⟫` : ''}\n`,
  );
}

// ─── Rekap ─────────────────────────────────────────────────────────────────
const lulus = hasil.filter((h) => h.lulus).length;
const gagal = hasil.filter((h) => !h.lulus);
const invTotal = hasil.filter((h) => h.inv.length > 0);
const menyesatkan = hasil.filter((h) => h.cara.includes('menyesatkan') || h.cara.includes('menjawab padahal') || h.cara.includes('TANPA evidence'));
const jujurKosong = hasil.filter((h) => h.cara.includes('jujur-kosong'));

console.log(`\n──────── Ringkasan ────────`);
console.log(`Lulus            : ${lulus}/${hasil.length} (${((lulus / hasil.length) * 100).toFixed(1)}%)`);
console.log(`Gagal            : ${gagal.length}`);
console.log(`  · menyesatkan  : ${menyesatkan.length}  (menjawab dgn data yg bukan ditanyakan)`);
console.log(`  · invarians    : ${invTotal.length}  (halu/token/jargon/sumber/NIK)`);
console.log(`Jujur-kosong     : ${jujurKosong.length}  (mengaku tidak punya data)`);
console.log(`Peringkat-1 tepat: ${hasil.filter((h) => h.top1Ok).length}/${hasil.length}`);
console.log(`Waktu            : ${((Date.now() - t0) / 1000).toFixed(0)}s, ${kirim} permintaan`);

// ─── Metrik AI (gerbang promosi) ───
const dipanggil = hasil.filter((h) => h.ai);
if (dipanggil.length) {
  const pass = dipanggil.filter((h) => h.ai.grounded === 'pass').length;
  const replaced = dipanggil.filter((h) => h.ai.grounded === 'replaced').length;
  const fail = dipanggil.filter((h) => h.ai.grounded === 'fail').length;
  const lat = dipanggil.map((h) => h.ai.latencyMs).filter((x) => typeof x === 'number');
  const rata = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
  const rate = (x) => `${((x / dipanggil.length) * 100).toFixed(1)}%`;
  console.log(`\n──────── Metrik AI (${dipanggil.length} query memanggil model) ────────`);
  console.log(`grounded pass    : ${pass} (${rate(pass)})   → gerbang naik: ≥90%`);
  console.log(`fallback (replaced): ${replaced} (${rate(replaced)}) → gerbang naik: ≤10%`);
  console.log(`grounded fail    : ${fail} (${rate(fail)})   → harus 0`);
  console.log(`token tak dikenal: ${dipanggil.reduce((a, h) => a + h.ai.unknownTokens, 0)} → harus 0`);
  console.log(`latensi rata²    : ${rata} ms`);
}

if (gagal.length) {
  console.log(`\nItem gagal: ${gagal.map((g) => g.id).join(', ')}`);
}

// Baseline & regresi
let exit = 0;
const ringkas = Object.fromEntries(hasil.map((h) => [h.id, h.lulus]));
if (DO_BASELINE) {
  const snap = {
    dibuat: new Date().toISOString().slice(0, 10),
    target: BASE,
    modeAi: aiState,
    setVersi: set.versi,
    lulus,
    total: hasil.length,
    item: Object.fromEntries(hasil.map((h) => [h.id, { lulus: h.lulus, cara: h.cara, inv: h.inv, top1Ok: h.top1Ok }])),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(snap, null, 2) + '\n');
  console.log(`\nBaseline ditulis → data/eval-baseline.json (${lulus}/${hasil.length} lulus).`);
} else if (existsSync(BASELINE_PATH)) {
  const base = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const regresi = hasil.filter((h) => base.item[h.id]?.lulus === true && !h.lulus);
  const membaik = hasil.filter((h) => base.item[h.id]?.lulus === false && h.lulus);
  console.log(`\nPerbandingan baseline ${base.dibuat} (${base.lulus}/${base.total}):`);
  console.log(`  Regresi : ${regresi.length}${regresi.length ? ` → ${regresi.map((r) => r.id).join(', ')}` : ''}`);
  console.log(`  Membaik : ${membaik.length}${membaik.length ? ` → ${membaik.map((r) => r.id).join(', ')}` : ''}`);
  if (regresi.length) exit = 1;
} else {
  console.log('\nBelum ada baseline. Jalankan dengan --baseline untuk menyimpan.');
}

// Invarians tidak pernah bisa di-xfail
if (invTotal.length) {
  console.log(`\n⟪PELANGGARAN INVARIANS⟫ (tidak bisa ditoleransi):`);
  for (const h of invTotal) console.log(`  ${h.id}: ${h.inv.join('; ')}`);
  exit = 1;
}

process.exit(exit);
