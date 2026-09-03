import { NextResponse } from 'next/server';
import { fetchSapaData, dataSourceLabel, type SapaDataOrigin } from '@/lib/sapa-client';
import { buildOpdDetail, resolveExactOpdName } from '@/services/opd-drilldown';

// In-memory cache — satu entri per OPD, TTL 10 menit (pola sama dengan
// LRU SPLP di sapa-client). Logika bisnis ada di services/opd-drilldown.ts
// (murni, teruji unit); handler ini hanya I/O + cache.
interface CacheEntry {
  data: ReturnType<typeof buildOpdDetail> & {
    origin: SapaDataOrigin;
    sourceLabel: string;
    lastFetched: string;
  };
  expiry: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 10 * 60 * 1000;

function getErrMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Kesalahan tidak diketahui';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const opdName = decodeURIComponent(slug).trim();
    if (!opdName || opdName.length > 200) {
      return NextResponse.json({ error: 'Parameter OPD tidak valid' }, { status: 400 });
    }

    const cached = cache.get(opdName);
    if (cached && Date.now() < cached.expiry) {
      return NextResponse.json(cached.data);
    }

    const { records, origin } = await fetchSapaData();
    // Pencocokan persis nama OPD (bukan filter token longgar filterByOpd) agar
    // drill-down tepat satu OPD; fallback case-insensitive.
    const exactName = resolveExactOpdName(records, opdName);
    if (!exactName) {
      return NextResponse.json({ error: `OPD "${opdName}" tidak ditemukan di data SAPA` }, { status: 404 });
    }

    const detail = buildOpdDetail(records, exactName);
    const result = {
      ...detail,
      origin,
      sourceLabel: dataSourceLabel(origin),
      lastFetched: new Date().toISOString(),
    };

    cache.set(opdName, { data: result, expiry: Date.now() + CACHE_TTL });
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrMessage(err) }, { status: 500 });
  }
}
