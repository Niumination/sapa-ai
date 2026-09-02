// ─── Bapokting API Route — untuk AI Smart Query ───
// Source: api-splp.layanan.go.id/bahan-pokok-penting-kabupaten-aceh-tengah/1.0/api/bapokting/harga
// Returns: BapoktingPrice[] dengan agregat siklus data (mingguan/bulanan/tahunan) + statistik lengkap

import { NextResponse } from 'next/server';
import { fetchBapoktingFromSplp, BapoktingPrice } from '@/lib/bapokting-client';
import { hitungStatsBapokting, generateAiNarrative, formatChartData } from '@/lib/bapokting-stats';

interface QueryParams {
  tanggal?: string;
  kategori?: string;
  agregat?: 'mingguan' | 'bulanan' | 'tahunan';
  hari?: number; // historis days (default: 7, max: 30)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params: QueryParams = {
    tanggal: searchParams.get('tanggal') || undefined,
    kategori: searchParams.get('kategori') || undefined,
    agregat: searchParams.get('agregat') as QueryParams['agregat'] || undefined,
    hari: parseInt(searchParams.get('hari') || '7', 10),
  };

  // Clamp hari (min 7, max 30)
  if (params.hari < 7) params.hari = 7;
  if (params.hari > 30) params.hari = 30;

  try {
    // Fetch data dari SPLP API
    const bapoktingData = await fetchBapoktingFromSplp({
      tanggal: params.tanggal,
      kategori: params.kategori,
    });

    if (bapoktingData.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Tidak ada data bapokting tersedia',
        data: [],
      });
    }

    // Hitung statistik lengkap
    const stats = hitungStatsBapokting(bapoktingData, params.hari);

    // Agregasi data jika diminta
    let result = bapoktingData;
    let agregatResult = null;

    if (params.agregat) {
      agregatResult = hitungAgregatSiklus(bapoktingData, params.agregat);
    }

    return NextResponse.json({
      success: true,
      message: 'Data bapokting berhasil diambil',
      sumber: 'DISPERINDAG SPLP API',
      tanggalAmbil: new Date().toISOString(),
      data: result,
      stats, // STATISTIK BARU
      agregat: agregatResult,
      narasi: generateAiNarrative(stats), // NARASI AI BARU
      visualisasi: {
        type: 'chart',
        data: formatChartData(stats, 10),
      },
    });
  } catch (error) {
    console.error('[Bapokting API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Gagal mengambil data bapokting',
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}

// ─── Agregat Functions ───────────────────────────────────────────────────────

interface AgregatResult {
  mingguan?: {
    title: string;
    chartData: { label: string; hargaRataRata: number }[];
    trend: 'naik' | 'turun' | 'stabil';
    komoditi: {
      naik: { nama: string; kenaikan: number }[];
      turun: { nama: string; penurunan: number }[];
    };
  };
  bulanan?: {
    title: string;
    chartData: { label: string; hargaRataRata: number }[];
    trend: 'naik' | 'turun' | 'stabil';
    komoditi: {
      naik: { nama: string; kenaikan: number }[];
      turun: { nama: string; penurunan: number }[];
    };
  };
  tahunan?: {
    title: string;
    chartData: { label: string; hargaRataRata: number }[];
    trend: 'naik' | 'turun' | 'stabil';
    komoditi: {
      naik: { nama: string; kenaikan: number }[];
      turun: { nama: string; penurunan: number }[];
    };
  };
}

function hitungAgregatSiklus(data: any[], siklus: 'mingguan' | 'bulanan' | 'tahunan'): AgregatResult {
  // Group by komoditi dan hitung rata-rata harga
  const grouped: Record<string, { total: number; count: number; items: any[] }> = {};

  for (const item of data) {
    if (!grouped[item.namaBarang]) {
      grouped[item.namaBarang] = { total: 0, count: 0, items: [] };
    }
    grouped[item.namaBarang].total += item.harga;
    grouped[item.namaBarang].count += 1;
    grouped[item.namaBarang].items.push(item);
  }

  // Hitung rata-rata per komoditi
  const chartData = Object.entries(grouped).map(([nama, stats]) => ({
    label: nama,
    hargaRataRata: Math.round(stats.total / stats.count),
  }));

  // Sort berdasarkan harga tertinggi (top 10 untuk grafik)
  const top10 = chartData.sort((a, b) => b.hargaRataRata - a.hargaRataRata).slice(0, 10);

  return {
    [siklus]: {
      title: `Agregat ${siklus.charAt(0).toUpperCase() + siklus.slice(1)} - Bapokting Aceh Tengah`,
      chartData: top10,
      trend: 'stabil', // Default — bisa diupdate jika ada data historis
      komoditi: {
        naik: [],
        turun: [],
      },
    },
  } as AgregatResult;
}
