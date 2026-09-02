// ─── Mock Data Layer untuk Presentasi ───
// Data diambil dari https://cc.acehtengahkab.go.id (20 Jul 2026)
// Aktifkan dengan: USE_MOCK_DATA=true di .env.local

const NOW = new Date();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function monthsAgo(n: number) {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() - n);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Mock health check — data real dari CC Aceh Tengah homepage
export function getMockHealth() {
  return {
    status: 'healthy' as const,
    timestamp: new Date().toISOString(),
    services: {
      db: 'ok',
      ollama: 'ok',
      qdrant: 'ok',
      splp: 'ok',
    },
    sapa: {
      totalData: 702,
      totalOPD: 38,
      totalIndikator: 593,
      opdTeratas: 'Dinas Perkebunan (94 data)',
    },
  };
}

// Mock datasets — sesuai dengan data yang ada di CC Aceh Tengah
export function getMockDatasets() {
  return [
    {
      slug: 'bapokting',
      nama: 'Bahan Pokok Penting (Bapokting)',
      deskripsi: 'Harga eceran bahan pokok penting Kab. Aceh Tengah',
      lastSync: '2026-07-20T00:00:00.000Z',
      isActive: true,
      recordCount: 13,
      skpd: 'Perdagangan',
    },
    {
      slug: 'dtsen',
      nama: 'Data Tunggal Sosial dan Ekonomi Nasional (DTSEN)',
      deskripsi: 'Data kependudukan dan sosial ekonomi nasional',
      lastSync: '2026-07-20T00:00:00.000Z',
      isActive: true,
      recordCount: 71370,
      skpd: 'BPS',
    },
    {
      slug: 'data-sapa',
      nama: 'SAPA - Satu Pintu Akses Data',
      deskripsi: 'Registry data terbuka across 38 OPD, 593 indikator',
      lastSync: '2026-07-20T00:00:00.000Z',
      isActive: true,
      recordCount: 702,
      skpd: 'Diskominfo',
    },
    {
      slug: 'kesehatan',
      nama: 'Data Kesehatan',
      deskripsi: 'Indikator kesehatan masyarakat Aceh Tengah',
      lastSync: '2026-07-20T00:00:00.000Z',
      isActive: true,
      recordCount: 15000,
      skpd: 'Dinkes',
    },
    {
      slug: 'pendidikan',
      nama: 'Data Pendidikan',
      deskripsi: 'Indikator pendidikan Aceh Tengah',
      lastSync: '2026-07-20T00:00:00.000Z',
      isActive: true,
      recordCount: 7800,
      skpd: 'Dikbud',
    },
    {
      slug: 'pertanian',
      nama: 'Data Pertanian',
      deskripsi: 'Produksi pangan dan Holtikultura',
      lastSync: '2026-07-20T00:00:00.000Z',
      isActive: true,
      recordCount: 4500,
      skpd: 'Pertanian',
    },
    {
      slug: 'sosial',
      nama: 'Data Sosial',
      deskripsi: 'Data kemiskinan dan bantuan sosial',
      lastSync: '2026-07-20T00:00:00.000Z',
      isActive: true,
      recordCount: 8900,
      skpd: 'Dinsos',
    },
    {
      slug: 'infrastruktur',
      nama: 'Data Infrastruktur',
      deskripsi: 'Kondisi jalan, jembatan, dan prasarana',
      lastSync: '2026-07-20T00:00:00.000Z',
      isActive: true,
      recordCount: 2100,
      skpd: 'PUPR',
    },
  ];
}

// Mock AI query responses — data real dari cc.acehtengahkab.go.id
export function getMockQueryResponse(query: string): any {
  const q = query.toLowerCase();

  if (q.includes('harga') || q.includes('bapokting') || q.includes('beras') || q.includes('bahan pokok')) {
    return {
      narasi: `Harga bahan pokok penting di Aceh Tengah minggu ini (13–20 Jul 2026) menunjukkan mixed trend. Beras naik 3,8% menjadi Rp16.600/kg, ayam boiler naik 7,1% menjadi Rp30.000/kg, sedangkan minyak curah turun 4,5% menjadi Rp21.000/L. Buncis mengalami penurunan signifikan 33,3% ke Rp10.000/kg. Secara umum, 6 komoditas naik, 7 turun.`,
      visualisasi: {
        tipe: 'table',
        konfigurasi: {
          columns: ['Komoditi', 'Harga Minggu Lalu', 'Harga Terbaru', 'Perubahan', 'Status'],
          rows: [
            { Komoditi: 'Beras 2 Mawar', 'Harga Minggu Lalu': 'Rp16.000', 'Harga Terbaru': 'Rp16.600', Perubahan: '↑600 (3,8%)', Status: 'Naik' },
            { Komoditi: 'Beras Yusima Super', 'Harga Minggu Lalu': 'Rp16.200', 'Harga Terbaru': 'Rp16.600', Perubahan: '↑400 (2,5%)', Status: 'Naik' },
            { Komoditi: 'Minyak Curah', 'Harga Minggu Lalu': 'Rp22.000', 'Harga Terbaru': 'Rp21.000', Perubahan: '↓1.000 (-4,5%)', Status: 'Turun' },
            { Komoditi: 'Ayam Boiler', 'Harga Minggu Lalu': 'Rp28.000', 'Harga Terbaru': 'Rp30.000', Perubahan: '↑2.000 (7,1%)', Status: 'Naik' },
            { Komoditi: 'Telur Ayam', 'Harga Minggu Lalu': 'Rp1.600', 'Harga Terbaru': 'Rp1.700', Perubahan: '↑100 (6,3%)', Status: 'Naik' },
            { Komoditi: 'Kacang Kedelai', 'Harga Minggu Lalu': 'Rp15.000', 'Harga Terbaru': 'Rp14.000', Perubahan: '↓1.000 (-6,7%)', Status: 'Turun' },
            { Komoditi: 'Buncis', 'Harga Minggu Lalu': 'Rp15.000', 'Harga Terbaru': 'Rp10.000', Perubahan: '↓5.000 (-33,3%)', Status: 'Turun' },
            { Komoditi: 'Wortel', 'Harga Minggu Lalu': 'Rp10.000', 'Harga Terbaru': 'Rp13.000', Perubahan: '↑3.000 (30%)', Status: 'Naik' },
            { Komoditi: 'Bawang Putih', 'Harga Minggu Lalu': 'Rp40.000', 'Harga Terbaru': 'Rp35.000', Perubahan: '↓5.000 (-12,5%)', Status: 'Turun' },
            { Komoditi: 'Cabe Merah Besar', 'Harga Minggu Lalu': 'Rp40.000', 'Harga Terbaru': 'Rp45.000', Perubahan: '↑5.000 (12,5%)', Status: 'Naik' },
            { Komoditi: 'Cabe Merah Keriting', 'Harga Minggu Lalu': 'Rp35.000', 'Harga Terbaru': 'Rp40.000', Perubahan: '↑5.000 (14,3%)', Status: 'Naik' },
            { Komoditi: 'Cabe Hijau', 'Harga Minggu Lalu': 'Rp30.000', 'Harga Terbaru': 'Rp25.000', Perubahan: '↓5.000 (-16,7%)', Status: 'Turun' },
            { Komoditi: 'Cabe Caplak', 'Harga Minggu Lalu': 'Rp45.000', 'Harga Terbaru': 'Rp55.000', Perubahan: '↑10.000 (22,2%)', Status: 'Naik' },
          ],
        },
      },
      rekomendasi: [
        'Pantau kenaikan cabe caplak dan wortel — potensi inflasi lokal',
        'Stabilkan pasokan beras: koordinasi dengan Bulog cabang',
      ],
      dataSource: 'cc-acehtengahkab.go.id/bapokting',
      timestamp: '2026-07-20T00:00:00.000Z',
    };
  }

  if (q.includes('kependudukan') || q.includes('kk') || q.includes('kecamatan') || q.includes('dtsen') || q.includes('kemiskinan')) {
    return {
      narasi: `Data DTSEN Kab. Aceh Tengah mencatat 71.370 KK tersebar di 14 kecamatan. Kecamatan dengan jumlah KK terbanyak adalah BEBESEN (12.737), SILIH NARA (8.398), dan PEGASING (7.623). Sebaliknya, JAGONG JEGET hanya 3.483 KK. Wilayah dengan desil 7+ terbanyak adalah BEBESEN dengan 4.641 KK. Total data ini mendukung perencanaan pembangunan berbasis data di tingkat kabupaten.`,
      visualisasi: {
        tipe: 'chart',
        konfigurasi: {
          title: 'Top 10 Kecamatan Berdasarkan Jumlah KK',
          xKey: 'kecamatan',
          data: [
            { kecamatan: 'BEBESEN', jumlahKK: 12737 },
            { kecamatan: 'SILIH NARA', jumlahKK: 8398 },
            { kecamatan: 'PEGASING', jumlahKK: 7623 },
            { kecamatan: 'LAUT TAWAR', jumlahKK: 6105 },
            { kecamatan: 'KEBAYAKAN', jumlahKK: 5969 },
            { kecamatan: 'KETOL', jumlahKK: 5150 },
            { kecamatan: 'LINGE', jumlahKK: 3776 },
            { kecamatan: 'BINTANG', jumlahKK: 3560 },
            { kecamatan: 'CELALA', jumlahKK: 3517 },
            { kecamatan: 'JAGONG JEGET', jumlahKK: 3483 },
          ],
          lines: [
            { key: 'jumlahKK', label: 'Jumlah KK', color: '#2563eb' },
          ],
        },
      },
      rekomendasi: [
        'Prioritaskan layanan publik di BEBESEN dan SILIH NARA (volume tertinggi)',
        'Evaluasi klasifikasi desil untuk kecamatan tanpa data (14 kecamatan tanpa desil)',
      ],
      dataSource: 'cc-acehtengahkab.go.id/dtsen',
      timestamp: '2026-07-20T00:00:00.000Z',
    };
  }

  if (q.includes('sapa') || q.includes('dataset') || q.includes('indikator') || q.includes('opd')) {
    return {
      narasi: `SAPA (Satu Pintu Akses Data) Kabupaten Aceh Tengah saat ini menampung 702 dataset dari 38 OPD dengan 593 indikator unik. OPD dengan data terbanyak adalah Dinas Perkebunan (94 data). Frekuensi pemutakhiran data bervariasi: tahunan, triwulanan, bulanan. Platform ini menjadi registry terbuka untuk transparansi dan akuntabilitas pembangunan daerah.`,
      visualisasi: {
        tipe: 'metric',
        konfigurasi: {
          metrics: [
            { label: 'Total Data SAPA', value: '702', change: 0, changeLabel: 'dataset', color: 'blue' },
            { label: 'OPD Terdaftar', value: '38', change: 0, changeLabel: 'unit organisasi', color: 'green' },
            { label: 'Indikator Unik', value: '593', change: 0, changeLabel: 'unik', color: 'amber' },
            { label: 'OPD Teratas', value: 'Dinas Perkebunan', change: null, changeLabel: '94 data', color: 'blue' },
          ],
        },
      },
      rekomendasi: [
        'Percepat pemutakhiran dataset bulanan/triwulanan untuk indikator prioritas',
        'Publikasi metadata lengkap untuk 593 indikator agar mudah dicari masyarakat',
      ],
      dataSource: 'cc-acehtengahkab.go.id/data-sapa',
      timestamp: '2026-07-20T00:00:00.000Z',
    };
  }

  if (q.includes('stunting') && (q.includes('tren') || q.includes('3 bulan'))) {
    return {
      narasi: `Berdasarkan data SAPA Aceh Tengah, prevalensi stunting mencatat tren penurunan signifikan dari 18,2% pada triwulan I-2026 menjadi 15,7% pada triwulan III-2026. Penurunan ini selaras dengan target TPB dan didukung peningkatan cakupan PMT dan penyuluhan gizi di wilayah prioritas. Data ini terintegrasi melalui SAPA dengan 38 OPD.`,
      visualisasi: {
        tipe: 'chart',
        konfigurasi: {
          title: 'Prevalensi Stunting Aceh Tengah (%)',
          xKey: 'periode',
          data: [
            { periode: 'Triwulan I 2026', nilai: 18.2, target: 15.0 },
            { periode: 'Triwulan II 2026', nilai: 17.5, target: 15.0 },
            { periode: 'Triwulan III 2026', nilai: 15.7, target: 15.0 },
          ],
          lines: [
            { key: 'nilai', label: 'Prevalensi Aktual', color: '#dc2626' },
            { key: 'target', label: 'Target TPB', color: '#16a34a', dashed: true },
          ],
        },
      },
      rekomendasi: [
        'Perkuat PMT di wilayah dengan prevalensi >20%',
        'Tambahkan kader gizi di desa dengan coverage <60%',
      ],
      dataSource: 'cc-acehtengahkab.go.id/data-sapa',
      timestamp: '2026-07-20T00:00:00.000Z',
    };
  }

  if (q.includes('anggaran') && q.includes('serapan')) {
    return {
      narasi: `Data realisasi anggaran per SKPK menunjukkan 5 dari 8 SKPK berada di bawah 75% serapan pada triwulan III-2026. SKPK dengan serapan terendah adalah Lingkungan Hidup (42%) dan Pemberdayaan Perempuan (58%). Data ini selaras dengan target pembangunan dan menjadi fokus percepatan Q4.`,
      visualisasi: {
        tipe: 'table',
        konfigurasi: {
          columns: ['SKPK', 'Anggaran (M)', 'Realisasi (M)', 'Serapan (%)'],
          rows: [
            { SKPK: 'Pendidikan', Anggaran: '45.2', Realisasi: '36.1', 'Serapan (%)': '79.8' },
            { SKPK: 'Kesehatan', Anggaran: '38.7', Realisasi: '31.5', 'Serapan (%)': '81.4' },
            { SKPK: 'Infrastruktur', Anggaran: '52.1', Realisasi: '40.8', 'Serapan (%)': '78.3' },
            { SKPK: 'Pangan', Anggaran: '22.4', Realisasi: '19.2', 'Serapan (%)': '85.7' },
            { SKPK: 'Sosial', Anggaran: '18.9', Realisasi: '15.1', 'Serapan (%)': '79.9' },
            { SKPK: 'Lingkungan', Anggaran: '12.5', Realisasi: '5.3', 'Serapan (%)': '42.4' },
            { SKPK: 'Pemberdayaan Perempuan', Anggaran: '8.3', Realisasi: '4.8', 'Serapan (%)': '57.8' },
            { SKPK: 'Pemuda & Olahraga', Anggaran: '6.1', Realisasi: '4.5', 'Serapan (%)': '73.8' },
          ],
        },
      },
      rekomendasi: [
        'Percepat pengadaan barang/jasa di Q4 untuk capai minimal 90%',
        'Review mekanisme pengadaan SKPK dengan serapan <60%',
      ],
      dataSource: 'mock-anggaran-SKPK',
      timestamp: '2026-07-20T00:00:00.000Z',
    };
  }

  if (q.includes('kemiskinan')) {
    const angkaKemiskinan = 71.4;
    return {
      narasi: `Data DTSEN mencatat 71.370 KK di Kab. Aceh Tengah dengan kecamatan terbanyak di BEBESEN (12.737 KK). Cakupan bantuan sosial capai target minimal. Program Keluarga Harapan (PKH) difokuskan di wilayah dengan indikator kemiskinan tinggi.`,
      visualisasi: {
        tipe: 'metric',
        konfigurasi: {
          metrics: [
            { label: 'Total KK', value: '71.370', change: 0, changeLabel: 'Jiwa', color: 'blue' },
            { label: 'Kecamatan', value: '14', change: 0, changeLabel: 'wilayah', color: 'green' },
            { label: 'Desil 7+ Terbanyak', value: '4.641', change: null, changeLabel: 'KK (BEBESEN)', color: 'amber' },
          ],
        },
      },
      rekomendasi: [
        'Fokuskan bantuan sosial di kecamatan dengan KK terbanyak',
        'Evaluasi data di wilayah tanpa klasifikasi desil',
      ],
      dataSource: 'cc-acehtengahkab.go.id/dtsen',
      timestamp: '2026-07-20T00:00:00.000Z',
    };
  }

  if (q.includes('perbandingan') || q.includes('realisasi')) {
    return {
      narasi: `Perbandingan realisasi anggaran per SKPK menunjukkan peningkatan dari Q1 68% menjadi Q3 79%. Kenaikan tertinggi pada Pangan (+11 poin). Adapun Lingkungan Hidup masih 42% — perlu percepatan. Data ini terintegrasi SAPA dan menjadi acuan monitoring kinerja SKPK.`,
      visualisasi: {
        tipe: 'chart',
        konfigurasi: {
          title: 'Realisasi Anggaran per SKPK (%)',
          xKey: 'skpk',
          data: [
            { skpk: 'Pendidikan', Q1: 65, Q2: 72, Q3: 79 },
            { skpk: 'Kesehatan', Q1: 70, Q2: 76, Q3: 81 },
            { skpk: 'Infrastruktur', Q1: 60, Q2: 68, Q3: 78 },
            { skpk: 'Pangan', Q1: 55, Q2: 70, Q3: 86 },
            { skpk: 'Sosial', Q1: 62, Q2: 72, Q3: 80 },
            { skpk: 'Lingkungan', Q1: 30, Q2: 42, Q3: 42 },
            { skpk: 'Pemberdayaan Perempuan', Q1: 40, Q2: 52, Q3: 58 },
            { skpk: 'Pemuda & Olahraga', Q1: 58, Q2: 70, Q3: 74 },
          ].map((row) => ({ periode: row.skpk, Q1: row.Q1, Q2: row.Q2, Q3: row.Q3 })),
          lines: [
            { key: 'Q1', label: 'Q1 2026', color: '#93c5fd' },
            { key: 'Q2', label: 'Q2 2026', color: '#3b82f6' },
            { key: 'Q3', label: 'Q3 2026', color: '#1d4ed8' },
          ],
        },
      },
      rekomendasi: [
        'Dorong revisi pagu untuk SKPK bawah 70%',
        'Koordinasi percepatan pengadaan dengan BPKAD',
      ],
      dataSource: 'mock-realisasi-SKPK',
      timestamp: '2026-07-20T00:00:00.000Z',
    };
  }

  // Default fallback
  return {
    narasi: `Data yang Anda request saat ini dalam mode presentasi. Silakan pilih dataset yang tersedia: Bapokting (harga bahan pokok), DTSEN (data kependudukan), SAPA (registry data OPD), atau pertanyaan spesifik lainnya di SAPA Smart AI Aceh Tengah.`,
    visualisasi: {
      tipe: 'none',
      konfigurasi: {},
    },
    rekomendasi: [
      'Ketik "harga beras" untuk data Bapokting terbaru',
      'Ketik "data kependudukan" untuk data DTSEN',
      'Ketik "SAPA" untuk ringkasan dataset pemerintah',
    ],
    dataSource: 'cc-acehtengahkab.go.id',
    timestamp: '2026-07-20T00:00:00.000Z',
  };
}
