// ─── POST /api/setup/admin — Auto-create Admin table ───
// PR Lapis-0: endpoint setup kini TERKUNCI. Wajib env ADMIN_SETUP_TOKEN (min 16
// karakter) + header x-setup-token yang cocok. Tanpa env → nonaktif (403).
// Seed tidak lagi memakai password default yang diketahui publik ("admin123"):
// gunakan ADMIN_BOOTSTRAP_PASSWORD, atau password acak sekali-tampil.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, isSetupAuthorized } from '@/lib/auth';

function randomPassword(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(18));
  return Buffer.from(bytes).toString('base64url'); // ~24 char, entropi ~144 bit
}

export async function POST(req: NextRequest) {
  if (!isSetupAuthorized(req)) {
    return NextResponse.json(
      {
        error:
          'Setup dinonaktifkan. Set ADMIN_SETUP_TOKEN (min 16 karakter) di server ' +
          'dan kirim header x-setup-token untuk menjalankan setup.',
      },
      { status: 403 },
    );
  }

  try {
    // Check if admin table exists by trying to query
    const existing = await prisma.admin.findFirst();
    if (existing) {
      return NextResponse.json({
        success: true,
        message: 'Admin table already exists',
      });
    }
  } catch {
    // Table doesn't exist, create it
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Admin" (
          "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
          "username" TEXT NOT NULL,
          "password" TEXT NOT NULL,
          "nama" TEXT NOT NULL,
          "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Admin_username_key" ON "Admin"("username")
      `);
    } catch (e: any) {
      // Enum might not exist yet, try without enum type
      if (e?.message?.includes('AdminRole')) {
        await prisma.$executeRawUnsafe(`
          DO $$ BEGIN
            CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPERADMIN', 'DTSEN_ANALYST', 'DTSEN_LOOKUP', 'DTSEN_ROOT');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        await prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "Admin" (
            "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
            "username" TEXT NOT NULL,
            "password" TEXT NOT NULL,
            "nama" TEXT NOT NULL,
            "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await prisma.$executeRawUnsafe(`
          CREATE UNIQUE INDEX IF NOT EXISTS "Admin_username_key" ON "Admin"("username")
        `);
      } else {
        throw e;
      }
    }
  }

  // Seed admin if empty — TANPA password default yang bisa ditebak.
  const count = await prisma.admin.count();
  if (count === 0) {
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? randomPassword();
    const fromEnv = Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD);
    const hash = await hashPassword(bootstrapPassword);
    await prisma.admin.create({
      data: {
        username: 'admin',
        password: hash,
        nama: 'Administrator',
        role: 'ADMIN',
      },
    });
    return NextResponse.json({
      success: true,
      message: fromEnv
        ? 'Admin table created + seeded (username: admin, password dari ADMIN_BOOTSTRAP_PASSWORD)'
        : 'Admin table created + seeded. SIMPAN password sekali-tampil di bawah lalu SEGERA ganti setelah login.',
      // Hanya dikirim saat tidak pakai env — pemanggil memegang ADMIN_SETUP_TOKEN (operator).
      ...(fromEnv ? {} : { bootstrapPassword }),
    });
  }

  return NextResponse.json({
    success: true,
    message: 'Admin table ready.',
  });
}
