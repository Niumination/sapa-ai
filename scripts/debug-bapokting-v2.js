const SPLP_URL = 'https://api-splp.layanan.go.id/bahan-pokok-penting-kabupaten-aceh-tengah/1.0/api/bapokting/harga';

async function main() {
  console.log('=== DEBUG BAPOKTING TREND (FIXED) ===\n');
  
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  // Get today's data
  console.log('1. Fetching today data (' + todayStr + ')...');
  const todayRes = await fetch(SPLP_URL);
  const todayData = await todayRes.json();
  console.log('   Status:', todayData.status);
  console.log('   Total:', todayData.total_komoditas);
  
  // Show structure of first item
  console.log('\n2. Sample item structure:');
  console.log(JSON.stringify(todayData.daftar_harga[0], null, 2));
  
  // Filter beras - use exact match on komoditi field
  const beras = todayData.daftar_harga.filter(i => 
    i.komoditi?.toLowerCase().startsWith('beras')
  );
  console.log('\n3. Beras variants found:');
  beras.forEach(i => {
    console.log(`   - "${i.komoditi}": Rp ${i.harga_eceran} ${i.satuan}`);
  });
  
  // Fetch historical (4 weeks) - try each date explicitly
  console.log('\n4. Fetching historical data...');
  const weekDates = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    weekDates.push(d.toISOString().split('T')[0]);
  }
  console.log('   Dates:', weekDates.join(', '));
  
  // Test if historical data exists for these dates
  console.log('\n5. Checking date availability:');
  for (const dateStr of weekDates) {
    try {
      const res = await fetch(`${SPLP_URL}?tb=data_aset&s=kecamatan&f=desil&tanggal=${dateStr}`);
      const data = await res.json();
      console.log(`   ${dateStr}: ${data.status} (${data.daftar_harga?.length || 0} items)`);
    } catch (e) {
      console.log(`   ${dateStr}: ERROR - ${e.message}`);
    }
  }
  
  // Build trend with CORRECT matching
  const trendMap = new Map();
  
  for (const commodity of beras) {
    const name = commodity.komoditi; // Full name: "Beras 88", "Beras 2 Mawar", etc.
    const points = [];
    
    for (const dateStr of weekDates) {
      try {
        const res = await fetch(`${SPLP_URL}?tb=data_aset&s=kecamatan&f=desil&tanggal=${dateStr}`);
        const data = await res.json();
        
        // Try multiple matching strategies
        let match = data.daftar_harga?.find(i => 
          i.komoditi === name ||  // Exact match
          i.komoditi?.toLowerCase() === name.toLowerCase() ||
          i.komoditi?.includes(name.split(' ')[0])  // Partial match
        );
        
        if (match && match.harga_eceran > 0) {
          points.push({ date: dateStr, price: match.harga_eceran });
          console.log(`   ✓ ${name} @ ${dateStr}: Rp ${match.harga_eceran}`);
        } else {
          console.log(`   ✗ ${name} @ ${dateStr}: NOT FOUND`);
          // Debug: show what's available
          const berasLike = data.daftar_harga?.filter(i => i.komoditi?.toLowerCase().includes('beras'));
          if (berasLike) {
            console.log(`      Available beras: ${berasLike.map(i => i.komoditi).join(', ')}`);
          }
        }
      } catch (e) {
        console.log(`   ✗ ${name} @ ${dateStr}: ERROR - ${e.message}`);
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
  console.log('\n6. Building chart data...');
  const allDates = [...new Set(beras.flatMap((_, i) => {
    const t = trendMap.get(beras[i].komoditi);
    return t?.points.map(p => p.date) || [];
  }))].sort();
  
  console.log('   Unique dates:', allDates.join(', '));
  
  const chartData = allDates.map(date => {
    const row = { label: new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) };
    for (const commodity of beras) {
      const t = trendMap.get(commodity.komoditi);
      const point = t?.points.find(p => p.date === date);
      row[commodity.komoditi] = point ? point.price : null;
    }
    return row;
  });
  
  console.log('\n=== FINAL OUTPUT ===');
  console.log(JSON.stringify({
    tipe: 'chart',
    konfigurasi: {
      type: 'line',
      xKey: 'label',
      data: chartData,
      lines: beras.map(b => b.komoditi),
    }
  }, null, 2));
  
  // Also show trend summary
  console.log('\n=== TREND SUMMARY ===');
  for (const [name, data] of trendMap) {
    console.log(`${name}: ${data.change > 0 ? '+' : ''}${data.change.toFixed(1)}% (${data.points.length} points)`);
  }
}

main().catch(console.error);
