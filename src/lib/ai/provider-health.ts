// ─── Kesehatan penyedia model — circuit breaker lintas-instance ───
//
// MASALAH YANG DIPERBAIKI (terukur 2026-09-21 di produksi)
// Penyedia OpenCode Go membalas HTTP 403 "An active OpenCode Go subscription is
// required to use Go models." untuk SETIAP permintaan karena langganan mati.
// Dua akibat yang terukur:
//   1. 403 diperlakukan sebagai throttle → di-retry setelah jeda 10 dtk, lalu
//      gagal juga. Setiap query ber-evidence membakar ~11,7 dtk wall-clock
//      (terukur: 12.366 ms dan 11.658 ms) untuk jawaban yang berakhir sama:
//      template deterministik. Pengguna menunggu, tanpa manfaat apa pun.
//   2. /api/status tetap melaporkan `state: "active"` karena status dihitung
//      dari NIAT konfigurasi (env terisi), bukan dari KENYATAAN panggilan.
//      Panel admin dan halaman status jadi berbohong tanpa sengaja.
//
// Solusi: circuit breaker yang mencatat hasil panggilan nyata ke penyimpanan
// bersama (`@/lib/store`, Upstash Redis; cadangan memori per-instance).
//   • Galat auth (401/402, 403 tanpa tanda throttle) → TIDAK di-retry, dan
//     membuka sirkuit setelah AMBANG_AUTH kegagalan berturut.
//     Selama terbuka, panggilan model dilewati seketika (fail fast) sehingga
//     permintaan pengguna langsung memakai jawaban deterministik tanpa jeda 11 dtk.
//   • Galat server/throttle → dihitung juga, dengan cooldown lebih pendek.
//   • Satu percobaan "setengah terbuka" diizinkan setelah cooldown lewat;
//     berhasil → sirkuit menutup, gagal → sirkuit membuka lagi.
//
// Catatan operasional: tanpa UPSTASH Redis, keadaan sirkuit hidup per-instance
// (sama seperti toggle admin). Ia tetap benar secara perilaku tiap instance —
// hanya saja tiap instance perlu satu kali gagal untuk belajar.

import { cacheGet, cacheSet, activeBackend, type StoreBackend } from '@/lib/store';

/** Sebab kegagalan yang dibedakan karena penanganannya berbeda. */
export type SebabGalat =
  /** Kunci salah, langganan mati, kuota habis — memperbaiki diri sendiri tidak mungkin. */
  | 'auth'
  /** 429 / 403 dengan tanda throttle (mis. "error code: 1010") — pulih setelah cooldown. */
  | 'throttle'
  /** 5xx — sementara. */
  | 'server'
  /** Batas waktu panggilan. */
  | 'timeout'
  /** Sambungan mandek (tidak ada data sama sekali) — punya penanganan sendiri di jalur streaming. */
  | 'stall'
  /** 4xx lain: permintaan/konfigurasi salah. */
  | 'konfigurasi'
  /** Galat jaringan/tipe lain. */
  | 'jaringan';

export interface KesehatanPenyedia {
  state: 'sehat' | 'terbuka';
  sebabTerakhir: SebabGalat | null;
  pesanTerakhir: string | null;
  gagalBerturut: number;
  gagalAuthBerturut: number;
  /** Epoch ms kapan sirkuit boleh dicoba lagi (percobaan setengah terbuka). */
  dibukaSampai: number | null;
  dibukaPada: string | null;
  berhasilTerakhir: string | null;
  backend: StoreBackend;
}

const KEY = 'sapa:ai:health:v1';
/** TTL panjang: keadaan sirkuit bersifat operasional, bukan cache. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function angkaEnv(nama: string, bawaan: number): number {
  const n = Number(process.env[nama]);
  return Number.isFinite(n) && n > 0 ? n : bawaan;
}

/** Kegagalan berturut sebelum sirkuit dibuka (non-auth). */
const AMBANG = angkaEnv('AI_CIRCUIT_FAIL_THRESHOLD', 3);
/** Kegagalan auth berturut sebelum sirkuit dibuka — 2, bukan 1: satu 401 bisa
 *  berarti kunci sedang dirotasi, dua berarti memang rusak. */
const AMBANG_AUTH = angkaEnv('AI_CIRCUIT_AUTH_THRESHOLD', 2);
const COOLDOWN_MS = angkaEnv('AI_CIRCUIT_COOLDOWN_MS', 60_000);
/** Cooldown auth lebih panjang: memperbaiki langganan/kunci butuh menit, bukan detik. */
const COOLDOWN_AUTH_MS = angkaEnv('AI_CIRCUIT_AUTH_COOLDOWN_MS', 600_000);

const SEHAT: KesehatanPenyedia = {
  state: 'sehat',
  sebabTerakhir: null,
  pesanTerakhir: null,
  gagalBerturut: 0,
  gagalAuthBerturut: 0,
  dibukaSampai: null,
  dibukaPada: null,
  berhasilTerakhir: null,
  backend: 'memory',
};

/** Penanda throttle di badan galat. 403 pada OpenCode Go dipakai untuk DUA hal
 *  yang berbeda: throttle burst (pulih sendiri) dan langganan mati (tidak pulih).
 *  Membedakannya penting — yang pertama layak diulang, yang kedua tidak. */
export function tandaThrottle(teks: string | undefined | null): boolean {
  return /(1010|rate ?limit|too many requests|overloaded|throttl|temporar)/i.test(String(teks ?? ''));
}

/** Klasifikasikan galat HTTP menjadi sebab yang bisa ditindak. */
export function klasifikasiStatus(status: number | undefined, pesan?: string): SebabGalat {
  if (status == null) return 'jaringan';
  if (status === 401 || status === 402) return 'auth';
  if (status === 403) return tandaThrottle(pesan) ? 'throttle' : 'auth';
  if (status === 429) return 'throttle';
  if (status >= 500) return 'server';
  return 'konfigurasi';
}

/** Klasifikasikan galat apa pun (LlmError, timeout, AbortError, jaringan). */
export function klasifikasiGalat(e: unknown): SebabGalat {
  const pesan = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number } | null)?.status;
  if (status != null) return klasifikasiStatus(status, pesan);
  if (/^stall/.test(pesan)) return 'stall';
  if (/^timeout|AbortError|aborted/i.test(pesan) || (e instanceof Error && e.name === 'AbortError')) return 'timeout';
  return 'jaringan';
}

/** Sebab yang boleh ikut membuka sirkuit. timeout/stall sengaja TIDAK dihitung:
 *  keduanya punya penanganan sendiri (watchdog + percobaan ulang bertimeout),
 *  dan model yang lambat bukan model yang mati. */
/**
 * Sebab yang MENGHITUNG kegagalan berturut-turut untuk membuka sirkuit.
 *
 * Reviu 2026-09-22 (gelombang 3, temuan saat audit penggabungan): semula hanya
 * `auth`, `throttle`, dan `server`. Akibatnya kegagalan JARINGAN (`fetch failed`)
 * dan TIMEOUT tidak pernah membuka sirkuit dan tidak pernah muncul di panel
 * status — terukur: dengan `AI_BASE_URL` diarahkan ke alamat mati, `/api/status`
 * tetap melaporkan `state: "active"`, `reachable: true`, `health.state: "sehat"`,
 * padahal SETIAP panggilan gagal. Itu persis kelas "panel berbohong" yang
 * diperbaiki gelombang 1, hanya jalur masuknya berbeda (jaringan, bukan auth).
 *
 * Ambangnya tetap 3 kegagalan berturut (`AI_CIRCUIT_FAIL_THRESHOLD`) supaya
 * gangguan jaringan sesaat tidak mematikan AI selama cooldown.
 *
 * `konfigurasi` (4xx selain auth/throttle) dan `stall` SENGAJA tetap di luar:
 * yang pertama adalah kesalahan permintaan kita (bukan penyedia tak sehat) dan
 * satu kueri ganjil tidak boleh mematikan AI untuk semua orang; yang kedua sudah
 * punya penanganan sendiri di jalur streaming.
 */
const DIHITUNG: SebabGalat[] = ['auth', 'throttle', 'server', 'timeout', 'jaringan'];

/** Baca keadaan kesehatan tersimpan (tanpa mengubah apa pun). */
export async function bacaKesehatan(): Promise<KesehatanPenyedia> {
  const tersimpan = await cacheGet<Partial<KesehatanPenyedia>>(KEY);
  if (!tersimpan) return { ...SEHAT, backend: activeBackend() };
  return {
    ...SEHAT,
    ...tersimpan,
    backend: activeBackend(),
  } as KesehatanPenyedia;
}

async function tulis(k: KesehatanPenyedia): Promise<void> {
  await cacheSet(KEY, { ...k, backend: undefined }, TTL_MS);
}

/** Boleh memanggil penyedia sekarang? */
export async function bolehPanggilPenyedia(): Promise<{ ok: boolean; alasan?: string; setengahTerbuka?: boolean }> {
  const k = await bacaKesehatan();
  if (k.state !== 'terbuka') return { ok: true };
  const sisaMs = (k.dibukaSampai ?? 0) - Date.now();
  if (sisaMs <= 0) return { ok: true, setengahTerbuka: true };
  return {
    ok: false,
    alasan: `penyedia gagal (${k.sebabTerakhir ?? 'tidak diketahui'}); sirkuit terbuka ${Math.ceil(sisaMs / 1000)} dtk lagi${
      k.pesanTerakhir ? ` — ${k.pesanTerakhir}` : ''
    }`,
  };
}

/** Catat kegagalan panggilan. Mengembalikan keadaan setelah pencatatan. */
export async function catatGagal(sebab: SebabGalat, pesan?: string): Promise<KesehatanPenyedia> {
  const k = await bacaKesehatan();
  if (!DIHITUNG.includes(sebab)) return k;

  const gagalBerturut = k.gagalBerturut + 1;
  const gagalAuthBerturut = sebab === 'auth' ? k.gagalAuthBerturut + 1 : 0;
  const buka = sebab === 'auth' ? gagalAuthBerturut >= AMBANG_AUTH : gagalBerturut >= AMBANG;
  const cooldown = sebab === 'auth' ? COOLDOWN_AUTH_MS : COOLDOWN_MS;

  const baru: KesehatanPenyedia = {
    state: buka ? 'terbuka' : k.state,
    sebabTerakhir: sebab,
    pesanTerakhir: pesan ? pesan.slice(0, 160) : k.pesanTerakhir,
    gagalBerturut,
    gagalAuthBerturut,
    dibukaSampai: buka ? Date.now() + cooldown : k.dibukaSampai,
    dibukaPada: buka ? new Date().toISOString() : k.dibukaPada,
    berhasilTerakhir: k.berhasilTerakhir,
    backend: activeBackend(),
  };
  await tulis(baru);
  return baru;
}

/** Catat keberhasilan: sirkuit menutup. */
export async function catatSukses(): Promise<KesehatanPenyedia> {
  const k = await bacaKesehatan();
  const baru: KesehatanPenyedia = {
    ...SEHAT,
    berhasilTerakhir: new Date().toISOString(),
    backend: activeBackend(),
    // Pertahankan riwayat sebab terakhir supaya operator tahu apa yang baru saja pulih.
    sebabTerakhir: k.state === 'terbuka' ? k.sebabTerakhir : null,
    pesanTerakhir: k.state === 'terbuka' ? k.pesanTerakhir : null,
  };
  await tulis(baru);
  return baru;
}

/** Untuk diagnosa/pemulihan manual (mis. setelah langganan diperpanjang). */
export async function resetKesehatan(): Promise<KesehatanPenyedia> {
  const baru: KesehatanPenyedia = { ...SEHAT, berhasilTerakhir: new Date().toISOString(), backend: activeBackend() };
  await tulis(baru);
  return baru;
}

/** Ringkasan siap-tampil untuk /api/status (tanpa kredensial apa pun). */
export function ringkasKesehatan(k: KesehatanPenyedia): {
  state: 'sehat' | 'terbuka';
  reachable: boolean;
  sebab: SebabGalat | null;
  pesan: string | null;
  gagalBerturut: number;
  sisaDetik: number;
  dibukaPada: string | null;
  berhasilTerakhir: string | null;
  backend: StoreBackend;
} {
  const sisaMs = (k.dibukaSampai ?? 0) - Date.now();
  return {
    state: k.state,
    reachable: k.state === 'sehat',
    sebab: k.sebabTerakhir,
    pesan: k.pesanTerakhir,
    gagalBerturut: k.gagalBerturut,
    sisaDetik: sisaMs > 0 ? Math.ceil(sisaMs / 1000) : 0,
    dibukaPada: k.dibukaPada,
    berhasilTerakhir: k.berhasilTerakhir,
    backend: k.backend,
  };
}
