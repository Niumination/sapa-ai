import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminFromRequest, verifyPassword, hashPassword, createToken, COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const ChangePasswordSchema = z.object({
  passwordLama: z.string().min(1, 'Password lama wajib diisi.'),
  passwordBaru: z.string().min(8, 'Password baru minimal 8 karakter.'),
});

/** POST /api/auth/change-password — ganti password akun yang sedang login. */
export async function POST(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json({ error: 'Login diperlukan.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus JSON yang valid.' }, { status: 400 });
  }
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }, { status: 400 });
  }
  const { passwordLama, passwordBaru } = parsed.data;

  try {
    const record = await prisma.admin.findUnique({ where: { username: admin.username } });
    if (!record) {
      return NextResponse.json({ error: 'Akun tidak ditemukan.' }, { status: 404 });
    }
    const ok = await verifyPassword(passwordLama, record.password);
    if (!ok) {
      return NextResponse.json({ error: 'Password lama salah.' }, { status: 401 });
    }
    const hash = await hashPassword(passwordBaru);
    await prisma.admin.update({ where: { username: admin.username }, data: { password: hash } });

    // Re-sign token agar sesi tetap valid setelah ganti password (tanpa ini
    // payload lama tetap berlaku sampai 7 hari — sesi aman, tapi biar konsisten).
    const token = await createToken({ id: admin.id, username: admin.username, nama: admin.nama, role: admin.role });
    const res = NextResponse.json({ success: true, message: 'Password berhasil diganti.' });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    });
    return res;
  } catch (err) {
    console.error('[auth/change-password] gagal:', err);
    return NextResponse.json({ error: 'Gagal mengganti password.' }, { status: 500 });
  }
}
