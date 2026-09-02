import { NextResponse } from 'next/server';

export async function GET() {
  const payload = {
    kecamatan: [],
    bounds: { center: [4.5, 97.0] as [number, number], zoom: 9 },
    kabupaten: { totalRecords: 0, totalOpd: 0, totalIndicators: 0, opdTeratas: null },
    dataScope: { level: 'kabupaten', kecamatanBreakdownTersedia: false, catatan: 'SAPA hanya menyediakan data pada level kabupaten.' },
    sumber: { nama: [], koordinat: [], peta: [] },
    lastFetched: new Date().toISOString(),
  };
  return NextResponse.json(payload);
}
