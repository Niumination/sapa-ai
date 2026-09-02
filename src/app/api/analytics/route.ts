import { NextResponse } from 'next/server';
import { fetchSapaData, getUniqueOpd, getUniqueIndicators, filterByOpd } from '@/lib/sapa-client';

let analyticsCache: any = null;
let cacheExpiry = 0;

export async function GET() {
  try {
    if (analyticsCache && Date.now() < cacheExpiry) {
      return NextResponse.json(analyticsCache);
    }

    const { records } = await fetchSapaData();
    const opds = getUniqueOpd(records);
    const indicators = getUniqueIndicators(records);

    // OPD breakdown with indicator categories
    const opdBreakdown = opds.map(opd => {
      const opdRecords = filterByOpd(records, opd.nama);
      const opdIndicators = getUniqueIndicators(opdRecords);
      const sampleValues = opdRecords
        .filter(r => r.variabel && r.variabel.trim() !== '')
        .map(r => ({
          indicator: r.kode_indikator_nama_indikator,
          value: r.variabel,
          unit: r.satuan,
          period: r.jadwal_pemutakhiran,
        }));
      return {
        nama: opd.nama,
        jumlahIndikator: opd.jumlah,
        uniqueIndicators: opdIndicators.length,
        totalRecords: opdRecords.length,
        hasData: sampleValues.length > 0,
        sampleValues: sampleValues.slice(0, 5),
      };
    });

    // Indicator frequency analysis
    const indicatorFrequency = indicators.map(ind => ({
      nama: ind.nama,
      kode: ind.kode,
      jumlah: ind.jumlah,
      opds: [...new Set(records.filter(r => r.id_kode_indikator?.toString() === ind.kode).map(r => r.opds_nama_opd))].slice(0, 5),
    }));

    // Satuan (unit) distribution
    const satuanMap = new Map<string, number>();
    records.forEach(r => {
      if (r.satuan) {
        satuanMap.set(r.satuan, (satuanMap.get(r.satuan) || 0) + 1);
      }
    });
    const satuanDist = [...satuanMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Jadwal pemutakhiran distribution
    const jadwalMap = new Map<string, number>();
    records.forEach(r => {
      if (r.jadwal_pemutakhiran) {
        jadwalMap.set(r.jadwal_pemutakhiran, (jadwalMap.get(r.jadwal_pemutakhiran) || 0) + 1);
      }
    });
    const jadwalDist = [...jadwalMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // Data completeness per OPD
    const completeness = opdBreakdown.map(opd => ({
      nama: opd.nama,
      completeness: opd.hasData ? Math.round((opd.sampleValues.length / Math.max(opd.jumlahIndikator, 1)) * 100) : 0,
      totalRecords: opd.totalRecords,
    })).sort((a, b) => b.completeness - a.completeness);

    // Indicator type categorization
    const kategoriIndicators = new Map<string, number>();
    records.forEach(r => {
      const name = r.kode_indikator_nama_indikator || '';
      if (/jumlah|total|count/i.test(name)) kategoriIndicators.set('Jumlah/Total', (kategoriIndicators.get('Jumlah/Total') || 0) + 1);
      else if (/persentase|%|rate/i.test(name)) kategoriIndicators.set('Persentase/Rate', (kategoriIndicators.get('Persentase/Rate') || 0) + 1);
      else if (/luas|area|hektar/i.test(name)) kategoriIndicators.set('Luas/Area', (kategoriIndicators.get('Luas/Area') || 0) + 1);
      else if (/nilai|value|rata/i.test(name)) kategoriIndicators.set('Nilai/Rata-rata', (kategoriIndicators.get('Nilai/Rata-rata') || 0) + 1);
      else kategoriIndicators.set('Lainnya', (kategoriIndicators.get('Lainnya') || 0) + 1);
    });
    const kategoriIndikatorDist = [...kategoriIndicators.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const result = {
      overview: {
        totalRecords: records.length,
        totalOpd: opds.length,
        totalIndicators: indicators.length,
      },
      opdBreakdown,
      indicatorFrequency: indicatorFrequency.slice(0, 20),
      satuanDistribusi: satuanDist,
      jadwalDistribusi: jadwalDist,
      completeness,
      kategoriIndikator: kategoriIndikatorDist,
      lastFetched: new Date().toISOString(),
    };

    analyticsCache = result;
    cacheExpiry = Date.now() + 10 * 60 * 1000;

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
