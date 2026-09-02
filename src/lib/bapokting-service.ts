// ─── Bapokting Service — AI Smart Query integration ───
// Integrasi /api/bapokting dengan QueryBar dan AIResponseRenderer

export interface BapoktingQueryOptions {
  tanggal?: string;
  kategori?: string;
  agregat?: 'mingguan' | 'bulanan' | 'tahunan';
  hari?: number; // historis days
}

export async function queryBapokting(options: BapoktingQueryOptions = {}) {
  const params = new URLSearchParams();
  if (options.tanggal) params.append('tanggal', options.tanggal);
  if (options.kategori) params.append('kategori', options.kategori);
  if (options.agregat) params.append('agregat', options.agregat);
  if (options.hari) params.append('hari', options.hari.toString());

  const res = await fetch(`/api/bapokting?${params.toString()}`);
  if (!res.ok) throw new Error(`Bapokting API error: ${res.status}`);

  return res.json();
}

// Format untuk display di dashboard
export function formatBapoktingData(data: any) {
  if (!data?.data) return [];

  return data.data.map((item: any) => ({
    nama: item.namaBarang,
    harga: item.harga,
    satuan: item.satuan,
    kategori: item.kategori,
    keterangan: item.keterangan,
  }));
}

// Group by kategori
export function groupBapoktingByCategory(data: any) {
  if (!data?.data) return {};

  const grouped: Record<string, any[]> = {};
  data.data.forEach((item: any) => {
    const cat = item.kategori || 'Lainnya';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });
  return grouped;
}

// Extract AI narasi dari response
export function getBapoktingNarrative(response: any): string {
  if (response?.narasi) return response.narasi;
  if (response?.message) return response.message;
  return 'Data bapokting berhasil diambil.';
}

// Extract stats dari response
export function getBapoktingStats(response: any) {
  return response?.stats || null;
}

// Build narasi AI dari response lengkap
export function buildBapoktingNarrative(data: any): string {
  if (!data?.data || data.data.length === 0) {
    return "Maaf, saya tidak menemukan data harga bapokting untuk permintaan Anda.";
  }

  // Gunakan narasi AI dari server (lebih lengkap)
  if (data.narasi) {
    return data.narasi;
  }

  // Fallback ke client-side generation
  const top5 = data.data.slice(0, 5).sort((a: any, b: any) => b.harga - a.harga);
  const lowest5 = [...data.data].sort((a: any, b: any) => a.harga - b.harga).slice(0, 5);

  let narrative = `**📊 Data Bapokting Aceh Tengah**\n\n`;
  narrative += `Berdasarkan data SPLP DISPERINDAG (${data.sumber || 'terkini'}):\n\n`;

  narrative += `*Harga Bahan Pokok Mahal (Top 5):*\n`;
  top5.forEach((item: any) => {
    narrative += `• ${item.namaBarang}: Rp ${item.harga.toLocaleString('id-ID')} / ${item.satuan}\n`;
  });

  narrative += `\n*Harga Bahan Pokok Murah (Top 5):*\n`;
  lowest5.forEach((item: any) => {
    narrative += `• ${item.namaBarang}: Rp ${item.harga.toLocaleString('id-ID')} / ${item.satuan}\n`;
  });

  if (data.agregat?.mingguan?.chartData) {
    narrative += `\n*Tren Mingguan (Top 5):*\n`;
    data.agregat.mingguan.chartData.slice(0, 5).forEach((item: any) => {
      narrative += `• ${item.label}: Rp ${Math.round(item.hargaRataRata).toLocaleString('id-ID')}\n`;
    });
  }

  return narrative;
}

// Format data untuk chart Recharts
export function formatBapoktingForChart(stats: any, limit: number = 10): any[] {
  if (!stats?.komoditas) return [];

  return Object.entries(stats.komoditas)
    .sort((a: any, b: any) => b[1].hargaAvg - a[1].hargaAvg)
    .slice(0, limit)
    .map(([nama, s]: [string, any]) => ({
      nama,
      harga: s.hargaAvg,
      trend: s.trend,
      persentasePerubahan: s.persentasePerubahan,
    }));
}
