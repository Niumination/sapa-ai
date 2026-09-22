#!/usr/bin/env node
// ─── Uji sitasi per klaim (FR-19) — 50 keluaran sampel ───────────────────────
//
// Kriteria terima dokumen 10 untuk FR-19: "0 klaim tanpa rujukan pada 50 keluaran
// sampel". Skrip ini menjalankannya secara objektif:
//
//   1. Menyusun 50 pertanyaan sampel (lintas indikator, lintas bentuk kalimat).
//   2. Meminta jawaban dari server yang hidup (mode AI atau deterministik).
//   3. Untuk setiap jawaban: membaca `narasiBersitasi` + `sitasi`, lalu
//      MEMERIKSA SENDIRI (tidak sekadar percaya ringkasan) bahwa setiap penanda
//      [n] menunjuk baris bukti yang angkanya benar-benar muncul pada kalimat itu.
//   4. Mencetak ringkasan + daftar pelanggaran, keluar 1 bila ada pelanggaran.
//
// Pakai:
//   SAPA_EVAL_URL=http://127.0.0.1:3116 node scripts/uji-sitasi.mjs
//   SAPA_EVAL_URL=http://127.0.0.1:3116 SAPA_SITASI_JUMLAH=50 node scripts/uji-sitasi.mjs
//
// Catatan kejujuran: pada korpus stub (luring), 50 pertanyaan dibangun dari 10
// indikator tiruan. Angka yang dihasilkan sah untuk menguji MEKANISME sitasi;
// evaluasi dengan data SPLP sungguhan tetap perlu dijalankan saat daring.

const URL_DASAR = (process.env.SAPA_EVAL_URL ?? 'http://127.0.0.1:3116').replace(/\/$/, '');
const JUMLAH = Number(process.env.SAPA_SITASI_JUMLAH ?? 50);
// Jeda antar-permintaan (ms). Pembatas laju server 30/menit membuat jeda 2100 ms
// menjadi aman; naikkan bila server memiliki batas lebih ketat.
const JEDA_MS = Number(process.env.SAPA_SITASI_JEDA_MS ?? 2100);

// Indikator pada korpus stub + beberapa pertanyaan meta yang jawabannya tanpa bukti
// (keduanya penting: yang pertama menguji sitasi, yang kedua menguji "tidak mengarang").
const TOPIK = [
  'jumlah penduduk',
  'prevalensi stunting',
  'indeks pembangunan manusia',
  'jumlah asn',
  'produksi kopi arabika',
  'jumlah petani kopi arabika',
  'tingkat kemiskinan',
  'jumlah koperasi di kecamatan bebesen',
  'jumlah keluarga penerima bantuan sosial sembako',
  'panjang jalan kabupaten',
];

const BENTUK = [
  (t) => `Berapa ${t}?`,
  (t) => `${t} sekarang berapa?`,
  (t) => `tolong tampilkan data ${t}`,
  (t) => `${t} tahun 2026`,
  (t) => `apa itu ${t}`,
];

const NEGATIF = [
  'berapa jumlah pemilik kucing liar di bireuen',
  'data gempa bulan lalu',
  'berapa jumlah drone di kecamatan peusangan',
  'siapa juara sepak bola kabupaten',
  'berapa harga cabai hari ini',
];

const PERTANYAAN = [];
for (let i = 0; i < Math.max(JUMLAH - NEGATIF.length, 0); i++) {
  const t = TOPIK[i % TOPIK.length];
  const bentuk = BENTUK[Math.floor(i / TOPIK.length) % BENTUK.length];
  PERTANYAAN.push(bentuk(t));
}
PERTANYAAN.push(...NEGATIF.slice(0, Math.max(JUMLAH - PERTANYAAN.length, 0)));

/** Normalisasi angka untuk pemeriksaan independen: "9.610" → "9610", "31,4" → "31.4". */
function angkaDari(teks) {
  const keluar = [];
  const pola = /\d[\d.]*(?:,\d+)?/g;
  let m;
  while ((m = pola.exec(teks)) !== null) {
    const tok = m[0];
    let n = tok;
    if (n.includes(',') && n.includes('.')) n = n.replace(/\./g, '').replace(',', '.');
    else if (n.includes(',')) n = n.replace(',', '.');
    else if ((n.match(/\./g) ?? []).length === 1 && /^\d{1,3}\.\d{3}$/.test(n)) n = n.replace(/\./g, '');
    else if ((n.match(/\./g) ?? []).length > 1) n = n.replace(/\./g, '');
    const f = Number(n);
    if (Number.isFinite(f)) keluar.push(f);
  }
  return keluar;
}

const SKALA = [
  [/\btriliun/i, 1e12],
  [/\bmiliar\b|\bmilyar\b/i, 1e9],
  [/\bjuta\b/i, 1e6],
  [/\bribu\b/i, 1e3],
];

function angkaDenganSkala(teks) {
  const dasar = angkaDari(teks);
  let faktor = 1;
  for (const [pola, f] of SKALA) if (pola.test(teks)) faktor = f;
  return dasar.map((n) => (n < 1e6 && faktor > 1 ? n * faktor : n));
}

/**
 * Kirim satu pertanyaan, menghormati pembatas laju server.
 *
 * Server membatasi 30 permintaan/menit per alamat (dan itu memang disengaja).
 * Alih-alih menembusnya, skrip ini menunggu sesuai `Retry-After` lalu mencoba
 * lagi — perilaku yang sama dengan klien yang sopan, dan membuat skrip ini aman
 * dijalankan terhadap produksi pula.
 */
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

const ringkas = { total: 0, klaim: 0, bersitasi: 0, tanpaSitasi: [], penunjukanSalah: [], tanpaBukti: 0 };
const rincian = [];

for (const q of PERTANYAAN) {
  let jawab;
  try {
    jawab = await tanya(q);
  } catch (e) {
    console.error(`GAGAL menghubungi ${URL_DASAR}: ${e.message}`);
    process.exit(2);
  }
  if (jawab.galat) {
    console.error(`GAGAL menjawab "${q}": ${jawab.galat}`);
    process.exit(2);
  }

  ringkas.total += 1;
  const bukti = jawab.evidence ?? [];
  const sitasi = jawab.sitasi ?? { totalKlaim: 0, bersitasi: 0, tanpaSitasi: [] };
  const narasi = jawab.narasiBersitasi ?? jawab.narasi ?? '';

  if (bukti.length === 0) ringkas.tanpaBukti += 1;
  ringkas.klaim += sitasi.totalKlaim ?? 0;
  ringkas.bersitasi += sitasi.bersitasi ?? 0;
  if ((sitasi.tanpaSitasi ?? []).length > 0) ringkas.tanpaSitasi.push({ q, klaim: sitasi.tanpaSitasi });

  // ── Pemeriksaan INDEPENDEN: setiap penanda [n] harus menunjuk baris bukti yang
  //    angkanya benar-benar tampak pada kalimat itu (penanda tidak boleh dikarang).
  const kalimat = narasi.split(/(?<=[.!?])\s+/);
  for (const k of kalimat) {
    const nomor = (k.match(/\[(\d+)\]/g) ?? []).map((x) => Number(x.replace(/[^\d]/g, '')));
    if (nomor.length === 0) continue;
    const angkaKalimat = angkaDenganSkala(k.replace(/\[\d+\]/g, ' '));
    for (const n of nomor) {
      const baris = bukti[n - 1];
      if (!baris) {
        ringkas.penunjukanSalah.push({ q, penanda: n, sebab: 'baris bukti tidak ada' });
        continue;
      }
      const nilaiBaris = angkaDari(String(baris.nilai));
      const cocok = nilaiBaris.some((v) =>
        angkaKalimat.some((a) => {
          const rel = Math.abs(v - a) / Math.max(Math.abs(v), 1);
          return rel <= 0.006 || (Number.isInteger(v) && Math.abs(v - a) < 0.5);
        }),
      );
      if (!cocok) {
        ringkas.penunjukanSalah.push({
          q,
          penanda: n,
          sebab: `nilai baris "${baris.nilai}" (${baris.indikator}) tidak tampak pada: ${k.slice(0, 90)}`,
        });
      }
    }
  }

  rincian.push({ q, bukti: bukti.length, klaim: sitasi.totalKlaim ?? 0, bersitasi: sitasi.bersitasi ?? 0 });
  process.stdout.write(`\r  sampel ${ringkas.total}/${PERTANYAAN.length} — ${ringkas.bersitasi}/${ringkas.klaim} klaim bersitasi`.padEnd(70));
  if (JEDA_MS > 0) await new Promise((r) => setTimeout(r, JEDA_MS));
}

// ── Laporan ──────────────────────────────────────────────────────────────────
console.log('');
console.log('═══ Uji sitasi per klaim (FR-19) ═══');
console.log(`  server          : ${URL_DASAR}`);
console.log(`  keluaran sampel : ${ringkas.total}`);
console.log(`  kalimat klaim   : ${ringkas.klaim}`);
console.log(`  klaim bersitasi : ${ringkas.bersitasi}`);
const tanpa = ringkas.klaim - ringkas.bersitasi;
console.log(`  klaim TANPA rujukan : ${tanpa}`);
console.log(`  jawaban tanpa bukti : ${ringkas.tanpaBukti} (wajar: pertanyaan di luar katalog)`);
console.log(`  penunjukan salah    : ${ringkas.penunjukanSalah.length}`);
console.log('');

if (ringkas.tanpaSitasi.length > 0) {
  console.log('Klaim tanpa rujukan yang dilaporkan server:');
  for (const t of ringkas.tanpaSitasi.slice(0, 10)) {
    console.log(`  - "${t.q}"`);
    for (const k of t.klaim) console.log(`      · ${k}`);
  }
  console.log('');
}

if (ringkas.penunjukanSalah.length > 0) {
  console.log('Penunjukan yang tidak dapat diverifikasi (WAJIB ditelusuri):');
  for (const p of ringkas.penunjukanSalah.slice(0, 10)) console.log(`  - "${p.q}" [${p.penanda}] ${p.sebab}`);
  console.log('');
}

const lulus = tanpa === 0 && ringkas.penunjukanSalah.length === 0 && ringkas.klaim > 0;
if (lulus) {
  console.log(`✓ LULUS — ${ringkas.bersitasi}/${ringkas.klaim} klaim bersitasi, 0 penunjukan salah, pada ${ringkas.total} keluaran sampel.`);
  process.exit(0);
}
console.log('✗ GAGAL — lihat daftar di atas.');
process.exit(1);
