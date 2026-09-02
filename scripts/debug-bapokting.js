const SPLP_URL = 'https://api-splp.layanan.go.id/bahan-pokok-penting-kabupaten-aceh-tengah/1.0/api/bapokting/harga';

async function main() {
  console.log('=== DEBUG BAPOKTING TREND ===\n');
  
  // Get today's data
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  console.log('1. Fetching today data (' + todayStr + ')...');
  const todayRes = await fetch(SPLP_URL);
  const todayData = await todayRes.json();
  console.log('   Status:', todayData.status);
  console.log('   Total:', todayData.total_komoditas);
  
  // Filter beras
  const beras = todayData.daftar_harga.filter(i => 
    i.komoditi?.toLowerCase().includes('beras')
  );
  console.log('\n2. Beras variants:');
  beras.forEach(i => {
    console.log(`   - ${i.komoditi}: Rp ${i.harga_eceran} ${i.satuan}`);
  });
  
  // Fetch historical (4 weeks)
  console.log('\n3. Fetching historical data...');
  const weekDates = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    weekDates.push(d.toISOString().split('T')[0]);
  }
  
  const trendMap = new Map();
  
  for (const commodity of beras) {
    const name = commodity.komoditi;
    const points = [];
    
    for (const dateStr of weekDates) {
      try {
        const res = await fetch(`${SPLP_URL}?tanggal=${dateStr}`);
        const data = await res.json();
        const match = data.daftar_harga?.find(i => 
          i.komoditi?.toLowerCase().includes(name.split(' ')[0])
        );
        if (match && match.harga_eceran > 0) {
          points.push({ date: dateStr, price: match.harga_eceran });
          console.log(`   ${name} @ ${dateStr}: Rp ${match.harga_eceran} ✓`);
        } else {
          console.log(`   ${name} @ ${dateStr}: NOT FOUND`);
        }
      } catch (e) {
        console.log(`   ${name} @ ${dateStr}: ERROR - ${e.message}`);
      }
    }
    
    if (points.length > 0) {
      points.sort((a, b) => a.date.localeCompare(b.date));
      const latest = points[points.length - 1].price;
      const oldest = points[0].price;
      const change = oldest > 0 ? ((latest - oldest) / oldest) * 100 : 0;
      trendMap.set(name, { points, latest, oldest, change });
    }
  }
  
  // Build chart data
  console.log('\n4. Building chart data...');
  const allDates = [...new Set(beras.flatMap((_, i) => {
    const t = trendMap.get(beras[i].komoditi);
    return t?.points.map(p => p.date) || [];
  }))].sort();
  
  const chartData = allDates.map(date => {
    const row = { label: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) };
    for (const commodity of beras) {
      const t = trendMap.get(commodity.komoditi);
      const point = t?.points.find(p => p.date === date);
      row[commodity.komoditi] = point ? point.price : null;
    }
    return row;
  });
  
  console.log('\n=== OUTPUT FORMAT ===');
  console.log(JSON.stringify({
    tipe: 'chart',
    konfigurasi: {
      type: 'line',
      xKey: 'label',
      data: chartData,
      lines: beras.map(b => b.komoditi),
    }
  }, null, 2));
}

main().catch(console.error);
