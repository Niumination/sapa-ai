import { NextResponse } from 'next/server';
import { getAnalyticsData } from '@/services/analytics-data';

export const revalidate = 600;
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await getAnalyticsData();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { status: 'error', error: e instanceof Error ? e.message : 'Gagal' },
      { status: 500 }
    );
  }
}
