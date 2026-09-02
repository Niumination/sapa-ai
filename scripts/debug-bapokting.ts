// Debug script for Bapokting trend
import { fetchLatestBapoktingPrices, SPLP_BAPOKTING_URL } from '../src/lib/bapokting-client';

async function debug() {
  console.log('=== DEBUG BAPOKTING ===\n');
  
  // 1. Fetch current data
  console.log('1. Fetching current data...');
  const currentData = await fetchLatestBapoktingPrices(50);
  console.log(`   Found ${currentData.length} items`);
  
  const beras = currentData.filter(p => p.namaBarang?.toLowerCase().includes('beras'));
  console.log(`   Beras variants: ${beras.length}`);
  beras.forEach(p => console.log(`   - ${p.namaBarang}: Rp ${p.harga} ${p.satuan}`));
  
  // 2. Fetch historical data (4 weeks)
  console.log('\n2. Fetching historical data...');
  const today = new Date();
  const weekDates: string[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    weekDates.push(d.toISOString().split('T')[0]);
  }
  console.log(`   Dates: ${weekDates.join(', ')}`);
  
  type TrendPoint = { date: string; price: number };
  type CommodityTrend = {
    nama: string;
    points: TrendPoint[];
    latest: number;
    oldest: number;
    trend: 'naik' | 'turun' | 'stabil';
    change: number;
  };
  
  const trendMap = new Map<string, CommodityTrend>();
  
  for (const commodity of beras) {
    const commodityName = commodity.namaBarang;
    const points: TrendPoint[] = [];
    
    for (const dateStr of weekDates) {
      try {
        const url = `${SPLP_BAPOKTING_URL}?tb=data_aset&s=kecamatan&f=desil&tanggal=${dateStr}`;
        console.log(`   Fetching ${dateStr}...`);
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const histData = await res.json();
          const items = histData?.daftar_harga || [];
          const match = items.find((item: any) =>
            (item.komoditi || '').toLowerCase().includes(commodityName.split(' ')[0])
          );
          if (match && match.harga_eceran > 0) {
            points.push({ date: dateStr, price: match.harga_eceran });
            console.log(`      ✓ Found: Rp ${match.harga_eceran}`);
          } else {
            console.log(`      ✗ Not found`);
          }
        } else {
          console.log(`      ✗ HTTP ${res.status}`);
        }
      } catch (e) {
        console.log(`      ✗ Error: ${e.message}`);
      }
    }
    
    if (points.length > 0) {
      points.sort((a, b) => a.date.localeCompare(b.date));
      const latest = points[points.length - 1].price;
      const oldest = points[0].price;
      const change = oldest > 0 ? ((latest - oldest) / oldest) * 100 : 0;
      trendMap.set(commodityName, {
        nama: commodityName,
        points,
        latest,
        oldest,
        trend: change > 2 ? 'naik' : change < -2 ? 'turun' : 'stabil',
        change,
      });
    }
  }
  
  console.log('\n3. Trend results:');
  console.log(`   Entries: ${trendMap.size}`);
  for (const [nama, data] of trendMap) {
    console.log(`   ${nama}: ${data.trend} (${data.change}%)`);
    console.log(`     Points: ${data.points.map(p => `${p.date}:${p.price}`).join(' → ')}`);
  }
  
  console.log('\n4. Chart data format:');
  const allDates = [...new Set(beras.map((_, i) => {
    const trend = trendMap.get(beras[i].namaBarang);
    return trend?.points.map(p => p.date) || [];
  }).flat())].sort();
  
  const chartData = allDates.map(date => {
    const row: any = { label: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) };
    for (const commodity of beras) {
      const trend = trendMap.get(commodity.namaBarang);
      const point = trend?.points.find(p => p.date === date);
      row[commodity.namaBarang] = point ? point.price : null;
    }
    return row;
  });
  
  console.log(JSON.stringify({
    tipe: 'chart',
    konfigurasi: {
      type: 'line',
      xKey: 'label',
      data: chartData,
      lines: beras.map(b => b.namaBarang),
    }
  }, null, 2));
}

debug().catch(console.error);
