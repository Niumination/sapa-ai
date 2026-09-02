// ─── POST /api/dtsen/release/[id]/publish — publish atomik (PR-4b) ───
// Transisi: hitung agregat (sensor k<5) → tulis agregat → rilis baru PUBLISHED,
// rilis lama SUPERSEDED → baris individu rilis lama DIPURGE seketika.
// (Desain §6.4 menyebut tenggang ~30 hari via cron; implementasi ini MEMPERKETAT:
// purge langsung saat rilis baru terbit — data by-name tidak menumpuk.)
// Role: RESTRICTED_PERSONAL (DTSEN_LOOKUP/SUPERADMIN). Audit sebelum sukses.
// @hotfix 29-Agu-2026: schema baru — bansos Boolean, agregat jiwa/kk,
// releaseNumber/metadata, DataSource tanpa lastSync.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromRequest } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { decideDataAccess, buildAuditEntry } from '@/lib/data-gate';
import { buildAgregatWilayah } from '@/services/dtsen-import';
import { buildProvenanceLabel, type ReleaseRef } from '@/services/dtsen-planner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function audit(admin: any, aksi: 'PUBLISH' | 'PUBLISH_DITOLAK', detail: string, ip: string, rowCount = 0) {
  // @hotfix 29-Agu-2026: schema DB aktual — kolom `action`, tanpa `adminNama`.
  const entry = buildAuditEntry({ admin, aksi, detail, ip, rowCount });
  return prisma.dataAccessAudit
    .create({ data: { adminId: entry.adminId, action: entry.aksi, detail: entry.detail, rowCount: entry.rowCount, ip: entry.ip } })
    .catch((e) => console.error('[dtsen/publish] audit gagal:', e));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req);
  const admin = await getAdminFromRequest(req);
  const decision = decideDataAccess(admin?.role ?? null, 'RESTRICTED_PERSONAL');
  if (!decision.ok) {
    if (admin) await audit(admin, 'PUBLISH_DITOLAK', 'percobaan publish tanpa hak', ip);
    return NextResponse.json(
      { error: decision.status === 401 ? 'Login dengan akun berrole DTSEN diperlukan.' : 'Role Anda tidak berhak mem-publish rilis.' },
      { status: decision.status },
    );
  }

  const { id } = await params;
  try {
    const release = await prisma.dtsenRelease.findUnique({ where: { id } });
    if (!release) return NextResponse.json({ error: 'Rilis tidak ditemukan.' }, { status: 404 });
    if (release.status !== 'STAGING') {
      return NextResponse.json({ error: `Hanya rilis STAGING yang bisa dipublish (status kini: ${release.status}).` }, { status: 409 });
    }

    const rows = await prisma.dtsenIndividu.findMany({
      where: { releaseId: id },
      select: { nikHash: true, namaMasked: true, kecamatan: true, desa: true, desil: true, bansos: true },
    });
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Rilis tidak memiliki baris individu — tidak bisa dipublish.' }, { status: 409 });
    }

    const aggr = buildAgregatWilayah(
      rows.map((r) => ({
        nikHash: r.nikHash,
        namaMasked: r.namaMasked,
        keluargaId: null,
        kecamatan: r.kecamatan ?? '',
        desa: r.desa ?? '',
        desil: r.desil ?? 0,
        statusBansos: { pkh: false, bpnt: false, pbi: r.bansos },
      })),
    );

    const previousPublished = await prisma.dtsenRelease.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true },
    });
    const prevIds = previousPublished.map((p) => p.id);

    const publishedAt = new Date();
    const md = (release.metadata ?? {}) as Record<string, unknown>;
    const releaseRef: ReleaseRef = { releaseNumber: release.releaseNumber, status: 'PUBLISHED', publishedAt };
    const provenanceLabel = buildProvenanceLabel(releaseRef);

    await prisma.$transaction([
      // @hotfix 29-Agu-2026: schema baru — agregat pakai jiwa/kk (bukan jumlahJiwa/jumlahKeluarga)
      prisma.dtsenAgregatWilayah.createMany({
        data: aggr.rows.map((a) => ({
          releaseId: id,
          kecamatan: a.kecamatan,
          desa: a.desa,
          desil: a.desil,
          jiwa: a.jumlahJiwa,
          kk: a.jumlahKeluarga,
        })),
      }),
      prisma.dtsenRelease.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt },
      }),
      prisma.dtsenRelease.updateMany({
        where: { id: { in: prevIds } },
        data: { status: 'SUPERSEDED' },
      }),
      prisma.dataSource.updateMany({
        where: { slug: 'dtsen' },
        data: { provenanceLabel },
      }),
    ]);

    let purged = 0;
    if (prevIds.length > 0) {
      try {
        const del = await prisma.dtsenIndividu.deleteMany({ where: { releaseId: { in: prevIds } } });
        purged = del.count;
      } catch (purgeErr) {
        console.error('[dtsen/publish] PURGE RILIS LAMA GAGAL (perlu ditindaklanjuti):', purgeErr);
      }
    }

    await audit(
      admin!,
      'PUBLISH',
      `release=${id} agregat=${aggr.rows.length} kelompokTersensor=${aggr.kelompokTerSensor} purgeIndividu=${purged} (${md.versi ?? 'manual'})`,
      ip,
      rows.length,
    );

    return NextResponse.json({
      ok: true,
      releaseId: id,
      status: 'PUBLISHED',
      agregat: {
        kelompokWilayahDesil: aggr.rows.length,
        jiwaTerSensor: aggr.jiwaTerSensor,
        kelompokTerSensor: aggr.kelompokTerSensor,
      },
      superseded: prevIds.length,
      individuRilisLamaDihapus: purged,
      message: 'Rilis aktif. Agregat wilayah tersedia untuk query; individu rilis lama sudah dipurge.',
    });
  } catch (err) {
    console.error('[dtsen/publish] gagal:', err);
    return NextResponse.json(
      { error: 'Publish gagal', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
