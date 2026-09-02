import { NextResponse } from 'next/server';
import { fetchSapaData, getUniqueOpd, getUniqueIndicators } from '@/lib/sapa-client';

// In-memory cache for stats (10 minutes)
let statsCache: any = null;
let statsCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000;

export async function GET() {
  try {
    // Return cached if fresh
    if (statsCache && Date.now() - statsCacheTime < CACHE_TTL) {
      return NextResponse.json(statsCache);
    }

    // Fetch live SAPA data
    const { records } = await fetchSapaData();
    const opds = getUniqueOpd(records);
    const indicators = getUniqueIndicators(records);

    // Group indicators by category
    const kategoriMap = new Map<string, { nama: string; jumlah: number; sampleValues: string[] }>();
    for (const r of records) {
      const nama = r.kode_indikator_nama_indikator?.trim() || 'Lainnya';
      const existing = kategoriMap.get(nama);
      if (existing) {
        existing.jumlah++;
        if (existing.sampleValues.length < 3 && r.variabel) {
          existing.sampleValues.push(r.variabel);
        }
      } else {
        kategoriMap.set(nama, {
          nama,
          jumlah: 1,
          sampleValues: r.variabel ? [r.variabel] : [],
        });
      }
    }
    const topIndicators = [...kategoriMap.values()]
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 20);

    // Data by year
    const yearMap = new Map<string, number>();
    for (const r of records) {
      const year = r.tahun || 'Unknown';
      yearMap.set(year, (yearMap.get(year) || 0) + 1);
    }
    const dataByYear = [...yearMap.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year.localeCompare(b.year));

    // Data freshness
    const latestUpdate = records.length > 0
      ? records.reduce((latest, r) => {
          const date = r.jadwal_pemutakhiran;
          return date && date > latest ? date : latest;
        }, records[0].jadwal_pemutakhiran || '')
      : '';

    // OPD kategori distribution
    const kategoriDistribusi = new Map<string, number>();
    for (const opd of opds) {
      const name = opd.nama;
      let kategori = 'Lainnya';
      if (name.includes('Dinas')) kategori = 'Dinas';
      else if (name.includes('Badan')) kategori = 'Badan';
      else if (name.includes('Sekretariat')) kategori = 'Sekretariat';
      else if (name.includes('Inspektorat')) kategori = 'Inspektorat';
      else if (name.includes('Kantor')) kategori = 'Kantor';
      kategoriDistribusi.set(kategori, (kategoriDistribusi.get(kategori) || 0) + 1);
    }

    const stats = {
      overview: {
        totalRecords: records.length,
        totalOpd: opds.length,
        totalIndicators: indicators.length,
        latestUpdate,
        lastFetched: new Date().toISOString(),
      },
      opds: opds.map(o => ({
        id: o.id,
        nama: o.nama,
        jumlahIndikator: o.jumlah,
      })),
      topIndicators,
      dataByYear,
      kategoriDistribusi: [...kategoriDistribusi.entries()].map(([name, count]) => ({ name, count })),
      sampleRecords: records.slice(0, 50).map(r => ({
        opd: r.opds_nama_opd,
        indikator: r.kode_indikator_nama_indikator,
        nilai: r.variabel,
        satuan: r.satuan,
        tahun: r.tahun,
        periode: r.jadwal_pemutakhiran,
      })),
    };

    // Cache
    statsCache = stats;
    statsCacheTime = Date.now();

    return NextResponse.json(stats);
  } catch (err) {
    console.error('[Stats API] Error:', err);
    return NextResponse.json(
      { error: 'Gagal mengambil data SAPA', detail: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 },
    );
  }
}
