import { NextResponse } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';
import { computeKpis } from '@/services/kpi';
import { buildReport } from '@/services/report-generator';

// SAPA-only: tanpa warehouse/DB/EWS — seksi EWS & perubahan menjawab jujur "belum aktif"
// Catatan: tabel warehouse tidak ada di sapa-ai (SPLP-only) — riwayat dibaca dari localStorage klien.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

let cache: { body: unknown; expiresAt: number } | null = null;
const TTL = 10 * 60 * 1000;

export async function GET() {
  try {
    if (cache && cache.expiresAt > Date.now()) return NextResponse.json(cache.body);

    const { records, origin } = await fetchSapaData();
    const kpis = computeKpis(records);

    // Tanpa DB: EWS & warehouse selalu null → report-generator akan render narasi "belum aktif" yang jujur
    const body = { report: buildReport({ records, origin, kpis, alerts: null, warehouse: null }) };
    cache = { body, expiresAt: Date.now() + TTL };
    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { error: 'Gagal menyusun laporan eksekutif', detail: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 }
    );
  }
}
