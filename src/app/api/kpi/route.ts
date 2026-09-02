// ─── GET /api/kpi — KPI pimpinan terkurasi (PR Lapis 2) ───
// Publik (data SAPA memang publik), dihitung deterministik, cache 10 menit.

import { NextResponse } from 'next/server';
import { fetchSapaData, dataSourceLabel } from '@/lib/sapa-client';
import { computeKpis } from '@/services/kpi';

export const dynamic = 'force-dynamic';

let cache: { body: unknown; expiresAt: number } | null = null;
const KPI_CACHE_TTL = 10 * 60 * 1000;

export async function GET() {
  try {
    if (cache && cache.expiresAt > Date.now()) {
      return NextResponse.json(cache.body);
    }
    const { records, origin } = await fetchSapaData();
    const kpis = computeKpis(records);
    const body = {
      kpis,
      total: kpis.length,
      source: dataSourceLabel(origin),
      updatedAt: new Date().toISOString(),
    };
    cache = { body, expiresAt: Date.now() + KPI_CACHE_TTL };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[KPI] Error:', err);
    return NextResponse.json(
      { error: 'Gagal menghitung KPI', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
