// ─── /api/cron/sync-sapa — sinkronisasi warehouse harian (PR Lapis 2) ───
// Dipanggil Vercel Cron (lihat vercel.json) atau manual oleh admin.
// Otorisasi (salah satu):
//   1. Authorization: Bearer <CRON_SECRET>   (cara Vercel Cron bekerja)
//   2. header x-setup-token = ADMIN_SETUP_TOKEN
//   3. sesi cookie admin
// Tanpa satu pun → 403 (fail-closed).

import { NextRequest, NextResponse } from 'next/server';
import { syncSapaWarehouse } from '@/services/warehouse-sync';
import { getAdminFromRequest, isSetupAuthorized } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && cronSecret.length >= 16) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  if (isSetupAuthorized(req)) return true;
  const admin = await getAdminFromRequest(req);
  return admin !== null;
}

async function handler(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json(
      { error: 'Forbidden — butuh CRON_SECRET, x-setup-token, atau sesi admin.' },
      { status: 403 },
    );
  }

  try {
    await prisma.admin.count();
  } catch {
    return NextResponse.json(
      {
        error:
          'Tabel warehouse belum ada. Jalankan sekali: POST /api/setup dengan header x-setup-token.',
      },
      { status: 409 },
    );
  }

  try {
    const result = await syncSapaWarehouse();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[cron/sync-sapa] failed:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export const GET = handler;
export const POST = handler;
