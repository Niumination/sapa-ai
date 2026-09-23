#!/usr/bin/env node
// ─── OPS-03: penjadwal penyegaran cache ───
//
// Memanggil POST /api/revalidate dengan rahasia, mencoba ulang bila gagal
// karena sebab yang bisa pulih (galat jaringan / 5xx), lalu MEMBUKTIKAN bahwa
// kesegaran benar-benar terpantau lewat GET /api/status sebelum melaporkan
// sukses. Penjadwal yang "berhasil" tanpa bukti kesegaran adalah penjadwal
// yang tidak menjaga apa pun.
//
// Mengapa skrip ini ada, bukan hanya satu baris curl di cron:
//   1. PEMILIHAN KATEGORI. "gagal" tidak cukup: 401 (rahasia salah), 503
//      fail-closed (rahasia belum diset di Vercel), 429 (terlalu sering), dan
//      5xx (gangguan sementara) menuntut tindakan berbeda. Skrip ini
//      menerjemahkannya dan MEMBERI KODE KELUAR yang berbeda pula.
//   2. PERCOBAAN ULANG DENGAN JEDA BERLIPAT. Gangguan sesaat tidak perlu
//      membangunkan operator; gangguan tetap harus.
//   3. TIDAK PERNAH MEMBOCORKAN RAHASIA. Rahasia hanya dikirim sebagai header,
//      tidak pernah dicetak, tidak pernah masuk artefak, tidak pernah masuk
//      notifikasi.
//
// Catatan keselarasan: logika kategori di sini adalah CERMIN dari
// `src/lib/penyegar-cache.ts` (`nilaiBalasan`, `hitungMundur`, `pilihTag`).
// Skrip harus tetap dapat dijalankan `node` polos di mesin tanpa build (cron
// lokal, runner CI), jadi ia tidak mengimpor TypeScript. Keselarasan keduanya
// diuji ujung-ke-ujung oleh `scripts/uji-segarkan.mjs` (setiap kategori
// dibangkitkan sungguhan lalu dicocokkan dengan harapan).
//
// Pemakaian:
//   SAPA_BASE_URL=https://sapa-smart-ai.vercel.app REVALIDATE_SECRET=... \
//     node scripts/segarkan-cache.mjs --tag=all --sumber=jadwal-github
//
// Opsi: --url --tag --ulang --jeda-basis --maks-jeda --timeout --periksa
//       --kering --sumber --ambang-basi-jam --simpan --diam
//
// Kode keluar: 0 sukses · 1 pemakaian salah · 2 ditolak (rahasia/tag)
//              3 endpoint tertutup (fail-closed) · 4 gagal setelah dicoba ulang
//              5 sukses tetapi kesegaran tidak terkonfirmasi

import process from 'node:process';

const KATEGORI_DITOLAK = new Set(['rahasia-salah', 'tag-salah']);
const KATEGORI_PULIH = new Set(['galat-server', 'tak-terduga']);

function bacaArg() {
  const arg = {};
  for (const a of process.argv.slice(2)) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    arg[m[1]] = m[2] === undefined ? '1' : m[2];
  }
  return arg;
}

const arg = bacaArg();
const env = process.env;

const cfg = {
  url: (arg.url ?? env.SAPA_BASE_URL ?? '').replace(/\/+$/, ''),
  rahasia: env.REVALIDATE_SECRET ?? '',
  tag: arg.tag ?? env.SAPA_SEGARKAN_TAG ?? 'all',
  sumber: (arg.sumber ?? env.SAPA_SEGARKAN_SUMBER ?? 'jadwal-luar').slice(0, 32),
  ulang: Number(arg.ulang ?? env.SAPA_SEGARKAN_ULANG ?? 3),
  jedaBasis: Number(arg['jeda-basis'] ?? 2000),
  maksJeda: Number(arg['maks-jeda'] ?? 60_000),
  timeout: Number(arg.timeout ?? 15_000),
  ambangBasiJam: Number(arg['ambang-basi-jam'] ?? 36),
  periksa: arg.periksa === '1',
  kering: arg.kering === '1',
  diam: arg.diam === '1',
  simpan: arg.simpan ?? '',
  webhook: env.SAPA_ALERT_WEBHOOK_URL ?? '',
  webhookToken: env.SAPA_ALERT_WEBHOOK_TOKEN ?? '',
};

const TAG_DIIZINKAN = ['sapa-analytics', 'kpi', 'stats', 'report'];

/** Cermin `pilihTag` di src/lib/penyegar-cache.ts. */
export function pilihTag(masukan) {
  const diminta = String(masukan ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (diminta.length === 0) return { ok: false, pesan: `tag/tags required (${TAG_DIIZINKAN.join('|')}|all)` };
  if (diminta.includes('all')) return { ok: true, tag: [...TAG_DIIZINKAN] };
  const asing = diminta.filter((t) => !TAG_DIIZINKAN.includes(t));
  if (asing.length > 0) return { ok: false, pesan: `tag tidak dikenal: ${asing.join(', ')}` };
  return { ok: true, tag: Array.from(new Set(diminta)) };
}

/** Cermin `nilaiBalasan` di src/lib/penyegar-cache.ts. */
export function nilaiBalasan(httpStatus, badan) {
  const pesanServer =
    badan && typeof badan === 'object' && typeof badan.error === 'string' ? badan.error : JSON.stringify(badan ?? '').slice(0, 300);
  if (httpStatus === 200) {
    if (badan && typeof badan === 'object' && badan.status === 'ok') return { ok: true, kategori: 'ok', pesan: 'cache disegarkan' };
    return { ok: false, kategori: 'tak-terduga', pesan: `HTTP 200 tanpa status 'ok': ${pesanServer}` };
  }
  if (httpStatus === 401 || httpStatus === 403) return { ok: false, kategori: 'rahasia-salah', pesan: `Ditolak (HTTP ${httpStatus}) — rahasia tidak cocok atau tidak dikirim.` };
  if (httpStatus === 503) {
    const tertutup = /REVALIDATE_SECRET belum diset/i.test(pesanServer);
    return {
      ok: false,
      kategori: tertutup ? 'endpoint-tertutup' : 'galat-server',
      pesan: tertutup ? 'Endpoint MENOLAK karena REVALIDATE_SECRET belum diset di produksi (fail-closed). Set rahasianya.' : `HTTP 503: ${pesanServer}`,
    };
  }
  if (httpStatus === 429) return { ok: false, kategori: 'dibatasi', pesan: 'Dibatasi laju (HTTP 429) — frekuensi penyegaran terlalu tinggi.' };
  if (httpStatus === 400) return { ok: false, kategori: 'tag-salah', pesan: `Permintaan ditolak (HTTP 400): ${pesanServer}` };
  if (httpStatus >= 500) return { ok: false, kategori: 'galat-server', pesan: `HTTP ${httpStatus}: ${pesanServer}` };
  return { ok: false, kategori: 'tak-terduga', pesan: `HTTP ${httpStatus}: ${pesanServer}` };
}

/** Cermin `hitungMundur` di src/lib/penyegar-cache.ts. */
export function hitungMundur(percobaan, { basisMs = 2000, faktor = 2, maksMs = 60_000 } = {}) {
  const n = Math.max(1, Math.floor(percobaan));
  return Math.min(maksMs, Math.round(basisMs * Math.pow(faktor, n - 1)));
}

function catat(teks) {
  if (!cfg.diam) console.log(teks);
}

function baris(obj) {
  console.log('[segarkan]', JSON.stringify(obj));
}

function galat(teks) {
  console.error(teks);
}

async function panggilSegarkan(tag) {
  const mulai = Date.now();
  // 'all' dikirim apa adanya; daftar tag dikirim sebagai `tags` (array).
  // Endpoint TIDAK menerima "stats,kpi" sebagai satu tag — dan itu memang
  // disengaja: salah ketik harus gagal, bukan "sukses" yang tidak menyentuh
  // apa pun. Terjemahan bentuk ini diuji di scripts/uji-segarkan.mjs.
  const badanPermintaan = tag.length === TAG_DIIZINKAN.length && TAG_DIIZINKAN.every((t, i) => tag[i] === t) ? { tag: 'all' } : { tags: tag };
  try {
    const res = await fetch(`${cfg.url}/api/revalidate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidate-secret': cfg.rahasia,
        'x-segarkan-sumber': cfg.sumber,
      },
      body: JSON.stringify(badanPermintaan),
      signal: AbortSignal.timeout(cfg.timeout),
    });
    const teks = await res.text();
    let badan = null;
    try {
      badan = JSON.parse(teks);
    } catch {
      badan = teks;
    }
    return { ...nilaiBalasan(res.status, badan), httpStatus: res.status, badan, durasiMs: Date.now() - mulai };
  } catch (e) {
    return {
      ok: false,
      kategori: 'galat-server',
      pesan: `Gagal menghubungi ${cfg.url}: ${e instanceof Error ? e.message : String(e)}`,
      httpStatus: 0,
      badan: null,
      durasiMs: Date.now() - mulai,
    };
  }
}

async function periksaKesegaran() {
  try {
    const res = await fetch(`${cfg.url}/api/status`, { signal: AbortSignal.timeout(cfg.timeout) });
    const badan = await res.json();
    const s = badan?.segarkanCache;
    if (!s || typeof s !== 'object') return { ada: false, segar: null, alasan: 'medan segarkanCache tidak ada di /api/status (versi lama?)' };
    const umur = typeof s.umurJam === 'number' ? s.umurJam : null;
    const segar = s.segar === true && umur !== null && umur <= cfg.ambangBasiJam;
    return { ada: true, segar, umurJam: umur, terakhirMs: s.terakhirMs ?? null, terlewat: s.terlewat === true, gagalBerturut: s.gagalBerturut ?? 0 };
  } catch (e) {
    return { ada: false, segar: null, alasan: `gagal membaca /api/status: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function kabariOperator({ kategori, pesan, kode }) {
  if (!cfg.webhook) return { terkirim: false, alasan: 'SAPA_ALERT_WEBHOOK_URL tidak diset' };
  const teks = [
    `Penyegaran cache SAPA GAGAL (${kategori}).`,
    `Layanan: ${cfg.url}`,
    `Sumber jadwal: ${cfg.sumber}`,
    `Pesan: ${pesan}`,
    `Kode keluar: ${kode}`,
    'Tindakan: lihat docs/usulan-ai-tingkat-lanjut/21-LAPORAN-OPS-03.md bagian "Bila gagal".',
  ].join('\n');
  try {
    const res = await fetch(cfg.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.webhookToken ? { authorization: `Bearer ${cfg.webhookToken}` } : {}) },
      // Bentuk payload sama dengan src/lib/ai/notifikasi.ts (jenis/judul/teks).
      body: JSON.stringify({ jenis: 'segarkan-cache-gagal', judul: 'Penyegaran cache SAPA gagal', teks }),
      signal: AbortSignal.timeout(cfg.timeout),
    });
    return { terkirim: res.ok, status: res.status };
  } catch (e) {
    return { terkirim: false, alasan: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  if (!cfg.url) {
    galat('[segarkan] SAPA_BASE_URL (atau --url) wajib diisi.');
    return 1;
  }

  const pilihan = pilihTag(cfg.tag);
  if (!pilihan.ok) {
    baris({ waktu: new Date().toISOString(), kategori: 'tag-salah', pesan: pilihan.pesan, url: cfg.url, sumber: cfg.sumber });
    return 1;
  }

  // Mode periksa: hanya membaca kesegaran (tidak butuh rahasia, tidak mengubah apa pun).
  if (cfg.periksa) {
    const kesegaran = await periksaKesegaran();
    baris({ waktu: new Date().toISOString(), mode: 'periksa', url: cfg.url, kesegaran });
    return kesegaran.ada && kesegaran.segar ? 0 : 5;
  }

  if (!cfg.rahasia) {
    galat('[segarkan] REVALIDATE_SECRET wajib diisi untuk menyegarkan cache (bukan --periksa).');
    return 1;
  }

  let hasil = null;
  let percobaan = 0;
  while (percobaan < Math.max(1, cfg.ulang)) {
    percobaan += 1;
    hasil = await panggilSegarkan(pilihan.tag);
    catat(`[segarkan] percobaan ${percobaan}: HTTP ${hasil.httpStatus} · kategori ${hasil.kategori} · ${hasil.durasiMs} ms`);
    if (hasil.ok) break;
    if (KATEGORI_DITOLAK.has(hasil.kategori) || hasil.kategori === 'endpoint-tertutup' || hasil.kategori === 'dibatasi') break;
    if (!KATEGORI_PULIH.has(hasil.kategori)) break;
    if (percobaan < cfg.ulang) {
      const jeda = hitungMundur(percobaan, { basisMs: cfg.jedaBasis, maksMs: cfg.maksJeda });
      catat(`[segarkan] mencoba ulang dalam ${jeda} ms …`);
      await new Promise((r) => setTimeout(r, jeda));
    }
  }

  if (!hasil.ok) {
    const kode = hasil.kategori === 'endpoint-tertutup' ? 3 : KATEGORI_DITOLAK.has(hasil.kategori) ? 2 : 4;
    const kabar = await kabariOperator({ kategori: hasil.kategori, pesan: hasil.pesan, kode });
    baris({
      waktu: new Date().toISOString(),
      hasil: 'gagal',
      kategori: hasil.kategori,
      pesan: hasil.pesan,
      httpStatus: hasil.httpStatus,
      percobaan,
      url: cfg.url,
      sumber: cfg.sumber,
      tag: pilihan.tag,
      kode,
      kabarOperator: kabar,
    });
    galat(`[segarkan] GAGAL (${hasil.kategori}): ${hasil.pesan}`);
    if (cfg.simpan) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(cfg.simpan, JSON.stringify({ hasil: hasil.kategori, pesan: hasil.pesan, percobaan, tag: pilihan.tag, waktu: new Date().toISOString() }, null, 2));
    }
    return kode;
  }

  // Bukti kesegaran: jangan pernah melaporkan sukses tanpa memeriksanya.
  const kesegaran = await periksaKesegaran();
  const terverifikasi = kesegaran.ada ? kesegaran.segar === true : false;
  baris({
    waktu: new Date().toISOString(),
    hasil: 'ok',
    kategori: 'ok',
    tag: hasil.badan?.revalidated ?? pilihan.tag,
    mode: hasil.badan?.mode ?? null,
    durasiMs: hasil.durasiMs,
    percobaan,
    url: cfg.url,
    sumber: cfg.sumber,
    kesegaran,
  });

  if (!terverifikasi) {
    galat(`[segarkan] cache disegarkan, tetapi kesegaran TIDAK terkonfirmasi: ${kesegaran.alasan ?? 'segar=false'}`);
    if (cfg.simpan) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(cfg.simpan, JSON.stringify({ hasil: 'ok-tanpa-bukti-kesegaran', kesegaran, tag: pilihan.tag, waktu: new Date().toISOString() }, null, 2));
    }
    return 5;
  }

  if (cfg.simpan) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(cfg.simpan, JSON.stringify({ hasil: 'ok', tag: pilihan.tag, kesegaran, durasiMs: hasil.durasiMs, percobaan, waktu: new Date().toISOString() }, null, 2));
  }
  return 0;
}

const kode = await main();
process.exit(kode);
