// ─── Rate limiter (SoT Fase D — cherry-pick 5faa080, tanpa auth/JWT) ───
//
// Bersandar pada src/lib/store.ts (Upstash Redis bila dikonfigurasi, jatuh ke memori bila tidak).
// Batas lintas instance bila Redis ada; tanpa Redis = limit × instance (didokumentasikan via `backend`).

import { incrementCounter, resetCounter, activeBackend, type StoreBackend } from '@/lib/store';

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Detik sampai window direset — untuk header Retry-After. */
  retryAfterSeconds: number;
  backend: StoreBackend;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export async function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  const { count, resetAt, backend } = await incrementCounter(`rl:${key}`, windowMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return { ok: count <= limit, limit, remaining: Math.max(0, limit - count), retryAfterSeconds, backend };
}

export async function resetRateLimit(key: string): Promise<void> {
  await resetCounter(`rl:${key}`);
}

export function getClientIp(req: Request): string {
  // PR Lapis-0: ambil entri PALING KANAN x-forwarded-for, bukan paling kiri.
  // Platform (Vercel) menambahkan IP klien asli di ujung kanan daftar; entri di
  // kiri bisa disisipkan bebas oleh klien (spoofing untuk bypass rate limit).
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'Retry-After': String(result.retryAfterSeconds),
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
  };
}

export { activeBackend };
