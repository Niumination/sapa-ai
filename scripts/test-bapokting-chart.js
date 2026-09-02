#!/usr/bin/env node
/**
 * Test script: Simulasi output Bapokting trend chart
 * Menampilkan format data yang akan dikirim ke frontend
 */

// Simulate bapoktingTrendData structure
const mockTrendData = [
  {
    nama: 'Beras 88',
    points: [
      { date: '2026-08-17', price: 15500 },
      { date: '2026-08-24', price: 16000 },
      { date: '2026-08-31', price: 16000 },
    ],
    latest: 16000,
    oldest: 15500,
    trend: 'naik',
    change: 3.2,
  },
  {
    nama: 'Beras 2 Mawar',
    points: [
      { date: '2026-08-17', price: 16200 },
      { date: '2026-08-24', price: 16600 },
      { date: '2026-08-31', price: 16600 },
    ],
    latest: 16600,
    oldest: 16200,
    trend: 'naik',
    change: 2.5,
  },
  {
    nama: 'Beras Cap Udang',
    points: [
      { date: '2026-08-17', price: 15000 },
      { date: '2026-08-24', price: 14500 },
      { date: '2026-08-31', price: 14500 },
    ],
    latest: 14500,
    oldest: 15000,
    trend: 'turun',
    change: -3.3,
  },
];

// Build chart data (sama seperti di orchestrator)
const allDates = mockTrendData[0].points.map(p => p.date);
const uniqueDates = [...new Set(allDates)].sort();

const chartData = [];
for (const date of uniqueDates) {
  const row = { minggu: date };
  for (const trend of mockTrendData) {
    const point = trend.points.find(p => p.date === date);
    row[trend.nama] = point ? point.price : null;
  }
  chartData.push(row);
}

// Format untuk frontend
const formattedData = chartData.map(row => {
  const formatted = { label: '' };
  try {
    const d = new Date(row.minggu);
    formatted.label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  } catch {
    formatted.label = row.minggu;
  }
  for (const trend of mockTrendData) {
    formatted[trend.nama] = row[trend.nama];
  }
  return formatted;
});

const lines = mockTrendData.map(t => t.nama);

console.log('=== MOCK CHART DATA ===');
console.log('Type: line');
console.log('X-Axis key:', 'label');
console.log('Lines:', JSON.stringify(lines));
console.log('\nData:');
console.log(JSON.stringify(formattedData, null, 2));

console.log('\n=== EXPECTED FRONTEND OUTPUT ===');
console.log('Chart type: LineChart (Recharts)');
console.log('XAxis dataKey: "label" → ["17 Agu", "24 Agu", "31 Agu"]');
console.log('Lines:');
lines.forEach(line => {
  console.log(`  - Line "${line}" → dataKey: "${line}"`);
});
console.log('\nEach data point has:');
console.log('  - label: tanggal (e.g., "17 Agu")');
console.log('  - Beras 88: harga (e.g., 15500)');
console.log('  - Beras 2 Mawar: harga (e.g., 16200)');
console.log('  - Beras Cap Udang: harga (e.g., 15000)');
