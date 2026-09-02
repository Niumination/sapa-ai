import { NextResponse } from 'next/server';
import { fetchSapaData, SapaRecord } from '@/lib/sapa-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 90;

// Hitung distribusi data secara deterministik dari SAPA SPLP
export async function GET() {
  try {
    const { records } = await fetchSapaData();

    // Kelompokkan berdasarkan OPD
    const opdMap = new Map<string, { nama: string; records: SapaRecord[] }>();
    for (const r of records) {
      const opd = r.opds_nama_opd || 'Lainnya';
      if (!opdMap.has(opd)) {
        opdMap.set(opd, { nama: opd, records: [] });
      }
      opdMap.get(opd)!.records.push(r);
    }

    // Hitung statistik per OPD dan indikator
    const opdBreakdown = Array.from(opdMap.values()).map(({ nama, records }) => {
      const indicators = new Set<string>();
      for (const r of records) {
        indicators.add(r.kode_indikator_nama_indikator || '');
      }
      return {
        nama,
        jumlahIndikator: records.length,
        indikatorUnik: indicators.size,
        totalRecords: records.length,
      };
    });

    // Urutkan berdasarkan jumlah data terbanyak
    opdBreakdown.sort((a, b) => b.jumlahIndikator - a.jumlahIndikator);

    // Total indikator unik
    const uniqueIndicators = new Set(records.map((r) => r.kode_indikator_nama_indikator || ''));

    // Hitung persentase kontribusi per OPD
    const totalRecords = records.length;
    const reportData = opdBreakdown.map((opd) => ({
      ...opd,
      kontribusiPersen: totalRecords > 0 ? Math.round((opd.jumlahIndikator / totalRecords) * 100) : 0,
    }));

    // Ringkasan eksekutif deterministik
    const summary = {
      totalRecords,
      totalOpd: opdMap.size,
      totalIndikatorUnik: uniqueIndicators.size,
      timestamp: new Date().toISOString(),
      sumber: 'SAPA SPLP - Diskominfo Aceh Tengah',
      catatan: 'Data diambil secara real-time dari API SPLP tanpa cache lokal. Setiap eksekusi report menghitung ulang seluruh agregasi.',
    };

    return NextResponse.json({
      status: 'ok',
      source: 'SAPA SPLP',
      summary,
      opdBreakdown: reportData,
    });
  } catch (e) {
    return NextResponse.json(
      { status: 'error', error: e instanceof Error ? e.message : 'Gagal menghasilkan laporan' },
      { status: 500 }
    );
  }
}
