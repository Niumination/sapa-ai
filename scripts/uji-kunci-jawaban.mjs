#!/usr/bin/env node
// ─── P9: kunci anti-mundur — sidik JAWABAN 120 item ──────────────────────────
//
// MASALAH YANG DIPERBAIKI
//
//   Set evaluasi membandingkan SKOR, bukan ISI jawaban. Item yang tetap "lulus"
//   bisa berubah total isinya — indikator lain, tahun lain, urutan bukti lain —
//   tanpa satu pun gerbang berbunyi. Selama perubahan itu kebetulan masih cocok
//   dengan pola relevansi item, 120/120 tetap 120/120. Itu artinya: gerbang
//   mutu kita bisa diam sementara mutu jawaban bergeser.
//
//   Butir ini menambahkan sidik ISI jawaban untuk seluruh 120 item. Perubahan
//   tidak otomatis dianggap salah — tetapi ia TIDAK BISA LAGI TERJADI DIAM-DIAM:
//   daftar item yang berubah dicetak, dan di gerbang uji terima ia muncul sebagai
//   peringatan eksplisit.
//
// APA YANG DISIDIK (dan kenapa bukan sekadar teks)
//   · narasi (spasi dinormalkan),
//   · bentuk jawaban & niat yang dikenali router,
//   · daftar bukti berurut: indikator · tahun · nilai · satuan · OPD,
//   · jumlah bukti.
//   Teks saja tidak cukup (urutan bukti & bentuk ikut menentukan apa yang dibaca
//   warga); angka saja juga tidak cukup (dua jawaban bisa punya angka sama
//   dengan pasangan indikator berbeda — kelas kesalahan FR-24).
//
// Pakai:
//   SAPA_EVAL_URL=http://127.0.0.1:3119 node scripts/uji-kunci-jawaban.mjs
//   SAPA_EVAL_URL=… node scripts/uji-kunci-jawaban.mjs --tulis-baseline
//   SAPA_EVAL_URL=… node scripts/uji-kunci-jawaban.mjs --baseline=verifikasi/lain.json
// Keluar: 0 = identik, 1 = ada jawaban berubah (daftarnya dicetak), 2 = server tak terjangkau.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPSI = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);

const URL_APP = (process.env.SAPA_EVAL_URL ?? 'http://127.0.0.1:3116').replace(/\/$/, '');
const BASELINE = OPSI['baseline'] ?? path.join(AKAR, 'verifikasi/kunci-jawaban.json');
const TULIS = OPSI['tulis-baseline'] === 'true';
const JEDA_MS = Number(process.env.SAPA_KUNCI_JEDA_MS ?? 0);

const set = JSON.parse(readFileSync(path.join(AKAR, 'data/eval-set.json'), 'utf8'));
const items = set.item ?? set.items ?? [];

let urutanIp = 0;
async function tanya(pertanyaan) {
  urutanIp += 1;
  const ip = `192.0.2.${(urutanIp % 250) + 1}`;
  const res = await fetch(`${URL_APP}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ query: pertanyaan }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const rapikan = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

function sidikJawaban(r) {
  const bahan = {
    narasi: rapikan(r.narasi),
    bentuk: r.bentuk ?? null,
    niat: r.niat ?? null,
    diagnosis: r.diagnosa?.sebab ?? null,
    bukti: (r.evidence ?? []).map((e) => [rapikan(e.indikator), e.tahun ?? null, String(e.nilai ?? ''), rapikan(e.satuan), rapikan(e.opd)]),
  };
  return createHash('sha256').update(JSON.stringify(bahan)).digest('hex').slice(0, 16);
}

async function utama() {
  console.log('══ Kunci anti-mundur jawaban (P9) ══');
  console.log(`   server: ${URL_APP} · item: ${items.length} · baseline: ${path.relative(AKAR, BASELINE)}${TULIS ? ' (MODE TULIS)' : ''}`);

  // Pemeriksaan awal: server hidup?
  try {
    const s = await fetch(`${URL_APP}/api/status`, { signal: AbortSignal.timeout(10_000) });
    if (s.status >= 500) throw new Error(`HTTP ${s.status}`);
  } catch (e) {
    console.log(`\n  \x1b[31m✗ server tidak terjangkau: ${e.message}\x1b[0m`);
    return 2;
  }

  const sekarang = {};
  let gagalTanya = 0;
  for (const it of items) {
    try {
      const r = await tanya(it.pertanyaan);
      // `bentuk` adalah OBJEK (niat/label/visual/urutan…). Untuk laporan dipakai
      // LABEL-nya, supaya baris peringatan bisa dibaca manusia — percobaan
      // pertama mencetak "[object Object]" dan itu membuat laporan tak berguna.
      sekarang[it.id] = {
        sidik: sidikJawaban(r),
        bukti: (r.evidence ?? []).length,
        bentuk: r.bentuk?.label ?? r.bentuk?.niat ?? null,
      };
    } catch (e) {
      gagalTanya += 1;
      sekarang[it.id] = { sidik: `GALAT:${e.message}`, bukti: 0, bentuk: null };
    }
    if (JEDA_MS) await new Promise((r) => setTimeout(r, JEDA_MS));
  }

  const isi = {
    dibuat: new Date().toISOString(),
    server: URL_APP,
    jumlahItem: items.length,
    gagalTanya,
    sidik: Object.fromEntries(Object.entries(sekarang).map(([id, v]) => [id, v.sidik])),
    ringkas: sekarang,
  };

  if (TULIS || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, `${JSON.stringify(isi, null, 1)}\n`, 'utf8');
    console.log(`\n  \x1b[33m·\x1b[0m baseline ditulis: ${Object.keys(sekarang).length} sidik item${gagalTanya ? ` (${gagalTanya} gagal ditanya)` : ''}`);
    console.log('  Keluar 0 — jalankan sekali lagi TANPA --tulis-baseline untuk membuktikan kuncinya stabil.');
    return 0;
  }

  const lama = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const berubah = [];
  const baruItem = [];
  const hilangItem = [];
  for (const id of Object.keys(sekarang)) {
    if (!(id in lama.sidik)) baruItem.push(id);
    else if (lama.sidik[id] !== sekarang[id].sidik) berubah.push(id);
  }
  for (const id of Object.keys(lama.sidik)) if (!(id in sekarang)) hilangItem.push(id);

  console.log(`\n  item dibandingkan: ${Object.keys(sekarang).length} · berubah: ${berubah.length} · baru: ${baruItem.length} · hilang: ${hilangItem.length}`);
  if (gagalTanya) console.log(`  \x1b[33m·\x1b[0m ${gagalTanya} item gagal ditanya — sidiknya tidak sebanding`);

  if (berubah.length === 0 && baruItem.length === 0 && hilangItem.length === 0 && gagalTanya === 0) {
    console.log('\n  \x1b[32m✓ IDENTIK\x1b[0m — tidak ada jawaban yang berubah dibanding baseline.');
    return 0;
  }

  console.log('\n  \x1b[33m! JAWABAN BERUBAH\x1b[0m — ini BUKAN otomatis salah, tetapi tidak boleh lewat tanpa disadari:');
  for (const id of berubah.slice(0, 20)) {
    const it = items.find((x) => x.id === id);
    console.log(`    · ${id} (${it?.grup ?? '?'}) bukti ${lama.ringkas?.[id]?.bukti ?? '?'} → ${sekarang[id].bukti} · bentuk ${lama.ringkas?.[id]?.bentuk ?? '?'} → ${sekarang[id].bentuk ?? '?'} — ${rapikan(it?.pertanyaan).slice(0, 60)}`);
  }
  if (berubah.length > 20) console.log(`    · … dan ${berubah.length - 20} item lain`);
  if (baruItem.length) console.log(`    · item baru (belum ada di baseline): ${baruItem.join(', ')}`);
  if (hilangItem.length) console.log(`    · item hilang dari set: ${hilangItem.join(', ')}`);
  console.log('\n  Bila perubahan itu DISENGAJA (mis. perbaikan yang disetujui pemilik produk), perbarui kunci:');
  console.log(`    SAPA_EVAL_URL=${URL_APP} node scripts/uji-kunci-jawaban.mjs --tulis-baseline`);
  console.log('  Bila TIDAK disengaja, hentikan dan periksa apa yang mengubah jawaban.');
  return 1;
}

utama()
  .then((k) => {
    process.exitCode = k;
  })
  .catch((e) => {
    console.error('Galat uji:', e);
    process.exitCode = 2;
  });
