import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    return NextResponse.json(
      { error: 'Forbidden — EWS membutuhkan sesi admin.', alerts: [], ready: false },
      { status: 403 },
    );
  }
  try {
    const [alerts, snapshotCount] = await Promise.all([
      prisma.ewsAlert.findMany({
        where: { resolvedAt: null },
        include: {
          indicator: {
            select: { nama: true, satuan: true, dataset: { select: { slug: true, nama: true } } },
          },
        },
        orderBy: [
          { severity: 'asc' },
          { createdAt: 'desc' },
        ],
        take: 100,
      }),
      prisma.sapaSnapshot.count(),
    ]);
    return NextResponse.json({ alerts, ready: snapshotCount > 0 });
  } catch (err) {
    console.error('Failed to fetch EWS alerts:', err);
    return NextResponse.json({ alerts: [], ready: false });
  }
}