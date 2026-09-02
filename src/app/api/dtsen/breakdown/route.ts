// ─── GET /api/dtsen/breakdown — pecah agregat DTSEN per dimensi (tanpa LLM) ───
// @hotfix 29-Agu-2026: tombol "Pecah Jawaban" di output AI memakai endpoint ini.
// DETERMINISTIK murni dari rilis PUBLISHED (tidak ada panggilan model → hemat
// usage). Agregat k≥5 sudah disensor saat publish.
//
// Query params:
//   scope   = 'kecamatan' | 'desa' | 'desil'   (dimensi yang diminta)
//   kecamatan = filter kecamatan (untuk scope desa/desil)
//   desa      = filter desa (untuk scope desil)
//   program   = 'pbi' | 'pkh' | 'bpnt' | 'semua'  (hitung penerima bansos)
//
// Contoh:
//   /api/dtsen/breakdown?scope=kecamatan              → 14 kecamatan
//   /api/dtsen/breakdown?scope=desa&kecamatan=LINGE   → desa di Linge
//   /api/dtsen/breakdown?scope=desil&kecamatan=LINGE&desa=LUMUT
//   /api/dtsen/breakdown?scope=kecamatan&program=pbi  → penerima PBI per kecamatan

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromRequest } from '@/lib/auth';
import { decideDataAccess, buildAuditEntry, requiredRolesFor } from '@/lib/data-gate';
import { decryptField, canSeeFullIdentitas } from '@/lib/dtsen-crypto';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get('scope') ?? 'kecamatan';
  const kecamatan = req.nextUrl.searchParams.get('kecamatan')?.toUpperCase() ?? null;
  const desa = req.nextUrl.searchParams.get('desa')?.toUpperCase() ?? null;
  const desil = req.nextUrl.searchParams.get('desil') ?? null;
  const program = req.nextUrl.searchParams.get('program') ?? null;

  // ── Auth gate: aggregate scope butuh RESTRICTED_AGGR, individu butuh RESTRICTED_PERSONAL ──
  const requiredSensitivity = scope === 'individu' ? 'RESTRICTED_PERSONAL' : 'RESTRICTED_AGGR';
  const admin = await getAdminFromRequest(req);
  const decision = decideDataAccess(admin?.role ?? null, requiredSensitivity);
  if (!decision.ok) {
    const roleList = requiredRolesFor(requiredSensitivity)?.filter(r => r !== 'DTSEN_ROOT').join(', ') + ', atau DTSEN_ROOT';
    return NextResponse.json(
      { ok: false, error: `Daftar per-${scope === 'individu' ? 'orang' : 'wilayah'} adalah data terbatas DTSEN — login dengan akun berrole ${roleList}.` },
      { status: decision.status },
    );
  }

  // ── scope=individu: data ByNameByAddress (sensitif) — WAJIB role DTSEN + audit ──
  if (scope === 'individu') {
    const admin = await getAdminFromRequest(req);
    const decision = decideDataAccess(admin?.role ?? null, 'RESTRICTED_PERSONAL');
    if (!decision.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: decision.status === 401
            ? 'Daftar per-orang adalah data terbatas DTSEN — login dengan akun berrole DTSEN_LOOKUP/SUPERADMIN.'
            : 'Role Anda tidak berhak melihat data per-orang.',
        },
        { status: decision.status },
      );
    }
    if (!kecamatan || !desa || desil === null) {
      return NextResponse.json({ ok: false, error: 'scope=individu butuh kecamatan + desa + desil.' }, { status: 400 });
    }
    try {
      const release = await prisma.dtsenRelease.findFirst({
        where: { status: 'PUBLISHED' },
        orderBy: { publishedAt: 'desc' },
        select: { id: true, releaseNumber: true, status: true, publishedAt: true },
      });
      if (!release) {
        return NextResponse.json({ ok: false, error: 'Belum ada rilis DTSEN yang dipublish.' }, { status: 404 });
      }
      // Rate limit: kuota per role per hari untuk scope=individu
      const rlKey = `dtsen:individu:${admin.id}:${scope}:${kecamatan}:${desa}:${desil}`;
      const rl = await checkRateLimit({ key: rlKey, limit: 200, windowMs: 24 * 60 * 60 * 1000 });
      if (!rl.ok) {
        return NextResponse.json(
          { ok: false, error: `Kuota harian akses per-orang tercapai (${rl.limit}). Coba lagi dalam ${rl.retryAfterSeconds} detik.`, retryAfter: rl.retryAfterSeconds },
          { status: 429, headers: rateLimitHeaders(rl) },
        );
      }
      const individu = await prisma.dtsenIndividu.findMany({
        where: {
          releaseId: release.id,
          kecamatan: { equals: kecamatan, mode: 'insensitive' },
          desa: { equals: desa, mode: 'insensitive' },
          desil: Number(desil),
        },
        orderBy: { namaMasked: 'asc' },
        take: 200,
        select: { namaMasked: true, namaAsliEnc: true, kecamatan: true, desa: true, desil: true, bansos: true },
      });
      // Audit wajib (UU 27/2022) — akses per-orang dicatat.
      const entry = buildAuditEntry({
        admin,
        aksi: 'BREAKDOWN_INDIVIDU',
        detail: `scope=individu ${kecamatan}/${desa}/desil ${desil} — ${individu.length} baris`,
        ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '',
        rowCount: individu.length,
      });
      try {
        await prisma.dataAccessAudit.create({ data: { adminId: entry.adminId, action: entry.aksi, detail: entry.detail, rowCount: entry.rowCount, ip: entry.ip } });
      } catch (e) {
        return NextResponse.json({ ok: false, error: 'Gagal mencatat audit akses — akses ditolak (fail-closed).' }, { status: 503 });
      }
      // @hotfix 29-Agu-2026: DTSEN_ROOT = otoritas TERTINGGI — dapat identitas
      // LENGKAP (nama asli + NIK terdekripsi, tanpa sensor). Role lain tetap
      // nama termask (UU 27/2022).
      const full = canSeeFullIdentitas(admin?.role);
      return NextResponse.json({
        ok: true,
        scope: 'individu',
        fullIdentitas: full,
        release: { releaseNumber: release.releaseNumber, publishedAt: release.publishedAt },
        total: individu.length,
        rows: individu.map((r) =>
          full
            ? {
                nama: decryptField(r.namaAsliEnc) ?? r.namaMasked,

                desil: r.desil,
                bansos: r.bansos,
              }
            : { nama: r.namaMasked, desil: r.desil, bansos: r.bansos },
        ),
      });
    } catch (err) {
      console.error('[dtsen/breakdown] individu gagal:', err);
      return NextResponse.json({ ok: false, error: 'Gagal memuat daftar per-orang.' }, { status: 500 });
    }
  }

  if (!['kecamatan', 'desa', 'desil'].includes(scope)) {
    return NextResponse.json({ error: `scope tidak dikenal: ${scope}` }, { status: 400 });
  }

  try {
    const release = await prisma.dtsenRelease.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, releaseNumber: true, status: true, publishedAt: true },
    });
    if (!release) {
      return NextResponse.json({ ok: false, error: 'Belum ada rilis DTSEN yang dipublish.' }, { status: 404 });
    }

    const baseWhere: any = { releaseId: release.id };
    if (kecamatan) baseWhere.kecamatan = { equals: kecamatan, mode: 'insensitive' };
    if (desa) baseWhere.desa = { equals: desa, mode: 'insensitive' };

    // ── Program bansos: hitung dari DtsenIndividu (bansos boolean) ──
    if (program && program !== 'semua') {
      const progMap: Record<string, { pkh: boolean; bpnt: boolean; pbi: boolean }> = {
        pbi: { pkh: false, bpnt: false, pbi: true },
        pkh: { pkh: true, bpnt: false, pbi: false },
        bpnt: { pkh: false, bpnt: true, pbi: false },
      };
      const filter = progMap[program];
      if (!filter) {
        return NextResponse.json({ error: `program tidak dikenal: ${program} (pilihan: pbi/pkh/bpnt)` }, { status: 400 });
      }

      // Prisma tidak punya field program per-individu (hanya bansos boolean).
      // Data BAPPEDA hanya memilah PBI (pbi_jk). pkh/bpnt = 0 di import ini.
      if (program !== 'pbi') {
        return NextResponse.json({
          ok: true,
          scope,
          program,
          release: { releaseNumber: release.releaseNumber, publishedAt: release.publishedAt },
          rows: [],
          total: 0,
          note: `Data BAPPEDA Des 2025 hanya memilah PBI (pbi_jk). Program ${program.toUpperCase()} tidak tersedia per-wilayah pada rilis ini.`,
        });
      }

      const grouped = await prisma.dtsenIndividu.groupBy({
        by: scope === 'desil' ? ['desil'] : scope === 'desa' ? ['desa'] : ['kecamatan'],
        where: { releaseId: release.id, bansos: true, ...(kecamatan ? { kecamatan: { equals: kecamatan, mode: 'insensitive' } } : {}), ...(desa ? { desa: { equals: desa, mode: 'insensitive' } } : {}) },
        _count: { _all: true },
      });
      const rows = grouped
        .filter((g) => {
          const v = scope === 'desil' ? g.desil : scope === 'desa' ? g.desa : g.kecamatan;
          return v !== null;
        })
        .map((g) => {
          const v = scope === 'desil' ? g.desil : scope === 'desa' ? g.desa : g.kecamatan;
          return { nama: scope === 'desil' ? `Desil ${v}` : v, nilai: g._count._all };
        })
        .sort((a, b) => b.nilai - a.nilai);

      return NextResponse.json({
        ok: true,
        scope,
        program,
        release: { releaseNumber: release.releaseNumber, publishedAt: release.publishedAt },
        total: rows.reduce((a, r) => a + r.nilai, 0),
        rows,
      });
    }

    // ── Tanpa program: agregat wilayah dari DtsenAgregatWilayah ──
    const grouped = await prisma.dtsenAgregatWilayah.groupBy({
      by: scope === 'desil' ? ['desil'] : scope === 'desa' ? ['desa'] : ['kecamatan'],
      where: baseWhere,
      _sum: { jiwa: true, kk: true },
    });
    const rows = grouped
      .filter((g) => {
        const v = scope === 'desil' ? g.desil : scope === 'desa' ? g.desa : g.kecamatan;
        return v !== null;
      })
      .map((g) => {
        const v = scope === 'desil' ? g.desil : scope === 'desa' ? g.desa : g.kecamatan;
        return { nama: scope === 'desil' ? `Desil ${v}` : v, jiwa: g._sum.jiwa ?? 0, keluarga: g._sum.kk ?? 0 };
      })
      .sort((a, b) => b.jiwa - a.jiwa);

    return NextResponse.json({
      ok: true,
      scope,
      program: null,
      release: { releaseNumber: release.releaseNumber, publishedAt: release.publishedAt },
      total: rows.reduce((a, r) => a + r.jiwa, 0),
      rows,
    });
  } catch (err) {
    console.error('[dtsen/breakdown] gagal:', err);
    return NextResponse.json(
      { ok: false, error: 'Gagal memecah data DTSEN.', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
