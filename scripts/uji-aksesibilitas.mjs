#!/usr/bin/env node
// ─── NFR-09 · Uji aksesibilitas halaman utama (WCAG 2.2 AA) ───
//
// Yang dilakukan:
//   1. Ambil HTML yang BENAR-BENAR disajikan server (`/dashboard`).
//   2. UJI DIRI pemeriksa — HTML halaman itu sengaja dirusak satu per satu
//      (tanpa lang, tanpa alt, dua h1, tanpa tautan lompati, tanpa wilayah live,
//      isian tanpa label, tombol tanpa nama, tabindex positif, kontras rendah).
//      Tiap cacat WAJIB dilaporkan. Kalau tidak, harness GAGAL — supaya "hijau"
//      tidak bisa berarti "vakum".
//   3. Periksa struktur halaman + kontras token yang dipakai, lalu putuskan.
//
// Batas yang jujur: tanpa peramban, urutan fokus nyata, perangkap fokus, dan
// ukuran sasaran dalam piksel tidak dapat diukur. Ukuran sasaran diperiksa
// lewat konvensi kelas `target-min` (lihat `24-LAPORAN-NFR-09.md` §4).
//
// Pakai: SAPA_A11Y_URL=http://127.0.0.1:3131 node scripts/uji-aksesibilitas.mjs
// Keluar: 0 = LULUS, 1 = ada pelanggaran, 2 = halaman tidak dapat diambil.

import { periksaHtml, periksaKontras, periksaCss, ambilElemen, atr } from '../verifikasi/aksesibilitas.mjs';

const URL_DASAR = process.env.SAPA_A11Y_URL ?? 'http://127.0.0.1:3131';
const JALUR = ['/dashboard'];

const warna = {
  ok: '\x1b[32m✓\x1b[0m',
  no: '\x1b[31m✗\x1b[0m',
  info: '\x1b[36m·\x1b[0m',
  tebal: (t) => `\x1b[1m${t}\x1b[0m`,
};

// ── 1. Sabotase: cacat yang ditanam wajib tertangkap ──────────────────────
// Semua penggantian memakai STRING biasa (bukan regex) supaya harfiah dan tidak
// bergantung pada aturan escaping — pada jalan pertama, sabotase berbasis regex
// gagal cocok dan uji diri menjadi vakum.
export function daftarSabotase(html) {
  const img = ambilElemen(html, 'img')[0];
  const input = ambilElemen(html, 'input').find((i) => (atr(i.tag, 'type') ?? 'text') === 'text');
  const tombolKosong = ambilElemen(html, 'button').find((b) => /aria-label=/.test(b.tag));

  const daftar = [
    {
      nama: 'lang dihapus',
      rusak: (h) => h.replace('lang="id"', ''),
      pola: /tanpa atribut lang/,
    },
    {
      nama: 'h1 kedua ditanam',
      rusak: (h) => h.replace('<main', '<main><h1>Judul tambahan</h1>'),
      pola: /ada 2 <h1>/,
    },
    {
      nama: 'tautan lompati dihapus',
      rusak: (h) => h.replace(/(<a[^>]*>)(?:(?!<\/a>)[\s\S])*?(?:Lompati|Lewati|Skip)(?:(?!<\/a>)[\s\S])*?<\/a>/, ''),
      pola: /tidak ada tautan "Lompati ke konten"/,
    },
    {
      nama: 'wilayah live dihapus',
      rusak: (h) => h.replaceAll('aria-live="polite"', '').replaceAll('role="status"', ''),
      pola: /tidak ada wilayah live/,
    },
    {
      nama: 'tabindex positif ditanam',
      rusak: (h) => h.replace('<button', '<button tabindex="3"'),
      pola: /tabindex="3" positif/,
    },
  ];

  if (img) {
    daftar.push({
      nama: 'alt gambar dihapus',
      rusak: (h) => h.replace(img.tag, img.tag.replace(/\salt="[^"]*"/, '')),
      pola: /tanpa atribut alt/,
    });
  }
  if (input) {
    daftar.push({
      nama: 'label isian dicopot',
      rusak: (h) => h.replace(input.tag, input.tag.replace(/\saria-label="[^"]*"/, '').replace(/\sid="[^"]*"/, '')),
      pola: /tanpa label/,
    });
  }
  if (tombolKosong) {
    daftar.push({
      nama: 'tombol kehilangan nama',
      rusak: (h) => h.replace(tombolKosong.tag, tombolKosong.tag.replace(/\saria-label="[^"]*"/, '')),
      pola: /tanpa nama aksesibel/,
    });
  }
  return daftar;
}

export function daftarSabotaseCss() {
  return [
    {
      nama: 'jaminan 24 px dihapus',
      rusak: (css) => css.replace(/min-height:\s*24px/g, 'min-height: 10px'),
      pola: /SC 2.5.8/,
    },
    {
      nama: 'cincin fokus dihapus',
      rusak: (css) => css.replace(/:focus-visible/g, ':hover'),
      pola: /cincin fokus/,
    },
    {
      nama: 'prefers-reduced-motion dihapus',
      rusak: (css) => css.replace(/prefers-reduced-motion/g, 'prefers-color-scheme'),
      pola: /prefers-reduced-motion/,
    },
  ];
}

function ujiDiriCss(css) {
  const daftar = daftarSabotaseCss();
  const gagal = [];
  const rincian = [];
  for (const s of daftar) {
    const rusak = s.rusak(css);
    if (rusak === css) {
      gagal.push(`sabotase CSS "${s.nama}" tidak mengubah apa pun — pola tidak cocok`);
      rincian.push({ nama: `CSS · ${s.nama}`, lulus: false });
      continue;
    }
    const { pelanggaran } = periksaCss(rusak);
    const ketemu = pelanggaran.some((p) => s.pola.test(p));
    rincian.push({ nama: `CSS · ${s.nama}`, lulus: ketemu, bukti: ketemu ? pelanggaran.find((p) => s.pola.test(p)) : null });
    if (!ketemu) gagal.push(`sabotase CSS "${s.nama}" TIDAK tertangkap`);
  }
  return { rincian, gagal };
}

function ujiDiri(htmlHalaman) {
  const daftar = daftarSabotase(htmlHalaman);
  const gagal = [];
  const rincian = [];
  for (const s of daftar) {
    const h = s.rusak(htmlHalaman);
    if (h === htmlHalaman) {
      gagal.push(`sabotase "${s.nama}" tidak mengubah apa pun — pola tidak cocok dengan HTML halaman saat ini`);
      rincian.push({ nama: s.nama, lulus: false });
      continue;
    }
    const { pelanggaran } = periksaHtml(h, { nama: 'sabotase' });
    const ketemu = pelanggaran.some((p) => s.pola.test(p));
    rincian.push({ nama: s.nama, lulus: ketemu, bukti: ketemu ? pelanggaran.find((p) => s.pola.test(p)) : null });
    if (!ketemu) gagal.push(`sabotase "${s.nama}" TIDAK tertangkap (pola ${s.pola})`);
  }

  // Sabotase warna: pasangan kontras rendah wajib dilaporkan.
  const { pelanggaran: pk } = periksaKontras([
    { nama: 'sabotase kontras', depan: '#9A9683', belakang: '#FFFFFF', jenis: 'teks', di: 'sabotase' },
  ]);
  const kontrasTertangkap = pk.length === 1;
  rincian.push({ nama: 'kontras rendah', lulus: kontrasTertangkap });
  if (!kontrasTertangkap) gagal.push('sabotase kontras rendah TIDAK tertangkap');

  // Sabotase warna yang harus LULUS: hijau tua di putih — memastikan alat ukur
  // tidak sekadar "selalu menuduh".
  const { pelanggaran: pk2 } = periksaKontras([
    { nama: 'sabotase kontras aman', depan: '#1B4332', belakang: '#FFFFFF', jenis: 'teks', di: 'sabotase' },
  ]);
  if (pk2.length !== 0) gagal.push('pasangan kontras yang JELAS aman justru dituduh melanggar — alat ukur tidak dapat dipercaya');
  rincian.push({ nama: 'kontras aman tidak dituduh', lulus: pk2.length === 0 });

  return { rincian, gagal, jumlah: rincian.length };
}

// ── 2. Ambil HTML & CSS nyata ──────────────────────────────────────────────
async function ambilCssDari(html) {
  const tautan = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
    .map((m) => atr(m[0], 'href'))
    .filter(Boolean);
  const kepingan = [];
  for (const href of tautan) {
    const url = href.startsWith('http') ? href : `${URL_DASAR}${href}`;
    const res = await fetch(url, { headers: { 'user-agent': 'uji-aksesibilitas/1' } });
    if (res.ok) kepingan.push(await res.text());
  }
  return { css: kepingan.join('\n'), jumlah: tautan.length };
}

async function ambilDokumen(jalur) {
  const res = await fetch(`${URL_DASAR}${jalur}`, { headers: { 'user-agent': 'uji-aksesibilitas/1' } });
  if (!res.ok) throw new Error(`${jalur} → HTTP ${res.status}`);
  return res.text();
}

// ── 3. Jalan ───────────────────────────────────────────────────────────────
const pelanggaran = [];
const catatan = [];
console.log(warna.tebal(`\n  NFR-09 · aksesibilitas ${URL_DASAR} (WCAG 2.2 AA)\n`));

const halaman = [];
for (const jalur of JALUR) {
  let html;
  try {
    html = await ambilDokumen(jalur);
  } catch (err) {
    console.error(`  ${warna.no} ${jalur}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  halaman.push(html);
  const hasil = periksaHtml(html, { nama: jalur });
  console.log(`  ${warna.tebal(jalur)} — ${html.length} bita`);
  console.log(
    `  ${warna.info} statistik: ${Object.entries(hasil.statistik)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
  );
  if (hasil.pelanggaran.length === 0) console.log(`  ${warna.ok} struktur: tidak ada pelanggaran`);
  else for (const p of hasil.pelanggaran) console.log(`  ${warna.no} ${p}`);
  pelanggaran.push(...hasil.pelanggaran);
  catatan.push(...hasil.catatan);
}

// CSS yang benar-benar dikirim server.
let css = '';
try {
  const hasil = await ambilCssDari(halaman[0]);
  css = hasil.css;
  console.log(`\n  ${warna.tebal('Gaya yang dikirim server')} — ${hasil.jumlah} berkas · ${css.length} bita`);
  const gaya = periksaCss(css);
  if (gaya.pelanggaran.length === 0) {
    console.log(
      `  ${warna.ok} janji di CSS ada: sasaran 24 px ${gaya.temuan.sasaran ? 'ya' : 'tidak'} · cincin fokus ${gaya.temuan.fokus ? 'ya' : 'tidak'} · prefers-reduced-motion ${gaya.temuan.gerak ? 'ya' : 'tidak'}`,
    );
  } else for (const p of gaya.pelanggaran) console.log(`  ${warna.no} ${p}`);
  pelanggaran.push(...gaya.pelanggaran);

  const diriCss = ujiDiriCss(css);
  console.log(`\n  ${warna.tebal('Uji diri pemeriksa CSS')} — ${diriCss.rincian.length} sabotase`);
  for (const r of diriCss.rincian) console.log(`  ${r.lulus ? warna.ok : warna.no} ${r.nama}`);
  pelanggaran.push(...diriCss.gagal.map((g) => `uji diri pemeriksa CSS GAGAL — ${g}`));
  var diriRingkasCss = diriCss;
} catch (err) {
  pelanggaran.push(`tidak dapat mengambil CSS: ${err instanceof Error ? err.message : String(err)}`);
}

// Uji diri pemeriksa — atas HTML halaman yang benar-benar diambil.
const diri = ujiDiri(halaman[0]);
console.log(`\n  ${warna.tebal('Uji diri pemeriksa')} — ${diri.jumlah} sabotase`);
for (const r of diri.rincian) {
  console.log(`  ${r.lulus ? warna.ok : warna.no} ${r.nama}${r.bukti ? ` → ${r.bukti.slice(0, 96)}` : ''}`);
}
pelanggaran.push(...diri.gagal.map((g) => `uji diri pemeriksa GAGAL — ${g}`));

// Kontras token (independen dari halaman yang diambil).
const kontras = periksaKontras();
const gagalKontras = kontras.rincian.filter((r) => !r.lulus);
console.log(`\n  ${warna.tebal('Kontras token yang dipakai')} — ${kontras.rincian.length} pasangan diperiksa`);
for (const r of kontras.rincian) {
  if (!r.lulus) console.log(`  ${warna.no} ${r.rasio.toFixed(2)}:1 (butuh ${r.ambang}:1) — ${r.nama} · ${r.di}`);
}
if (gagalKontras.length === 0) {
  const terketat = [...kontras.rincian].sort((a, b) => a.rasio - a.ambang - (b.rasio - b.ambang))[0];
  console.log(`  ${warna.ok} semua pasangan memenuhi ambang WCAG 2.2 AA (paling ketat: ${terketat.nama} ${terketat.rasio.toFixed(2)}:1)`);
}
pelanggaran.push(...kontras.pelanggaran);

if (catatan.length) {
  console.log(`\n  ${warna.tebal('Catatan (bukan pelanggaran)')}`);
  for (const c of catatan.slice(0, 8)) console.log(`  ${warna.info} ${c}`);
  if (catatan.length > 8) console.log(`  ${warna.info} … dan ${catatan.length - 8} catatan lain`);
}

const lulusDiri = diri.rincian.filter((r) => r.lulus).length;
console.log('\n  ──────────────── Ringkasan ────────────────');
console.log(`  halaman diperiksa   : ${JALUR.join(', ')}`);
console.log(`  sabotase tertangkap : ${lulusDiri}/${diri.jumlah} (HTML) · ${diriRingkasCss ? `${diriRingkasCss.rincian.filter((r) => r.lulus).length}/${diriRingkasCss.rincian.length}` : '0/0'} (CSS)`);
console.log(`  pasangan kontras    : ${kontras.rincian.length - gagalKontras.length}/${kontras.rincian.length} lulus`);

if (pelanggaran.length) {
  console.log(`\n  ${warna.no} GAGAL — ${pelanggaran.length} pelanggaran:`);
  for (const p of pelanggaran) console.log(`    · ${p}`);
  process.exit(1);
}
console.log(`\n  ${warna.ok} LULUS — pemeriksa terbukti menangkap cacat yang ditanam, halaman utama bersih, kontras AA terpenuhi.`);
process.exit(0);
