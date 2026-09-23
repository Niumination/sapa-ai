// ─── Uji ujung-ke-ujung notifikasi sirkuit penyedia (OPS-04) ────────────────
//
// Mengapa harness ini ada. Notifikasi hanya berguna bila ia BENAR-BENAR keluar
// dari sistem saat gangguan terjadi. Uji unit sudah menjaga mesin keadaannya,
// tetapi ia tidak membuktikan bahwa jalur jawaban sungguhan memicunya. Harness
// ini karena itu menjalankan SELURUH pipa dengan penyedia tiruan yang bisa
// dibalik nasibnya:
//
//   fase A — penyedia menolak (HTTP 401)  → sirkuit terbuka → peringatan keluar
//   fase B — penyedia sehat kembali        → sirkuit menutup → notifikasi pulih
//
// Cara pakai (dua server di bawah dikendalikan harness ini sendiri):
//
//   # 1) stub katalog (mis. verifikasi/korpus-uji-besar.json) di :9911
//   # 2) aplikasi uji dengan penyedia menunjuk ke port harness (SAPA_PROVIDER):
//   SAPA_SPLP_BASE_URL=http://127.0.0.1:9911 \
//   AI_ENABLED=true AI_PROVIDER=custom AI_BASE_URL=http://127.0.0.1:9933/v1 \
//   AI_API_KEY=mock-uji AI_MODEL=mock-pintar \
//   AI_CIRCUIT_AUTH_THRESHOLD=2 AI_CIRCUIT_AUTH_COOLDOWN_MS=30000 \
//   AI_TIMEOUT_MS=5000 ADMIN_TOKEN=token-uji-123 \
//   SAPA_ALERT_WEBHOOK_URL=http://127.0.0.1:9931/hook \
//   npx next start -p 3131 &
//   # 3) node scripts/uji-peringatan.mjs --url=http://127.0.0.1:3131 --token=token-uji-123
//
// Yang diperiksa (masing-masing bisa GAGAL, tidak ada yang "dianggap lulus"):
//   1. peringatan pertama keluar saat sirkuit terbuka; isinya memuat sebab yang
//      benar dan tautan panel; TIDAK memuat rahasia;
//   2. tidak spam: pemeriksaan berikutnya tidak mengirim ulang;
//   3. pemeriksaan kering (`?kering=1`) melaporkan rencana tanpa mengirim;
//   4. notifikasi uji (`?uji=1`) benar-benar sampai ke saluran;
//   5. saat penyedia sehat kembali: notifikasi pemulihan terkirim dan episode
//      ditutup (keadaan.aktif=false, status tenang).
//
// Catatan kejujuran: cooldown auth sirkuit dipendekkan (30 dtk) di perintah
// contoh di atas. Itu disengaja — tanpa itu fase B harus menunggu 10 menit; yang
// diuji tetap jalur kode yang sama, bukan versi yang dilonggarkan.

import http from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (nama, bawaan) => {
  const p = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return p ? p.slice(nama.length + 3) : bawaan;
};

const AKAR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = arg('url', 'http://127.0.0.1:3131').replace(/\/$/, '');
const TOKEN = arg('token', process.env.ADMIN_TOKEN ?? '');
const SINK_PORT = Number(arg('sink-port', '9931'));
const PROVIDER_PORT = Number(arg('provider-port', '9933'));
const TIMEOUT_MS = Number(arg('timeout', '60')) * 1000;
/** Berkas bukti: seluruh notifikasi yang benar-benar diterima saluran. */
const SIMPAN = arg('simpan', '');

// PERTANYAAN DIAMBIL ACAK DARI KORPUS — dan itu bukan kerapian, melainkan syarat
// sahnya uji. Jawaban yang BERHASIL disimpan di cache jawaban; pertanyaan yang
// sudah pernah berhasil dijawab tidak akan memanggil model lagi, sehingga
// kegagalan penyedia (yang justru sedang kita uji) tidak akan pernah terpicu.
// Karena itu tiap putaran memilih indikator + OPD acak dari korpus yang sama
// dengan yang dipakai aplikasi uji. Jawaban yang GAGAL tidak di-cache, jadi
// pengulangan dalam satu putaran tetap memanggil model.
function susunPertanyaan() {
  const eksplisit = arg('pertanyaan', '');
  if (eksplisit) return [eksplisit];

  const berkas = arg('korpus', join(AKAR, 'verifikasi', 'korpus-uji-besar.json'));
  const cadangan = [
    'Berapa jumlah ASN di Aceh Tengah?',
    'Berapa jumlah penduduk Kabupaten Aceh Tengah?',
    'Berapa produksi kopi arabika Aceh Tengah?',
  ];
  try {
    const mentah = JSON.parse(readFileSync(berkas, 'utf8'));
    const data = Array.isArray(mentah) ? mentah : (mentah.data ?? []);
    const kandidat = data
      .filter((r) => r && r.kode_indikator_nama_indikator && r.opds_nama_opd)
      .map((r) => `Berapa ${r.kode_indikator_nama_indikator} di ${r.opds_nama_opd}?`);
    if (!kandidat.length) return cadangan;
    const acak = [...kandidat].sort(() => Math.random() - 0.5).slice(0, 8);
    return acak.length ? acak : cadangan;
  } catch {
    console.log(`   ! korpus ${berkas} tidak terbaca — memakai pertanyaan cadangan`);
    return cadangan;
  }
}
const DAFTAR_PERTANYAAN = susunPertanyaan();

let lulus = 0;
let gagal = 0;
const hasil = [];
const ok = (t) => {
  lulus += 1;
  hasil.push(`  ✓ ${t}`);
  console.log(`  ✓ ${t}`);
};
const no = (t) => {
  gagal += 1;
  hasil.push(`  ✗ ${t}`);
  console.log(`  ✗ ${t}`);
};
function info(t) {
  hasil.push(`  · ${t}`);
  console.log(`  · ${t}`);
}

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Server 1: saluran webhook (sink) ───────────────────────────────────────

const diterima = [];
const sink = http.createServer((req, res) => {
  let badan = '';
  req.on('data', (c) => (badan += c));
  req.on('end', () => {
    let json = null;
    try {
      json = JSON.parse(badan);
    } catch {
      json = { _mentah: badan.slice(0, 200) };
    }
    diterima.push({ waktu: new Date().toISOString(), url: req.url, json });
    console.log(`  ← notifikasi diterima: jenis=${json?.jenis ?? '?'} (${badan.length} bita)`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
});
await new Promise((r) => sink.listen(SINK_PORT, '127.0.0.1', r));

// ─── Server 2: penyedia model tiruan yang bisa dibalik ─────────────────────

let modePenyedia = 'auth';
const provider = http.createServer((req, res) => {
  if (modePenyedia === 'auth') {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'invalid api key — uji OPS-04', type: 'auth_error' } }));
    return;
  }
  const isi = JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            narasi: 'Jumlah ASN di Aceh Tengah tercatat 9.610 orang menurut data resmi.',
            rekomendasi: [],
            followUps: [],
            visualHint: 'metric',
            confidence: 'sedang',
          }),
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 10 },
  });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(isi);
});
await new Promise((r) => provider.listen(PROVIDER_PORT, '127.0.0.1', r));

const tutup = () => {
  sink.close();
  provider.close();
};

// ─── Bantu: panggil aplikasi ────────────────────────────────────────────────

async function status() {
  const r = await fetch(`${APP}/api/status`, { signal: AbortSignal.timeout(40_000) });
  return r.json();
}

async function tanya(teks) {
  const r = await fetch(`${APP}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: teks }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await r.json().catch(() => ({}));
  return { statusHttp: r.status, body: j };
}

async function admin(qs) {
  const url = `${APP}/api/admin/peringatan?token=${encodeURIComponent(TOKEN)}${qs ? `&${qs}` : ''}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const j = await r.json().catch(() => ({}));
  return { statusHttp: r.status, body: j };
}

async function tungguPayload(jenis, batasMs) {
  const sampai = Date.now() + batasMs;
  while (Date.now() < sampai) {
    const hit = diterima.find((d) => d.json?.jenis === jenis);
    if (hit) return hit;
    await tidur(500);
  }
  return null;
}

// ─── Jalannya uji ───────────────────────────────────────────────────────────

console.log('══ Uji OPS-04: notifikasi sirkuit penyedia ══');
console.log(`   aplikasi : ${APP}`);
console.log(`   sink     : http://127.0.0.1:${SINK_PORT}/hook`);
console.log(`   penyedia : http://127.0.0.1:${PROVIDER_PORT}/v1 (mode awal: menolak 401)`);
console.log(`   pertanyaan pertama: "${DAFTAR_PERTANYAAN[0]}" (${DAFTAR_PERTANYAAN.length} kandidat acak dari korpus)`);
if (!TOKEN) console.log('   ! ADMIN_TOKEN tidak diberikan — pemeriksaan endpoint admin akan dilewati');

let keluarKode = 1;
try {
  const st0 = await status();
  const aiState = st0?.ai?.state;
  console.log(`   status awal: ai.state=${aiState} records=${st0?.sapa?.records ?? '?'} health=${st0?.ai?.health?.state ?? '-'}`);
  if (aiState !== 'active' && aiState !== 'shadow') {
    info(`aplikasi tidak menjalankan jalur AI (ai.state=${aiState}) — uji dilewati, bukan lulus`);
    keluarKode = 0;
    throw new Error('lewati');
  }
  if ((st0?.sapa?.records ?? 0) < 1) {
    no('katalog kosong pada aplikasi uji — pertanyaan tidak akan sampai ke tahap model');
    throw new Error('katalog');
  }

  // ── Fase A: penyedia menolak → sirkuit terbuka → peringatan ──
  console.log('  ── fase A: penyedia menolak (401) ──');
  let peringatan = null;
  let modelDipanggil = 0;
  let cacheTerpakai = 0;
  for (let i = 1; i <= 8 && !peringatan; i++) {
    const pertanyaan = DAFTAR_PERTANYAAN[(i - 1) % DAFTAR_PERTANYAAN.length];
    const j = await tanya(pertanyaan);
    const st = await status();
    const a = j.body?.ai ?? {};
    if (a.cached) cacheTerpakai += 1;
    const adaBukti = (j.body?.evidence?.length ?? 0) > 0;
    if (!a.cached && adaBukti) modelDipanggil += 1;
    console.log(
      `     tanya #${i}: HTTP ${j.statusHttp} · bukti=${j.body?.evidence?.length ?? 0} · cached=${a.cached ?? '-'} · alasan=${a.reason ?? '-'} · health=${st?.ai?.health?.state ?? '-'}/gagal=${st?.ai?.health?.gagalBerturut ?? '-'}`,
    );
    peringatan = await tungguPayload('sirkuit-terbuka', 8_000);
  }

  if (modelDipanggil > 0) ok(`model benar-benar dipanggil ${modelDipanggil} kali (uji tidak vakum)`);
  else no('model tidak pernah dipanggil — uji ini tidak mengukur apa pun (periksa korpus/pertanyaan)');
  if (cacheTerpakai) info(`${cacheTerpakai} jawaban datang dari cache (tidak memanggil model)`);

  if (peringatan) {
    ok('peringatan keluar saat sirkuit penyedia terbuka (tanpa membuka panel)');
    const d = peringatan.json;
    if (d?.sirkuit?.sebab === 'auth') ok('sebab yang dilaporkan benar (auth)');
    else no(`sebab yang dilaporkan tidak sesuai: ${d?.sirkuit?.sebab}`);
    if (typeof d?.teks === 'string' && d.teks.includes('TERBUKA') && d.teks.includes('/admin/')) ok('pesan memuat keadaan + tautan panel');
    else no('pesan tidak memuat keadaan/tautan panel');
    const bocor = TOKEN && typeof d?.teks === 'string' && d.teks.includes(TOKEN);
    const polaKunci = /\b(sk|pk|ghp|AIza)[-_A-Za-z0-9]{6,}|[A-Za-z0-9_-]{32,}/.test(String(d?.teks ?? ''));
    if (!bocor && !polaKunci) ok('pesan bebas rahasia/kunci');
    else no('pesan memuat calon rahasia — perlu ditelusuri');
  } else {
    const st = await status();
    const pets = TOKEN ? await admin('') : { body: {} };
    const aktifSebelumnya = pets.body?.keadaan?.aktif;
    no(
      `peringatan TIDAK keluar dalam batas waktu (health=${st?.ai?.health?.state ?? '-'}, gagal=${st?.ai?.health?.gagalBerturut ?? '-'}, episode-aktif=${aktifSebelumnya ?? '?'})`,
    );
    info(
      aktifSebelumnya
        ? 'episode peringatan sudah aktif dari uji SEBELUMNYA → mulai ulang aplikasi uji agar uji ini bersih'
        : 'periksa SAPA_ALERT_WEBHOOK_URL pada aplikasi uji dan apakah saluran dapat dijangkau',
    );
  }

  const jumlahAwal = diterima.length;

  if (TOKEN) {
    // ── Tidak spam ──
    const p1 = await admin('');
    if (p1.statusHttp === 200) {
      if (p1.body?.statusPeringatan === 'masih-terbuka' && (p1.body?.dikirim?.length ?? -1) === 0)
        ok('pemeriksaan ulang tidak mengirim peringatan baru (tidak spam)');
      else no(`pemeriksaan ulang berperilaku tak terduga: ${p1.body?.statusPeringatan} dikirim=${JSON.stringify(p1.body?.dikirim)}`);
      if (p1.body?.keadaan?.aktif === true) ok('episode peringatan tercatat aktif (keadaan tersimpan antar-permintaan)');
      else no('episode peringatan tidak tercatat aktif');

      // ── Kering ──
      const pk = await admin('kering=1');
      if (pk.body?.statusPeringatan === 'kering' && pk.body?.pratinjau) ok('pemeriksaan kering melaporkan rencana + pratinjau pesan tanpa mengirim');
      else no(`pemeriksaan kering tidak sesuai: ${pk.body?.statusPeringatan} pratinjau=${Boolean(pk.body?.pratinjau)}`);

      // ── Uji saluran ──
      const pu = await admin('uji=1');
      const ujiSampai = await tungguPayload('uji', 8_000);
      if (ujiSampai && pu.body?.uji?.dikirim?.every?.((x) => x.ok)) ok('notifikasi uji benar-benar sampai ke saluran (siap:true)');
      else no(`notifikasi uji tidak sampai: ${JSON.stringify(pu.body?.uji ?? pu.body)}`);
    } else {
      info(`endpoint admin menolak (HTTP ${p1.statusHttp}) — pemeriksaan manual dilewati`);
    }

    await tidur(2_000);
    if (diterima.length === jumlahAwal + 1) ok('tidak ada kiriman tak terduga antar-pemeriksaan');
    else no(`ada ${diterima.length - jumlahAwal - 1} kiriman tak terduga`);
  }

  // ── Fase B: penyedia pulih → sirkuit menutup → notifikasi pemulihan ──
  console.log('  ── fase B: penyedia sehat kembali ──');
  modePenyedia = 'ok';
  const st1 = await status();
  const sisaDetik = st1?.ai?.health?.sisaDetik ?? 0;
  console.log(`     cooldown tersisa ${sisaDetik} dtk (menunggu sirkuit setengah terbuka)`);
  if (sisaDetik > 0) await tidur(Math.min(sisaDetik * 1000 + 2_000, TIMEOUT_MS));

  let pulih = null;
  for (let i = 1; i <= 4 && !pulih; i++) {
    const j = await tanya(DAFTAR_PERTANYAAN[0]);
    console.log(
      `     tanya pemulihan #${i}: HTTP ${j.statusHttp} · used=${j.body?.ai?.used ?? '-'} · alasan=${j.body?.ai?.reason ?? '-'}`,
    );
    pulih = await tungguPayload('sirkuit-pulih', 10_000);
  }

  if (pulih) {
    ok('notifikasi pemulihan terkirim saat penyedia sehat kembali');
    const st2 = await status();
    if (st2?.ai?.health?.state === 'sehat') ok('sirkuit benar-benar menutup (health=sehat)');
    else no(`sirkuit belum menutup: ${st2?.ai?.health?.state}`);
    if (TOKEN) {
      const p2 = await admin('');
      if (p2.body?.keadaan?.aktif === false) ok('episode ditutup (keadaan.aktif=false)');
      else no('episode tidak ditutup setelah pemulihan');
    }
  } else {
    no('notifikasi pemulihan TIDAK terkirim dalam batas waktu');
  }

  keluarKode = gagal === 0 ? 0 : 1;
} catch (e) {
  if (e instanceof Error && (e.message === 'lewati' || e.message === 'katalog')) {
    // sudah dilaporkan sebagai info/no di atas
  } else {
    no(`harness berhenti karena galat: ${e instanceof Error ? e.message : String(e)}`);
    keluarKode = 1;
  }
} finally {
  console.log('');
  console.log(`   ringkasan: ${lulus} ✓ / ${gagal} ✗ · notifikasi diterima sink: ${diterima.length}`);
  for (const d of diterima) console.log(`     - ${d.waktu} ${d.json?.jenis ?? '?'}`);
  console.log(gagal === 0 ? '   HASIL: LULUS' : '   HASIL: GAGAL');
  if (SIMPAN) {
    try {
      writeFileSync(SIMPAN, `${JSON.stringify({ waktu: new Date().toISOString(), app: APP, diterima }, null, 2)}\n`);
      console.log(`   bukti notifikasi disimpan: ${SIMPAN}`);
    } catch (e) {
      console.log(`   ! gagal menyimpan bukti: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  tutup();
  setTimeout(() => process.exit(keluarKode), 200);
}
