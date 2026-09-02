// ─── GET /api/report — Laporan Eksekutif (PR-3) ───
// Publik (seluruh isi bersumber data SAPA yang memang publik), dirakit
// deterministik oleh report-generator (tanpa LLM), cache in-mem 10 menit.
// Bila tabel warehouse/EWS belum ada, seksi terkait menjawab jujur — bukan 500.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchSapaData } from '@/lib/sapa-client';
import { computeKpis } from '@/services/kpi';
import { getWarehouseReportMeta } from '@/services/warehouse-sync';
import { buildReport, type ReportAlert } from '@/services/report-generator';

export const dynamic = 'force-dynamic';

let cache: { body: unknown; expiresAt: number } | null = null;
const REPORT_CACHE_TTL = 10 * 60 * 1000;

async function loadOpenAlerts(): Promise<ReportAlert[] | null> {
  try {
    const rows = await prisma.ewsAlert.findMany({
      where: { resolvedAt: null },
      include: { indicator: { select: { nama: true, satuan: true } } },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return rows.map((r) => ({
      indikator: r.indicator.nama,
      satuan: r.indicator.satuan,
      pesan: r.pesan,
      severity: (r.severity as ReportAlert['severity']) ?? 'INFO',
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return null; // tabel belum ada → generator menjawab jujur "belum aktif"
  }
}

export async function GET() {
  try {
    if (cache && cache.expiresAt > Date.now()) {
      return NextResponse.json(cache.body);
    }
    const { records, origin } = await fetchSapaData();
    const kpis = computeKpis(records);
    const [alerts, warehouse] = await Promise.all([loadOpenAlerts(), getWarehouseReportMeta()]);
    const body = { report: buildReport({ records, origin, kpis, alerts, warehouse }) };
    cache = { body, expiresAt: Date.now() + REPORT_CACHE_TTL };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[report] Error:', err);
    return NextResponse.json(
      { error: 'Gagal menyusun laporan eksekutif', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
