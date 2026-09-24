#!/usr/bin/env node
// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah nomor identitas PALSU untuk menguji pagar data pribadi.
// ─── EV-05: siapkan instrumen panel penilai MANUSIA (30 sampel berlapis) ──────
//
// MENGAPA ADA
//   Kriteria terima EV-05 berbunyi: "panel penilai manusia 30 sampel; skor
//   relevansi penilai ≥ 4/5". Skor itu hanya sah bila datang dari ORANG, bukan
//   dari skrip. Karena itu yang dapat disiapkan oleh repo ini adalah
//   INSTRUMENNYA: sampel berlapis, rubrik, lembar penilaian, dan alat hitung.
//   Repo ini TIDAK dan TIDAK AKAN mengisi skornya sendiri.
//
// YANG DIHASILKAN (semua di verifikasi/, bisa dibuka tanpa jaringan)
//   panel-penilai-30.json — 30 sampel + bukti + rubrik (bahan mentah penilaian)
//   panel-penilai-30.csv  — lembar isian untuk lembar kerja (Excel/LibreOffice)
//   panel-penilai-30.html — lembar penilaian mandiri: tampil di browser mana pun,
//                           tanpa aset luar, hasil diunduh sebagai CSV/JSON
//
// SAMPEL (berlapis, deterministik)
//   30 item = 3 item per niat dari 9 niat (E01–E30) → tiap niat terwakili sama
//   banyak, jadi skor rata-rata tidak didominasi satu jenis pertanyaan.
//
// Pakai:
//   SAPA_EVAL_URL=http://127.0.0.1:3181 node scripts/siapkan-panel-penilai.mjs
//   node scripts/siapkan-panel-penilai.mjs --tanpa-jalan   # pakai sampel lama
//
// Keluar: 0 = berkas tertulis, 1 = ada 16 digit (NIK) pada bahan → DIBATALKAN,
//         2 = aplikasi tidak dapat dihubungi.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const ada = (n) => argv.some((a) => a === `--${n}`);
const BASE = (process.env.SAPA_EVAL_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const DIR = path.join(root, 'verifikasi');
const JSN = path.join(DIR, 'panel-penilai-30.json');
const CSV = path.join(DIR, 'panel-penilai-30.csv');
const HTM = path.join(DIR, 'panel-penilai-30.html');
const NIAT = ['nilai_saat_ini', 'tren', 'perbandingan', 'peringkat', 'komposisi', 'distribusi', 'meta_katalog', 'sebab', 'personal'];

const RUBRIK = [
  { kunci: 'relevansi', tanya: 'Apakah jawaban menjawab pertanyaan yang diajukan?', 1: 'tidak menjawab / salah topik', 3: 'menjawab sebagian', 5: 'menjawab tepat sasaran' },
  { kunci: 'bukti', tanya: 'Apakah angka & klaim di jawaban benar-benar ada di daftar bukti?', 1: 'ada angka/klaim di luar bukti', 3: 'sebagian tidak dapat ditelusuri', 5: 'semua dapat ditelusuri ke bukti' },
  { kunci: 'jujur', tanya: 'Apakah batas data dinyatakan apa adanya (tidak mengarang)?', 1: 'mengarang / menyembunyikan batas', 3: 'batas disebut samar', 5: 'batas/ketiadaan data dinyatakan tegas' },
];

// Aplikasi membatasi laju permintaan (rate limit). 30 sampel tidak boleh gagal
// hanya karena itu: tunggu jendela pembatasnya lalu ulangi — sama seperti
// `scripts/eval-run.mjs` menunggu 62 detik tiap 24 permintaan.
const JEDA_MS = Number(process.env.SAPA_PANEL_JEDA_MS ?? 1200);
const JENDELA_MS = 62_000;
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

const minta = async (pertanyaan, percobaan = 4) => {
  for (let i = 0; i < percobaan; i++) {
    const r = await fetch(`${BASE}/api/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: pertanyaan }),
    });
    if (r.status === 429) {
      process.stdout.write(`       (terbatas laju — menunggu ${JENDELA_MS / 1000} dtk)\n`);
      await tidur(JENDELA_MS);
      continue;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  throw new Error('HTTP 429 berulang — batas laju tidak juga longgar');
};

async function kumpulkan() {
  const set = JSON.parse(fs.readFileSync(path.join(root, 'data', 'eval-set.json'), 'utf8'));
  const item = set.item.filter((i) => /^E\d+$/.test(i.id));
  // 27 = 3 item × 9 niat; tiga sisanya diambil dari niat yang punya item keempat
  // (E07 tren, E14 peringkat, E27 sebab) supaya panel tetap genap 30 sampel —
  // jumlah yang dituntut kriteria terima EV-05.
  const pilih = [];
  for (const n of NIAT) {
    const milik = item.filter((i) => i.niat === n).slice(0, 3);
    if (milik.length < 3) throw new Error(`niat ${n} hanya punya ${milik.length} item`);
    pilih.push(...milik);
  }
  const terpakai = new Set(pilih.map((i) => i.id));
  const sisa = item.filter((i) => !terpakai.has(i.id)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, 30 - pilih.length);
  pilih.push(...sisa);
  if (pilih.length !== 30) throw new Error(`hanya ${pilih.length} sampel terkumpul`);
  const sampel = [];
  for (const it of pilih) {
    const d = await minta(it.pertanyaan.replace('{{NIK_UJI}}', '1234567890123456'));
    sampel.push({
      id: it.id,
      niat: it.niat,
      mode: it.harus,
      pertanyaan: it.pertanyaan,
      niatServer: d.niat ?? null,
      bentuk: d.bentuk?.label ?? null,
      jalur: d.diagnosa?.jalur ?? null,
      narasi: d.narasi ?? '',
      bukti: (d.evidence ?? []).slice(0, 6).map((e) => ({
        id: e.id ?? null, indikator: e.indikator, tahun: e.tahun ?? null, opd: e.opd ?? null, nilai: e.nilai ?? null,
      })),
      jumlahBukti: (d.evidence ?? []).length,
      // Seluruh angka dari SELURUH baris bukti (bukan hanya 6 yang ditampilkan):
      // praskor mesin memeriksa apakah angka di narasi ada di bukti, dan tanpa
      // daftar penuh ia akan menuduh angka yang sah sebagai karangan.
      buktiAngka: [...new Set((d.evidence ?? []).flatMap((e) => [String(e.nilai ?? ''), String(e.tahun ?? '')]))].filter(Boolean),
    });
    process.stdout.write(`  ${it.id} ${it.niat.padEnd(15)} bukti ${String((d.evidence ?? []).length).padStart(2)}\n`);
    await tidur(JEDA_MS);
  }
  return { dibuat: new Date().toISOString(), target: BASE, jumlah: sampel.length, rubrik: RUBRIK, sampel };
}

const bersihDariNik = (teks) => !/\b\d{16}\b/.test(String(teks).replace(/[.,\s]/g, ''));

async function utama() {
  let data;
  if (ada('tanpa-jalan')) {
    if (!fs.existsSync(JSN)) { console.error(`[GAGAL] tidak ada ${JSN}`); process.exit(2); }
    data = JSON.parse(fs.readFileSync(JSN, 'utf8'));
    console.log(`[info] memakai sampel lama (${data.jumlah}) — tanpa memanggil aplikasi.`);
  } else {
    console.log(`[info] mengambil 30 sampel dari ${BASE} …`);
    try { data = await kumpulkan(); } catch (e) {
      console.error(`[GAGAL] aplikasi tidak dapat dihubungi: ${e.message}`);
      process.exit(2);
    }
  }

  // Penjaga: bahan penilaian tidak boleh memuat NIK apa adanya.
  if (!bersihDariNik(JSON.stringify(data))) {
    console.error('[GAGAL] bahan panel memuat 16 digit (pola NIK) — berkas TIDAK ditulis.');
    process.exit(1);
  }

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(JSN, JSON.stringify(data, null, 2) + '\n');

  // CSV untuk lembar kerja
  const kepala = ['id', 'niat', 'mode', 'pertanyaan', 'narasi', 'jumlahBukti', ...RUBRIK.map((r) => `penilai1_${r.kunci}`), ...RUBRIK.map((r) => `penilai2_${r.kunci}`), 'catatan'];
  const sel = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const baris = data.sampel.map((s) => [s.id, s.niat, s.mode, s.pertanyaan, s.narasi, s.jumlahBukti,
    ...RUBRIK.map(() => ''), ...RUBRIK.map(() => ''), ''].map(sel).join(','));
  fs.writeFileSync(CSV, [kepala.map(sel).join(','), ...baris].join('\n') + '\n');

  fs.writeFileSync(HTM, halamanHtml(data));
  console.log(`\n✓ tertulis: ${path.relative(root, JSN)} · ${path.relative(root, CSV)} · ${path.relative(root, HTM)}`);
  console.log(`  30 sampel, 3 dimensi × 2 penilai, ambang lulus: rata-rata relevansi ≥ 4/5.`);
  process.exit(0);
}

// ─── lembar penilaian mandiri (tanpa aset luar, aman dibuka dari berkas) ─────
function halamanHtml(data) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const kartu = data.sampel.map((s) => `
  <section class="kartu" data-id="${esc(s.id)}">
    <h3>${esc(s.id)} · <span class="niat">${esc(s.niat)}</span> <span class="mode">mode ${esc(s.mode)}</span></h3>
    <p class="tanya"><strong>Pertanyaan:</strong> ${esc(s.pertanyaan)}</p>
    <p class="jawab"><strong>Jawaban sistem:</strong> ${esc(s.narasi)}</p>
    <details><summary>Bukti yang dipakai (${s.bukti.length} dari ${s.jumlahBukti})</summary>
      <ul>${s.bukti.map((b) => `<li>${esc(b.indikator)} — ${esc(b.nilai ?? '')} ${esc(b.tahun ?? 'tanpa tahun')} (${esc(b.opd ?? '')})</li>`).join('')}</ul>
    </details>
    ${RUBRIK.map((r) => `
    <fieldset class="rubrik" data-dimensi="${esc(r.kunci)}">
      <legend>${esc(r.tanya)}</legend>
      ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="p1-${esc(s.id)}-${esc(r.kunci)}" value="${n}" data-berkas="penilai1" data-id="${esc(s.id)}" data-dim="${esc(r.kunci)}"> ${n}</label>`).join('')}
      <span class="petunjuk">1 = ${esc(r[1])} · 3 = ${esc(r[3])} · 5 = ${esc(r[5])}</span>
    </fieldset>`).join('')}
    <label class="catatan">Catatan (opsional)<br><textarea rows="2" data-id="${esc(s.id)}"></textarea></label>
  </section>`).join('');

  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel penilai — SAPA (EV-05)</title>
<style>
  :root { color-scheme: light; }
  body { font: 16px/1.55 system-ui, sans-serif; margin: 0; padding: 1.25rem; max-width: 60rem; background: #f7f7f5; color: #14181d; }
  h1 { font-size: 1.5rem; margin: 0 0 .35rem; } h2 { font-size: 1.05rem; margin: 1.4rem 0 .5rem; }
  .pengantar { background: #fff; border: 1px solid #d8d8d2; border-radius: .5rem; padding: .9rem 1rem; }
  .kartu { background: #fff; border: 1px solid #d8d8d2; border-radius: .5rem; padding: .9rem 1rem; margin: 0 0 1rem; }
  .kartu h3 { margin: 0 0 .5rem; font-size: 1rem; }
  .niat { font-weight: 600; color: #26456b; } .mode { color: #5b6270; font-weight: 400; font-size: .85rem; }
  .tanya, .jawab { margin: .3rem 0; } .jawab { background: #f2f6f2; border-left: 3px solid #4a7d4a; padding: .5rem .6rem; }
  details { margin: .5rem 0; } details ul { margin: .35rem 0 .35rem 1.1rem; font-size: .9rem; color: #404652; }
  fieldset.rubrik { border: 1px solid #dfdfd8; border-radius: .4rem; padding: .5rem .6rem; margin: .45rem 0; }
  fieldset.rubrik legend { font-weight: 600; font-size: .9rem; }
  fieldset.rubrik label { margin-right: .75rem; }
  .petunjuk { display: block; font-size: .8rem; color: #5b6270; margin-top: .2rem; }
  textarea { width: 100%; font: inherit; }
  .tombol { position: sticky; bottom: 0; background: #f7f7f5; padding: .75rem 0; border-top: 1px solid #d8d8d2; display: flex; gap: .6rem; flex-wrap: wrap; }
  button { font: inherit; padding: .5rem .9rem; border-radius: .4rem; border: 1px solid #26456b; background: #26456b; color: #fff; cursor: pointer; }
  button.jenis2 { background: #fff; color: #26456b; }
  #status { align-self: center; color: #404652; }
  @media (prefers-color-scheme: dark) { body { background: #14181d; color: #eceff3; } .kartu, .pengantar { background: #1d232b; border-color: #333b46; } .jawab { background: #1b2a1e; } #status { color: #c3c9d2; } }
</style></head><body>
<h1>Panel penilai manusia — SAPA (EV-05)</h1>
<div class="pengantar">
  <p><strong>30 sampel</strong> (3 per niat; ${esc(data.jumlah)} total), diambil ${esc(String(data.dibuat).slice(0, 10))} dari
  <code>${esc(data.target)}</code>. Nilailah <em>setiap</em> sampel pada tiga dimensi 1–5.
  Ambang kriteria terima: <strong>rata-rata dimensi “relevansi” ≥ 4,0</strong>.</p>
  <p>Berkas ini berjalan tanpa jaringan. Isian disimpan di peramban (localStorage) sementara Anda mengerjakan;
  tekan <em>Unduh CSV</em> lalu jalankan:</p>
  <p><code>node scripts/hitung-panel.mjs --berkas=panel-penilai-hasil.csv</code></p>
</div>
<h2>Sampel</h2>
${kartu}
<div class="tombol">
  <button type="button" id="unduh">Unduh CSV hasil</button>
  <button type="button" class="jenis2" id="unduh-json">Unduh JSON</button>
  <button type="button" class="jenis2" id="bersih">Kosongkan isian</button>
  <span id="status"></span>
</div>
<script>
  var KUNCI = 'sapa-panel-ev05';
  var state = JSON.parse(localStorage.getItem(KUNCI) || '{}');
  function simpan() { localStorage.setItem(KUNCI, JSON.stringify(state)); hitung(); }
  function hitung() {
    var total = 0, terisi = 0;
    document.querySelectorAll('input[type=radio]').forEach(function (r) { total++; if (r.checked) terisi++; });
    document.getElementById('status').textContent = terisi + ' / ' + total + ' penilaian terisi';
  }
  document.querySelectorAll('input[type=radio]').forEach(function (r) {
    var kunci = r.dataset.id + '|' + r.dataset.dim;
    if (state[kunci] === Number(r.value)) r.checked = true;
    r.addEventListener('change', function () { state[kunci] = Number(r.value); simpan(); });
  });
  document.querySelectorAll('textarea').forEach(function (t) {
    if (state['cat|' + t.dataset.id]) t.value = state['cat|' + t.dataset.id];
    t.addEventListener('input', function () { state['cat|' + t.dataset.id] = t.value; simpan(); });
  });
  function unduh(nama, teks, jenis) {
    var b = new Blob([teks], { type: jenis });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = nama; a.click();
    URL.revokeObjectURL(a.href);
  }
  document.getElementById('unduh').onclick = function () {
    var baris = ['id,dimensi,nilai,catatan'];
    document.querySelectorAll('.kartu').forEach(function (k) {
      var id = k.dataset.id, cat = (state['cat|' + id] || '').replace(/"/g, '""');
      ['relevansi', 'bukti', 'jujur'].forEach(function (d) {
        var v = state[id + '|' + d];
        baris.push(id + ',' + d + ',' + (v == null ? '' : v) + ',"' + cat + '"');
      });
    });
    unduh('panel-penilai-hasil.csv', baris.join('\\n') + '\\n', 'text/csv;charset=utf-8');
  };
  document.getElementById('unduh-json').onclick = function () {
    unduh('panel-penilai-hasil.json', JSON.stringify(state, null, 2), 'application/json');
  };
  document.getElementById('bersih').onclick = function () {
    if (!confirm('Kosongkan semua isian?')) return;
    localStorage.removeItem(KUNCI); location.reload();
  };
  hitung();
</script></body></html>`;
}

await utama();
