import { NextResponse } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const { records } = await fetchSapaData();
    return NextResponse.json({ 
      status: 'ok', 
      source: 'SAPA SPLP',
      recordCount: records.length,
      lastFetched: new Date().toISOString()
    });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e instanceof Error ? e.message : 'Gagal' }, { status: 500 });
  }
}
