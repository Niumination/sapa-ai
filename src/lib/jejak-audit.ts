// ─── CMP-04 · Jejak audit jawaban (pertanyaan · bukti · gerbang · sebab) ───────
//
// Kebutuhan internal & pemeriksaan: bila ada pertanyaan "kenapa portal menjawab
// seperti ini pada tanggal itu?", jawabannya harus dapat ditelusuri. Sebelumnya
// hanya metadata AI yang tersedia pada respons; tidak ada catatan yang bertahan.
//
// PRINSIP YANG DIPEGANG (semuanya diuji mesin):
//   1. TANPA DATA PRIBADI. Pertanyaan disimpan setelah **penyamaran**: pola NIK
//      (16 digit, termasuk bentuk berkelompok 4-4-4-4), nomor telepon, surel, dan
//      tautan diganti penanda. Bila penyamaran terjadi, catatannya diberi tanda
//      `piiDisamarkan: true` — bukan disembunyikan.
//   2. TIDAK PERNAH MENGGANGGU JAWABAN. `catatJejak()` tidak pernah melempar;
//      kegagalan penyimpanan hanya membuat jejak hilang (dan itu dicatat di
//      penghitung `dilewati`, bukan berkas log rahasia).
//   3. RETENSI NYATA. Jejak disimpan dengan masa simpan (`RETENSI_HARI`) di
//      lapisan penyimpanan, sehingga kedaluwarsa di backend — bukan sekadar
//      filter tampilan.
//   4. DAPAT DIEKSPOR. Bentuk JSON (mesin), NDJSON (aliran), CSV (lembar kerja)
//      untuk pemeriksaan; CSV memakai kutip ganda yang benar agar aman dibuka.
//
// Catatan kunci: jejak ini **bukan** log percakapan. Yang disimpan adalah metadata
// jawaban (pertanyaan tersamar, id bukti, hasil gerbang, sebab) — bukan isi narasi
// dan bukan data katalog.

import { activeBackend, cacheGet, cacheSet, type StoreBackend } from '@/lib/store';

/** Umur simpan jejak audit (hari). Disimpan sebagai TTL di lapisan penyimpanan. */
export const RETENSI_HARI = 30;
/** Batas jumlah catatan per hari — penjaga ukuran penyimpanan. */
export const MAKS_PER_HARI = 500;
/** Panjang maksimum pertanyaan yang disimpan (setelah penyamaran). */
export const MAKS_PANJANG_KUERI = 240;

export type ModeJejak = 'ai' | 'deterministik' | 'tanpa-bukti' | 'ditolak-pagar';

export interface Jejak {
  /** Jam pencatatan (ISO). */
  waktu: string;
  /** Pertanyaan setelah penyamaran data pribadi. */
  kueri: string;
  /** Benar bila ada pola data pribadi yang disamarkan di pertanyaan. */
  piiDisamarkan: boolean;
  /** Niat pertanyaan (FR-18) — deterministik, tanpa model. */
  niat: string | null;
  mode: ModeJejak;
  /** Jumlah baris bukti yang menyertai jawaban. */
  jumlahBukti: number;
  /** Id baris bukti (dibatasi 10 supaya catatan tetap ringkas). */
  idBukti: string[];
  /** Hasil gerbang pemeriksaan pasangan entitas (FR-24), bila diperiksa. */
  gerbang: { ok: boolean; keras: number; lunak: number } | null;
  /** Sebab jawaban (FR-20): `lapis:rincian`. */
  sebab: string;
  /** Status kejujuran jawaban: menjawab / jujur-kosong / ditolak. */
  status: string;
  aiUsed: boolean;
  grounded: string;
  durasiMs: number;
}

// ─── Penyamaran data pribadi ──────────────────────────────────────────────────

/** Pola data pribadi yang TIDAK boleh tersimpan: NIK, telepon, surel, tautan. */
const NIK_PADAT = /\d{16}/g;
/**
 * NIK yang diketik berkelompok 4-4-4-4. Dua penjagaan penting, keduanya lahir dari
 * temuan nyata pada jejak audit (24 Sep 2026):
 *   1. HANYA empat kelompok — daftar `idBukti` pada ekspor CSV berisi sepuluh angka
 *      4 digit berurutan, dan pola `\b\d{4} \d{4} \d{4} \d{4}\b` menuduhnya
 *      sebagai NIK (positif palsu yang membuat petugas pemeriksaan tidak percaya).
 *   2. Bila SEMUA kelompok adalah tahun yang masuk akal (1900–2100), itu rentang
 *      tahun — bukan NIK. Aturan yang sama dipakai pagar masukan (`ai/guard.ts`)
 *      supaya penilaian di dua tempat tidak berbeda.
 */
const GRUP_NIK = /(?<!\d )(\d{4}) (\d{4}) (\d{4}) (\d{4})(?! ?\d{4})/g;

function semuaTahun(grup: string): boolean {
  return grup.split(' ').every((k) => {
    const n = Number(k);
    return Number.isFinite(n) && n >= 1900 && n <= 2100;
  });
}

function adaNikBerkelompok(teks: string): boolean {
  const cocok = teks.match(GRUP_NIK) ?? [];
  return cocok.some((m) => !semuaTahun(m));
}
const TELEPON = /(\+62|62|0)8[\d\s().-]{6,}\d/g;
const SUREL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const TAUTAN = /https?:\/\/\S+|www\.\S+/g;

/** Benar bila teks memuat pola data pribadi (dipakai juga oleh uji & harness). */
export function adaPenandaPribadi(teks: string): boolean {
  const s = String(teks ?? '');
  return (
    /\d{16}/.test(s.replace(/[.,']/g, '')) ||
    adaNikBerkelompok(s) ||
    /(\+62|62|0)8[\d\s().-]{6,}\d/.test(s) ||
    /[\w.+-]+@[\w-]+\.[\w.-]+/.test(s) ||
    /https?:\/\/\S+|www\.\S+/.test(s)
  );
}

/**
 * Samarkan data pribadi pada pertanyaan. Angka lain (mis. tahun 2024, nilai 27,5)
 * TETAP disimpan — jejak audit tanpa angka tidak berguna untuk pemeriksaan.
 */
export function samarkanPribadi(teks: string): { teks: string; disamarkan: boolean } {
  const asli = String(teks ?? '');
  let t = asli;
  t = t.replace(SUREL, '[surel]');
  t = t.replace(TAUTAN, '[tautan]');
  t = t.replace(GRUP_NIK, (m) => (semuaTahun(m) ? m : '[NIK]'));
  // Bentuk padat, termasuk yang diselipi titik/koma/apostrof seperti saat mengetik.
  t = t.replace(NIK_PADAT, '[NIK]');
  t = t.replace(/\b(\d{4})[.,'](\d{4})[.,'](\d{4})[.,'](\d{4})\b/g, '[NIK]');
  t = t.replace(TELEPON, '[nomor]');
  return { teks: t, disamarkan: t !== asli };
}

// ─── Kunci penyimpanan ────────────────────────────────────────────────────────

const KUNCI_PREFIX = 'audit:v1:';
const kunciHari = (hari: string) => `${KUNCI_PREFIX}${hari}`;
const kunciDilewati = (hari: string) => `${KUNCI_PREFIX}dilewati:${hari}`;
const TTL_MS = RETENSI_HARI * 24 * 60 * 60 * 1000;

/** Hari UTC (`YYYY-MM-DD`) — sama seperti pencatatan lain di aplikasi ini. */
export function hariIni(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function hariSah(hari: unknown): hari is string {
  return typeof hari === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hari);
}

/** Benar bila tanggal berada di luar jendela retensi (data memang sudah kedaluwarsa). */
export function diLuarRetensi(hari: string, sekarang: Date = new Date()): boolean {
  const batas = new Date(sekarang.getTime() - RETENSI_HARI * 24 * 60 * 60 * 1000);
  return new Date(`${hari}T23:59:59Z`).getTime() < batas.getTime();
}

/** Daftar hari dalam jendela retensi, terbaru dulu (untuk pemilih di dasbor). */
export function hariTersedia(sekarang: Date = new Date()): string[] {
  const keluar: string[] = [];
  for (let i = 0; i < RETENSI_HARI; i += 1) {
    keluar.push(hariIni(new Date(sekarang.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return keluar;
}

// ─── Pencatatan ───────────────────────────────────────────────────────────────

export interface MasukanJejak {
  kueri: string;
  niat?: string | null;
  mode: ModeJejak;
  jumlahBukti?: number;
  idBukti?: string[];
  gerbang?: { ok: boolean; keras: number; lunak: number } | null;
  sebab: string;
  status?: string;
  aiUsed?: boolean;
  grounded?: string;
  durasiMs?: number;
}

export interface HasilCatatJejak {
  tersimpan: boolean;
  alasan?: 'penuh' | 'gagal';
  hari: string;
}

/**
 * Catat satu jejak jawaban. TIDAK PERNAH melempar — jejak audit tidak boleh
 * membuat pengguna gagal mendapat jawaban.
 */
export async function catatJejak(masukan: MasukanJejak): Promise<HasilCatatJejak> {
  const hari = hariIni();
  const { teks, disamarkan } = samarkanPribadi(masukan.kueri);

  const catatan: Jejak = {
    waktu: new Date().toISOString(),
    kueri: teks.slice(0, MAKS_PANJANG_KUERI),
    piiDisamarkan: disamarkan,
    niat: masukan.niat ?? null,
    mode: masukan.mode,
    // Bila hanya id yang diberikan, hitung dari id — supaya `jumlahBukti` tidak
    // pernah bertentangan dengan daftar buktinya sendiri.
    jumlahBukti: masukan.jumlahBukti ?? masukan.idBukti?.length ?? 0,
    idBukti: (masukan.idBukti ?? []).slice(0, 10).map(String),
    gerbang: masukan.gerbang ?? null,
    sebab: masukan.sebab,
    status: masukan.status ?? 'tidak-diketahui',
    aiUsed: Boolean(masukan.aiUsed),
    grounded: masukan.grounded ?? 'tidak-diketahui',
    durasiMs: Math.max(0, Math.round(masukan.durasiMs ?? 0)),
  };

  try {
    const tersimpan = (await cacheGet<Jejak[]>(kunciHari(hari))) ?? [];
    if (tersimpan.length >= MAKS_PER_HARI) {
      // Penuh: catat jumlah yang dilewati supaya operator tahu jejaknya tidak utuh.
      const lewat = ((await cacheGet<number>(kunciDilewati(hari))) ?? 0) + 1;
      await cacheSet(kunciDilewati(hari), lewat, TTL_MS);
      return { tersimpan: false, alasan: 'penuh', hari };
    }
    // Urutan: terbaru di depan supaya pembacaan ringkas cukup mengambil kepala.
    await cacheSet(kunciHari(hari), [catatan, ...tersimpan], TTL_MS);
    return { tersimpan: true, hari };
  } catch {
    return { tersimpan: false, alasan: 'gagal', hari };
  }
}

/**
 * Susun jejak dari hasil `composeAnswer` — satu pintu untuk kedua rute
 * (JSON & SSE) supaya isi jejaknya tidak mungkin berbeda antar jalur.
 *
 * Tipe parameter dibuat struktural (bukan impor tipe service) agar modul ini tetap
 * ringan dan tidak menyeret layanan lain ke dalam uji.
 */
export function jejakDariHasil(masukan: {
  query: string;
  hasil: {
    evidence?: { id?: unknown }[];
    diagnosa?: { sebab?: string; status?: string } | null;
    pemeriksaan?: { ok?: boolean; keras?: number; lunak?: number } | null;
    ai?: { used?: boolean; grounded?: string; intent?: string | null } | null;
  };
  durasiMs?: number;
}): MasukanJejak {
  const bukti = masukan.hasil.evidence ?? [];
  const ai = masukan.hasil.ai ?? {};
  const sebab = masukan.hasil.diagnosa?.sebab ?? 'tidak-diketahui';
  const status = masukan.hasil.diagnosa?.status ?? 'tidak-diketahui';
  // Tag pagar masukan dari taksonomi sebab (FR-20) berbentuk `masukan:*` —
  // mis. `masukan:data-personal` untuk pertanyaan ber-NIK. Mode diturunkan dari
  // tag itu, bukan dari teks jawaban, supaya tidak bisa berbeda antar jalur.
  const mode: ModeJejak = ai.used
    ? 'ai'
    : sebab.startsWith('masukan:')
      ? 'ditolak-pagar'
      : bukti.length === 0
        ? 'tanpa-bukti'
        : 'deterministik';
  return {
    kueri: masukan.query,
    niat: ai.intent ?? null,
    mode,
    jumlahBukti: bukti.length,
    idBukti: bukti.map((b) => String(b?.id ?? '')),
    gerbang: masukan.hasil.pemeriksaan
      ? {
          ok: Boolean(masukan.hasil.pemeriksaan.ok),
          keras: Number(masukan.hasil.pemeriksaan.keras ?? 0),
          lunak: Number(masukan.hasil.pemeriksaan.lunak ?? 0),
        }
      : null,
    sebab,
    status,
    aiUsed: Boolean(ai.used),
    grounded: ai.grounded ?? 'tidak-diketahui',
    durasiMs: masukan.durasiMs ?? 0,
  };
}

// ─── Pembacaan ────────────────────────────────────────────────────────────────

export interface RingkasanJejak {
  hari: string;
  jumlah: number;
  dilewati: number;
  diluarRetensi: boolean;
  backend: StoreBackend;
  perMode: Record<string, number>;
  perStatus: Record<string, number>;
  piiDisamarkan: number;
  item: Jejak[];
}

/** Ambil jejak satu hari (terbaru dulu). Tidak pernah melempar. */
export async function ambilJejak(hari: string = hariIni()): Promise<RingkasanJejak> {
  const kosong: RingkasanJejak = {
    hari,
    jumlah: 0,
    dilewati: 0,
    diluarRetensi: diLuarRetensi(hari),
    backend: activeBackend(),
    perMode: {},
    perStatus: {},
    piiDisamarkan: 0,
    item: [],
  };
  if (!hariSah(hari)) return kosong;
  if (diLuarRetensi(hari)) return kosong; // di luar retensi: tidak dibaca sama sekali
  try {
    const item = (await cacheGet<Jejak[]>(kunciHari(hari))) ?? [];
    const dilewati = (await cacheGet<number>(kunciDilewati(hari))) ?? 0;
    const perMode: Record<string, number> = {};
    const perStatus: Record<string, number> = {};
    let pii = 0;
    for (const j of item) {
      perMode[j.mode] = (perMode[j.mode] ?? 0) + 1;
      perStatus[j.status] = (perStatus[j.status] ?? 0) + 1;
      if (j.piiDisamarkan) pii += 1;
    }
    return { ...kosong, jumlah: item.length, dilewati, perMode, perStatus, piiDisamarkan: pii, item };
  } catch {
    return kosong;
  }
}

// ─── Ekspor ───────────────────────────────────────────────────────────────────

const KOLOM = [
  'waktu',
  'kueri',
  'piiDisamarkan',
  'niat',
  'mode',
  'jumlahBukti',
  'idBukti',
  'gerbang',
  'sebab',
  'status',
  'aiUsed',
  'grounded',
  'durasiMs',
] as const;

function selCsv(nilai: unknown): string {
  const teks = nilai === null || nilai === undefined ? '' : String(nilai);
  return /[",\n;]/.test(teks) ? `"${teks.replace(/"/g, '""')}"` : teks;
}

/** CSV dengan baris kepala — aman dibuka di lembar kerja (kutip ganda benar). */
export function eksporCsv(items: Jejak[]): string {
  const baris = [KOLOM.join(',')];
  for (const j of items) {
    baris.push(
      [
        j.waktu,
        j.kueri,
        j.piiDisamarkan,
        j.niat ?? '',
        j.mode,
        j.jumlahBukti,
        // Pemisah `;` (bukan spasi): sel tetap terbaca di lembar kerja, dan daftar
        // id tidak lagi berbentuk deret "4-4-4-4" yang menyerupai NIK berkelompok.
        j.idBukti.join(';'),
        j.gerbang ? `keras=${j.gerbang.keras};lunak=${j.gerbang.lunak};ok=${j.gerbang.ok}` : '',
        j.sebab,
        j.status,
        j.aiUsed,
        j.grounded,
        j.durasiMs,
      ]
        .map(selCsv)
        .join(','),
    );
  }
  return `${baris.join('\n')}\n`;
}

/** NDJSON: satu catatan per baris, cocok untuk pipa alat lain. */
export function eksporNdjson(items: Jejak[]): string {
  return items.map((j) => JSON.stringify(j)).join('\n') + (items.length ? '\n' : '');
}

/**
 * Periksa apakah teks ekspor masih memuat pola data pribadi. Dipakai uji & harness
 * sebagai jaring terakhir: bila penyamaran gagal, ekspor TIDAK boleh keluar.
 */
export function eksporMengandungPii(teks: string): boolean {
  return adaPenandaPribadi(teks);
}
