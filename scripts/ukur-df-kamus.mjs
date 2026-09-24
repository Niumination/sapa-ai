#!/usr/bin/env node
// ─── DS-05 · Alat tinjauan 3 bulan: ukur df kamus terhadap sebuah korpus ───
//
// Gunanya: saat tinjauan berkala (dokumen 10: tiap 3 bulan), jalankan alat ini
// pada korpus terbaru untuk memastikan dua hal tetap benar:
//   1. setiap KATA kamus masih ber-df 0 (kalau katalog sudah memakai kata itu,
//      entri harus DIHAPUS — memetakan kata yang ada di katalog menyesatkan);
//   2. setiap PADANAN masih ber-df > 0 (kalau tidak, entri itu mati).
// Keluarannya siap disalin ke `dfProduksi` pada `src/lib/kamus-daerah.ts`.
//
// Pakai:
//   node scripts/ukur-df-kamus.mjs verifikasi/korpus-produksi.json
//   node scripts/ukur-df-kamus.mjs verifikasi/korpus-uji-besar.json
//
// Keluar: 0 = kamus masih sehat, 1 = ada entri yang harus diperbarui/dihapus.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const berkas = process.argv[2] ?? 'verifikasi/korpus-uji-besar.json';

const kamus = readFileSync(join(AKAR, 'src', 'lib', 'kamus-daerah.ts'), 'utf8');
const entri = [...kamus.matchAll(/^ {2}\{ kata: '([^']+)', padanan: \[([^\]]+)\], arti: '[^']*', sumber: '[^']*', dfProduksi: \{([^}]*)\}/gm)].map((m) => ({
  kata: m[1],
  padanan: m[2].split(',').map((t) => t.trim().replace(/^'|'$/g, '')).filter(Boolean),
  // df yang sudah tercatat di modul (= terukur pada katalog PRODUKSI saat kurasi).
  // Dipakai untuk membedakan "padanan tidak ada di korpus ini" (informasi biasa,
  // mis. korpus uji sandbox memang lebih kecil) dari "padanan memang mati".
  dfTercatat: Object.fromEntries(m[3].split(',').map((b) => b.split(':').map((x) => x.trim())).filter((b) => b.length === 2)),
}));
const ditinjauPada = /DITINJAU_PADA = '([^']+)'/.exec(kamus)?.[1] ?? '?';
const tinjauanBerikutnya = /TINJAUAN_BERIKUTNYA = '([^']+)'/.exec(kamus)?.[1] ?? '?';

const korpus = JSON.parse(readFileSync(join(AKAR, berkas), 'utf8'));
const data = Array.isArray(korpus) ? korpus : korpus.data;
const nama = [...new Set(data.map((r) => String(r.kode_indikator_nama_indikator ?? r.indikator ?? '').trim()))];

const df = (kata) => {
  const pola = new RegExp(`(?<![a-z0-9])${kata.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
  return nama.filter((n) => pola.test(n)).length;
};

console.log(`\n  Tinjauan kamus daerah DS-05`);
console.log(`  korpus   : ${berkas} (${data.length} record · ${nama.length} nama indikator unik)`);
console.log(`  ditinjau : ${ditinjauPada} · berikutnya: ${tinjauanBerikutnya}\n`);

const kunciMenyusup = [];
const padananMati = [];
const hanyaProduksi = [];
const barisDf = [];

for (const e of entri) {
  const dfKunci = df(e.kata);
  const dfs = e.padanan.map((p) => [p, df(p)]);
  if (dfKunci > 0) kunciMenyusup.push({ ...e, dfKunci });
  if (dfs.every(([, n]) => n === 0)) {
    const adaDiProduksi = e.padanan.some((p) => Number(e.dfTercatat?.[p] ?? 0) > 0);
    if (adaDiProduksi) hanyaProduksi.push({ ...e, dfs });
    else padananMati.push({ ...e, dfs });
  }
  barisDf.push(`  { kata: '${e.kata}', padanan: [${e.padanan.map((p) => `'${p}'`).join(', ')}], dfProduksi: {${dfs.map(([p, n]) => `${p}: ${n}`).join(', ')}}, terbuktiKorpusUji: ${dfs.some(([, n]) => n > 0)} },`);
}

console.log(`  entri diperiksa       : ${entri.length}`);
console.log(`  kata yang MULAI ada di katalog (harus dihapus): ${kunciMenyusup.length}`);
for (const k of kunciMenyusup) console.log(`    ✗ ${k.kata} — df=${k.dfKunci}`);
console.log(`  padanan MATI di korpus ini & tidak tercatat di produksi: ${padananMati.length}`);
for (const k of padananMati) console.log(`    ✗ ${k.kata} — ${k.dfs.map(([p, n]) => `${p}:${n}`).join(', ')}`);
console.log(`  padanan hanya ada di katalog PRODUKSI (bukan masalah, tidak bisa diuji end-to-end di korpus ini): ${hanyaProduksi.length}`);
for (const k of hanyaProduksi) console.log(`    · ${k.kata} — ${k.padanan.map((p) => `${p}:prod ${k.dfTercatat?.[p] ?? 0}`).join(', ')}`);

console.log(`\n  ── siap disalin ke dfProduksi / terbuktiKorpusUji (hasil ukur ${new Date().toISOString().slice(0, 10)}) ──`);
for (const b of barisDf) console.log(b);

const adaMasalah = kunciMenyusup.length > 0 || padananMati.length > 0;
console.log(
  adaMasalah
    ? `\n  GAGAL — perbarui kamus: hapus kata yang sudah ada di katalog, ganti padanan yang mati.\n`
    : `\n  LULUS — kamus masih sehat menurut korpus ini${hanyaProduksi.length ? ` (${hanyaProduksi.length} entri hanya terbukti di katalog produksi)` : ''}.\n`,
);
process.exitCode = adaMasalah ? 1 : 0;
