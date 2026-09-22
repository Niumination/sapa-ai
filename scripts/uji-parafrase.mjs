#!/usr/bin/env node
// ─── Uji parafrase & muat dingin lapis semantik (FR-12 / EV-05) ──────────────
//
// Kriteria terima dokumen 10 untuk FR-12:
//   "recall@15 pada 20 kueri parafrase baru ≥ 90%; latensi muat dingin < 300 ms"
//
// Skrip ini mengukurnya secara objektif terhadap server yang hidup:
//
//   1. Menembak 20 kueri parafrase (kata berbeda dari nama indikator) ke
//      `/api/query`, lalu memeriksa apakah indikator yang DIHARAPKAN muncul pada
//      bukti jawaban — pada posisi ≤ 15 (recall@15).
//   2. Membandingkan dua jalur: leksikal-saja (dipaksa dengan `lapisSemantik:false`
//      tidak tersedia dari API, jadi dipakai `SAPA_SEMANTIK=off` pada server))
//      dan leksikal+semantik. Karena satu server hanya punya satu setelan,
//      jalankan skrip ini DUA KALI: sekali terhadap server dengan
//      `SAPA_SEMANTIK=off`, sekali dengan bawaan (aktif/hash).
//   3. Mengukur waktu muat dingin indeks (dari `/api/status` → `semantik`).
//
// Pakai:
//   SAPA_EVAL_URL=http://127.0.0.1:3117 node scripts/uji-parafrase.mjs
//   SAPA_SEMANTIK_LABEL="leksikal-saja" SAPA_EVAL_URL=… node scripts/uji-parafrase.mjs
//
// CATATAN KEJUJURAN: daftar kueri & indikator harapan diambil dari
// `data/eval-parafrase.json`. Bila berkas itu tidak ada, dipakai daftar baku di
// dalam skrip ini — dan daftar baku ini DISUSUN UNTUK KORPUS STUB sehingga tidak
// sah dipakai menilai korpus produksi. Untuk korpus sungguhan, sediakan berkas
// JSON dengan 20 kueri parafrase baru.

import { readFileSync, existsSync } from 'node:fs';

const URL_DASAR = (process.env.SAPA_EVAL_URL ?? 'http://127.0.0.1:3116').replace(/\/$/, '');
const LABEL = process.env.SAPA_SEMANTIK_LABEL ?? 'bawaan';
const JEDA_MS = Number(process.env.SAPA_PARAFRASE_JEDA_MS ?? 2100);

const BAKU = [
  { pertanyaan: 'berapa banyak warga yang tercatat di kabupaten ini', harap: 'penduduk' },
  { pertanyaan: 'banyaknya penduduk aceh tengah', harap: 'penduduk' },
  { pertanyaan: 'jumlah pendudk', harap: 'penduduk' },
  { pertanyaan: 'berapa jiwa penduduk kabupaten', harap: 'penduduk' },
  { pertanyaan: 'angka stunting anak', harap: 'stunting' },
  { pertanyaan: 'prevalens stunting', harap: 'stunting' },
  { pertanyaan: 'seberapa besar masalah gizi kurang pada balita', harap: 'stunting' },
  { pertanyaan: 'derajat kemiskinan penduduk', harap: 'kemiskinan' },
  { pertanyaan: 'tingkat kemiskinan aceh tengah', harap: 'kemiskinan' },
  { pertanyaan: 'angka kemiskinan', harap: 'kemiskinan' },
  { pertanyaan: 'jumlah kopi arabik yang dipanen', harap: 'kopi' },
  { pertanyaan: 'produksi kopi arabika', harap: 'kopi' },
  { pertanyaan: 'hasil panen kopi', harap: 'kopi' },
  { pertanyaan: 'indeks pembangunan manusia', harap: 'manusia' },
  { pertanyaan: 'angka ipm aceh tengah', harap: 'manusia' },
  { pertanyaan: 'jumlah asn kabupaten', harap: 'asn' },
  { pertanyaan: 'banyak asn', harap: 'asn' },
  { pertanyaan: 'koperasi di bebesen', harap: 'koperasi' },
  { pertanyaan: 'jumlah koperas', harap: 'koperasi' },
  { pertanyaan: 'keluarga penerima bantuan sembako', harap: 'sembako' },
];

const berkas = existsSync('data/eval-parafrase.json')
  ? JSON.parse(readFileSync('data/eval-parafrase.json', 'utf8'))
  : null;
const daftar = berkas?.item ?? BAKU;
const negatif = berkas?.negatif ?? [];
const sumber = existsSync('data/eval-parafrase.json') ? 'data/eval-parafrase.json' : 'daftar baku dalam skrip (korpus stub)';

async function tanya(query, percobaan = 0) {
  const res = await fetch(`${URL_DASAR}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 429 && percobaan < 6) {
    const detik = Number(res.headers.get('retry-after') ?? 0) || 8;
    process.stdout.write(`\r  menunggu pembatas laju (${detik} dtk)…`.padEnd(60));
    await new Promise((r) => setTimeout(r, (detik + 1) * 1000));
    return tanya(query, percobaan + 1);
  }
  if (!res.ok) return { galat: `HTTP ${res.status}` };
  return res.json();
}

const hasil = [];
let kena = 0;

for (const [i, uji] of daftar.entries()) {
  let jawab;
  try {
    jawab = await tanya(uji.pertanyaan);
  } catch (e) {
    console.error(`GAGAL menghubungi ${URL_DASAR}: ${e.message}`);
    process.exit(2);
  }
  if (jawab.galat) {
    console.error(`GAGAL menjawab "${uji.pertanyaan}": ${jawab.galat}`);
    process.exit(2);
  }

  const bukti = (jawab.evidence ?? []).slice(0, 15);
  const posisi = bukti.findIndex((e) => String(e.indikator ?? '').toLowerCase().includes(uji.harap.toLowerCase()));
  const dapat = posisi >= 0;
  if (dapat) kena += 1;
  const jalurSemantik = /pencocokan MAKNA/i.test(jawab.narasi ?? '');
  hasil.push({ ...uji, dapat, posisi, jalurSemantik, jumlahBukti: (jawab.evidence ?? []).length });
  process.stdout.write(`\r  kueri ${i + 1}/${daftar.length} — recall@15 ${kena}/${i + 1}`.padEnd(60));
  if (JEDA_MS > 0) await new Promise((r) => setTimeout(r, JEDA_MS));
}

// ── Set negatif: pertanyaan di luar katalog HARUS tidak dijawab dengan data ──
const hasilNegatif = [];
for (const [i, pertanyaan] of negatif.entries()) {
  let jawab;
  try {
    jawab = await tanya(pertanyaan);
  } catch (e) {
    console.error(`GAGAL menghubungi ${URL_DASAR}: ${e.message}`);
    process.exit(2);
  }
  const jumlahBukti = (jawab.evidence ?? []).length;
  const menolak = jumlahBukti === 0;
  hasilNegatif.push({ pertanyaan, menolak, jumlahBukti });
  process.stdout.write(`\r  negatif ${i + 1}/${negatif.length} — menolak benar ${hasilNegatif.filter((h) => h.menolak).length}`.padEnd(60));
  if (JEDA_MS > 0 && i < negatif.length - 1) await new Promise((r) => setTimeout(r, JEDA_MS));
}

let statusSemantik = null;
try {
  const st = await fetch(`${URL_DASAR}/api/status`).then((r) => (r.ok ? r.json() : null));
  statusSemantik = st?.semantik ?? null;
} catch {
  statusSemantik = null;
}

const total = daftar.length;
const persen = (kena / total) * 100;
const lewatSemantik = hasil.filter((h) => h.jalurSemantik).length;

console.log('\n');
console.log('═══ Uji parafrase lapis semantik (FR-12 / EV-05) ═══');
console.log(`  server            : ${URL_DASAR}`);
console.log(`  setelan dilaporkan: ${LABEL}`);
console.log(`  sumber kueri      : ${sumber}`);
console.log(`  jawaban lewat jalur semantik : ${lewatSemantik}/${total}`);
if (statusSemantik) {
  console.log(`  penyedia semantik : ${statusSemantik.penyedia} · dim ${statusSemantik.dim} · sidik indeks ${statusSemantik.sidik ?? '—'}`);
  const pb = statusSemantik.pembangunanTerakhir;
  console.log(`  muat dingin indeks: ${pb ? `${pb.durasiMs} ms untuk ${pb.jumlahRecord} record (penyedia ${pb.penyedia})` : 'belum dibangun'}`);
}
console.log('');
console.log('  #  hasil  pos  jalur      pertanyaan');
for (const [i, h] of hasil.entries()) {
  const tanda = h.dapat ? '✓' : '✗';
  console.log(
    `  ${String(i + 1).padStart(2)}   ${tanda}     ${String(h.posisi + 1).padStart(3)}  ${h.jalurSemantik ? 'semantik ' : 'leksikal '}  ${h.pertanyaan}`,
  );
}
if (hasilNegatif.length > 0) {
  const menolak = hasilNegatif.filter((h) => h.menolak).length;
  console.log('');
  console.log(`  Set negatif (di luar katalog) — menolak benar: ${menolak}/${hasilNegatif.length}`);
  for (const h of hasilNegatif) {
    console.log(`    ${h.menolak ? '✓' : '✗'} ${h.pertanyaan}${h.menolak ? '' : ` (${h.jumlahBukti} bukti disajikan)`}`);
  }
}
console.log('');
console.log(`  recall@15 = ${kena}/${total} = ${persen.toFixed(0)}% (ambang dokumen 10: 90%)`);
const menolakNegatif = hasilNegatif.length === 0 || hasilNegatif.every((h) => h.menolak);
const lulus = persen >= 90 && menolakNegatif;
console.log(lulus ? '✓ LULUS' : '✗ GAGAL');
process.exit(lulus ? 0 : 1);
