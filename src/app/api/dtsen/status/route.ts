// ─── GET /api/dtsen/status — status semua sumber data + rilis tersimpan ───
// Menampilkan: registry sumber (DataSource) + jumlah rilis per status +
// rilis DTSEN terbaru. Role: RESTRICTED_AGGR ke atas (metadata saja).

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
    const sources = await prisma.dataSource.findMany({ orderBy: { slug: 'asc' } });
    const releases = await prisma.dtsenRelease.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });

    // Rilis per sumber (dari metadata.sourceSlug; fallback slug 'dtsen')
    const releasesBySource = new Map<string, typeof releases>();
    for (const r of releases) {
      const slug = (r.metadata as any)?.sourceSlug ?? 'dtsen';
      const arr = releasesBySource.get(slug) ?? [];
      arr.push(r);
      releasesBySource.set(slug, arr);
    }

    // Statistik agregat per rilis
    const releaseStats = await Promise.all(
      releases.map(async (r) => {
        const [individu, agregat] = await Promise.all([
          prisma.dtsenIndividu.count({ where: { releaseId: r.id } }),
          prisma.dtsenAgregatWilayah.count({ where: { releaseId: r.id } }),
        ]);
        return { releaseId: r.id, individu, agregat };
      }),
    );
    const statsMap = new Map(releaseStats.map((s) => [s.releaseId, s]));

    const totalIndividu = releaseStats.reduce((a, s) => a + s.individu, 0);
    const totalAgregat = releaseStats.reduce((a, s) => a + s.agregat, 0);

    return NextResponse.json({
      ok: true,
      ringkasan: {
        totalSumber: sources.length,
        totalRilis: releases.length,
        rilisAktif: releases.filter((r) => r.status === 'PUBLISHED').length,
        totalIndividu,
        totalAgregat,
      },
      sumber: sources.map((s) => {
        const rels = releasesBySource.get(s.slug) ?? [];
        return {
          slug: s.slug,
          nama: s.nama,
          sensitivity: s.sensitivity,
          provenanceLabel: s.provenanceLabel,
          ownerInstansi: s.ownerInstansi,
          rilis: rels.map((r) => ({
            id: r.id,
            releaseNumber: r.releaseNumber,
            status: r.status,
            versi: (r.metadata as any)?.versi ?? 'manual',
            jalur: (r.metadata as any)?.jalur ?? 'MANUAL',
            totalBaris: (r.metadata as any)?.totalBaris ?? 0,
            ditolak: (r.metadata as any)?.ditolak ?? 0,
            checksum: (r.metadata as any)?.checksum ?? null,
            uploadedBy: (r.metadata as any)?.uploadedBy ?? null,
            publishedAt: r.publishedAt,
            createdAt: r.createdAt,
            ...(statsMap.get(r.id) ?? { individu: 0, agregat: 0 }),
          })),
        };
      }),
      rilis: releases.map((r) => ({
        id: r.id,
        releaseNumber: r.releaseNumber,
        status: r.status,
        versi: (r.metadata as any)?.versi ?? 'manual',
        jalur: (r.metadata as any)?.jalur ?? 'MANUAL',
        sourceSlug: (r.metadata as any)?.sourceSlug ?? 'dtsen',
        totalBaris: (r.metadata as any)?.totalBaris ?? 0,
        ditolak: (r.metadata as any)?.ditolak ?? 0,
        uploadedBy: (r.metadata as any)?.uploadedBy ?? null,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
        ...(statsMap.get(r.id) ?? { individu: 0, agregat: 0 }),
      })),
    });
  } catch (err) {
    console.error('[dtsen/status] gagal:', err);
    return NextResponse.json(
      { error: 'Gagal membaca status sumber.', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
