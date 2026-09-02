import { NextResponse } from 'next/server';
import { fetchSapaData, SapaRecord } from '@/lib/sapa-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const { records } = await fetchSapaData();

    // 1. Overview
    const uniqueOpds = new Set<string>();
    const uniqueIndicators = new Set<string>();
    const yearCounts: Record<string, number> = {};
    const opdCounts: Record<string, { id: number; nama: string; count: number }> = {};
    const indicatorCounts: Record<string, { count: number; samples: string[] }> = {};

    for (const r of records) {
      const opdName = r.opds_nama_opd || 'Lainnya';
      uniqueOpds.add(opdName);

      const indName = r.kode_indikator_nama_indikator || 'Indikator';
      uniqueIndicators.add(indName);

      const yr = r.tahun ? String(r.tahun) : '2025';
      yearCounts[yr] = (yearCounts[yr] || 0) + 1;

      if (!opdCounts[opdName]) {
        opdCounts[opdName] = { id: r.id_opds || 0, nama: opdName, count: 0 };
      }
      opdCounts[opdName].count += 1;

      if (!indicatorCounts[indName]) {
        indicatorCounts[indName] = { count: 0, samples: [] };
      }
      indicatorCounts[indName].count += 1;
      if (r.variabel && indicatorCounts[indName].samples.length < 3) {
        indicatorCounts[indName].samples.push(`${r.variabel} ${r.satuan || ''}`.trim());
      }
    }

    const opds = Object.values(opdCounts)
      .map((o) => ({ id: o.id, nama: o.nama, jumlahIndikator: o.count }))
      .sort((a, b) => b.jumlahIndikator - a.jumlahIndikator);

    const topIndicators = Object.entries(indicatorCounts)
      .map(([nama, data]) => ({ nama, jumlah: data.count, sampleValues: data.samples }))
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 10);

    const dataByYear = Object.entries(yearCounts)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year.localeCompare(b.year));

    // Kategori/OPD distribusi untuk pie chart (Top 5 + Lainnya)
    const top5Opds = opds.slice(0, 5);
    const otherCount = opds.slice(5).reduce((acc, curr) => acc + curr.jumlahIndikator, 0);
    const kategoriDistribusi = top5Opds.map((o) => ({ name: o.nama, count: o.jumlahIndikator }));
    if (otherCount > 0) {
      kategoriDistribusi.push({ name: 'OPD Lainnya', count: otherCount });
    }

    const overview = {
      totalRecords: records.length,
      totalOpd: uniqueOpds.size,
      totalIndicators: uniqueIndicators.size,
      latestUpdate: new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
      lastFetched: new Date().toISOString(),
    };

    return NextResponse.json({
      overview,
      opds,
      topIndicators,
      dataByYear,
      kategoriDistribusi,
      sampleRecords: records.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gagal memuat statistik' },
      { status: 500 }
    );
  }
}
