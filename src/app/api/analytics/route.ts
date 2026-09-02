import { NextResponse } from 'next/server';

export async function GET() {
  const payload = {
    overview: { totalRecords: 0, totalOpd: 0, totalIndicators: 0 },
    opdBreakdown: [],
    indicatorFrequency: [],
    satuanDistribusi: [],
    jadwalDistribusi: [],
    completeness: [],
    kategoriIndikator: [],
    lastFetched: new Date().toISOString(),
  };
  return NextResponse.json(payload);
}
