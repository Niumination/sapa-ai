#!/usr/bin/env node
// ─── DS-03 (EV-25): cache jawaban harus terikat VERSI ISI korpus, bukan jumlahnya ──
//
// MASALAH YANG DIUJI
//   Kunci cache jawaban lama: `ai:v1:<hash(query)>:<jumlah record>`. Jumlah record
//   hampir tidak pernah berubah ketika OPD memutakhirkan ANGKA pada indikator yang
//   sudah ada — jadi jawaban dari korpus lama tetap disajikan sampai TTL habis,
//   walaupun data sumbernya sudah berubah dan operator sudah menekan "segarkan".
//
// APA YANG DILAKUKAN HARNESS INI (dari luar aplikasi, tanpa mock internal)
//   1. menjalankan SPLP tiruan dengan korpus A (6 record) lalu menanyakan "jumlah ASN";
//   2. menanyakan hal yang sama sekali lagi → harus dilayani CACHE (bukti cache hidup);
//   3. menjalankan SPLP tiruan dengan korpus B — JUMLAH RECORD SAMA, satu angka diubah;
//   4. memanggil /api/revalidate (OPS-03) supaya korpus di memori dilupakan;
//   5. menanyakan hal yang sama ketiga kali → WAJIB angka baru dan BUKAN dari cache.
//
//   Langkah 3 sengaja mempertahankan jumlah record: itulah inti DS-03. Kalau kunci
//   cache masih memakai jumlah record, langkah 5 MENYAJIKAN JAWABAN LAMA dan
//   harness GAGAL — jadi uji ini bukan formalitas.
//
//   KENYATAAN YANG DIUKUR (diperiksa langsung 24 Sep 2026): pada cache-hit,
//   bagian BUKTI selalu dihitung ulang dari korpus yang berlaku, jadi angka di
//   `evidence` tetap baru. Yang BASI adalah NARASI model. Karena itu ukuran
//   yang menentukan bukan "angka pada bukti", melainkan (a) `ai.cached` harus
//   false, dan (b) narasi tidak boleh menyebut angka lama sementara bukti sudah
//   angka baru — campuran seperti itulah yang dibaca pengguna sebagai fakta.
//
// Pakai:
//   SAPA_EVAL_URL=http://127.0.0.1:3131 REVALIDATE_SECRET=rahasia-uji node scripts/uji-cache-korpus.mjs
// Keluar: 0 = LULUS, 1 = ada pelanggaran, 2 = aplikasi tidak dapat dihubungi.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP = (process.env.SAPA_EVAL_URL ?? 'http://127.0.0.1:3131').replace(/\/$/, '');
const STUB_PORT = Number(process.env.SAPA_STUB_PORT ?? 9955);
const RAHASIA = process.env.REVALIDATE_SECRET ?? 'rahasia-uji';
const JEDA_MS = Number(process.env.SAPA_CACHE_JEDA_MS ?? 300);

const warna = { ok: '\u001b[32m✓\u001b[0m', no: '\u001b[31m✗\u001b[0m', info: '\u001b[2m·\u001b[0m' };
const pelanggaran = [];
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

const rec = (id, nama, opd, satuan, nilai) => ({
  id,
  id_kode_indikator: 100 + id,
  kode_indikator_kode_indikator: `X.${id}`,
  kode_indikator_nama_indikator: nama,
  id_opds: id,
  opds_nama_opd: opd,
  jadwal_pemutakhiran: 'Tahunan',
  satuan,
  tahun: '2026',
  variabel: nilai,
});

// Penanda unik per jalan uji. Alasannya penting: cache jawaban aplikasi
// menyimpan hasil 15 menit, jadi korpus yang sama persis akan menghasilkan
// "cache hit" dari jalan sebelumnya — uji menjadi tidak hermetis dan bisa
// memberi kesimpulan salah. Dengan penanda acak, sidik korpus selalu baru
// sehingga setiap "cached=false" benar-benar berarti kunci berbeda.
const NILAI_A = String(9000 + Math.floor(Math.random() * 900));
const NILAI_B = String(Number(NILAI_A) + 7); // angka baru dari OPD (beda 7 dari A)

/** Korpus A. Nilai ASN = NILAI_A. */
const korpusA = [
  rec(1, 'Jumlah ASN', 'Badan Kepegawaian dan Pengembangan SDM', 'pegawai', NILAI_A),
  rec(2, 'Prevalensi Stunting', 'Dinas Kesehatan', 'Persen', '31,4'),
  rec(3, 'Jumlah Penduduk', 'Dinas Kependudukan dan Pencatatan Sipil', 'Jiwa', '236866'),
  rec(4, 'Produksi Kopi Arabika', 'Dinas Pertanian', 'ton', '29019'),
  rec(5, 'Indeks Pembangunan Manusia', 'Bappeda', 'poin', '78,09'),
  rec(6, 'Angka Kemiskinan', 'Bappeda', 'Persen', '12,29'),
];

/** Korpus B — JUMLAH RECORD SAMA (6), angka ASN diubah OPD menjadi NILAI_B. */
const korpusB = korpusA.map((r) => (r.id === 1 ? { ...r, variabel: NILAI_B } : { ...r }));

const dir = mkdtempSync(path.join(tmpdir(), 'ds03-'));
const berkasA = path.join(dir, 'korpus-a.json');
const berkasB = path.join(dir, 'korpus-b.json');
writeFileSync(berkasA, JSON.stringify({ api_status: 1, api_message: 'ok', data: korpusA }));
writeFileSync(berkasB, JSON.stringify({ api_status: 1, api_message: 'ok', data: korpusB }));

let stubb = null;

function jalankanStub(berkas) {
  stubb = spawn(process.execPath, ['verifikasi/stub-splp.mjs', String(STUB_PORT), berkas], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  });
  return tungguStub();
}

async function tungguStub(percobaan = 40) {
  for (let i = 0; i < percobaan; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${STUB_PORT}/sapa/1.0/api/daftar_data`, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) return true;
    } catch {
      /* belum siap */
    }
    await tidur(100);
  }
  return false;
}

function hentikanStub() {
  if (!stubb) return;
  try {
    process.kill(-stubb.pid, 'SIGKILL');
  } catch {
    /* sudah mati */
  }
  stubb = null;
}

async function tanya(query) {
  const r = await fetch(`${APP}/api/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`/api/query ${r.status}`);
  return r.json();
}

/** Nilai yang benar-benar DISAJIKAN untuk indikator tertentu (dari evidence). */
function nilaiBukti(jawaban, kataKunci) {
  const baris = (jawaban.evidence ?? []).filter((e) =>
    String(e.indikator ?? '').toLowerCase().includes(kataKunci),
  );
  return baris.map((b) => String(b.nilai));
}

console.log(`\nDS-03 — kunci cache jawaban terikat versi ISI korpus → ${APP}\n`);

if (korpusA.length !== korpusB.length) {
  pelanggaran.push('korpus A dan B harus berjumlah record sama (inti uji DS-03)');
}

// ── Fase A: korpus A ──
if (!(await jalankanStub(berkasA))) {
  console.log(`  ${warna.no} SPLP tiruan tidak siap di :${STUB_PORT}`);
  hentikanStub();
  process.exit(2);
}
await tidur(JEDA_MS);

// Status dibaca SESUDAH SPLP tiruan hidup: kalau dibaca lebih dulu, katalog
// terlihat 0 record dan kesimpulan uji bisa salah dibaca orang.
try {
  const status = await (await fetch(`${APP}/api/status`, { signal: AbortSignal.timeout(10_000) })).json();
  console.log(`  ${warna.info} status: record=${status?.sapa?.records} · ai=${status?.ai?.state}`);
  if (status?.ai?.state !== 'active' && status?.ai?.state !== 'shadow') {
    pelanggaran.push(
      `mode AI tidak aktif (state=${status?.ai?.state}) — cache jawaban hanya dipakai pada mode AI, uji tidak sah`,
    );
  }
  if ((status?.sapa?.records ?? 0) !== korpusA.length) {
    pelanggaran.push(
      `katalog terbaca ${status?.sapa?.records} record, seharusnya ${korpusA.length} — aplikasi belum membaca korpus uji`,
    );
  }
} catch (e) {
  console.log(`  ${warna.no} aplikasi tidak dapat dihubungi: ${e instanceof Error ? e.message : e}`);
  hentikanStub();
  process.exit(2);
}

// Segarkan lebih dulu: aplikasi mungkin masih memegang korpus lain dari
// percobaan sebelumnya. Tanpa ini, "fase A" bisa membaca korpus B dan uji
// memberi kesimpulan yang salah (pernah terjadi 24 Sep 2026).
await fetch(`${APP}/api/revalidate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-revalidate-secret': RAHASIA },
  body: JSON.stringify({ tag: 'all', secret: RAHASIA }),
  signal: AbortSignal.timeout(30_000),
});
await tidur(JEDA_MS);

const a1 = await tanya('Berapa jumlah ASN di Aceh Tengah?');
const nilaiA1 = nilaiBukti(a1, 'asn');
console.log(`  ${warna.info} fase A · query 1 → nilai=${nilaiA1.join('/')} cached=${a1.ai?.cached}`);

await tidur(JEDA_MS);
const a2 = await tanya('Berapa jumlah ASN di Aceh Tengah?');
console.log(`  ${warna.info} fase A · query 2 → nilai=${nilaiBukti(a2, 'asn').join('/')} cached=${a2.ai?.cached}`);

// Fase A WAJIB membaca korpus A (bukan sisa korpus lain di memori). Cache
// boleh saja sudah berisi jawaban untuk korpus A ini (mis. jalan kedua pada
// proses yang sama) — itu perilaku yang benar; yang tidak boleh adalah nilai
// dari korpus lain.
if (!nilaiA1.includes(NILAI_A)) {
  pelanggaran.push(`fase A tidak membaca korpus A (terbaca ${nilaiA1.join('/') || '-'}, seharusnya ${NILAI_A})`);
}
if (a2.ai?.cached !== true) {
  pelanggaran.push('query kedua TIDAK dilayani cache — uji ini tidak menguji cache (cache mati/tak berfungsi)');
} else {
  console.log(`  ${warna.ok} cache hidup: query kedua dilayani dari simpanan (cached=true)`);
}

// ── Fase B: korpus B (jumlah record SAMA, satu angka berubah) ──
hentikanStub();
if (!(await jalankanStub(berkasB))) {
  console.log(`  ${warna.no} SPLP tiruan (korpus B) tidak siap`);
  hentikanStub();
  process.exit(2);
}

const segar = await fetch(`${APP}/api/revalidate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-revalidate-secret': RAHASIA },
  body: JSON.stringify({ tag: 'all', secret: RAHASIA }),
  signal: AbortSignal.timeout(30_000),
});
console.log(`  ${warna.info} penyegaran (OPS-03) → HTTP ${segar.status}`);

await tidur(JEDA_MS);
const b1 = await tanya('Berapa jumlah ASN di Aceh Tengah?');
const nilaiB1 = nilaiBukti(b1, 'asn');
console.log(`  ${warna.info} fase B · query 3 → nilai=${nilaiB1.join('/')} cached=${b1.ai?.cached}`);

if (String(nilaiA1.join('')) === String(nilaiB1.join(''))) {
  pelanggaran.push(
    `nilai TIDAK berubah setelah korpus diperbarui (masih ${nilaiB1.join('/')}) — jawaban korpus lama masih disajikan`,
  );
}
if (b1.ai?.cached === true) {
  pelanggaran.push(
    'jawaban korpus BARU dilaporkan berasal dari cache (cached=true) — kunci cache tidak ikut berubah, narasi model basi disajikan',
  );
}
// Bahaya yang sesungguhnya terlihat pengguna: narasi (teks model) menyebut angka
// korpus LAMA padahal bukti di bawahnya sudah angka BARU. Narasi disajikan
// terformat ("9.054") sementara korpus mentah ("9054"), jadi keduanya
// dibandingkan setelah tanda pemisah ribuan dibuang.
const polos = (t) => t.replace(/[.,\s]/g, '');
const narasiPolos = polos(String(b1.narasi ?? b1.answer ?? ''));
if (narasiPolos.includes(NILAI_A) && !narasiPolos.includes(NILAI_B)) {
  pelanggaran.push(
    `narasi menyebut angka korpus LAMA (${NILAI_A}) sementara bukti sudah ${NILAI_B} — pembaca melihat campuran yang menyesatkan`,
  );
}
if (b1.ai?.cached === true) {
  // Jejak untuk berkas bukti: apa yang sebenarnya dibaca pengguna saat jawaban
  // dilayani dari simpanan lama (bukti segar + narasi basi).
  console.log(
    `  ${warna.info} cache-hit: bukti=${nilaiB1.join('/')} · narasi="${String(b1.narasi ?? '').slice(0, 80)}…"`,
  );
}
if (b1.ai?.cached !== true && nilaiB1.includes(NILAI_B) && !narasiPolos.includes(NILAI_A)) {
  console.log(
    `  ${warna.ok} setelah korpus berubah (jumlah record tetap ${korpusB.length}): jawaban dihitung ULANG (cached=false), bukti ${NILAI_B}, narasi tanpa angka lama`,
  );
}

hentikanStub();

// ── Ringkasan ──
console.log('\n  ──────────────── Ringkasan ────────────────');
console.log(`  korpus A/B          : ${korpusA.length} record · angka ASN ${NILAI_A} → ${NILAI_B} (jumlah record TIDAK berubah)`);
console.log(`  query 1 (dingin)    : nilai ${nilaiA1.join('/')} · cached=${a1.ai?.cached}`);
console.log(`  query 2 (korpus A)  : nilai ${nilaiBukti(a2, 'asn').join('/')} · cached=${a2.ai?.cached}`);
console.log(`  query 3 (korpus B)  : nilai ${nilaiB1.join('/')} · cached=${b1.ai?.cached}`);

if (pelanggaran.length) {
  console.log(`\n  ${warna.no} GAGAL — ${pelanggaran.length} pelanggaran:`);
  for (const p of pelanggaran) console.log(`    · ${p}`);
  process.exit(1);
}
console.log(`\n  ${warna.ok} LULUS — cache jawaban terikat VERSI ISI korpus: perubahan angka tanpa perubahan jumlah record`);
console.log('          membuat jawaban dihitung ULANG (tanpa narasi basi), dan "segarkan" juga');
console.log('          melupakan korpus di memori sehingga penyegaran benar-benar terlihat.');
process.exit(0);
