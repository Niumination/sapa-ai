#!/usr/bin/env node
// ─── P2: kontrak skema sumber data SPLP ──────────────────────────────────────
//
// MASALAH YANG DIPERBAIKI
//   719 uji dan seluruh set evaluasi berjalan di atas KORPUS YANG DISIMPAN
//   (`verifikasi/korpus-produksi.json`, tarikan 24 Sep 2026). Tidak ada satu pun
//   yang memeriksa bentuk data yang benar-benar datang dari SPLP. Akibatnya bila
//   pengelola SPLP mengganti nama bidang (`opds_nama_opd` → `nama_opd`),
//   menghapusnya, atau mengubah tipe (`variabel` dari teks ke angka), aplikasi
//   bisa menjawab SALAH — kolom OPD kosong, angka gagal dibaca — tanpa satu pun
//   uji gagal. Kegagalan seperti itu hanya terlihat oleh warga.
//
//   Kelas risiko ini tidak bisa ditutup oleh uji unit: yang diuji harus DATA
//   NYATA, bukan fungsi. Karena itu bentuknya kontrak + pembanding snapshot.
//
// YANG DIPERIKSA
//   1. Bidang wajib ada di SETIAP record (bidang yang benar-benar dibaca
//      `SapaRecord` — daftarnya di bawah sengaja sejalan dengan berkas itu).
//   2. Tipe sesuai (angka/teks/null). `null` sah untuk bidang yang memang boleh
//      kosong; `undefined` tidak pernah sah.
//   3. Bidang teks yang menentukan tampilan (`opds_nama_opd`, `variabel`,
//      `satuan`) tidak kosong pada proporsi di bawah ambang.
//   4. Tahun berformat masuk akal (tahun 4 digit atau rentang) bila diisi.
//   5. PERGESERAN terhadap snapshot terakhir: bidang HILANG, tipe BERUBAH, atau
//      rasio-kosong melonjak > 5 poin = GAGAL. Bidang BARU = catatan (SPLP
//      menambah bidang itu wajar; yang berbahaya adalah yang hilang/berubah).
//
// Pakai:
//   node scripts/uji-kontrak-splp.mjs                       # berkas tersimpan
//   node scripts/uji-kontrak-splp.mjs --url=…               # tarikan langsung
//   node scripts/uji-kontrak-splp.mjs --tulis-baseline       # perbarui snapshot
//   node scripts/uji-kontrak-splp.mjs --sabotase=hapus-bidang:satuan   # kontrol negatif
// Keluar: 0 = LULUS, 1 = ada pelanggaran, 2 = sumber tidak dapat dibaca.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPSI = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);

const BERKAS = OPSI['berkas'] ?? path.join(AKAR, 'verifikasi/korpus-produksi.json');
const BASELINE = OPSI['baseline'] ?? path.join(AKAR, 'verifikasi/kontrak-splp.json');
const TULIS_BASELINE = OPSI['tulis-baseline'] === 'true';
const SABOTASE = OPSI['sabotase'] ?? null;
const URL_SPLP =
  OPSI['url'] ?? process.env.SAPA_SPLP_BASE_URL ?? 'https://api-splp.layanan.go.id/sapa/1.0/api';

/**
 * Bidang yang dibaca aplikasi (`SapaRecord` di src/lib/sapa-client.ts).
 * `wajib: true` berarti ketiadaannya membuat jawaban salah secara diam-diam.
 */
const KONTRAK = [
  { nama: 'id', tipe: 'number', wajib: true },
  { nama: 'id_kode_indikator', tipe: 'number', wajib: true },
  { nama: 'kode_indikator_kode_indikator', tipe: 'string|null', wajib: true },
  { nama: 'kode_indikator_nama_indikator', tipe: 'string|null', wajib: true },
  { nama: 'id_opds', tipe: 'number', wajib: true },
  { nama: 'opds_nama_opd', tipe: 'string', wajib: true, tidakBolehKosong: true },
  { nama: 'jadwal_pemutakhiran', tipe: 'string', wajib: true },
  { nama: 'satuan', tipe: 'string', wajib: true },
  { nama: 'tahun', tipe: 'string|null', wajib: true, tahun: true },
  { nama: 'variabel', tipe: 'string', wajib: true, tidakBolehKosong: true },
];

const AMBANG_LONJAKAN_KOSONG = 5; // poin persen

const LULUS = [];
const GAGAL = [];
const CATATAN = [];

function ok(nama, keterangan) {
  LULUS.push(nama);
  console.log(`  \x1b[32m✓\x1b[0m ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
}
function no(nama, keterangan) {
  GAGAL.push(nama);
  console.log(`  \x1b[31m✗\x1b[0m ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
}
function catat(nama, keterangan) {
  CATATAN.push(nama);
  console.log(`  \x1b[33m·\x1b[0m ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
}
function bagian(judul) {
  console.log(`\n── ${judul} ──`);
}

function cocokTipe(nilai, tipe) {
  if (tipe === 'number') return typeof nilai === 'number' && Number.isFinite(nilai);
  if (tipe === 'string') return typeof nilai === 'string';
  if (tipe === 'string|null') return nilai === null || typeof nilai === 'string';
  return false;
}

function tahunMasukAkal(teks) {
  if (teks === null) return true;
  if (typeof teks !== 'string') return false;
  const bersih = teks.trim();
  if (bersih === '') return true; // kosong bukan kesalahan format
  const angka = bersih.match(/\d{4}/g) ?? [];
  if (angka.length === 0) return false;
  return angka.every((a) => {
    const n = Number(a);
    return n >= 1900 && n <= 2200;
  });
}

// ── Pembacaan sumber ─────────────────────────────────────────────────────────

async function bacaSumber() {
  if (OPSI['url'] || OPSI['pakai-url'] === 'true') {
    const alamat = `${String(URL_SPLP).replace(/\/+$/, '')}/daftar_data`;
    const res = await fetch(alamat, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} dari ${alamat}`);
    const json = await res.json();
    return { asal: alamat, records: json.data, api_status: json.api_status };
  }
  if (!existsSync(BERKAS)) throw new Error(`berkas korpus tidak ada: ${BERKAS}`);
  const json = JSON.parse(readFileSync(BERKAS, 'utf8'));
  return { asal: BERKAS, records: Array.isArray(json) ? json : json.data, api_status: json.api_status ?? null };
}

// ── Sabotase (kontrol negatif) ───────────────────────────────────────────────

function sabotase(records) {
  if (!SABOTASE) return records;
  const [jenis, bidang] = String(SABOTASE).split(':');
  const salinan = records.map((r) => ({ ...r }));
  if (jenis === 'hapus-bidang') {
    for (const r of salinan) delete r[bidang];
    console.log(`  \x1b[33m(sabotase: bidang "${bidang}" dihapus dari semua record)\x1b[0m`);
  } else if (jenis === 'ubah-tipe') {
    for (const r of salinan) r[bidang] = 'teks-bukan-angka';
    console.log(`  \x1b[33m(sabotase: tipe "${bidang}" diubah menjadi teks)\x1b[0m`);
  } else if (jenis === 'kosongkan') {
    for (const r of salinan) r[bidang] = '';
    console.log(`  \x1b[33m(sabotase: bidang "${bidang}" dikosongkan)\x1b[0m`);
  } else {
    throw new Error(`jenis sabotase tidak dikenal: ${jenis}`);
  }
  return salinan;
}

// ── Analisis kontrak ─────────────────────────────────────────────────────────

function analisis(records) {
  const jumlah = records.length;
  const perBidang = {};
  const bidangTerlihat = new Set();

  for (const k of KONTRAK) {
    perBidang[k.nama] = { ada: 0, tipeSalah: 0, kosong: 0, contohSalah: null };
  }
  const tambahan = new Map();

  for (const r of records) {
    for (const kunci of Object.keys(r)) {
      bidangTerlihat.add(kunci);
      if (!KONTRAK.some((k) => k.nama === kunci)) tambahan.set(kunci, (tambahan.get(kunci) ?? 0) + 1);
    }
    for (const k of KONTRAK) {
      const nilai = r[k.nama];
      if (!(k.nama in r)) continue;
      const s = perBidang[k.nama];
      s.ada += 1;
      if (!cocokTipe(nilai, k.tipe)) {
        s.tipeSalah += 1;
        if (s.contohSalah === null) s.contohSalah = `${typeof nilai}: ${JSON.stringify(nilai)?.slice(0, 40)}`;
        continue;
      }
      if (k.tidakBolehKosong && typeof nilai === 'string' && nilai.trim() === '') s.kosong += 1;
      if (k.tahun && !tahunMasukAkal(nilai)) {
        s.tipeSalah += 1;
        if (s.contohSalah === null) s.contohSalah = `tahun tak masuk akal: ${JSON.stringify(nilai)}`;
      }
    }
  }

  const opd = new Set(records.map((r) => r.opds_nama_opd).filter(Boolean));
  const indikator = new Set(records.map((r) => r.kode_indikator_nama_indikator).filter(Boolean));
  const tahun = {};
  for (const r of records) {
    const t = typeof r.tahun === 'string' ? r.tahun.trim() : '';
    if (!t) continue;
    for (const a of t.match(/\d{4}/g) ?? []) tahun[a] = (tahun[a] ?? 0) + 1;
  }

  return {
    jumlah,
    perBidang: Object.fromEntries(
      Object.entries(perBidang).map(([n, s]) => [
        n,
        {
          ada: s.ada,
          rasioAda: jumlah ? Math.round((s.ada / jumlah) * 1000) / 10 : 0,
          tipeSalah: s.tipeSalah,
          rasioKosong: jumlah ? Math.round((s.kosong / jumlah) * 1000) / 10 : 0,
          contohSalah: s.contohSalah,
        },
      ]),
    ),
    bidangTambahan: Object.fromEntries([...tambahan.entries()].sort()),
    opd: opd.size,
    indikator: indikator.size,
    tahunTeratas: Object.fromEntries(Object.entries(tahun).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 8)),
  };
}

function periksa(a) {
  for (const k of KONTRAK) {
    const s = a.perBidang[k.nama];
    if (s.rasioAda < 100) {
      no(`bidang wajib "${k.nama}" ada di semua record`, `hanya ${s.rasioAda}%`);
      continue;
    }
    if (s.tipeSalah > 0) {
      no(`tipe bidang "${k.nama}" sesuai kontrak`, `${s.tipeSalah} salah — contoh ${s.contohSalah}`);
      continue;
    }
    ok(`bidang "${k.nama}" lengkap & bertipe benar`, `${s.rasioAda}% ada`);
  }
  if (a.perBidang['opds_nama_opd'].rasioKosong > 0) {
    no('opds_nama_opd tidak ada yang kosong', `${a.perBidang['opds_nama_opd'].rasioKosong}% kosong`);
  } else {
    ok('opds_nama_opd tidak ada yang kosong', `0 dari ${a.jumlah}`);
  }
  if (a.perBidang['variabel'].rasioKosong > 0) {
    no('variabel (nilai) tidak ada yang kosong', `${a.perBidang['variabel'].rasioKosong}% kosong`);
  } else {
    ok('variabel (nilai) tidak ada yang kosong', `0 dari ${a.jumlah}`);
  }
}

function bandingkan(a, b) {
  bagian('Perbandingan dengan snapshot kontrak terakhir');
  // CATATAN KETEPATAN (ditemukan saat menulis bagian ini): perbandingan snapshot
  // TIDAK bisa menjadi tempat pertama yang menangkap bidang-kontrak-yang-hilang
  // — pemeriksaan kontrak di atas sudah menangkapnya lebih dulu, untuk SETIAP
  // bidang, karena semua bidang kontrak wajib. Menulis pemeriksaan "bidang
  // hilang" di sini akan menjadi kode mati yang mengaku menjaga sesuatu.
  // Jadi pembandingan snapshot di sini fokus pada GEOMETRI data: rasio-kosong,
  // jumlah, dan bidang TAMBAHAN (yang memang tidak diperiksa kontrak).
  const tambahanHilang = Object.keys(b.bidangTambahan ?? {}).filter((n) => !(n in a.bidangTambahan));
  if (tambahanHilang.length) {
    catat(`bidang tambahan hilang: ${tambahanHilang.join(', ')}`, 'tidak dibaca aplikasi — dicatat, bukan digagalkan');
  }
  const bedaTipe = Object.entries(a.perBidang).filter(([n, s]) => s.tipeSalah > 0 && (b.perBidang[n]?.tipeSalah ?? 0) === 0);
  if (bedaTipe.length) {
    catat(`bidang bertipe salah yang sebelumnya bersih: ${bedaTipe.map(([n]) => n).join(', ')}`, 'sudah digagalkan di pemeriksaan kontrak');
  }

  let lonjakan = 0;
  for (const n of Object.keys(a.perBidang)) {
    const s = a.perBidang[n];
    if (s.tipeSalah > 0) lonjakan += 0; // sudah dilaporkan di pemeriksaan kontrak
    const beda = s.rasioKosong - (b.perBidang[n]?.rasioKosong ?? 0);
    if (beda > AMBANG_LONJAKAN_KOSONG) {
      no(`rasio kosong "${n}" melonjak`, `${b.perBidang[n]?.rasioKosong ?? 0}% → ${s.rasioKosong}%`);
      lonjakan += 1;
    }
  }
  if (lonjakan === 0) ok(`tidak ada lonjakan rasio-kosong > ${AMBANG_LONJAKAN_KOSONG} poin`);

  const bedaJumlah = Math.abs(a.jumlah - b.jumlah);
  if (bedaJumlah > 0) {
    catat(`jumlah record berubah: ${b.jumlah} → ${a.jumlah}`, 'wajar bila SPLP menambah/mengurangi data');
  }
  const bidangTambahanBaru = Object.keys(a.bidangTambahan).filter((n) => !(n in b.bidangTambahan));
  if (bidangTambahanBaru.length) catat(`bidang tak-terpakai baru: ${bidangTambahanBaru.join(', ')}`);
}

async function main() {
  console.log('══ Uji kontrak skema SPLP (P2) ══');
  console.log(`   sumber: ${OPSI['url'] ? URL_SPLP : path.relative(AKAR, BERKAS)}`);
  if (SABOTASE) console.log(`   MODE SABOTASE: ${SABOTASE} — harness WAJIB GAGAL`);

  let sumber;
  try {
    sumber = await bacaSumber();
  } catch (e) {
    console.log(`\n  \x1b[31m✗ sumber tidak dapat dibaca: ${e.message}\x1b[0m`);
    return 2;
  }
  if (!Array.isArray(sumber.records) || sumber.records.length === 0) {
    console.log('\n  \x1b[31m✗ sumber tidak memuat array data yang berisi\x1b[0m');
    return 2;
  }
  const records = sabotase(sumber.records.map((r) => ({ ...r })));

  bagian('Kontrak bidang (yang benar-benar dibaca aplikasi)');
  const a = analisis(records);
  periksa(a);
  console.log(
    `  · katalog: ${a.jumlah} record · ${a.opd} OPD · ${a.indikator} indikator unik · tahun teratas ${JSON.stringify(a.tahunTeratas)}`,
  );
  const tambahan = Object.entries(a.bidangTambahan);
  if (tambahan.length) catat('bidang tambahan pada sumber (tidak dibaca aplikasi)', tambahan.map(([n, c]) => `${n}(${c})`).join(', '));

  if (!SABOTASE && existsSync(BASELINE)) {
    bandingkan(a, JSON.parse(readFileSync(BASELINE, 'utf8')));
  } else if (!SABOTASE) {
    catat('snapshot kontrak belum ada', 'jalankan --tulis-baseline untuk membuatnya');
  }

  if (!SABOTASE && (TULIS_BASELINE || !existsSync(BASELINE))) {
    writeFileSync(BASELINE, `${JSON.stringify(a, null, 2)}\n`, 'utf8');
    catat('snapshot kontrak ditulis', path.relative(AKAR, BASELINE));
  }

  bagian('Ringkasan');
  if (SABOTASE) {
    // Dalam mode sabotase, HASIL YANG BENAR adalah GAGAL. Ini kontrol negatif:
    // harness yang tidak bisa gagal tidak membuktikan apa pun.
    if (GAGAL.length > 0) {
      console.log(`  \x1b[32m✓ KONTROL NEGATIF LULUS\x1b[0m — sabotase "${SABOTASE}" tertangkap (${GAGAL.length} pelanggaran)`);
      return 0;
    }
    console.log(`  \x1b[31m✗ KONTROL NEGATIF GAGAL\x1b[0m — sabotase "${SABOTASE}" TIDAK tertangkap`);
    return 1;
  }

  if (GAGAL.length === 0) {
    console.log(`  \x1b[32m✓ LULUS\x1b[0m — ${LULUS.length} pemeriksaan kontrak terpenuhi${CATATAN.length ? `, ${CATATAN.length} catatan` : ''}`);
    return 0;
  }
  console.log(`  \x1b[31m✗ GAGAL\x1b[0m — ${GAGAL.length} pelanggaran:`);
  for (const g of GAGAL) console.log(`    - ${g}`);
  return 1;
}

main()
  .then((kode) => {
    process.exitCode = kode;
  })
  .catch((e) => {
    console.error('Galat uji:', e);
    process.exitCode = 2;
  });
