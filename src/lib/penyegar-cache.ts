// ─── OPS-03: penyegaran cache terjadwal ───
//
// MASALAH YANG DIPERBAIKI
// Cache SAPA berlapis: LRU 10 menit per instance + `unstable_cache` 600 detik
// bertag (sapa-analytics · kpi · stats · report). Endpoint pembatalnya,
// /api/revalidate, sudah ada dan — sejak perbaikan 21 Sep 2026 — sudah
// fail-closed (tanpa REVALIDATE_SECRET ia menolak, bukan diam-diam terbuka).
//
// Tetapi TIDAK ADA YANG MEMANGGILNYA. Akibatnya:
//   1. "Cache segar harian" (kriteria OPS-03 di dokumen 10) tidak pernah
//      terjadi — hanya bergantung pada TTL 600 detik; bila agregat SPLP
//      berubah dan tak ada warga membuka halaman, angka lama terus disajikan.
//   2. Tidak ada cara melihat KAPAN terakhir disegarkan. Bila penjadwal mati
//      (rahasia salah, cron dimatikan, endpoint berubah), tidak ada satu pun
//      sinyal: situs menyajikan data basi dengan tenang. Ini kelas kegagalan
//      yang tidak berbunyi — sama seperti sirkuit penyedia AI sebelum OPS-04.
//
// YANG DITAMBAHKAN BERKAS INI
//   • pembukuan penyegaran (waktu, tag, mode, sumber, durasi, hasil) di
//     penyimpanan bersama — sumber kebenaran untuk "segar/basi" dan riwayat;
//   • penilaian balasan endpoint dalam KATEGORI yang bisa ditindaklanjuti
//     (rahasia salah · endpoint tertutup · dibatasi · tag salah · galat
//     server), bukan sekadar "gagal";
//   • kebijakan mundur (backoff) yang dipakai penjadwal luar;
//   • satu fungsi `jalankanPenyegaran` dipakai oleh /api/revalidate DAN
//     /api/admin/segarkan, supaya tidak ada dua jalur yang bisa menyimpang.
//
// PRIVASI: berkas ini tidak pernah menyimpan atau mencatat nilai rahasia.
// Yang dicatat hanyalah TAG (nama kebijakan cache) dan MODE akses.

import { revalidateTag } from 'next/cache';
import { lupakanKorpus } from '@/lib/sapa-client';
import { activeBackend, cacheGet, cacheSet } from '@/lib/store';

/** Tag cache yang boleh dibatalkan (cermin allowlist di /api/revalidate). */
export const TAG_DIIZINKAN = ['sapa-analytics', 'kpi', 'stats', 'report'] as const;
export type TagCache = (typeof TAG_DIIZINKAN)[number];

/** Kunci penyimpanan pembukuan. Versi disertakan agar perubahan bentuk aman. */
export const KUNCI_SEGARKAN = 'sapa:segarkan:v1';
/** 120 hari: riwayat jadwal harian tetap terbaca antar-perilisan. */
export const TTL_SEGARKAN_MS = 120 * 24 * 60 * 60 * 1000;
/** Riwayat disimpan terbatas — pembukuan bukan arsip. */
export const MAKS_RIWAYAT = 30;
/** Jam jadwal harian (UTC). 22 UTC = 05:00 WIB — sebelum jam kerja. */
export const JAM_JADWAL_UTC = 22;
/** Umur di atas ini dianggap basi (dokumen 10: segar harian, toleransi 12 jam). */
export const AMBANG_BASI_JAM = 36;
/** Gagal berturut-turut sebelum operator perlu dikabari. */
export const AMBANG_GAGAL_BERTURUT = 3;

export type KategoriBalasan =
  | 'ok'
  | 'rahasia-salah'
  | 'endpoint-tertutup'
  | 'dibatasi'
  | 'tag-salah'
  | 'galat-server'
  | 'tak-terduga';

export interface NilaiBalasan {
  ok: boolean;
  kategori: KategoriBalasan;
  pesan: string;
}

export interface OpsiMundur {
  basisMs?: number;
  faktor?: number;
  maksMs?: number;
}

export interface EntriSegarkan {
  /** Epoch ms saat penyegaran dicatat. */
  waktuMs: number;
  tag: string[];
  /** 'bertanda' (lewat rahasia) atau 'admin' (lewat token operator). */
  mode: string;
  sumber: string;
  kategori: KategoriBalasan;
  durasiMs: number;
}

export interface KeadaanSegarkan {
  riwayat: EntriSegarkan[];
  jumlahOk: number;
  jumlahGagal: number;
}

export interface StatusSegarkan {
  terakhirMs: number | null;
  umurJam: number | null;
  segar: boolean;
  terlewat: boolean;
  berikutnyaMs: number | null;
  gagalBerturut: number;
  perluKabar: boolean;
  jumlahOk: number;
  jumlahGagal: number;
}

export const KEADAAN_KOSONG: KeadaanSegarkan = { riwayat: [], jumlahOk: 0, jumlahGagal: 0 };

// ── Pemilihan tag ────────────────────────────────────────────────────────────

/**
 * Terjemahkan permintaan tag menjadi daftar tag sah.
 * 'all' → seluruh allowlist; campuran yang memuat tag tak dikenal ditolak
 * (bukan diam-diam diabaikan) supaya salah ketik tidak menghasilkan
 * "penyegaran sukses" yang sebenarnya tidak menyentuh apa pun.
 */
export function pilihTag(masukan?: string | string[] | null): { ok: true; tag: TagCache[] } | { ok: false; pesan: string } {
  const diminta = (Array.isArray(masukan) ? masukan : masukan ? [masukan] : [])
    .map((t) => String(t ?? '').trim())
    .filter(Boolean);

  if (diminta.length === 0) {
    return { ok: false, pesan: `tag/tags required (${TAG_DIIZINKAN.join('|')}|all)` };
  }

  if (diminta.includes('all')) {
    // 'all' bersama tag lain tetap bermakna "semua"; tak perlu ditolak.
    return { ok: true, tag: [...TAG_DIIZINKAN] };
  }

  const takDikenal = diminta.filter((t) => !(TAG_DIIZINKAN as readonly string[]).includes(t));
  if (takDikenal.length > 0) {
    return { ok: false, pesan: `tag tidak dikenal: ${takDikenal.join(', ')}. Diizinkan: ${TAG_DIIZINKAN.join(', ')}|all` };
  }

  const unik = Array.from(new Set(diminta)) as TagCache[];
  return { ok: true, tag: unik };
}

// ── Penilaian balasan ────────────────────────────────────────────────────────

/**
 * Ubah (status HTTP, badan) menjadi kategori yang bisa ditindaklanjuti.
 *
 * MENGAPA kategori, bukan benar/salah: penjadwal yang gagal wajib memberi tahu
 * PENYEBABNYA. "gagal" membuat operator menebak; kategori langsung menunjuk
 * perbaikan yang tepat (set rahasia · pasang REVALIDATE_SECRET · kurangi
 * frekuensi · perbaiki tag). Ini juga yang membuat kegagalan senyap mustahil.
 */
export function nilaiBalasan(httpStatus: number, badan: unknown): NilaiBalasan {
  const teks = typeof badan === 'string' ? badan : JSON.stringify(badan ?? '');
  const pesanServer = (() => {
    if (badan && typeof badan === 'object' && 'error' in (badan as Record<string, unknown>)) {
      const e = (badan as Record<string, unknown>).error;
      if (typeof e === 'string') return e;
    }
    return teks.slice(0, 300);
  })();

  if (httpStatus === 200) {
    const status = badan && typeof badan === 'object' ? (badan as Record<string, unknown>).status : undefined;
    if (status === 'ok') return { ok: true, kategori: 'ok', pesan: 'cache disegarkan' };
    return { ok: false, kategori: 'tak-terduga', pesan: `HTTP 200 tanpa status 'ok': ${pesanServer}` };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return { ok: false, kategori: 'rahasia-salah', pesan: `Ditolak (HTTP ${httpStatus}) — rahasia tidak cocok atau tidak dikirim.` };
  }
  if (httpStatus === 503) {
    // Kasus paling penting: fail-closed karena REVALIDATE_SECRET belum diset.
    // Tanpa kategori ini, penjadwal akan tampak "sekadar gagal" padahal
    // perbaikannya satu langkah: set rahasianya.
    const tertutup = /REVALIDATE_SECRET belum diset/i.test(pesanServer);
    return {
      ok: false,
      kategori: tertutup ? 'endpoint-tertutup' : 'galat-server',
      pesan: tertutup
        ? 'Endpoint MENOLAK karena REVALIDATE_SECRET belum diset di produksi (fail-closed). Set rahasianya.'
        : `HTTP 503: ${pesanServer}`,
    };
  }
  if (httpStatus === 429) {
    return { ok: false, kategori: 'dibatasi', pesan: 'Dibatasi laju (HTTP 429) — frekuensi penyegaran terlalu tinggi.' };
  }
  if (httpStatus === 400) {
    return { ok: false, kategori: 'tag-salah', pesan: `Permintaan ditolak (HTTP 400): ${pesanServer}` };
  }
  if (httpStatus >= 500) {
    return { ok: false, kategori: 'galat-server', pesan: `HTTP ${httpStatus}: ${pesanServer}` };
  }
  return { ok: false, kategori: 'tak-terduga', pesan: `HTTP ${httpStatus}: ${pesanServer}` };
}

// ── Kebijakan mundur (backoff) ───────────────────────────────────────────────

/**
 * Jeda sebelum percobaan ke-(percobaan) — 1 → basis, 2 → basis×faktor, dst.
 * Dibatasi `maksMs` agar penjadwal tidak pernah menggantung lebih lama dari
 * jendela cron berikutnya (cron OPS-04 berjalan tiap 10 menit).
 */
export function hitungMundur(percobaan: number, opsi: OpsiMundur = {}): number {
  const basis = opsi.basisMs ?? 2000;
  const faktor = opsi.faktor ?? 2;
  const maks = opsi.maksMs ?? 60_000;
  const n = Math.max(1, Math.floor(percobaan));
  const nilai = basis * Math.pow(faktor, n - 1);
  return Math.min(maks, Math.round(nilai));
}

// ── Pembukuan ────────────────────────────────────────────────────────────────

export function catatSegarkan(keadaan: KeadaanSegarkan, entri: EntriSegarkan): KeadaanSegarkan {
  const riwayat = [...(keadaan.riwayat ?? []), entri].slice(-MAKS_RIWAYAT);
  return {
    riwayat,
    jumlahOk: (keadaan.jumlahOk ?? 0) + (entri.kategori === 'ok' ? 1 : 0),
    jumlahGagal: (keadaan.jumlahGagal ?? 0) + (entri.kategori === 'ok' ? 0 : 1),
  };
}

/** Jumlah kegagalan pada ekor riwayat (beruntun dari yang terbaru). */
export function gagalBerturut(riwayat: EntriSegarkan[]): number {
  let n = 0;
  for (let i = riwayat.length - 1; i >= 0; i -= 1) {
    if (riwayat[i].kategori === 'ok') break;
    n += 1;
  }
  return n;
}

export interface OpsiStatus {
  ambangBasiJam?: number;
  jamJadwalUtc?: number;
  ambangGagalBerturut?: number;
  /** Detik (untuk pengujian/pemakaian ulang). */
  sekarangMs?: number;
}

/**
 * Nilai kesegaran cache dari sudut pandang jadwal harian.
 *
 * `terlewat` sengaja tidak hanya berarti "sudah basi": bila jadwal berikutnya
 * sudah lewat (toleransi 1 jam) dan belum ada penyegaran, itu tanda penjadwal
 * MATI — bukan sekadar data lama. Inilah sinyal yang sebelumnya tidak ada.
 */
export function statusSegarkan(keadaan: KeadaanSegarkan, opsi: OpsiStatus = {}): StatusSegarkan {
  const ambang = opsi.ambangBasiJam ?? AMBANG_BASI_JAM;
  const jam = opsi.jamJadwalUtc ?? JAM_JADWAL_UTC;
  const ambangGagal = opsi.ambangGagalBerturut ?? AMBANG_GAGAL_BERTURUT;
  const sekarang = opsi.sekarangMs ?? Date.now();

  const riwayat = keadaan.riwayat ?? [];
  const suksesTerakhir = [...riwayat].reverse().find((e) => e.kategori === 'ok') ?? null;
  const terakhirMs = suksesTerakhir?.waktuMs ?? null;
  const umurJam = terakhirMs === null ? null : (sekarang - terakhirMs) / 3_600_000;

  const berikutnya = new Date(sekarang);
  berikutnya.setUTCHours(jam, 0, 0, 0);
  if (berikutnya.getTime() <= sekarang) berikutnya.setUTCDate(berikutnya.getUTCDate() + 1);
  const berikutnyaMs = berikutnya.getTime();

  const basi = umurJam === null || umurJam > ambang;
  // Jadwal sebelumnya = berikutnya − 1 hari.
  const jadwalSebelumnya = berikutnyaMs - 24 * 3_600_000;
  const terlewat = basi && sekarang - jadwalSebelumnya > 3_600_000;

  const gb = gagalBerturut(riwayat);
  return {
    terakhirMs,
    umurJam: umurJam === null ? null : Number(umurJam.toFixed(2)),
    segar: !basi,
    terlewat,
    berikutnyaMs,
    gagalBerturut: gb,
    perluKabar: gb >= ambangGagal || terlewat,
    jumlahOk: keadaan.jumlahOk ?? 0,
    jumlahGagal: keadaan.jumlahGagal ?? 0,
  };
}

/** Bentuk ringkas untuk /api/status — tanpa riwayat, tanpa apa pun yang sensitif. */
export function ringkasanSegarkan(status: StatusSegarkan): Record<string, unknown> {
  return {
    terakhirMs: status.terakhirMs,
    umurJam: status.umurJam,
    segar: status.segar,
    terlewat: status.terlewat,
    berikutnyaMs: status.berikutnyaMs,
    gagalBerturut: status.gagalBerturut,
    perluKabar: status.perluKabar,
    jumlahOk: status.jumlahOk,
    jumlahGagal: status.jumlahGagal,
  };
}

// ── Penyimpanan (store bersama: Redis bila ada, memori bila tidak) ───────────

export async function bacaKeadaanSegarkan(): Promise<KeadaanSegarkan> {
  const tersimpan = await cacheGet<Partial<KeadaanSegarkan>>(KUNCI_SEGARKAN);
  if (!tersimpan) return { ...KEADAAN_KOSONG };
  return {
    riwayat: Array.isArray(tersimpan.riwayat) ? tersimpan.riwayat : [],
    jumlahOk: typeof tersimpan.jumlahOk === 'number' ? tersimpan.jumlahOk : 0,
    jumlahGagal: typeof tersimpan.jumlahGagal === 'number' ? tersimpan.jumlahGagal : 0,
  };
}

export async function simpanKeadaanSegarkan(keadaan: KeadaanSegarkan): Promise<void> {
  await cacheSet(KUNCI_SEGARKAN, keadaan, TTL_SEGARKAN_MS);
}

// ── Jalur penyegaran tunggal ─────────────────────────────────────────────────

export interface HasilPenyegaran {
  ok: boolean;
  tag: string[];
  fase: 'disegarkan' | 'ditolak';
  /** True bila hanya divalidasi (cache tidak dibatalkan). */
  kering: boolean;
  pesan: string;
  durasiMs: number;
  /** Entri yang baru dicatat (null bila permintaan gagal sebelum dicatat). */
  entri: EntriSegarkan | null;
  status: StatusSegarkan;
}

export interface OpsiPenyegaran {
  tagDiminta?: string | string[] | null;
  /** 'bertanda' (rahasia /api/revalidate) atau 'admin' (token operator). */
  mode: string;
  sumber?: string;
  /** Bila true, tag divalidasi/dihitung tetapi cache TIDAK dibatalkan. */
  kering?: boolean;
  sekarangMs?: number;
}

/**
 * Satu-satunya jalur pembatal cache + pencatatan.
 *
 * Setiap penyegaran yang BERHASIL dicatat; kegagalan server (endpoint tertutup)
 * juga dicatat. Kegagalan 401 (rahasia salah) TIDAK menulis ke penyimpanan
 * bersama dengan sengaja: jalur itu dapat dipanggil anonim, dan menulis ke
 * Redis untuk setiap percobaan akan menjadikan endpoint ini alat pemborosan
 * kuota. Percobaan rahasia yang salah tetap terlihat di log ([segarkan]).
 */
export async function jalankanPenyegaran(opsi: OpsiPenyegaran): Promise<HasilPenyegaran> {
  const mulai = Date.now();
  const sekarangMs = opsi.sekarangMs ?? mulai;

  const pilihan = pilihTag(opsi.tagDiminta);
  if (!pilihan.ok) {
    const keadaan0 = await bacaKeadaanSegarkan();
    return {
      ok: false,
      tag: [],
      fase: 'ditolak',
      kering: opsi.kering === true,
      pesan: pilihan.pesan,
      durasiMs: Date.now() - mulai,
      entri: null,
      status: statusSegarkan(keadaan0, { sekarangMs }),
    };
  }

  if (!opsi.kering) {
    // { expire: 0 } = kedaluwarsa SEKETIKA (sama dengan alasan di route lama):
    // profil bawaan 'max' hanya MENANDAI basi dan masih menyajikan entri lama.
    for (const t of pilihan.tag) revalidateTag(t, { expire: 0 });

    // DS-03: cache data SAPA juga dipegang di MEMORI proses (`splpCache`,
    // TTL 10 menit). Tanpa melupakannya, "segarkan" hanya membatalkan cache
    // Next sementara permintaan berikutnya masih menerima salinan lama —
    // operator menekan segarkan, pembukuan berkata berhasil, tetapi angka yang
    // dilihat warga tidak berubah. Dilupakan HANYA pada penyegaran nyata,
    // tidak pada uji kering (kering = tidak boleh mengubah apa pun).
    lupakanKorpus();
  }

  const durasiMs = Date.now() - mulai;
  const entri: EntriSegarkan = {
    waktuMs: sekarangMs,
    tag: pilihan.tag,
    mode: opsi.mode,
    sumber: opsi.sumber ?? 'tak-diketahui',
    kategori: 'ok',
    durasiMs,
  };

  const keadaan = catatSegarkan(await bacaKeadaanSegarkan(), entri);
  await simpanKeadaanSegarkan(keadaan);
  const status = statusSegarkan(keadaan, { sekarangMs });

  return {
    ok: true,
    tag: pilihan.tag,
    fase: 'disegarkan',
    kering: opsi.kering === true,
    pesan: opsi.kering ? 'uji kering: tag dihitung, cache TIDAK dibatalkan' : 'cache disegarkan',
    durasiMs,
    entri,
    status,
  };
}

/** Catat kegagalan sisi-server (mis. endpoint tertutup) tanpa membatalkan cache. */
export async function catatKegagalanSegarkan(
  kategori: KategoriBalasan,
  opsi: { mode: string; sumber?: string; tag?: string[]; durasiMs?: number; sekarangMs?: number },
): Promise<StatusSegarkan> {
  const sekarangMs = opsi.sekarangMs ?? Date.now();
  const entri: EntriSegarkan = {
    waktuMs: sekarangMs,
    tag: opsi.tag ?? [],
    mode: opsi.mode,
    sumber: opsi.sumber ?? 'tak-diketahui',
    kategori,
    durasiMs: opsi.durasiMs ?? 0,
  };
  const keadaan = catatSegarkan(await bacaKeadaanSegarkan(), entri);
  await simpanKeadaanSegarkan(keadaan);
  return statusSegarkan(keadaan, { sekarangMs });
}

/** Baris log tunggal. Tidak pernah memuat rahasia (hanya tag/mode/kategori). */
export function barisLogSegarkan(bahan: {
  entri: EntriSegarkan | null;
  status: StatusSegarkan;
  backend: string;
}): string {
  return JSON.stringify({
    waktu: new Date().toISOString(),
    tag: bahan.entri?.tag ?? [],
    mode: bahan.entri?.mode ?? null,
    sumber: bahan.entri?.sumber ?? null,
    kategori: bahan.entri?.kategori ?? null,
    durasiMs: bahan.entri?.durasiMs ?? null,
    terakhirMs: bahan.status.terakhirMs,
    umurJam: bahan.status.umurJam,
    segar: bahan.status.segar,
    terlewat: bahan.status.terlewat,
    gagalBerturut: bahan.status.gagalBerturut,
    backend: bahan.backend,
  });
}

/** Ringkasan untuk endpoint admin (riwayat + status + backend). */
export async function ringkasSegarkan(): Promise<{ status: StatusSegarkan; riwayat: EntriSegarkan[]; backend: string }> {
  const keadaan = await bacaKeadaanSegarkan();
  return { status: statusSegarkan(keadaan), riwayat: keadaan.riwayat, backend: activeBackend() };
}
