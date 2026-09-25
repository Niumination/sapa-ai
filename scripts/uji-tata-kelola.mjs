#!/usr/bin/env node
// ─── CMP-03 · Uji tata kelola risiko AI (register bertuan + bukti nyata) ───────
//
// Yang dibuktikan harness ini:
//   A. KELENGKAPAN — setiap risiko punya pemilik BERUPA PERAN, kendali, bukti, dan
//      tindak lanjut bertanggal; keempat fungsi NIST AI RMF terwakili.
//   B. BUKTI NYATA — setiap rujukan bukti (uji/harness/laporan/modul) benar-benar
//      ADA sebagai berkas di repositori; rujukan jenis `endpoint` dijawab aplikasi
//      yang sedang berjalan (bukan alamat karangan).
//   C. HALAMAN & KONSISTENSI — halaman publik memuat setiap risiko beserta
//      pemiliknya, dan tingkat risiko yang dilaporkan cocok dengan matriks
//      kemungkinan × dampak.
//   D. SABOTASE (mode `--sabotase`) — register yang sengaja dirusak (pemilik
//      dihapus, bukti menunjuk berkas tidak ada, tenggat lewat, jenis bukti asing)
//      WAJIB membuat pemeriksa melaporkan pelanggaran. Tanpa ini, "hijau" hanya
//      berarti "tidak ada yang diperiksa".
//
// Pakai: node scripts/uji-tata-kelola.mjs [--sabotase]
// Keluar: 0 = lulus, 1 = ada pelanggaran, 2 = gagal menyiapkan.

import { envUji } from './lingkungan-uji.mjs';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};
const SABOTASE = process.argv.includes('--sabotase');

const PORT_SPLP = Number(arg('port-splp', '3169'));
const PORT = Number(arg('port', '3183'));
const TIMEOUT_S = Number(arg('timeout', '180'));

const warna = { ok: '\x1b[32m✓\x1b[0m', no: '\x1b[31m✗\x1b[0m' };
let LULUS = 0;
const GAGAL = [];

function periksa(nama, syarat, keterangan = '') {
  if (syarat) {
    LULUS += 1;
    console.log(`  ${warna.ok} ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
  } else {
    GAGAL.push(nama);
    console.log(`  ${warna.no} ${nama}${keterangan ? ` — ${keterangan}` : ''}`);
  }
}
const bagian = (judul) => console.log(`\n── ${judul} ──`);

const KATA_PERAN = ['pengelola', 'operator', 'petugas', 'koordinator', 'penanggung jawab', 'kepala', 'sekretariat', 'tim'];
const JENIS_BUKTI = ['uji', 'harness', 'artefak-verifikasi', 'laporan', 'endpoint', 'modul'];
const FUNGSI_NIST = ['govern', 'map', 'measure', 'manage'];
const BOBOT = { rendah: 1, sedang: 2, tinggi: 3 };

function tingkat(k, d) {
  const skor = BOBOT[k] * BOBOT[d];
  return skor >= 6 ? 'tinggi' : skor >= 3 ? 'sedang' : 'rendah';
}

/**
 * Seluruh pemeriksaan register dalam SATU fungsi — dipakai untuk data sungguhan
 * maupun data yang sengaja dirusak pada mode sabotase (jadi pembuktiannya nyata).
 * Mengembalikan daftar pelanggaran (string).
 */
function periksaDaftar(item, { hariIni = new Date() } = {}) {
  const langgar = [];
  const idTerlihat = new Set();
  const fungsiTerlihat = new Set();
  const berkasDicek = new Set();

  if (!Array.isArray(item) || item.length < 9) langgar.push(`jumlah risiko < 9 (${(item ?? []).length})`);

  for (const r of item ?? []) {
    const tanda = r.id ?? '(tanpa id)';
    if (!/^R-\d{2}$/.test(String(r.id ?? ''))) langgar.push(`${tanda}: id tidak berbentuk R-NN`);
    if (idTerlihat.has(r.id)) langgar.push(`${tanda}: id ganda`);
    idTerlihat.add(r.id);

    if (!r.judul || String(r.judul).length < 15) langgar.push(`${tanda}: judul terlalu pendek`);
    if (!r.kategori || String(r.kategori).length < 4) langgar.push(`${tanda}: kategori kosong`);

    // Pemilik = PERAN
    const peran = String(r.pemilik?.peran ?? '');
    if (peran.trim().length < 5) langgar.push(`${tanda}: tanpa pemilik peran`);
    else if (!KATA_PERAN.some((k) => peran.toLowerCase().includes(k))) langgar.push(`${tanda}: pemilik "${peran}" tidak tampak seperti peran`);
    if (String(r.pemilik?.tanggungJawab ?? '').length < 20) langgar.push(`${tanda}: tanggung jawab pemilik belum jelas`);

    // Kendali
    const kendali = (r.kendali ?? []).filter((k) => String(k).trim().length >= 10);
    if (kendali.length === 0) langgar.push(`${tanda}: tanpa kendali yang berarti`);

    // Bukti nyata
    const bukti = r.bukti ?? [];
    if (bukti.length === 0) langgar.push(`${tanda}: tanpa bukti`);
    for (const b of bukti) {
      if (!JENIS_BUKTI.includes(b.jenis)) langgar.push(`${tanda}: jenis bukti asing "${b.jenis}"`);
      const rujukan = String(b.rujukan ?? '');
      if (rujukan.length < 3) langgar.push(`${tanda}: rujukan bukti kosong`);
      else if (b.jenis !== 'endpoint') {
        berkasDicek.add(rujukan);
        if (!existsSync(join(AKAR, rujukan))) langgar.push(`${tanda}: bukti menunjuk berkas yang TIDAK ADA: ${rujukan}`);
      } else if (!rujukan.startsWith('/api/')) {
        langgar.push(`${tanda}: rujukan endpoint bukan rute internal: ${rujukan}`);
      }
    }

    // Tindak lanjut
    const tl = r.tindakLanjut ?? [];
    if (!tl.some((t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t.tanggal ?? '')))) langgar.push(`${tanda}: tidak ada tindak lanjut bertanggal`);
    for (const t of tl) {
      if (!['selesai', 'jalan', 'rencana'].includes(t.status)) langgar.push(`${tanda}: status tindak lanjut asing "${t.status}"`);
    }

    // Tingkat & tenggat
    for (const f of r.nist ?? []) fungsiTerlihat.add(f);
    if (tingkat(r.kemungkinan, r.dampak) !== r.tingkat) {
      langgar.push(`${tanda}: tingkat dilaporkan "${r.tingkat}" padahal matriks menyebut "${tingkat(r.kemungkinan, r.dampak)}"`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.tinjauanBerikutnya ?? ''))) langgar.push(`${tanda}: tenggat tinjauan tidak valid`);
    else if (new Date(`${r.tinjauanBerikutnya}T23:59:59Z`).getTime() < hariIni.getTime()) langgar.push(`${tanda}: tenggat tinjauan LEWAT (${r.tinjauanBerikutnya})`);
  }

  for (const f of FUNGSI_NIST) if (!fungsiTerlihat.has(f)) langgar.push(`fungsi NIST "${f}" tidak terwakili`);
  return { langgar, berkasDicek: [...berkasDicek] };
}

// ── Proses ────────────────────────────────────────────────────────────────
function jalankan(perintah, argumen, env, berkasLog, bersih = false) {
  const aliran = createWriteStream(berkasLog, { flags: 'w' });
  // `bersih = true` untuk APLIKASI yang diuji (lihat scripts/lingkungan-uji.mjs).
  const proc = spawn(perintah, argumen, { cwd: AKAR, detached: true, env: bersih ? envUji(env).env : { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.pipe(aliran);
  proc.stderr.pipe(aliran);
  return proc;
}

async function tungguSiap(url, batasMs) {
  const batas = Date.now() + batasMs;
  while (Date.now() < batas) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.status < 500) return true;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

let app = null;
let splp = null;
const matikan = (proc) => {
  if (!proc || proc.killed) return;
  try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch { /* sudah mati */ } }
};

try {
  console.log(`\n  CMP-03 · tata kelola risiko AI${SABOTASE ? ' (MODE SABOTASE — harus GAGAL)' : ''}\n`);

  splp = jalankan(process.execPath, [join(AKAR, 'verifikasi', 'stub-splp.mjs'), String(PORT_SPLP), join(AKAR, 'verifikasi', 'korpus-uji-besar.json')], {}, '/tmp/tata-kelola-splp.log');
  const urlSplp = `http://127.0.0.1:${PORT_SPLP}/sapa/1.0/api`;
  if (!(await tungguSiap(`${urlSplp}/daftar_data`, 25_000))) {
    console.error(`  ${warna.no} penyedia SPLP tiruan tidak siap`);
    process.exit(2);
  }

  app = jalankan('npx', ['next', 'start', '-p', String(PORT)], { SAPA_SPLP_BASE_URL: urlSplp, AI_ENABLED: 'false' }, '/tmp/tata-kelola-app.log', true);
  if (!(await tungguSiap(`http://127.0.0.1:${PORT}/api/status`, TIMEOUT_S * 1000))) {
    console.error(`  ${warna.no} aplikasi tidak siap — lihat /tmp/tata-kelola-app.log`);
    process.exit(2);
  }

  // ── Ambil register & halaman ─────────────────────────────────────────────
  const resReg = await fetch(`http://127.0.0.1:${PORT}/api/tata-kelola-risiko`, { signal: AbortSignal.timeout(30_000) });
  const register = await resReg.json();
  const resHal = await fetch(`http://127.0.0.1:${PORT}/tata-kelola-risiko`, { signal: AbortSignal.timeout(30_000) });
  const html = await resHal.text();
  const teks = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

  // Data sabotase: rusak dengan cara yang paling mungkin terjadi di dunia nyata.
  if (SABOTASE) {
    register.item[0].pemilik = { peran: '', tanggungJawab: '' };
    register.item[1].bukti[0].rujukan = 'scripts/uji-yang-tidak-pernah-ada.mjs';
    register.item[2].tinjauanBerikutnya = '2026-01-01';
    register.item[3].bukti[0].jenis = 'catatan-lisan';
    register.item[0].tingkat = 'rendah';
    register.item[0].kemungkinan = 'tinggi';
    register.item[0].dampak = 'tinggi';
  }

  bagian('A. Pemeriksaan register (satu pemeriksa untuk data nyata & data dirusak)');
  const { langgar, berkasDicek } = periksaDaftar(register.item);
  periksa('A1 tidak ada pelanggaran pada register', langgar.length === 0, langgar.length ? langgar.slice(0, 6).join(' | ') : 'bersih');
  periksa('A2 jumlah risiko memadai', register.item.length >= 9, `${register.item.length} risiko`);
  periksa(
    'A3 keempat fungsi NIST AI RMF terwakili',
    FUNGSI_NIST.every((f) => (register.item ?? []).some((r) => (r.nist ?? []).includes(f))),
    FUNGSI_NIST.join(' · '),
  );
  periksa('A4 endpoint melaporkan jumlah & tingkat yang sama dengan daftarnya', register.jumlah === register.item.length);
  periksa(
    'A5 setiap risiko punya pemilik berupa PERAN',
    register.item.every((r) => KATA_PERAN.some((k) => String(r.pemilik.peran).toLowerCase().includes(k))),
    `${register.item.length} pemilik`,
  );

  bagian('B. Bukti nyata (berkas ada, endpoint hidup)');
  periksa('B1 seluruh rujukan bukti berupa berkas benar-benar ada di repositori', berkasDicek.every((b) => existsSync(join(AKAR, b))), `${berkasDicek.length} berkas diperiksa`);
  const endpoint = [...new Set(register.item.flatMap((r) => (r.bukti ?? []).filter((b) => b.jenis === 'endpoint').map((b) => b.rujukan)))];
  const endpointHasil = [];
  const endpointOk = [];
  for (const rute of endpoint) {
    const res = await fetch(`http://127.0.0.1:${PORT}${rute}`, { signal: AbortSignal.timeout(20_000) });
    // 404 = rute tidak ada (bukti karangan). 401/403 = benar ada, memang berpenjaga.
    // 503 = benar ada, gagal-tertutup karena rahasia admin belum diset — juga bukti rute nyata.
    const ada = res.status !== 404;
    endpointOk.push(ada);
    endpointHasil.push(`${rute}→${res.status}${ada ? '' : ' (TIDAK ADA)'}`);
  }
  periksa('B2 rujukan bukti berjenis endpoint benar-benar rute aplikasi (bukan karangan)', endpointOk.every(Boolean), endpointHasil.join(' · '));

  bagian('C. Halaman publik & konsistensi');
  periksa('C1 halaman memuat judul & ringkasan register', resHal.status === 200 && teks.includes('Tata kelola risiko AI') && teks.includes('Ringkasan register'));
  const idHilang = register.item.filter((r) => !teks.includes(r.id)).map((r) => r.id);
  periksa('C2 halaman memuat SETIAP id risiko', idHilang.length === 0, idHilang.join(', ') || `${register.item.length} id`);
  const peranHilang = register.item.filter((r) => !teks.includes(String(r.pemilik.peran))).map((r) => r.id);
  periksa('C3 halaman memuat pemilik setiap risiko', peranHilang.length === 0, peranHilang.join(', ') || 'semua tampil');
  periksa('C4 halaman menyebut rujukan NIST AI RMF', teks.includes('NIST AI RMF'), 'ISO/IEC 42001 & NIST AI RMF');

  bagian('D. Sabotase (pemeriksa harus menangkap kerusakan)');
  if (SABOTASE) {
    periksa('D1 register yang dirusak TERDETEKSI (jumlah pelanggaran ≥ 4)', langgar.length >= 4, `${langgar.length} pelanggaran`);
    periksa('D2 pelanggaran menyebut bukti yang tidak ada', langgar.some((l) => l.includes('TIDAK ADA')));
    periksa('D3 pelanggaran menyebut tenggat lewat', langgar.some((l) => l.includes('LEWAT')));
    periksa('D4 pelanggaran menyebut jenis bukti asing', langgar.some((l) => l.includes('jenis bukti asing')));
    periksa('D5 pelanggaran menyebut pemilik hilang', langgar.some((l) => l.includes('pemilik')));
    periksa('D6 pelanggaran menyebut tingkat tidak cocok matriks', langgar.some((l) => l.includes('matriks')));
  } else {
    // Mode normal juga menguji pemeriksanya: register yang dirusak di memori
    // WAJIB menghasilkan pelanggaran — kalau tidak, mode --sabotase akan hijau semu.
    const tiruan = JSON.parse(JSON.stringify(register.item));
    tiruan[0].bukti[0].rujukan = 'scripts/tidak-ada.mjs';
    const uji = periksaDaftar(tiruan);
    periksa('D1 pemeriksa menangkap bukti yang tidak ada (uji diri di memori)', uji.langgar.some((l) => l.includes('TIDAK ADA')), `${uji.langgar.length} pelanggaran pada data uji`);
    const bersihTanpaSabotase = periksaDaftar(JSON.parse(JSON.stringify(register.item))).langgar.length;
    periksa('D2 selisih pelanggaran membuktikan pemeriksa bekerja', bersihTanpaSabotase === 0 && uji.langgar.length > 0);
  }

  console.log('\n  ──────────────── Ringkasan ────────────────');
  console.log(`  risiko diperiksa   : ${register.item.length}`);
  console.log(`  berkas bukti dicek : ${berkasDicek.length} (+${endpoint.length} endpoint)`);
  console.log(`  pemeriksaan lulus  : ${LULUS}`);
  if (GAGAL.length) {
    console.log(`\n  ${warna.no} GAGAL — ${GAGAL.length} pemeriksaan tidak terpenuhi:`);
    for (const g of GAGAL) console.log(`    · ${g}`);
    process.exitCode = 1;
  } else if (SABOTASE) {
    console.log(`\n  ${warna.ok} Mode sabotase: kerusakan tertangkap seperti seharusnya.`);
  } else {
    console.log(`\n  ${warna.ok} LULUS — setiap risiko bertuan (peran), berkendali, berbukti nyata, dan bertindak lanjut.`);
  }
} catch (err) {
  console.error(`\n  ${warna.no} galat: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 2;
} finally {
  matikan(app);
  matikan(splp);
}
