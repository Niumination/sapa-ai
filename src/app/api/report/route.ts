import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchSapaData } from '@/lib/sapa-client';
import { computeKpis } from '@/services/kpi';
import { buildReport } from '@/services/report-generator';

// SAPA-only: tanpa warehouse/DB/EWS — seksi EWS & perubahan menjawab jujur "belum aktif"
// 4A: ganti manual LRU (cache var) → unstable_cache terdistribusi 600s

export const revalidate = 600;
export const runtime = 'nodejs';
export const maxDuration = 60;

async function fetchReportPayload() {
  const { records, origin } = await fetchSapaData();
  const kpis = computeKpis(records);
  return { report: buildReport({ records, origin, kpis, alerts: null, warehouse: null }) };
}

const getCachedReport = unstable_cache(fetchReportPayload, ['report'], {
  revalidate: 600,
  tags: ['report'],
});

export async function GET() {
  try {
    const body = await getCachedReport();
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { error: 'Gagal menyusun laporan eksekutif', detail: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 }
    );
  }
}
