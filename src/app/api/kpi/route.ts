import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { fetchSapaData } from '@/lib/sapa-client';
import { computeKpis } from '@/services/kpi';

export const revalidate = 600;
export const runtime = 'nodejs';
export const maxDuration = 60;

async function fetchKpiPayload() {
  const { records, origin } = await fetchSapaData();
  const kpis = computeKpis(records);
  return {
    status: 'ok' as const,
    source: origin === 'splp' ? 'SAPA SPLP' : origin,
    kpis,
  };
}

const getCachedKpi = unstable_cache(fetchKpiPayload, ['kpi'], {
  revalidate: 600,
  tags: ['kpi'],
});

export async function GET() {
  try {
    const data = await getCachedKpi();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { status: 'error', error: e instanceof Error ? e.message : 'Gagal memuat KPI' },
      { status: 500 }
    );
  }
}
