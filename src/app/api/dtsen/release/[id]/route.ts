// ─── GET /api/dtsen/release/[id] — detail untuk ditinjau sebelum publish ───
// Sampel yang dikembalikan HANYA bentuk terminimasi (nama masked + wilayah +
// desil). nikHash TIDAK PERNAH dikembalikan ke klien.
// Role: RESTRICTED_AGGR ke atas.
// @hotfix 29-Agu-2026: schema baru — metadata JSON, bansos Boolean.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromRequest } from '@/lib/auth';
import { decideDataAccess } from '@/lib/data-gate';
import { buildAgregatWilayah } from '@/services/dtsen-import';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminFromRequest(req);
  const decision = decideDataAccess(admin?.role ?? null, 'RESTRICTED_AGGR');
  if (!decision.ok) {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: decision.status });
  }

  const { id } = await params;
  try {
    const release = await prisma.dtsenRelease.findUnique({
      where: { id },
      select: {
        id: true, releaseNumber: true, status: true, publishedAt: true, createdAt: true, metadata: true,
      },
    });
    if (!release) return NextResponse.json({ error: 'Rilis tidak ditemukan.' }, { status: 404 });

    // @hotfix 29-Agu-2026: flat-kan metadata untuk frontend lama.
    const md = (release.metadata ?? {}) as Record<string, unknown>;
    const releaseFlat = {
      id: release.id,
      versi: md.versi ?? 'manual',
      jalur: md.jalur ?? 'MANUAL',
      status: release.status,
      totalBaris: md.totalBaris ?? 0,
      ditolak: md.ditolak ?? 0,
      uploadedBy: md.uploadedBy ?? null,
      publishedAt: release.publishedAt,
      createdAt: release.createdAt,
      checksum: md.checksum ?? null,
      releaseNumber: release.releaseNumber,
    };

    const rows = await prisma.dtsenIndividu.findMany({
      where: { releaseId: id },
      select: { namaMasked: true, kecamatan: true, desa: true, desil: true, bansos: true },
    });

    // Preview agregat dihitung ulang deterministik dari baris terminimasi.
    const preview = buildAgregatWilayah(
      rows.map((r) => ({
        nikHash: '',
        namaMasked: r.namaMasked,
        keluargaId: null,
        kecamatan: r.kecamatan ?? '',
        desa: r.desa ?? '',
        desil: r.desil ?? 0,
        statusBansos: { pkh: false, bpnt: false, pbi: r.bansos },
      })),
    );

    return NextResponse.json({
      release: releaseFlat,
      sampelTerkover: rows.slice(0, 8).map((r) => ({
        namaMasked: r.namaMasked,
        kecamatan: r.kecamatan,
        desa: r.desa,
        desil: r.desil,
      })),
      sebaranKecamatan: Object.entries(
        rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.kecamatan ?? ''] = (acc[r.kecamatan ?? ''] ?? 0) + 1;
          return acc;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .map(([kecamatan, jiwa]) => ({ kecamatan, jiwa })),
      agregatPreview: {
        kelompokWilayahDesil: preview.rows.length,
        jiwaTerSensor: preview.jiwaTerSensor,
        kelompokTerSensor: preview.kelompokTerSensor,
        contoh: preview.rows.slice(0, 10),
      },
    });
  } catch (err) {
    console.error('[dtsen/release] gagal:', err);
    return NextResponse.json({ error: 'Gagal membaca rilis' }, { status: 500 });
  }
}
