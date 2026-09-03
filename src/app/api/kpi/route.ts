import { NextResponse } from 'next/server';
import { getKpiData } from '@/services/kpi-data';

export const revalidate = 600;
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const data = await getKpiData();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { status: 'error', error: e instanceof Error ? e.message : 'Gagal memuat KPI' },
      { status: 500 }
    );
  }
}
