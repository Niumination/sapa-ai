import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, isSetupAuthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/setup/dtsen-role — Buat/upgrade akun dengan role DTSEN.
 *
 * Body JSON:
 *   { "username": "analis1", "password": "...", "role": "DTSEN_ANALYST" | "DTSEN_LOOKUP", "nama": "Analis DTSEN" }
 *
 * Keamanan:
 * - Wajib header `x-setup-token` cocok dengan env `ADMIN_SETUP_TOKEN` (fail-closed tanpa env).
 * - Hanya role DTSEN_ANALYST / DTSEN_LOOKUP yang bisa dibuat di sini (bukan SUPERADMIN).
 * - Password di-hash bcrypt(12); tidak pernah dikembalikan.
 *
 * DTSEN_ANALYST  → akses agregat DTSEN (RESTRICTED_AGGR).
 * DTSEN_LOOKUP   → akses agregat + lookup by-NIK (RESTRICTED_PERSONAL, audit trail).
 */
export async function POST(req: Request) {
  if (!isSetupAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized — butuh x-setup-token yang valid.' }, { status: 403 });
  }

  let body: { username?: string; password?: string; role?: string; nama?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON tidak valid.' }, { status: 400 });
  }

  const username = (body.username ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  const role = body.role ?? '';
  const nama = (body.nama ?? username).trim();

  const ALLOWED_ROLES = ['DTSEN_ANALYST', 'DTSEN_LOOKUP'];
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `Role harus salah satu: ${ALLOWED_ROLES.join(', ')}.` },
      { status: 400 },
    );
  }
  if (!username || username.length < 3) {
    return NextResponse.json({ error: 'Username minimal 3 karakter.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password minimal 8 karakter.' }, { status: 400 });
  }

  try {
    const hash = await hashPassword(password);
    const existing = await prisma.admin.findUnique({ where: { username } });

    if (existing) {
      // Upgrade role akun yang sudah ada (mis. ADMIN → DTSEN_LOOKUP).
      await prisma.admin.update({
        where: { username },
        data: { role: role as any, nama },
      });
      return NextResponse.json({ success: true, message: `Role ${username} di-upgrade ke ${role}.`, username, role });
    }

    const created = await prisma.admin.create({
      data: { username, password: hash, nama, role: role as any },
      select: { id: true, username: true, role: true, nama: true },
    });
    return NextResponse.json({ success: true, message: `Akun ${role} dibuat.`, ...created }, { status: 201 });
  } catch (e: any) {
    console.error('[setup/dtsen-role] error:', e);
    return NextResponse.json({ error: `Gagal membuat akun: ${e?.message ?? String(e)}` }, { status: 500 });
  }
}
