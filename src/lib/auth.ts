// ─── Auth Helpers — JWT + bcrypt for Admin ───

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

// FAIL-CLOSED (PR Lapis-0): tidak ada lagi fallback secret hardcode.
// Secret fallback publik ('cc-acehtengah-secret-key-2026' di repo publik) berarti
// siapa pun bisa menempa token admin begitu satu deploy lupa memasang env.
// Jika JWT_SECRET hilang/terlalu lemah → auth tidak berfungsi (login 500,
// token verifikasi selalu gagal → 401), BUKAN diam-diam terbuka.
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'JWT_SECRET belum dikonfigurasi (minimal 16 karakter acak). ' +
        'Set di environment server — auth sengaja dimatikan (fail-closed).',
    );
  }
  return new TextEncoder().encode(secret);
}

const COOKIE_NAME = 'cc-admin-session';

export interface AdminPayload {
  id: string;
  username: string;
  nama: string;
  role: string;
}

/** Hash password with bcrypt */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Verify password against hash */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Create JWT token */
export async function createToken(admin: AdminPayload): Promise<string> {
  return new SignJWT(admin as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret());
}

/** Verify JWT token — gagal/kedaluwarsa/misconfig selalu berarti "tidak terautentikasi" */
export async function verifyToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as AdminPayload;
  } catch {
    return null;
  }
}

/** Ekstrak admin dari cookie request — helper untuk proteksi route API mutasi. */
export async function getAdminFromRequest(req: Request): Promise<AdminPayload | null> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const match = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const token = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  return verifyToken(token);
}

/**
 * Otorisasi endpoint setup (migrasi/seed): wajib env ADMIN_SETUP_TOKEN dan
 * header x-setup-token yang cocok. Tanpa env → endpoint nonaktif (fail-closed).
 */
export function isSetupAuthorized(req: Request): boolean {
  const expected = process.env.ADMIN_SETUP_TOKEN;
  if (!expected || expected.length < 16) return false;
  const given = req.headers.get('x-setup-token') ?? '';
  // Bandingkan tanpa early-exit per karakter (kurangi timing oracle).
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export { COOKIE_NAME };
