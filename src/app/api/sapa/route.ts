import { NextResponse } from 'next/server';
import { fetchSapaData, SapaRecord } from '@/lib/sapa-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Daftar 14 kecamatan resmi Kabupaten Aceh Tengah dengan koordinat
const KECAMATAN_ACEH_TENGAH = [
  { nama: 'Lut Tawar', lat: 4.6186, lng: 96.8667, wikidataId: 'Q3683072' },
  { nama: 'Bebesen', lat: 4.6347, lng: 96.8375, wikidataId: 'Q3683057' },
  { nama: 'Pegasing', lat: 4.5833, lng: 96.8167, wikidataId: 'Q3683081' },
  { nama: 'Bies', lat: 4.595, lng: 96.7925, wikidataId: 'Q3683060' },
  { nama: 'Silih Nara', lat: 4.5667, lng: 96.7333, wikidataId: 'Q3683087' },
  { nama: 'Ketol', lat: 4.7167, lng: 96.7833, wikidataId: 'Q3683069' },
  { nama: 'Kute Panang', lat: 4.6833, lng: 96.85, wikidataId: 'Q3683070' },
  { nama: 'Celala', lat: 4.4667, lng: 96.7, wikidataId: 'Q3683063' },
  { nama: 'Rusip Antara', lat: 4.4167, lng: 96.6167, wikidataId: 'Q3683084' },
  { nama: 'Jagong Jeget', lat: 4.45, lng: 96.8167, wikidataId: 'Q3683066' },
  { nama: 'Atu Lintang', lat: 4.5167, lng: 96.85, wikidataId: 'Q3683054' },
  { nama: 'Linge', lat: 4.3833, lng: 96.95, wikidataId: 'Q3683071' },
  { nama: 'Bintang', lat: 4.5833, lng: 96.9833, wikidataId: 'Q3683061' },
  { nama: 'Kebayakan', lat: 4.65, lng: 96.8667, wikidataId: 'Q3683067' },
];

export async function GET() {
  try {
    const { records } = await fetchSapaData();

    // 1. Agregasi OPD & Indikator
    const opdMap = new Map<string, { nama: string; count: number; uniqueInd: Set<string> }>();
    const indFreq = new Map<string, { nama: string; count: number; opds: Set<string> }>();
    const satuanMap = new Map<string, number>();
    const jadwalMap = new Map<string, number>();
    const uniqueIndicators = new Set<string>();

    for (const r of records) {
      const opd = r.opds_nama_opd || 'Lainnya';
      const ind = r.kode_indikator_nama_indikator || 'Indikator';
      const sat = r.satuan || 'Lainnya';
      const jdw = r.jadwal_pemutakhiran || 'Tahunan';

      uniqueIndicators.add(ind);

      if (!opdMap.has(opd)) {
        opdMap.set(opd, { nama: opd, count: 0, uniqueInd: new Set() });
      }
      const opdItem = opdMap.get(opd)!;
      opdItem.count++;
      opdItem.uniqueInd.add(ind);

      if (!indFreq.has(ind)) {
        indFreq.set(ind, { nama: ind, count: 0, opds: new Set() });
      }
      const indItem = indFreq.get(ind)!;
      indItem.count++;
      indItem.opds.add(opd);

      satuanMap.set(sat, (satuanMap.get(sat) || 0) + 1);
      jadwalMap.set(jdw, (jadwalMap.get(jdw) || 0) + 1);
    }

    const opdBreakdown = Array.from(opdMap.values()).map((o) => ({
      nama: o.nama,
      jumlahIndikator: o.count,
      uniqueIndicators: o.uniqueInd.size,
      totalRecords: o.count,
      hasData: o.count > 0,
    }));

    const completeness = opdBreakdown.map((o) => ({
      nama: o.nama,
      completeness: Math.min(100, Math.round((o.jumlahIndikator / (records.length || 1)) * 500)),
      totalRecords: o.totalRecords,
    }));

    const indicatorFrequency = Array.from(indFreq.values()).map((i) => ({
      nama: i.nama,
      jumlah: i.count,
      opds: Array.from(i.opds),
    }));

    const satuanDistribusi = Array.from(satuanMap.entries()).map(([name, count]) => ({ name, count }));
    const jadwalDistribusi = Array.from(jadwalMap.entries()).map(([name, count]) => ({ name, count }));

    // Struktur GIS Response
    const topOpd = opdBreakdown.sort((a, b) => b.jumlahIndikator - a.jumlahIndikator)[0];

    return NextResponse.json({
      status: 'ok',
      source: 'SAPA SPLP',
      lastFetched: new Date().toISOString(),
      overview: {
        totalRecords: records.length,
        totalOpd: opdMap.size,
        totalIndicators: uniqueIndicators.size,
      },
      opdBreakdown,
      completeness,
      indicatorFrequency,
      satuanDistribusi,
      jadwalDistribusi,
      kategoriIndikator: satuanDistribusi.slice(0, 5),
      // Format khusus GIS
      kecamatan: KECAMATAN_ACEH_TENGAH,
      bounds: {
        center: [4.58, 96.84] as [number, number],
        zoom: 10,
      },
      kabupaten: {
        totalRecords: records.length,
        totalOpd: opdMap.size,
        totalIndicators: uniqueIndicators.size,
        opdTeratas: topOpd ? { nama: topOpd.nama, jumlah: topOpd.jumlahIndikator } : null,
      },
      dataScope: {
        level: 'kabupaten',
        kecamatanBreakdownTersedia: false,
        catatan: 'Data SAPA tersedia pada agregasi tingkat Kabupaten Aceh Tengah. Peta menampilkan sebaran wilayah 14 kecamatan.',
      },
      sumber: {
        nama: [{ label: 'SAPA Aceh Tengah', url: 'https://sapa.acehtengahkab.go.id' }],
        koordinat: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org' }],
        peta: [{ label: 'Leaflet.js', url: 'https://leafletjs.com' }],
      },
    });
  } catch (e) {
    return NextResponse.json(
      { status: 'error', error: e instanceof Error ? e.message : 'Gagal' },
      { status: 500 }
    );
  }
}
