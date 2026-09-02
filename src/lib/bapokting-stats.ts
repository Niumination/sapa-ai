// ─── Bapokting Statistics Engine ─────────────────────────────────────────────
// Historis analysis, trend detection, dan rekomendasi otomatis

import { BapoktingPrice } from './bapokting-client';
import { describe, growth, classifyTrend } from './statistics/compute';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BapoktingStats {
  komoditas: Record<string, KomoditasStats>;
  kategori: Record<string, KategoriStats>;
  kecamatan: Record<string, KecamatanStats>;
  trend: {
    naik: KomoditasTrend[];
    turun: KomoditasTrend[];
    stabil: KomoditasTrend[];
  };
  rekomendasi: string[];
  volatility: VolatilityMetrics;
  peringatan?: string;
}

export interface KomoditasStats {
  nama: string;
  kategori?: string;
  hargaMin: number;
  hargaMax: number;
  hargaAvg: number;
  hargaStdDev: number;
  hargaCurrent: number;
  hargaHistoris: { tanggal: string; harga: number }[];
  trend: 'naik' | 'turun' | 'stabil';
  persentasePerubahan: number;
  cukupData: boolean;
}

export interface KategoriStats {
  nama: string;
  komoditasCount: number;
  hargaAvg: number;
  hargaMin: number;
  hargaMax: number;
  komoditas: string[];
}

export interface KecamatanStats {
  nama: string;
  komoditasCount: number;
  hargaAvg: number;
  hargaMin: number;
  hargaMax: number;
  komoditas: string[];
}

export interface KomoditasTrend {
  nama: string;
  persentase: number;
  arah: 'naik' | 'turun' | 'stabil';
}

export interface VolatilityMetrics {
  overallIndex: number;
  tertinggi: { nama: string; nilai: number }[];
  terendah: { nama: string; nilai: number }[];
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

// Statistik deskriptif + persen dipindah ke semantic layer (WP3.0c):
//   src/lib/statistics/compute.ts — describe(), growth(), classifyTrend().
// Jangan reimplementasi stdDev/persen di sini (aturan A7).

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Hitung statistik lengkap dari data bapokting
 * @param data Array of BapoktingPrice (minimal 2 items untuk statistik valid)
 * @param hari Jumlah hari historis yang dipertimbangkan (default: 7)
 */
export function hitungStatsBapokting(data: BapoktingPrice[], hari: number = 7): BapoktingStats {
  // Group data by komoditas
  const groupedByKomoditas: Record<string, BapoktingPrice[]> = {};
  for (const item of data) {
    if (!groupedByKomoditas[item.namaBarang]) {
      groupedByKomoditas[item.namaBarang] = [];
    }
    groupedByKomoditas[item.namaBarang].push(item);
  }

  // Hitung statistik per komoditas
  const komoditasStats: Record<string, KomoditasStats> = {};
  const trendNaik: KomoditasTrend[] = [];
  const trendTurun: KomoditasTrend[] = [];
  const trendStabil: KomoditasTrend[] = [];

  for (const [nama, items] of Object.entries(groupedByKomoditas)) {
    // Sort by tanggal (descending) untuk ambil terbaru
    const sorted = [...items].sort((a, b) => {
      const tA = a.tanggal ? new Date(a.tanggal).getTime() : 0;
      const tB = b.tanggal ? new Date(b.tanggal).getTime() : 0;
      return tB - tA;
    });

    // Ambil historis (max `hari` terakhir)
    const historis = sorted
      .map((item) => ({
        tanggal: item.tanggal || new Date().toISOString(),
        harga: item.harga,
      }))
      .slice(0, hari);

    const hargaValues = historis.map((h) => h.harga);
    const stats = describe(hargaValues);
    const avg = stats.mean;
    const stdDev = stats.stdDev;

    // Hitung trend: bandingkan rata-rata 7 hari terakhir vs 7 hari sebelumnya
    let trend: 'naik' | 'turun' | 'stabil' = 'stabil';
    let persentasePerubahan = 0;
    let cukupData = false;

    if (sorted.length >= 14) {
      cukupData = true;
      const mingguIni = sorted.slice(0, 7).reduce((a, b) => a + b.harga, 0) / 7;
      const mingguLalu = sorted.slice(7, 14).reduce((a, b) => a + b.harga, 0) / 7;
      persentasePerubahan = growth(mingguLalu, mingguIni);
      trend = classifyTrend(persentasePerubahan);
    }

    const currentHarga = sorted.length > 0 ? sorted[0].harga : 0;

    komoditasStats[nama] = {
      nama,
      kategori: items[0]?.kategori,
      hargaMin: Math.min(...hargaValues),
      hargaMax: Math.max(...hargaValues),
      hargaAvg: Math.round(avg),
      hargaStdDev: Math.round(stdDev),
      hargaCurrent: currentHarga,
      hargaHistoris: historis,
      trend,
      persentasePerubahan: Math.round(persentasePerubahan * 100) / 100,
      cukupData,
    };

    // Classify untuk trend lists
    if (komoditasStats[nama].persentasePerubahan > 2) {
      trendNaik.push({ nama, persentase: komoditasStats[nama].persentasePerubahan, arah: 'naik' });
    } else if (komoditasStats[nama].persentasePerubahan < -2) {
      trendTurun.push({ nama, persentase: Math.abs(komoditasStats[nama].persentasePerubahan), arah: 'turun' });
    } else {
      trendStabil.push({ nama, persentase: 0, arah: 'stabil' });
    }
  }

  // Group by kategori — weighted average (bukan rata-rata dari rata-rata)
  const kategoriStats: Record<string, KategoriStats> = {};
  const kategoriWeight: Record<string, { sum: number; count: number }> = {};
  for (const kom of Object.values(komoditasStats)) {
    const cat = kom.kategori || 'Lainnya';
    if (!kategoriStats[cat]) {
      kategoriStats[cat] = { nama: cat, komoditasCount: 0, hargaAvg: 0, hargaMin: Infinity, hargaMax: 0, komoditas: [] };
      kategoriWeight[cat] = { sum: 0, count: 0 };
    }
    kategoriStats[cat].komoditasCount += 1;
    const w = kom.hargaHistoris.length || 1;
    kategoriWeight[cat].sum += kom.hargaAvg * w;
    kategoriWeight[cat].count += w;
    kategoriStats[cat].hargaMin = Math.min(kategoriStats[cat].hargaMin, kom.hargaMin);
    kategoriStats[cat].hargaMax = Math.max(kategoriStats[cat].hargaMax, kom.hargaMax);
    kategoriStats[cat].komoditas.push(kom.nama);
  }
  // Hitung rata-rata per kategori (tertimbang)
  for (const [catName, cat] of Object.entries(kategoriStats)) {
    const w = kategoriWeight[catName];
    cat.hargaAvg = Math.round(w.sum / w.count);
  }

  // Group by kecamatan
  const kecamatanStats: Record<string, KecamatanStats> = {};
  for (const item of data) {
    const kec = item.kecamatan || 'Lainnya';
    if (!kecamatanStats[kec]) {
      kecamatanStats[kec] = { nama: kec, komoditasCount: 0, hargaAvg: 0, hargaMin: Infinity, hargaMax: 0, komoditas: [] };
    }
    kecamatanStats[kec].komoditasCount += 1;
    kecamatanStats[kec].hargaAvg += item.harga;
    kecamatanStats[kec].hargaMin = Math.min(kecamatanStats[kec].hargaMin, item.harga);
    kecamatanStats[kec].hargaMax = Math.max(kecamatanStats[kec].hargaMax, item.harga);
    if (!kecamatanStats[kec].komoditas.includes(item.namaBarang)) {
      kecamatanStats[kec].komoditas.push(item.namaBarang);
    }
  }
  // Hitung rata-rata per kecamatan
  for (const kec of Object.values(kecamatanStats)) {
    kec.hargaAvg = Math.round(kec.hargaAvg / kec.komoditasCount);
  }

  // Hitung volatility metrics
  const volatilityList = Object.entries(komoditasStats).map(([nama, stats]) => ({
    nama,
    nilai: stats.hargaAvg === 0 ? 0 : stats.hargaStdDev / stats.hargaAvg, // CV, guard div-by-zero
  }));
  volatilityList.sort((a, b) => b.nilai - a.nilai);
  const tertinggi = volatilityList.slice(0, 5).map((v) => ({ nama: v.nama, nilai: Math.round(v.nilai * 1000) / 10 }));
  const terendah = [...volatilityList].reverse().slice(0, 5).map((v) => ({ nama: v.nama, nilai: Math.round(v.nilai * 1000) / 10 }));
  const overallIndex = volatilityList.length === 0 ? 0 : Math.round(
    volatilityList.reduce((sum, v) => sum + v.nilai, 0) / volatilityList.length * 1000
  ) / 10;

  // Generate rekomendasi — hindari kontradiksi untuk komoditas yang sama
  const rekomendasi: string[] = [];
  if (trendNaik.length > 0) {
    const topNaik = trendNaik.slice(0, 3).map((t) => t.nama).join(', ');
    rekomendasi.push(`Harga ${topNaik} naik minggu ini — pertimbangkan stok alternatif.`);
  }
  if (trendTurun.length > 0) {
    const topTurun = trendTurun.slice(0, 3).map((t) => t.nama).join(', ');
    rekomendasi.push(`Harga ${topTurun} turun — peluang beli murah.`);
  }
  if (tertinggi.length > 0) {
    const volAtas = tertinggi[0];
    // jangan klaim fluktuatif jika nilai CV sama dengan yang terendah (satu komoditas saja)
    const volBawahVal = terendah[0]?.nilai;
    if (volatilityList.length > 1 || volAtas.nilai !== volBawahVal) {
      rekomendasi.push(`Komoditas paling fluktuatif: ${volAtas.nama} (CV: ${volAtas.nilai}%) — monitor teratur.`);
    }
  }
  if (terendah.length > 0) {
    const volBawah = terendah[0];
    const volAtasVal = tertinggi[0]?.nilai;
    if (volatilityList.length > 1 || volBawah.nilai !== volAtasVal) {
      rekomendasi.push(`Komoditas paling stabil: ${volBawah.nama} (CV: ${volBawah.nilai}%) — referensi harga andal.`);
    }
  }
  if (rekomendasi.length === 0) {
    rekomendasi.push('Harga bahan pokok cenderung stabil minggu ini — pasokan aman.');
  }

  const kurangData = Object.values(komoditasStats).filter((k) => !k.cukupData);
  const peringatan = kurangData.length > 0 ? `Tren tidak dihitung: ${kurangData.length} komoditas memiliki data <14 hari (dilaporkan sebagai stabil, perubahan 0%)` : undefined;

  return {
    komoditas: komoditasStats,
    kategori: kategoriStats,
    kecamatan: kecamatanStats,
    trend: { naik: trendNaik, turun: trendTurun, stabil: trendStabil },
    rekomendasi,
    volatility: { overallIndex, tertinggi, terendah },
    ...(peringatan ? { peringatan } : {}),
  };
}

/**
 * Generate narasi AI dari hasil statistik
 */
export function generateAiNarrative(stats: BapoktingStats, tanggal: string = new Date().toLocaleDateString('id-ID')): string {
  const lines: string[] = [];

  lines.push(`**📊 Data Bapokting Aceh Tengah — ${tanggal}**\n`);

  // Top 5 mahal
  const top5Mahal = Object.values(stats.komoditas)
    .sort((a, b) => b.hargaAvg - a.hargaAvg)
    .slice(0, 5);
  lines.push(`**Harga Tertinggi (Top 5):**`);
  top5Mahal.forEach((k, i) => {
    lines.push(`${i + 1}. ${k.nama} — ${formatRupiah(k.hargaAvg)} / kg`);
  });

  // Top 5 murah
  const top5Murah = Object.values(stats.komoditas)
    .sort((a, b) => a.hargaAvg - b.hargaAvg)
    .slice(0, 5);
  lines.push(`\n**Harga Termurah (Top 5):**`);
  top5Murah.forEach((k, i) => {
    lines.push(`${i + 1}. ${k.nama} — ${formatRupiah(k.hargaAvg)} / kg`);
  });

  // Tren harga
  if (stats.trend.naik.length > 0) {
    lines.push(`\n**↑ Harga Naik:** ${stats.trend.naik.slice(0, 5).map((t) => t.nama).join(', ')}`);
  }
  if (stats.trend.turun.length > 0) {
    lines.push(`\n**↓ Harga Turun:** ${stats.trend.turun.slice(0, 5).map((t) => t.nama).join(', ')}`);
  }

  // Rekomendasi
  lines.push(`\n**💡 Rekomendasi:**`);
  stats.rekomendasi.forEach((rec, i) => {
    lines.push(`${i + 1}. ${rec}`);
  });

  return lines.join('\n');
}

/**
 * Format data untuk chart (Recharts compatibility)
 */
export function formatChartData(stats: BapoktingStats, limit: number = 10): any[] {
  return Object.values(stats.komoditas)
    .sort((a, b) => b.hargaAvg - a.hargaAvg)
    .slice(0, limit)
    .map((k) => ({
      nama: k.nama,
      harga: k.hargaAvg,
      trend: k.trend,
      persentasePerubahan: k.persentasePerubahan,
      min: k.hargaMin,
      max: k.hargaMax,
    }));
}

/**
 * Format data untuk per-kecamatan breakdown
 */
export function formatKecamatanData(stats: BapoktingStats): any[] {
  return Object.entries(stats.kecamatan).map(([nama, s]) => ({
    kecamatan: nama,
    hargaAvg: s.hargaAvg,
    komoditasCount: s.komoditasCount,
  }));
}

/**
 * Format data untuk per-kategori breakdown
 */
export function formatKategoriData(stats: BapoktingStats): any[] {
  return Object.entries(stats.kategori).map(([nama, s]) => ({
    kategori: nama,
    hargaAvg: s.hargaAvg,
    komoditasCount: s.komoditasCount,
  }));
}
