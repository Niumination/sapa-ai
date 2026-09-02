import { NextResponse } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';
import { computeKpis } from '@/services/kpi';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const { records, origin } = await fetchSapaData();
    // Kurasi terverifikasi SPLP (8 KPI): stunting, IPM, ASN, kemiskinan, kopi, PDRB, jalan, putus-sekolah
    // — pakai computeKpis (retrieval v2 + prefer/avoid + delta multi-tahun), sama dengan /api/report
    const kpis = computeKpis(records);
    return NextResponse.json({
      status: 'ok',
      source: origin === 'splp' ? 'SAPA SPLP' : origin,
      kpis,
    });
  } catch (e) {
    return NextResponse.json(
      { status: 'error', error: e instanceof Error ? e.message : 'Gagal memuat KPI' },
      { status: 500 }
    );
  }
}
