// ─── Penyimpanan bersama untuk rate limit & cache (P1-08) ───
//
// MASALAH (LAPORAN_AUDIT_PRODUCTION_READINESS.md §P1-08)
// Rate limiter dan seluruh cache sebelumnya memakai variabel modul. Di Vercel
// setiap instance serverless punya memori sendiri dan mati saat idle, sehingga:
//   • batas efektif = limit × jumlah instance aktif (proteksi jauh lebih lemah
//     daripada yang tertulis)
//   • hit-rate cache rendah dan TIDAK KONSISTEN antar pengguna — pengguna A
//     bisa melihat data 10 menit lalu sementara pengguna B melihat data baru
//
// SOLUSI
// Lapisan penyimpanan dengan dua implementasi:
//   1. Upstash Redis via REST — dipakai bila UPSTASH_REDIS_REST_URL dan
//      UPSTASH_REDIS_REST_TOKEN tersedia. REST dipilih (bukan koneksi TCP)
//      karena tahan terhadap sifat serverless yang sering cold start.
//   2. Memori proses — cadangan otomatis bila Redis tidak dikonfigurasi
//      atau sedang gagal, sehingga aplikasi TIDAK ikut mati.
//
// Kegagalan Redis tidak pernah menggagalkan permintaan pengguna: operasi
// dianggap best-effort dan jatuh ke memori.

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '');
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Batas jumlah kunci yang ditahan di memori, mencegah kebocoran. */
const MAX_LOCAL_KEYS = 10_000;
const REDIS_TIMEOUT_MS = 1_500;

export type StoreBackend = 'redis' | 'memory';

export function activeBackend(): StoreBackend {
  return UPSTASH_URL && UPSTASH_TOKEN ? 'redis' : 'memory';
}

// ─── Cadangan di memori ───

interface LocalEntry {
  value: string;
  expiresAt: number;
}

const local = new Map<string, LocalEntry>();

function sweepLocal(now: number): void {
  for (const [k, v] of local) if (v.expiresAt <= now) local.delete(k);
}

function localGet(key: string): string | null {
  const hit = local.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    local.delete(key);
    return null;
  }
  return hit.value;
}

function localSet(key: string, value: string, ttlMs: number): void {
  if (local.size > MAX_LOCAL_KEYS) sweepLocal(Date.now());
  local.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function localIncr(key: string, ttlMs: number): { count: number; resetAt: number } {
  const now = Date.now();
  const hit = local.get(key);
  if (!hit || hit.expiresAt <= now) {
    const resetAt = now + ttlMs;
    local.set(key, { value: '1', expiresAt: resetAt });
    return { count: 1, resetAt };
  }
  const count = Number(hit.value) + 1;
  hit.value = String(count);
  return { count, resetAt: hit.expiresAt };
}

// ─── Upstash Redis via REST ───

/** Jalankan satu perintah Redis. Mengembalikan null bila gagal/timeout. */
async function redisCommand(command: (string | number)[]): Promise<unknown | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;

  try {
    const res = await fetch(UPSTASH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[store] Redis membalas ${res.status} — memakai cadangan memori`);
      return null;
    }
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (json.error) {
      console.warn('[store] Redis error:', json.error);
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.warn(
      '[store] Redis tidak dapat dihubungi — memakai cadangan memori:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Jalankan beberapa perintah sekaligus (pipeline). */
async function redisPipeline(commands: (string | number)[][]): Promise<unknown[] | null> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;

  try {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(REDIS_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown; error?: string }[];
    return json.map((r) => r.result ?? null);
  } catch {
    return null;
  }
}

// ─── API publik ───

export interface CounterResult {
  count: number;
  resetAt: number;
  backend: StoreBackend;
}

/**
 * Naikkan pencacah ber-TTL secara atomik — dasar bagi rate limiting.
 * INCR + EXPIRE dijalankan dalam satu pipeline agar tidak ada jendela di mana
 * kunci ada tanpa masa berlaku (yang akan membuat pengguna terkunci selamanya).
 */
export async function incrementCounter(key: string, windowMs: number): Promise<CounterResult> {
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  const hasil = await redisPipeline([
    ['INCR', key],
    ['EXPIRE', key, ttlSeconds, 'NX'],
    ['PTTL', key],
  ]);

  if (hasil && typeof hasil[0] === 'number') {
    const pttl = typeof hasil[2] === 'number' && hasil[2] > 0 ? hasil[2] : windowMs;
    return { count: hasil[0], resetAt: Date.now() + pttl, backend: 'redis' };
  }

  const lokal = localIncr(key, windowMs);
  return { ...lokal, backend: 'memory' };
}

/** Hapus pencacah — dipakai setelah login berhasil. */
export async function resetCounter(key: string): Promise<void> {
  local.delete(key);
  await redisCommand(['DEL', key]);
}

/** Ambil nilai cache. Mengembalikan null bila tidak ada / kedaluwarsa / rusak. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const dariRedis = await redisCommand(['GET', key]);
  const mentah = typeof dariRedis === 'string' ? dariRedis : localGet(key);
  if (mentah == null) return null;

  try {
    return JSON.parse(mentah) as T;
  } catch {
    // Nilai rusak — perlakukan sebagai cache miss, jangan sampai menggagalkan
    // permintaan pengguna.
    return null;
  }
}

/** Simpan nilai cache dengan masa berlaku. */
export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return; // Tidak dapat diserialisasi — lewati diam-diam.
  }

  localSet(key, serialized, ttlMs);
  await redisCommand(['SET', key, serialized, 'PX', Math.max(1, Math.round(ttlMs))]);
}

/**
 * Pola cache-aside: ambil dari cache, atau hitung lalu simpan.
 * Kegagalan penyimpanan tidak pernah menggagalkan `produce()`.
 */
export async function cached<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== null) return hit;

  const nilai = await produce();
  await cacheSet(key, nilai, ttlMs);
  return nilai;
}

/** Hanya untuk keperluan pengujian — kosongkan penyimpanan memori. */
export function __clearLocalStore(): void {
  local.clear();
}
