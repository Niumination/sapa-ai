// Shared KPI payload — dipakai server (RSC) dan API route.
// Sama pola dengan analytics-data.ts: unstable_cache 600s + LRU di sapa-client
import { unstable_cache } from 'next/cache';
import { fetchSapaData } from '@/lib/sapa-client';
import { computeKpis, type KpiResult } from '@/services/kpi';

export interface KpiPayload {
  status: 'ok';
  source: string;
  kpis: KpiResult[];
}

async function fetchKpiPayload(): Promise<KpiPayload> {
  const { records, origin } = await fetchSapaData();
  const kpis = computeKpis(records);
  return {
    status: 'ok' as const,
    source: origin === 'splp' ? 'SAPA SPLP' : origin,
    kpis,
  };
}

export const getKpiData = unstable_cache(fetchKpiPayload, ['kpi'], {
  revalidate: 600,
  tags: ['kpi'],
});
