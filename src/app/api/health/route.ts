import { NextResponse } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';

export async function GET() {
  try {
    await fetchSapaData();
    return NextResponse.json({ status: 'ok', source: 'SAPA SPLP', timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ status: 'error', error: e instanceof Error ? e.message : 'unknown' }, { status: 500 });
  }
}
