// ─── POST /api/dtsen/query — pintu data restricted (PR-4c: planner penuh) ───
// Desain §8: query planner determinstik (tanpa LLM) — scope AGGR vs PERSONAL;
// provenance di 3 tempat: header narasi ("Menurut DTSEN …"), chip visual
// (objek provenance), metadata (dataOrigin: 'dtsen'). Sensor k-anonymity
// dinamis (§6.2). Matriks (§6.1): tanpa sesi → 401; ADMIN → 403;
// DTSEN_ANALYST → AGGR saja; DTSEN_LOOKUP → AGGR + PERSONAL (by-NIK).
// Semua percobaan bersesi diaudit; audit LOOKUP_NIK hanya menyimpan NIK termask.
//
// @hotfix 29-Agu-2026: disesuaikan schema DB aktual —
//   DtsenRelease { releaseNumber, status, publishedAt, metadata(Json) }
//   DtsenIndividu { bansos: Boolean } (bukan statusBansos JSON)
//   DtsenAgregatWilayah { jiwa, kk } (bukan jumlahJiwa/jumlahKeluarga)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAdminFromRequest } from '@/lib/auth';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { decideDataAccess, buildAuditEntry, type AuditAction } from '@/lib/data-gate';
import { hmac, K_MIN, type AgregatRow } from '@/services/dtsen-import';
import {
  planDtsenQuery,
  sensitivityForPlan,
  buildProvenanceLabel,
  buildAgregatAnswer,
  buildLookupNarasi,
  maskNikForAudit,
  SENSOR_MESSAGE,
  ENUMERASI_MESSAGE,
  NO_RELEASE_MESSAGE,
  NOT_DTSEN_MESSAGE,
  type BansosCountResult,
  type ReleaseRef,
} from '@/services/dtsen-planner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Lebih ketat dari /api/query publik: jalur restricted memang jarang & sensitif.
const RATE_PER_MINUTE = 5;
const RATE_PER_HOUR = 30;

const QuerySchema = z.object({
  query: z.string().trim().min(3).max(2000),
});

async function writeAudit(admin: NonNullable<Awaited<ReturnType<typeof getAdminFromRequest>>>, aksi: AuditAction, detail: string, ip: string, rowCount = 0) {
  // @hotfix 29-Agu-2026: schema DB aktual — kolom `action`, tanpa `adminNama`.
  const entry = buildAuditEntry({ admin, aksi, detail, ip, rowCount });
  await prisma.dataAccessAudit.create({ data: { adminId: entry.adminId, action: entry.aksi, detail: entry.detail, rowCount: entry.rowCount, ip: entry.ip } });
}

/** Rilis PUBLISHED terbaru (hanya satu yang aktif secara logika; ambil yang teranyar). */
async function findActiveRelease(): Promise<{ id: string; releaseNumber: string; status: string; publishedAt: Date | null; metadata: any } | null> {
  return prisma.dtsenRelease.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, releaseNumber: true, status: true, publishedAt: true, metadata: true },
  });
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const perMinute = await checkRateLimit({ key: `dtsen:m:${ip}`, limit: RATE_PER_MINUTE, windowMs: 60_000 });
  if (!perMinute.ok) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan. Tunggu sebentar.' }, { status: 429, headers: rateLimitHeaders(perMinute) });
  }
  const perHour = await checkRateLimit({ key: `dtsen:h:${ip}`, limit: RATE_PER_HOUR, windowMs: 3_600_000 });
  if (!perHour.ok) {
    return NextResponse.json({ error: 'Kuota per jam tercapai.' }, { status: 429, headers: rateLimitHeaders(perHour) });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body harus JSON yang valid.' }, { status: 400 });
  }
  const parsed = QuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Query tidak valid', detail: parsed.error.flatten() }, { status: 400 });
  }
  const { query } = parsed.data;

  // ─── Planner deterministik (desain §8) — sebelum gate, tanpa menyentuh DB ───
  const plan = planDtsenQuery(query);
  if (!plan.asksDtsen) {
    return NextResponse.json({ ok: false, error: NOT_DTSEN_MESSAGE }, { status: 400 });
  }
  const sensitivity = sensitivityForPlan(plan);
  // Aksi audit mengikuti scope: PERSONAL → LOOKUP_NIK*, AGGR → QUERY_DTSEN*.
  const aksiOk: AuditAction = plan.scope === 'PERSONAL' ? 'LOOKUP_NIK' : 'QUERY_DTSEN';
  const aksiTolak: AuditAction = plan.scope === 'PERSONAL' ? 'LOOKUP_NIK_DITOLAK' : 'QUERY_DTSEN_DITOLAK';
  // Detail audit JANGAN PERNAH memuat NIK mentah — hanya bentuk termask.
  const auditDetail = plan.nik ? `NIK ${maskNikForAudit(plan.nik)} — ${query}` : query;

  const admin = await getAdminFromRequest(req);
  const decision = decideDataAccess(admin?.role ?? null, sensitivity);
  if (!decision.ok) {
    // Percobaan DENGAN sesi (tapi role kurang) diaudit — sinyal keamanan penting.
    if (admin) {
      try {
        await writeAudit(admin, aksiTolak, auditDetail, ip);
      } catch {}
    }
    return NextResponse.json(
      {
        error:
          decision.status === 401
            ? 'Data DTSEN terbatas — login dengan akun berrole DTSEN_LOOKUP, SUPERADMIN, atau DTSEN_ROOT.'
            : plan.scope === 'PERSONAL'
              ? `Lookup per-orang butuh role ${decision.requiredRoles?.join(' / ')} (Permen Bappenas 7/2025: maks eselon II/III).`
              : `Role Anda tidak berhak mengakses DTSEN agregat (butuh: ${decision.requiredRoles?.join(' / ')}).`,
      },
      { status: decision.status },
    );
  }

  // ─── Terotorisasi → audit wajib SEBELUM menjawab (desain §6.3) ───
  try {
    await writeAudit(admin!, aksiOk, auditDetail, ip, 0);
  } catch (err) {
    // Audit gagal = tabel fondasi belum ada → fail-closed, jangan setengah hati.
    console.error('[dtsen/query] audit write failed:', err);
    return NextResponse.json(
      { error: 'Fondasi tabel DTSEN belum dibuat. Jalankan sekali: POST /api/setup dengan x-setup-token.' },
      { status: 409 },
    );
  }

  // ─── Enumerasi per-orang TANPA NIK → penolakan jujur (desain §6.2) ───
  if (plan.enumerasi) {
    return NextResponse.json({ ok: false, dataOrigin: 'dtsen', error: ENUMERASI_MESSAGE }, { status: 422 });
  }

  const release = await findActiveRelease().catch(() => null);
  if (!release) {
    const source = await prisma.dataSource.findUnique({ where: { slug: 'dtsen' } }).catch(() => null);
    return NextResponse.json({
      ok: true,
      dataOrigin: 'dtsen',
      provenance: { label: source?.provenanceLabel ?? 'DTSEN — Kemensos/BPS (menunggu rilis resmi)' },
      plan: { scope: plan.scope },
      narasi: NO_RELEASE_MESSAGE,
      message: NO_RELEASE_MESSAGE,
    });
  }
  // @hotfix 29-Agu-2026: schema baru — versi/jalur di metadata, bukan kolom.
  const md = release.metadata ?? {};
  const releaseRef: ReleaseRef = { releaseNumber: release.releaseNumber, status: release.status, publishedAt: release.publishedAt };
  const provenance = {
    label: buildProvenanceLabel(releaseRef),
    releaseNumber: release.releaseNumber,
    versi: md.versi ?? 'manual',
    jalur: md.jalur ?? 'MANUAL',
    publishedAt: release.publishedAt,
  };

  // ═══ JALUR PERSONAL — lookup by-NIK (role DTSEN_LOOKUP/SUPERADMIN) ═══
  if (plan.scope === 'PERSONAL' && plan.nik) {
    const secret = process.env.DTSEN_NIK_KEY;
    if (!secret || secret.length < 16) {
      // Desain §6.4: tanpa kunci, jalur mati total (fail-closed).
      return NextResponse.json({ ok: false, error: 'DTSEN_NIK_KEY belum dikonfigurasi (min 16 karakter) — jalur DTSEN nonaktif.' }, { status: 503 });
    }
    const nikHash = hmac(plan.nik, secret);
    let row: { namaMasked: string; kecamatan: string | null; desa: string | null; desil: number | null; bansos: boolean } | null = null;
    try {
      row = await prisma.dtsenIndividu.findFirst({
        where: { releaseId: release.id, nikHash },
        select: { namaMasked: true, kecamatan: true, desa: true, desil: true, bansos: true },
      });
    } catch (err) {
      console.error('[dtsen/query] lookup gagal:', err);
      return NextResponse.json({ error: 'Lookup gagal.' }, { status: 500 });
    }
    // @hotfix 29-Agu-2026: schema baru — bansos Boolean → statusBansos {pkh,bpnt,pbi}.
    const found = row
      ? {
          namaMasked: row.namaMasked,
          kecamatan: row.kecamatan,
          desa: row.desa,
          desil: row.desil,
          statusBansos: row.bansos
            ? { pkh: false, bpnt: false, pbi: true } // PBI JKN — data BAPPEDA tidak membedakan program PKH/BPNT
            : { pkh: false, bpnt: false, pbi: false },
        }
      : null;
    const payload = {
      ok: true,
      dataOrigin: 'dtsen' as const,
      provenance,
      plan: { scope: 'PERSONAL' as const },
      narasi: buildLookupNarasi(found, releaseRef),
      individu: found,
    };
    // Pertahanan berlapis: NIK mentah TIDAK BOLEH muncul di respons apa pun.
    if (JSON.stringify(payload).includes(plan.nik)) {
      console.error('[dtsen/query] LEAK GUARD terpicu — respons dibatalkan');
      return NextResponse.json({ error: 'Respons dibatalkan demi keamanan data.' }, { status: 500 });
    }
    return NextResponse.json(payload);
  }

  // ═══ JALUR AGGR — agregat siap-saji + hitung bansos dinamis (sensor k) ═══
  try {
    const wilayahFilter = {
      // @hotfix 29-Agu-2026: case-insensitive — data DB UPPERCASE ("LINGE"),
      // detectKecamatan mengembalikan bentuk kamus ("Linge") → tanpa mode
      // insensitive filter Prisma tidak match (Postgres case-sensitive).
      ...(plan.kecamatan ? { kecamatan: { equals: plan.kecamatan, mode: 'insensitive' as const } } : {}),
      ...(plan.desa ? { desa: { equals: plan.desa, mode: 'insensitive' as const } } : {}),
      ...(plan.desil && plan.desil.length > 0 ? { desil: { in: plan.desil } } : {}),
    };
    const aggrDb = await prisma.dtsenAgregatWilayah.findMany({
      where: { releaseId: release.id, ...wilayahFilter },
      orderBy: [{ kecamatan: 'asc' }, { desa: 'asc' }, { desil: 'asc' }],
      select: { kecamatan: true, desa: true, desil: true, jiwa: true, kk: true },
    });
    // @hotfix 29-Agu-2026: schema baru — jiwa/kk (bukan jumlahJiwa/jumlahKeluarga).
    const rows: AgregatRow[] = aggrDb.map((r) => ({
      kecamatan: r.kecamatan ?? '',
      desa: r.desa ?? '',
      desil: r.desil ?? 0,
      jumlahJiwa: r.jiwa ?? 0,
      jumlahKeluarga: r.kk ?? 0,
    }));

    // Hitung bansos dinamis dari tabel individu — HANYA COUNT, dengan sensor
    // k-anonymity dinamis (§6.2): 1..k-1 → disensor; 0 ditampilkan apa adanya.
    let bansosCounts: BansosCountResult[] | null = null;
    if (plan.bansos && plan.bansos.length > 0) {
      bansosCounts = [];
      for (const prog of plan.bansos) {
        // @hotfix 29-Agu-2026: schema baru — satu flag `bansos` Boolean (PBI JKN);
        // data BAPPEDA tidak membedakan program PKH/BPNT. Hitung flag umum untuk semua.
        const count = await prisma.dtsenIndividu.count({
          where: { releaseId: release.id, ...wilayahFilter, bansos: true },
        });
        bansosCounts.push({ program: prog, jiwa: count >= K_MIN ? count : count === 0 ? 0 : null });
      }
    }

    const jawaban = buildAgregatAnswer({
      rows,
      release: releaseRef,
      kecamatan: plan.kecamatan,
      desa: plan.desa,
      desil: plan.desil,
      bansosCounts,
    });

    return NextResponse.json({
      ok: true,
      dataOrigin: 'dtsen' as const,
      provenance,
      plan: {
        scope: 'AGGR' as const,
        kecamatan: plan.kecamatan,
        desa: plan.desa,
        desil: plan.desil,
        bansos: plan.bansos,
        sensorDinamis: jawaban.sensor.length > 0 ? SENSOR_MESSAGE : null,
      },
      narasi: jawaban.narasi,
      jawaban: {
        scopeLabel: jawaban.scopeLabel,
        totalJiwa: jawaban.totalJiwa,
        totalKeluarga: jawaban.totalKeluarga,
        byDesil: jawaban.byDesil,
        byWilayah: jawaban.byWilayah,
        bansos: jawaban.bansos,
        sensor: jawaban.sensor,
      },
    });
  } catch (err) {
    console.error('[dtsen/query] agregat gagal:', err);
    return NextResponse.json({ error: 'Query agregat gagal', detail: err instanceof Error ? err.message : 'Unknown' }, { status: 500 });
  }
}
