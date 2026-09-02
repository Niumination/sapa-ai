// ─── GET /api/dtsen/releases — daftar rilis (ringkasan saja, tanpa individu) ───
// Role: RESTRICTED_AGGR ke atas. Tidak ada data pribadi di sini — hanya metadata.
// @hotfix 29-Agu-2026: schema baru — versi/jalur/totalBaris di metadata JSON.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromRequest } from '@/lib/auth';
import { decideDataAccess } from '@/lib/data-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  const decision = decideDataAccess(admin?.role ?? null, 'RESTRICTED_AGGR');
  if (!decision.ok) {
    return NextResponse.json(
      {
        error: decision.status === 401
          ? 'Data DTSEN terbatas — login dengan akun berrole DTSEN_LOOKUP, SUPERADMIN, atau DTSEN_ROOT.'
          : `Role Anda tidak berhak (butuh: ${decision.requiredRoles?.join(' / ')}).`,
      },
      { status: decision.status },
    );
  }

  try {
    const releases = await prisma.dtsenRelease.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, releaseNumber: true, status: true,
        publishedAt: true, createdAt: true, metadata: true,
      },
    });
    // Flat-kan metadata agar frontend lama (versi/jalur/totalBaris/ditolak/uploadedBy/checksum) tetap berfungsi.
    const flat = releases.map((r) => {
      const md = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        versi: md.versi ?? 'manual',
        jalur: md.jalur ?? 'MANUAL',
        status: r.status,
        totalBaris: md.totalBaris ?? 0,
        ditolak: md.ditolak ?? 0,
        uploadedBy: md.uploadedBy ?? null,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
        checksum: md.checksum ?? null,
        releaseNumber: r.releaseNumber,
      };
    });
    return NextResponse.json({ releases: flat });
  } catch (err) {
    console.error('[dtsen/releases] gagal:', err);
    return NextResponse.json(
      { error: 'Tabel fondasi belum dibuat. Jalankan POST /api/setup dengan x-setup-token.' },
      { status: 409 },
    );
  }
}
