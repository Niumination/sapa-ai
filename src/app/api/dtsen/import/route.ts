// ─── POST /api/dtsen/import — impor manual multi-format → staging (PR-4b + PR-4c) ───
// Alur ketat (desain §7.2): validasi template → baris kotor DITOLAK (dengan
// alasan per baris) → baris valid masuk STAGING dalam bentuk terminimasi
// (HMAC NIK + nama masked). CSV mentah & NIK mentah TIDAK PERNAH disimpan,
// TIDAK PERNAH dikembalikan di respons.
// Otorisasi: role RESTRICTED_PERSONAL (DTSEN_LOOKUP/SUPERADMIN) — via data-gate.
//
// @hotfix 29-Agu-2026: disesuaikan dengan schema DB aktual —
//   DtsenRelease { releaseNumber, status, metadata(Json) }
//   DtsenIndividu { nikHash, namaMasked, kecamatan, desa, desil, bansos(Boolean) }
//   DtsenAgregatWilayah { jiwa, kk, pkh, bpnt, pbi_kredit, pbi_nonkredit }
//
// Format yang didukung (query param ?format=):
//   DTSEN_CSV   — format DTSEN standar (CSV: nik, nama, no_kk, kecamatan, desa, desil, pkh, bpnt, pbi_jk)
//   STUNTING_XLSX — format stunting (Excel: NIK, Nama, JK, Kec, Desa/Kel, dll)
//   KOMINFO_XLSX — format Kominfo (Excel: NIK, NAMA, KETERANGAN DESIL, KK, DESA, KECAMATAN, dll)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminFromRequest } from '@/lib/auth';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { decideDataAccess, buildAuditEntry } from '@/lib/data-gate';
import {
  parseAndValidateDtsenCsv,
  buildAgregatWilayah,
  importChecksum,
  type ValidDtsenRow,
  type RejectedRow,
} from '@/services/dtsen-import';
import { parseStuntingXlsx, parseKominfoXlsx } from '@/services/dtsen-multisource';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10 MB teks CSV
const CHUNK = 5000;

function audit(admin: any, aksi: 'IMPORT' | 'IMPORT_DITOLAK', detail: string, ip: string, rowCount = 0) {
  // @hotfix 29-Agu-2026: schema DB aktual — kolom `action` (bukan `aksi`), tanpa `adminNama`.
  const entry = buildAuditEntry({ admin, aksi, detail, ip, rowCount });
  return prisma.dataAccessAudit
    .create({ data: { adminId: entry.adminId, action: entry.aksi, detail: entry.detail, rowCount: entry.rowCount, ip: entry.ip } })
    .catch((e) => console.error('[dtsen/import] audit gagal:', e));
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit({ key: `dtsen:imp:${ip}`, limit: 10, windowMs: 3_600_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: 'Kuota impor per jam tercapai.' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const admin = await getAdminFromRequest(req);
  const decision = decideDataAccess(admin?.role ?? null, 'RESTRICTED_PERSONAL');
  if (!decision.ok) {
    if (admin) await audit(admin, 'IMPORT_DITOLAK', 'percobaan impor tanpa hak', ip);
    return NextResponse.json(
      {
        error: decision.status === 401
          ? 'Impor DTSEN terbatas — login dengan akun berrole DTSEN_LOOKUP, SUPERADMIN, atau DTSEN_ROOT.'
          : `Role Anda tidak berhak mengimpor (butuh: ${decision.requiredRoles?.join(' / ')}).`,
      },
      { status: decision.status },
    );
  }

  const secret = process.env.DTSEN_NIK_KEY ?? '';
  if (secret.length < 16) {
    return NextResponse.json(
      { error: 'DTSEN_NIK_KEY belum dikonfigurasi (min 16 karakter). Impor dinonaktifkan (fail-closed).' },
      { status: 409 },
    );
  }

  const raw = await req.text();
  if (raw.length === 0) {
    return NextResponse.json({ error: 'Body kosong — kirim teks CSV.' }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Berkas terlalu besar (> 10 MB teks).' }, { status: 413 });
  }
  const format = (req.nextUrl.searchParams.get('format') ?? 'DTSEN_CSV').toUpperCase();
  const filename = (req.nextUrl.searchParams.get('filename') ?? 'unggahan.csv').slice(0, 120);
  const versi = (req.nextUrl.searchParams.get('versi') ?? 'manual').slice(0, 60);

  let result: { valid: ValidDtsenRow[]; rejected: RejectedRow[]; totalDataLines: number };
  let parseWarnings: string[] = [];

  switch (format) {
    case 'DTSEN_CSV':
      result = parseAndValidateDtsenCsv(raw, secret);
      break;
    case 'STUNTING_XLSX':
      {
        // Untuk Excel, body harus berupa JSON array of row objects (parse di frontend)
        const parsed = JSON.parse(raw);
        const sr = parseStuntingXlsx(parsed, secret);
        result = { valid: sr.valid, rejected: sr.rejected, totalDataLines: sr.totalDataLines };
        parseWarnings = sr.warnings;
      }
      break;
    case 'KOMINFO_XLSX':
      {
        const parsed = JSON.parse(raw);
        const kr = parseKominfoXlsx(parsed, secret);
        result = { valid: kr.valid, rejected: kr.rejected, totalDataLines: kr.totalDataLines };
        parseWarnings = kr.warnings;
      }
      break;
    default:
      return NextResponse.json(
        { error: `Format "${format}" tidak didukung. Format: DTSEN_CSV, STUNTING_XLSX, KOMINFO_XLSX` },
        { status: 400 },
      );
  }
  if (result.valid.length === 0) {
    await audit(admin!, 'IMPORT_DITOLAK', `file=${filename} DITOLAK total: ${result.rejected[0]?.reason ?? 'tanpa baris valid'}`, ip);
    return NextResponse.json(
      {
        ok: false,
        error: 'Tidak ada baris valid yang bisa distaging.',
        totalDataLines: result.totalDataLines,
        rejected: result.rejected.slice(0, 100),
      },
      { status: 422 },
    );
  }

  const sourceSlug =
    format === 'STUNTING_XLSX' ? 'dtsen-stunting'
    : format === 'KOMINFO_XLSX' ? 'dtsen-kominfo'
    : 'dtsen';

  const source = await prisma.dataSource.findUnique({ where: { slug: sourceSlug } }).catch(() => null);
  if (!source) {
    return NextResponse.json(
      { error: 'Fondasi tabel belum ada. Jalankan sekali: POST /api/setup dengan x-setup-token.' },
      { status: 409 },
    );
  }

  try {
    // ── @hotfix 29-Agu-2026: schema baru — releaseNumber + metadata JSON ──
    const release = await prisma.dtsenRelease.create({
      data: {
        id: crypto.randomUUID(),
        releaseNumber: `BAPPEDA-${new Date().toISOString().slice(0, 10)}`,
        status: 'STAGING',
        metadata: {
          sourceId: source.id,
          sourceSlug,
          versi,
          jalur: format === 'DTSEN_CSV' ? 'MANUAL' : `MANUAL_${format}`,
          totalBaris: result.valid.length,
          ditolak: result.rejected.length,
          checksum: importChecksum(result.valid),
          uploadedBy: admin!.nama,
          filename,
        } as any,
      },
    });

    for (let i = 0; i < result.valid.length; i += CHUNK) {
      // ── schema baru: statusBansos {pkh,bpnt,pbi} → bansos Boolean (salah satu aktif) ──
      const chunk = result.valid.slice(i, i + CHUNK).map((r) => ({
        releaseId: release.id,
        nikHash: r.nikHash,
        namaMasked: r.namaMasked,
        kecamatan: r.kecamatan,
        desa: r.desa,
        desil: r.desil,
        bansos: r.statusBansos.pkh || r.statusBansos.bpnt || r.statusBansos.pbi,
      }));
      await prisma.dtsenIndividu.createMany({ data: chunk });
    }

    // Agregat preview dari data staging (untuk respons tinjauan)
    const preview = buildAgregatWilayah(result.valid);
    await audit(
      admin!,
      'IMPORT',
      `file=${filename} valid=${result.valid.length} ditolak=${result.rejected.length} release=${release.id}`,
      ip,
      result.valid.length,
    );

    return NextResponse.json({
      ok: true,
      releaseId: release.id,
      status: 'STAGING',
      totalDataLines: result.totalDataLines,
      valid: result.valid.length,
      ditolak: result.rejected.length,
      rejectedSample: result.rejected.slice(0, 50),
      checksum: (release.metadata as any)?.checksum ?? null,
      agregatPreview: {
        kelompokWilayahDesil: preview.rows.length,
        jiwaTerSensor: preview.jiwaTerSensor,
        kelompokTerSensor: preview.kelompokTerSensor,
      },
      message:
        'Rilis distaging (NIK sudah HMAC, nama ter-mask — data mentah tidak disimpan). ' +
        'Tinjau di halaman admin, lalu publish untuk menjadikannya rilis aktif.',
      ...(parseWarnings.length > 0 && { warnings: parseWarnings }),
    });
  } catch (err) {
    console.error('[dtsen/import] gagal:', err);
    return NextResponse.json(
      { error: 'Gagal menulis staging', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
