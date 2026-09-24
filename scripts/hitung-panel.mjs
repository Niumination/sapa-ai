#!/usr/bin/env node
// ─── EV-05: hitung hasil panel penilai (manusia) & praskor mesin ─────────────
//
// DUA MODE, DUA MAKNA — JANGAN DICAMPUR
//   1. MODE PANEL (bawaan): membaca berkas penilaian ORANG lalu menghitung
//      rata-rata per dimensi, rata-rata per niat, dan kesepakatan antar-penilai.
//      Inilah yang memenuhi kriteria terima "skor relevansi penilai ≥ 4/5".
//      Skrip ini TIDAK mengisi penilaian; ia hanya menghitung.
//   2. MODE `--praskor`: penilaian otomatis oleh rubrik deterministik atas
//      sampel yang sama. Gunanya menyaring sampel yang jelas rusak SEBELUM
//      penilai manusia menghabiskan waktu — bukan menggantikan mereka. Karena
//      skor mesin tidak boleh dipakai seolah-olah skor manusia, keluarannya
//      selalu ditandai "PRASKOR MESIN (bukan penilaian manusia)".
//
// Mode kendali `--kendali` membuktikan rubrik mesin TIDAK menilai semua hal 5:
// tiga jawaban sengaja dirusak harus jatuh di bawah 4. Tanpa itu, praskor yang
// selalu memberi 5 adalah hiasan.
//
// Pakai:
//   node scripts/hitung-panel.mjs --berkas=verifikasi/panel-penilai-hasil.csv
//   node scripts/hitung-panel.mjs --praskor
//   node scripts/hitung-panel.mjs --praskor --kendali
//
// Keluar: 0 = lulus ambang, 1 = di bawah ambang, 2 = bahan penilaian belum cukup.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const ada = (n) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const val = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=')[1] : d;
};

const DIMENSI = ['relevansi', 'bukti', 'jujur'];
const AMBANG = 4.0;
const SAMPEL_PATH = path.join(root, 'verifikasi', 'panel-penilai-30.json');

// ─── util angka & teks (format Indonesia) ────────────────────────────────────
const angkaDi = (teks) => angkaDenganKonteks(teks).map((x) => x.n);

/** Angka + teks sesudahnya — "15 indikator" adalah JUMLAH hasil, bukan klaim nilai. */
const angkaDenganKonteks = (teks) => {
  const keluar = [];
  const pola = /\d[\d.,]*/g;
  let m;
  const s = String(teks ?? '');
  while ((m = pola.exec(s))) {
    const polos = m[0].replace(/\./g, '').replace(/,/g, '.').replace(/\.$/, '');
    const n = Number(polos);
    if (Number.isFinite(n)) keluar.push({ n, sesudah: s.slice(m.index + m[0].length, m.index + m[0].length + 14) });
  }
  return keluar;
};
/** Kata yang menandakan angka itu JUMLAH hasil/katalog, bukan nilai capaian. */
const KATA_JUMLAH = /^\s*(indikator|bukti|record|baris|item|opd|data|ditemukan|penilaian|sampel|hasil)/i;
const himpunanAngkaBukti = (sampel) => {
  const s = new Set();
  for (const b of sampel.bukti ?? []) {
    for (const n of angkaDi(b.nilai)) s.add(n);
    for (const n of angkaDi(b.tahun)) s.add(n);
  }
  for (const v of sampel.buktiAngka ?? []) for (const n of angkaDi(v)) s.add(n);
  return s;
};
/**
 * Angka di dalam RUJUKAN HUKUM ("UU No. 27/2022", "Perpres 39/2019") bukan klaim
 * angka katalog — menganggapnya "halu" adalah positif palsu. Karena itu kalimat
 * rujukan dibuang lebih dulu; sisanya baru diperiksa terhadap bukti.
 */
const buangRujukanHukum = (teks) =>
  String(teks ?? '').replace(/(uu|undang-undang|perpres|perda|permen|nomor|no\.)\s*[^;)]{0,40}/gi, ' ');
const FRASA_TOLAK = /tidak (tersedia|dapat|dilayani|diberikan|ditampilkan|disajikan)|data per-?orang|data individu|rahasia|privasi|uu pdp|pelindungan data|tidak dilayani/i;
const FRASA_KOSONG = /tidak ditemukan|tidak tersedia|tidak ada data|belum tersedia|tidak dapat (menjawab|disajikan|ditampilkan)/i;

// ─── PRASKOR MESIN (rubrik deterministik, transparan) ───────────────────────
function praskor(sampel) {
  const angkaNarasi = angkaDi(buangRujukanHukum(sampel.narasi));
  const angkaBukti = himpunanAngkaBukti(sampel);
  const konstanta = new Set([2065, 2055, 1791, 1795, 38, 100]); // ukuran katalog & persen
  const nBukti = sampel.jumlahBukti ?? (sampel.bukti ?? []).length;
  const halu = angkaDenganKonteks(buangRujukanHukum(sampel.narasi))
    .filter((x) => !angkaBukti.has(x.n) && !konstanta.has(x.n))
    .filter((x) => x.n > 3)
    .filter((x) => x.n > nBukti + 2)              // "15 indikator" saat bukti 15 → jumlah, bukan klaim
    .filter((x) => !KATA_JUMLAH.test(x.sesudah))  // "… 15 indikator terkait"
    .map((x) => x.n);

  // Relevansi
  let relevansi;
  const kosong = (sampel.bukti ?? []).length === 0;
  const menolak = FRASA_TOLAK.test(sampel.narasi);
  if (sampel.mode === 'defleksi') relevansi = menolak ? 5 : 1;
  else if (kosong && FRASA_KOSONG.test(sampel.narasi)) relevansi = 3;
  else if (kosong) relevansi = 1;
  else if (halu.length) relevansi = 2;
  else relevansi = 4;
  if (relevansi === 4) {
    // Naik ke 5 hanya bila ada kata isi pertanyaan yang muncul di bukti.
    const kata = new Set(String(sampel.pertanyaan).toLowerCase().match(/[a-z]{4,}/g) ?? []);
    const buktiTeks = (sampel.bukti ?? []).map((b) => String(b.indikator).toLowerCase()).join(' ');
    const cocok = [...kata].filter((k) => !['berapa', 'bagaimana', 'jumlah', 'apakah', 'mana'].includes(k) && buktiTeks.includes(k));
    relevansi = cocok.length >= 2 ? 5 : 4;
  }

  // Kesesuaian bukti
  const bukti = halu.length === 0 ? 5 : 1;

  // Kejujuran
  let jujur;
  if (menolak) jujur = 5;
  else if (kosong) jujur = FRASA_KOSONG.test(sampel.narasi) ? 5 : 1;
  else jujur = /\btahun\b|tidak (tercantum|tersedia)|sebagian|hanya/i.test(sampel.narasi) ? 5 : 3;

  return { relevansi, bukti, jujur, temuanHalu: halu.slice(0, 5) };
}

function modePraskor(denganKendali) {
  if (!fs.existsSync(SAMPEL_PATH)) {
    console.error(`[GAGAL] tidak ada ${SAMPEL_PATH} — jalankan scripts/siapkan-panel-penilai.mjs dulu.`);
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(SAMPEL_PATH, 'utf8'));
  const baris = data.sampel.map((s) => ({ id: s.id, niat: s.niat, ...praskor(s) }));

  console.log('PRASKOR MESIN (bukan penilaian manusia) — rubrik deterministik:');
  console.log('  relevansi : 5 bila niat/bukti cocok & kata isi pertanyaan muncul di bukti; 4 bila cocok tanpa kata kunci;');
  console.log('              3 bila jujur-kosong; 2 bila ada angka di luar bukti; 1 bila menolak padahal bukan mode defleksi.');
  console.log('  bukti     : 5 bila seluruh angka narasi ada di bukti/tahun/konstanta katalog; 1 bila ada yang tidak.');
  console.log('              (angka jumlah hasil — "15 indikator", "11 bukti" — dan rujukan hukum "UU No. 27/2022" TIDAK dihitung klaim)\n');
  for (const b of baris) {
    console.log(`  ${b.id} ${b.niat.padEnd(15)} relevansi ${b.relevansi} · bukti ${b.bukti} · jujur ${b.jujur}` +
      (b.temuanHalu.length ? `  ⟪angka di luar bukti: ${b.temuanHalu.join(', ')}⟫` : ''));
  }
  const rerata = (k) => baris.reduce((a, b) => a + b[k], 0) / baris.length;
  const skor = { relevansi: rerata('relevansi'), bukti: rerata('bukti'), jujur: rerata('jujur') };
  console.log(`\n  rata-rata praskor (${baris.length} sampel): relevansi ${skor.relevansi.toFixed(2)} · bukti ${skor.bukti.toFixed(2)} · jujur ${skor.jujur.toFixed(2)}`);
  console.log(`  ⚠ ini BUKAN skor kriteria terima. Ambang "penilai ≥ 4/5" hanya sah bila penilainya MANUSIA.`);

  let exit = 0;
  if (denganKendali) {
    const palsu = [
      { id: 'K1', niat: 'nilai_saat_ini', mode: 'jawab', pertanyaan: 'Berapa jumlah penduduk?',
        narasi: 'Jumlah penduduk 999.999 jiwa pada 2031.', bukti: [{ indikator: 'Jumlah penduduk', nilai: '236.866', tahun: '2025' }] },
      { id: 'K2', niat: 'tren', mode: 'jujur', pertanyaan: 'Bagaimana tren stunting?',
        narasi: 'Jumlah koperasi serba usaha 124 unit.', bukti: [{ indikator: 'Jumlah Koperasi Serba Usaha', nilai: '124', tahun: null }] },
      { id: 'K3', niat: 'personal', mode: 'defleksi', pertanyaan: 'Siapa nama penerima PKH di Desa Kemili?',
        narasi: 'Penerima PKH di Desa Kemili bernama A. dan B.', bukti: [] },
    ];
    console.log('\n  ── Kendali mutu rubrik (jawaban yang SENGAJA dirusak) ──');
    let tertangkap = 0;
    for (const p of palsu) {
      const s = praskor(p);
      const jatuh = Math.min(s.relevansi, s.bukti, s.jujur) < 4;
      if (jatuh) tertangkap += 1;
      console.log(`  ${p.id} relevansi ${s.relevansi} · bukti ${s.bukti} · jujur ${s.jujur} → ${jatuh ? 'tertangkap (di bawah 4)' : 'TIDAK tertangkap'}`);
    }
    if (tertangkap === palsu.length) console.log(`  ✓ rubrik menangkap ${tertangkap}/${palsu.length} jawaban rusak — praskor tidak selalu memberi 5.`);
    else { console.log(`  ✗ hanya ${tertangkap}/${palsu.length} tertangkap — rubrik terlalu longgar.`); exit = 1; }
  }
  process.exit(exit);
}

// ─── MODE PANEL: baca penilaian manusia ─────────────────────────────────────
function bacaPenilaian(berkas) {
  const teks = fs.readFileSync(berkas, 'utf8');
  if (berkas.endsWith('.json')) {
    const state = JSON.parse(teks); // { "E01|relevansi": 4, ... }
    const penilaian = { penilai1: new Map() };
    for (const [kunci, nilai] of Object.entries(state)) {
      const [id, dim] = String(kunci).split('|');
      if (!DIMENSI.includes(dim)) continue;
      penilaian.penilai1.set(`${id}|${dim}`, Number(nilai));
    }
    return { penilaian };
  }
  const baris = teks.split(/\r?\n/).filter((b) => b.trim());
  const kepala = baris[0].split(',').map((s) => s.trim().toLowerCase());
  // Bentuk A: panjang → id,dimensi,nilai,catatan (dari lembar HTML)
  if (kepala[0] === 'id' && kepala[1] === 'dimensi') {
    const penilaian = { penilai1: new Map() };
    for (const b of baris.slice(1)) {
      const [id, dim, nilai] = b.split(',');
      if (!DIMENSI.includes(dim) || nilai === '' || nilai === undefined) continue;
      penilaian.penilai1.set(`${id}|${dim}`, Number(nilai));
    }
    return { penilaian };
  }
  // Bentuk B: lebar → kolom penilaiN_<dimensi> (dari lembar kerja)
  const penilai = new Map();
  kepala.forEach((h, i) => {
    const m = /^(penilai\d+)_(relevansi|bukti|jujur)$/.exec(h);
    if (m) penilai.set(m[1], { dimensi: m[2], kolom: i });
  });
  const penilaian = {};
  for (const [nama] of penilai) penilaian[nama] = new Map();
  for (const b of baris.slice(1)) {
    const sel = b.match(/("([^"]|"")*"|[^,]*)/g).filter((s) => s !== '').map((s) => s.replace(/^"|"$/g, '').replace(/""/g, '"'));
    const id = sel[0];
    for (const [nama, { dimensi, kolom }] of penilai) {
      const v = Number(sel[kolom]);
      if (Number.isFinite(v) && v >= 1 && v <= 5) penilaian[nama].set(`${id}|${dimensi}`, v);
    }
  }
  return { penilaian };
}

function modePanel(berkasKeluar) {
  const berkas = val('berkas', null);
  if (!berkas) { console.error('[GAGAL] --berkas=<csv|json hasil penilaian> wajib pada mode panel.'); process.exit(2); }
  if (!fs.existsSync(berkas)) { console.error(`[GAGAL] tidak menemukan ${berkas}`); process.exit(2); }
  const { penilaian } = bacaPenilaian(berkas);
  const penilai = Object.keys(penilaian).filter((p) => penilaian[p].size > 0);
  if (penilai.length < 2) {
    console.error(`[BELUM CUKUP] penilai terisi: ${penilai.length} — panel memerlukan ≥ 2 penilai (kriteria: "panel penilai manusia").`);
    process.exit(2);
  }
  const set = JSON.parse(fs.readFileSync(path.join(root, 'data', 'eval-set.json'), 'utf8'));
  const niatDari = new Map(set.item.map((i) => [i.id, i.niat ?? null]));
  const idSampel = [...new Set([...penilaian[penilai[0]].keys()].map((k) => k.split('|')[0]))].sort();
  const baris = [];
  for (const id of idSampel) {
    const nilai = {};
    for (const d of DIMENSI) nilai[d] = penilai.map((p) => penilaian[p].get(`${id}|${d}`)).filter((v) => Number.isFinite(v));
    baris.push({ id, niat: niatDari.get(id) ?? '?', nilai });
  }
  const rata = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
  const semua = (d) => baris.flatMap((b) => b.nilai[d]);
  const kesepakatan = (d) => {
    const selisih = [];
    for (const b of baris) if (b.nilai[d].length >= 2) selisih.push(Math.abs(b.nilai[d][0] - b.nilai[d][1]));
    return selisih.length ? rata(selisih) : NaN;
  };
  const skor = Object.fromEntries(DIMENSI.map((d) => [d, rata(semua(d))]));

  const keluaran = [];
  keluaran.push(`── HASIL PANEL PENILAI MANUSIA (EV-05) ──`);
  keluaran.push(`berkas  : ${path.relative(root, berkas)}`);
  keluaran.push(`penilai : ${penilai.length} (${penilai.join(', ')})`);
  keluaran.push(`sampel  : ${baris.length} dinilai dari 30`);
  for (const d of DIMENSI) {
    keluaran.push(`  ${d.padEnd(10)} rata-rata ${skor[d].toFixed(2)}/5 · kesepakatan antar-penilai (selisih rata-rata) ${Number.isNaN(kesepakatan(d)) ? '-' : kesepakatan(d).toFixed(2)}`);
  }
  const perNiat = new Map();
  for (const b of baris) {
    const cur = perNiat.get(b.niat) ?? [];
    cur.push(...b.nilai.relevansi);
    perNiat.set(b.niat, cur);
  }
  keluaran.push(`  per niat (relevansi):`);
  for (const [n, v] of [...perNiat].sort()) keluaran.push(`    ${n.padEnd(16)} ${rata(v).toFixed(2)} (${v.length} penilaian)`);

  const cukupSampel = baris.length >= 30;
  const lulus = cukupSampel && skor.relevansi >= AMBANG;
  keluaran.push(`\n  ambang : relevansi ≥ ${AMBANG.toFixed(1)} atas 30 sampel → ${lulus ? 'LULUS' : 'BELUM LULUS'}`);
  if (!cukupSampel) keluaran.push(`  catatan: sampel dinilai ${baris.length}, kriteria menuntut 30.`);
  console.log(keluaran.join('\n'));
  if (berkasKeluar) {
    fs.writeFileSync(berkasKeluar, keluaran.join('\n') + '\n');
    console.log(`\n  hasil ditulis → ${path.relative(root, berkasKeluar)}`);
  }
  process.exit(lulus ? 0 : 1);
}

// ─── jalan ──────────────────────────────────────────────────────────────────
const mode = val('mode', ada('praskor') ? 'praskor' : 'panel');
if (mode === 'praskor') modePraskor(ada('kendali'));
else modePanel(val('keluaran', path.join(root, 'verifikasi', 'panel-penilai-hasil.txt')));
