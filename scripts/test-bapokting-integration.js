#!/usr/bin/env node
/**
 * Integration test: Simulasi lengkap alur Bapokting
 * Menguji: fetch data → filter komoditas → hitung tren → build chart
 */

const SPLP_URL = 'https://api-splp.layanan.go.id/bahan-pokok-penting-kabupaten-aceh-tengah/1.0/api/bapokting/harga';

async function fetchBapokting(tanggal = null) {
  let url = `${SPLP_URL}?tb=data_aset&s=kecamatan&f=desil`;
  if (tanggal) url += `&tanggal=${tanggal}`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log('=== TESTING BAPOKTING INTEGRATION ===\n');
  
  // 1. Fetch data hari ini
  console.log('1. Fetching today\'s data...');
  const today = new Date().toISOString().split('T')[0];
  const todayData = await fetchBapokting();
  console.log(`   Date: ${todayData.tanggal}`);
  console.log(`   Total commodities: ${todayData.total_komoditas}`);
  
  // 2. Filter beras
  const berasItems = todayData.daftar_harga.filter(i => 
    i.komoditi?.toLowerCase().includes('beras')
  );
  console.log(`   Beras variants: ${berasItems.length}`);
  berasItems.forEach(i => {
    console.log(`   - ${i.komoditi}: Rp ${i.harga_eceran} ${i.satuan}`);
  });
  
  // 3. Fetch historical data (4 weeks back)
  console.log('\n2. Fetching historical data (4 weeks)...');
  const weekDates = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    weekDates.push(d.toISOString().split('T')[0]);
  }
  console.log(`   Dates to check: ${weekDates.join(', ')}`);
  
  const historicalPrices = {};
  for (const date of weekDates) {
    try {
      const data = await fetchBapokting(date);
      if (data.daftar_harga) {
        console.log(`   ${date}: ${data.daftar_harga.length} items`);
        for (const item of data.daftar_harga) {
          if (item.komoditi?.toLowerCase().includes('beras') && item.harga_eceran > 0) {
            const name = item.komoditi;
            if (!historicalPrices[name]) historicalPrices[name] = [];
            historicalPrices[name].push({ date, price: item.harga_eceran });
          }
        }
      }
    } catch (e) {
      console.log(`   ${date}: ERROR - ${e.message}`);
    }
  }
  
  // 4. Build trend data
  console.log('\n3. Building trend data...');
  const trendData = Object.entries(historicalPrices).map(([nama, points]) => {
    points.sort((a, b) => a.date.localeCompare(b.date));
    const latest = points[points.length - 1].price;
    const oldest = points[0].price;
    const change = oldest > 0 ? ((latest - oldest) / oldest) * 100 : 0;
    return {
      nama,
      points,
      latest,
      oldest,
      trend: change > 2 ? 'naik' : change < -2 ? 'turun' : 'stabil',
      change: Math.round(change * 10) / 10,
    };
  });
  
  console.log(`   Trend entries: ${trendData.length}`);
  trendData.forEach(t => {
    console.log(`   - ${t.nama}: ${t.trend} (${t.change}%)`);
    console.log(`     Prices: ${t.points.map(p => `${p.date}:${p.price}`).join(' → ')}`);
  });
  
  // 5. Build chart data (format yang dikirim ke frontend)
  console.log('\n4. Building chart data for frontend...');
  const allDates = [...new Set(trendData.flatMap(t => t.points.map(p => p.date)))].sort();
  const chartData = allDates.map(date => {
    const row = { label: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) };
    for (const t of trendData) {
      const point = t.points.find(p => p.date === date);
      row[t.nama] = point ? point.price : null;
    }
    return row;
  });
  
  console.log('   Chart data:');
  chartData.forEach(row => {
    console.log(`   ${row.label}: ${Object.entries(row).filter(([k]) => k !== 'label').map(([k, v]) => `${k}=${v}`).join(', ')}`);
  });
  
  // 6. Expected frontend config
  console.log('\n5. Expected frontend chart config:');
  console.log(JSON.stringify({
    tipe: 'chart',
    konfigurasi: {
      type: 'line',
      xKey: 'label',
      data: chartData,
      lines: trendData.map(t => t.nama),
    }
  }, null, 2));
  
  console.log('\n=== TEST COMPLETE ===');
}

main().catch(console.error);
