#!/usr/bin/env node
// ─── EV-24: uji 50 keluaran sampel — pasangan entitas (FR-24) ────────────────
//
// MENGAPA HARNESS INI ADA
//   Kriteria terima FR-24: "0 kesalahan pasangan pada 50 keluaran sampel".
//   Klaim itu tidak boleh bergantung pada pemeriksa yang sedang diuji — kalau
//   harness memakai `periksaPasanganEntitas` yang sama, ia hanya membuktikan
//   "pemeriksa setuju dengan dirinya sendiri".
//
//   Karena itu harness ini memeriksa ULANG secara mandiri, langsung dari
//   balasan HTTP: setiap angka di narasi harus ada di baris bukti yang
//   PASANGANNYA benar (satuan yang tertulis = satuan baris itu; wilayah yang
//   disebut = wilayah baris itu). Bila narasi model ditolak gerbang, yang
//   diperiksa adalah narasi yang benar-benar disajikan.
//
// KELUARAN
//   0 = LULUS (0 kesalahan pasangan) · 1 = ada kesalahan · 2 = server mati
//
// Pakai:
//   SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/uji-pasangan.mjs
//   SAPA_PASANGAN_JEDA_MS=2100   # jeda antar-permintaan (batas laju 30/menit)

const BASE = (process.env.SAPA_EVAL_URL ?? 'http://127.0.0.1:3117').replace(/\/$/, '');
const JEDA_MS = Number(process.env.SAPA_PASANGAN_JEDA_MS ?? 2100);
const URL_SET = process.env.SAPA_PASANGAN_SET ?? 'data/eval-set.json';

import fs from 'node:fs';
import path from 'node:path';

const warna = { ok: '\u001b[32m✓\u001b[0m', no: '\u001b[31m✗\u001b[0m', info: '\u001b[2m·\u001b[0m' };
const pelanggaran = [];

const normNum = (t) => String(t).replace(/\./g, '').replace(',', '.').trim();
const angkaDi = (t) => (String(t ?? '').match(/\d[\d.,]*\d|\d/g) ?? []).map(normNum).filter(Boolean);
const kecDi = (t, daftar) => daftar.filter((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(String(t ?? '')));

async function tanya(query, stream = false, percobaan = 0) {
  const res = await fetch(`${BASE}/api/query${stream ? '/stream' : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (res.status === 429 && percobaan < 5) {
    const detik = Number(res.headers.get('retry-after') ?? 0) || 8;
    await new Promise((r) => setTimeout(r, (detik + 1) * 1000));
    return tanya(query, stream, percobaan + 1);
  }
  if (!res.ok) return { __error: `HTTP ${res.status}` };
  if (!stream) return res.json();
  const teks = await res.text();
  for (const baris of teks.split('\n')) {
    if (!baris.startsWith('data:')) continue;
    try {
      const o = JSON.parse(baris.slice(5).trim());
      if (o?.type === 'result' || o?.narasi) return o.payload ?? o;
    } catch { /* keep-alive */ }
  }
  return { __error: 'SSE tanpa hasil' };
}

/** Kosakata kecamatan dari bukti narasi itu sendiri (mandiri; tidak dari server). */
function kecamatanDariBukti(evidence) {
  const hitung = new Map();
  for (const e of evidence ?? []) {
    for (const m of String(e.indikator ?? '').matchAll(/Kecamatan\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,2})/g)) {
      let kata = m[1].split(/\s+/);
      while (kata.length > 1 && ['tahun', 'di', 'dan', 'per', 'pada', 'anggaran', 'yang'].includes(kata[kata.length - 1].toLowerCase())) kata = kata.slice(0, -1);
      const nama = kata.join(' ');
      hitung.set(nama, (hitung.get(nama) ?? 0) + 1);
    }
  }
  return [...hitung.entries()].filter(([, n]) => n >= 2).map(([n]) => n);
}

/** Pemeriksaan mandiri satu balasan: kembalikan daftar kesalahan pasangan. */
/**
 * Konstanta sistem yang sah walau bukan nilai bukti. Daftarnya SENGAJA sama
 * dengan daftar di `answer-compose.ts` dan uji invarians `eval-run.mjs` —
 * narasi deterministik menulis "15 indikator unik dari 13 OPD" dan "Dari 1.210
 * record SAPA", dan itu bukan klaim nilai indikator.
 */
function angkaSistem(status, evidence, matched) {
  return new Set(
    [
      status?.sapa?.records,
      status?.sapa?.opd,
      evidence?.length,
      new Set((evidence ?? []).map((e) => e.opd)).size,
      new Set((evidence ?? []).map((e) => e.indikator)).size,
      matched,
    ]
      .filter((n) => n != null && n !== '')
      .map((n) => normNum(String(n))),
  );
}

function periksaSendiri(narasi, evidence, kecamatan, diizinkan = new Set()) {
  const salah = [];
  const bersih = String(narasi ?? '')
    .replace(/"[^"]*"/g, ' ')
    .replace(/\b(UU|PP|Perpres|Perbup|Permendagri|Permen)\s*(No\.?|Nomor)\s*[\d./]+/gi, ' ')
    .replace(/Tidak ada data untuk tahun [^.]*di SAPA\.?/gi, ' ');
  const nilaiBukti = new Set();
  for (const e of evidence ?? []) {
    for (const n of angkaDi(e.nilai)) nilaiBukti.add(n);
    for (const m of String(e.nilai ?? '').matchAll(/(\d[\d.,]*)\s*[–—-]\s*(\d[\d.,]*)/g)) {
      nilaiBukti.add(normNum(m[1]));
      nilaiBukti.add(normNum(m[2]));
    }
    for (const t of [e.indikator, e.opd, e.satuan]) for (const n of angkaDi(t)) nilaiBukti.add(n);
  }
  const tahunBukti = new Set((evidence ?? []).map((e) => String(e.tahun ?? '').trim()).filter((t) => /^(?:19|20)\d{2}$/.test(t)));
  const satuanKatalog = new Set((evidence ?? []).map((e) => String(e.satuan ?? '').trim().toLowerCase().split(/[\s/]+/)[0]).filter(Boolean));

  // KLAUSA (bukan kalimat): titik, titik koma, dan koma diikuti spasi.
  // Spesifikasi yang sama dipakai gerbang di aplikasi: satu kalimat bisa memuat
  // dua klausa berbeda pemilik ("… di Kecamatan Celala tercatat 892,26 Orang,
  // dengan rincian terbesar pada 8313 Orang") — memeriksa per kalimat membuat
  // angka klausa kedua dituduh milik wilayah klausa pertama. Koma DESIMAL tetap
  // utuh karena hanya koma yang diikuti spasi yang memecah.
  for (const kalimat of bersih.split(/(?<=[.;!?])\s+|;\s+|,\s+/)) {
    for (const angka of new Set(angkaDi(kalimat))) {
      const pemilik = (evidence ?? []).filter((e) => angkaDi(e.nilai).includes(angka));
      if (pemilik.length === 0) {
        if (nilaiBukti.has(angka) || tahunBukti.has(angka) || diizinkan.has(angka)) continue; // label/tahun/konstanta = bukan klaim nilai
        salah.push(`angka ${angka} tidak ada di bukti`);
        continue;
      }
      // satuan tepat setelah angka
      const m = new RegExp(`${angka.replace('.', '[.,]')}(?:\\s*[.,]\\d+)?\\s+([A-Za-z/]{2,20})`, 'i').exec(
        kalimat.replace(/(\d)\.(\d{3})\b/g, '$1$2'),
      );
      const kata = m ? m[1].toLowerCase() : null;
      const lewati = new Set(['pada', 'tahun', 'di', 'dan', 'dengan', 'menurut', 'sebesar', 'dari', 'untuk', 'yang', 'juta', 'ribu', 'miliar', 'adalah', 'ini', 'itu', 'mencapai', 'tercatat']);
      if (kata && !lewati.has(kata) && satuanKatalog.has(kata)) {
        const cocok = pemilik.some((e) => String(e.satuan ?? '').toLowerCase().includes(kata));
        if (!cocok) salah.push(`nilai ${angka} ditulis bersatuan "${kata}" padahal bukti bersatuan "${pemilik.map((e) => e.satuan).join('/')}"`);
      }
      // wilayah
      if (kecamatan.length) {
        const sebut = kecDi(kalimat, kecamatan);
        if (sebut.length) {
          const cocokW = pemilik.some((e) => kecDi(e.indikator, sebut).length > 0);
          if (!cocokW) salah.push(`nilai ${angka} disebut di wilayah ${sebut.join(',')} padahal bukti bukan wilayah itu`);
        }
      }
    }
  }
  return salah;
}

async function main() {
  console.log(`\nUji pasangan entitas (FR-24 / EV-24) → ${BASE}\n`);
  let status;
  try {
    status = await (await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(25000) })).json();
  } catch (e) {
    console.error(`  ${warna.no} server tidak dapat dihubungi: ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const aiState = status?.ai?.state ?? (status?.ai?.enabled ? 'aktif' : 'nonaktif');
  console.log(`  katalog: ${status?.sapa?.records ?? '?'} record · mode AI: ${aiState} · set: ${URL_SET}\n`);

  const set = JSON.parse(fs.readFileSync(path.resolve(URL_SET), 'utf8'));
  const item = (set.item ?? []).slice(0, Number(process.env.SAPA_PASANGAN_N ?? 50));
  let diperiksa = 0;
  let ditolakGerbang = 0;
  let temuanServer = 0;

  for (const [i, it] of item.entries()) {
    let r;
    try {
      r = await tanya(it.pertanyaan);
    } catch (e) {
      pelanggaran.push(`${it.id}: permintaan gagal (${e instanceof Error ? e.message : e})`);
      continue;
    }
    if (r.__error) {
      pelanggaran.push(`${it.id}: ${r.__error}`);
      continue;
    }
    const narasi = r.narasi ?? r.answer ?? '';
    const evidence = r.evidence ?? [];
    const kec = kecamatanDariBukti(evidence);
    const salah = evidence.length > 0 ? periksaSendiri(narasi, evidence, kec, angkaSistem(status, evidence, r.matched)) : [];
    diperiksa += 1;

    const pemeriksaan = r.pemeriksaan ?? {};
    if (!(pemeriksaan.nilaiDiizinkan)) { /* bidang opsional */ }
    if (typeof pemeriksaan.keras === 'number' && pemeriksaan.keras > 0) temuanServer += 1;
    if (r.ai?.nilaiTambah === 'ditolak-pasangan-entitas') ditolakGerbang += 1;

    if (salah.length) {
      pelanggaran.push(`${it.id}: ${salah.slice(0, 2).join(' | ')}`);
      console.log(`  ${warna.no} ${it.id.padEnd(4)} ${salah[0].slice(0, 110)}`);
    } else {
      console.log(
        `  ${warna.ok} ${it.id.padEnd(4)} ${String(evidence.length).padStart(2)} bukti · ` +
          `gerbang=${pemeriksaan.keras ?? '-'} · nilai diperiksa ${pemeriksaan.jumlahNilai ?? '-'} · ` +
          `jalur ${r.ai?.nilaiTambah ?? (r.ai?.used ? 'ai' : 'deterministik')}`,
      );
    }
    if (JEDA_MS > 0) await new Promise((x) => setTimeout(x, JEDA_MS));
  }

  console.log('\n  ──────────────── Ringkasan ────────────────');
  console.log(`  keluaran diperiksa      : ${diperiksa}`);
  console.log(`  kesalahan pasangan      : ${pelanggaran.length}  (ambang dokumen 10: 0 dari 50)`);
  console.log(`  narasi model ditolak    : ${ditolakGerbang}  (gerbang FR-24 bekerja)`);
  console.log(`  temuan keras di balasan : ${temuanServer}  (harus 0 — balasan yang disajikan tidak boleh bertemuan keras)`);

  if (pelanggaran.length === 0 && temuanServer === 0) {
    console.log(`  ${warna.ok} LULUS — 0 kesalahan pasangan pada ${diperiksa} keluaran sampel.`);
    process.exit(0);
  }
  console.log(`  ${warna.no} GAGAL:`);
  for (const p of pelanggaran.slice(0, 15)) console.log(`    · ${p}`);
  if (temuanServer > 0) console.log(`    · ${temuanServer} balasan membawa temuan keras dari server sendiri`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`\n  ${warna.no} tidak terduga: ${e instanceof Error ? e.stack : e}`);
  process.exit(2);
});
