// ─── Lapisan sumber data tunggal (mock ⇄ live) ───
//
// MASALAH SEBELUMNYA (LAPORAN_AUDIT_PRODUCTION_READINESS.md §P1-04)
//
// `USE_MOCK_DATA` hanya dicek di 2 dari 8 endpoint (/api/query dan /api/health).
// Akibatnya saat mode mock dinyalakan untuk demo/presentasi:
//   • /api/stats, /api/analytics, /api/geodata tetap memukul SAPA → 500
//   • dashboard utama tetap kosong
//   • /api/query mengembalikan JSON polos padahal klien mem-parse SSE,
//     sehingga panel AI gagal dengan "AI tidak mengembalikan respons"
//
// Solusinya: SATU titik keputusan. Semua endpoint memanggil `getSapaRecords()`
// dan tidak lagi peduli mode mana yang aktif. Karena mock menghasilkan bentuk
// `SapaRecord[]` yang sama dengan API asli, seluruh agregasi hilir
// (getUniqueOpd, getUniqueIndicators, aggregateByIndicator, dst.) bekerja
// identik tanpa cabang khusus.

import { fetchSapaData, type SapaRecord } from '@/lib/sapa-client';

export function isMockMode(): boolean {
  return process.env.USE_MOCK_DATA === 'true';
}

// ─── Dataset sintetis ───
// Nilai bersifat ILUSTRATIF untuk demo/pengembangan — bukan angka resmi.
// Struktur field mengikuti persis respons SAPA agar tidak ada drift skema.

interface MockSpec {
  opd: string;
  opdId: number;
  jadwal: string;
  indikator: [kode: string, nama: string, satuan: string, nilai: string, tahun: string | null][];
}

const MOCK_SPECS: MockSpec[] = [
  {
    opd: 'Dinas Kesehatan',
    opdId: 1,
    jadwal: 'Tahunan',
    indikator: [
      ['1.02.01', 'Jumlah Balita Stunting', 'Jiwa', '1245', '2025'],
      ['1.02.02', 'Prevalensi Stunting', 'Persen', '21.3', '2025'],
      ['1.02.03', 'Jumlah Puskesmas', 'Unit', '15', '2025'],
      ['1.02.04', 'Jumlah Tenaga Kesehatan', 'Orang', '892', '2025'],
      ['1.02.05', 'Cakupan Imunisasi Dasar Lengkap', 'Persen', '88.4', '2024'],
      ['1.02.06', 'Angka Kematian Ibu', 'Kasus', '7', '2024'],
    ],
  },
  {
    opd: 'Dinas Pendidikan',
    opdId: 2,
    jadwal: 'Tahunan',
    indikator: [
      ['1.01.01', 'Jumlah Sekolah Dasar', 'Unit', '187', '2025'],
      ['1.01.02', 'Jumlah Sekolah Menengah Pertama', 'Unit', '62', '2025'],
      ['1.01.03', 'Jumlah Guru Bersertifikat', 'Orang', '2341', '2025'],
      ['1.01.04', 'Angka Partisipasi Murni SD', 'Persen', '99.1', '2024'],
      ['1.01.05', 'Angka Partisipasi Murni SMP', 'Persen', '86.7', '2024'],
      ['1.01.06', 'Rata-rata Lama Sekolah', 'Tahun', '10.2', '2024'],
    ],
  },
  {
    opd: 'Dinas Perkebunan',
    opdId: 3,
    jadwal: 'Tahunan',
    indikator: [
      ['2.01.01', 'Luas Areal Kopi Arabika', 'Hektar', '48750', '2025'],
      ['2.01.02', 'Produksi Kopi Arabika', 'Ton', '31200', '2025'],
      ['2.01.03', 'Jumlah Petani Kopi', 'Orang', '38400', '2025'],
      ['2.01.04', 'Produktivitas Kopi per Hektar', 'Ton/Ha', '0.64', '2024'],
      ['2.01.05', 'Luas Areal Tembakau', 'Hektar', '412', '2024'],
    ],
  },
  {
    opd: 'Dinas Pertanian dan Pangan',
    opdId: 4,
    jadwal: 'Triwulanan',
    indikator: [
      ['2.02.01', 'Luas Panen Padi', 'Hektar', '9840', '2025'],
      ['2.02.02', 'Produksi Gabah Kering Giling', 'Ton', '52300', '2025'],
      ['2.02.03', 'Luas Lahan Sawah Irigasi', 'Hektar', '7120', '2024'],
      ['2.02.04', 'Jumlah Kelompok Tani', 'Kelompok', '684', '2025'],
    ],
  },
  {
    opd: 'Dinas Sosial',
    opdId: 5,
    jadwal: 'Semesteran',
    indikator: [
      ['1.06.01', 'Jumlah Penerima Bantuan Sosial', 'KK', '18420', '2025'],
      ['1.06.02', 'Persentase Penduduk Miskin', 'Persen', '14.8', '2024'],
      ['1.06.03', 'Jumlah Penyandang Disabilitas Terdata', 'Jiwa', '1932', '2024'],
    ],
  },
  {
    opd: 'Badan Kepegawaian dan Pengembangan SDM',
    opdId: 6,
    jadwal: 'Bulanan',
    indikator: [
      ['5.03.01', 'Jumlah ASN', 'Orang', '6284', '2025'],
      ['5.03.02', 'Jumlah PPPK', 'Orang', '1547', '2025'],
      ['5.03.03', 'Jumlah ASN Pensiun Tahun Berjalan', 'Orang', '213', '2025'],
    ],
  },
  {
    opd: 'Dinas Pekerjaan Umum dan Penataan Ruang',
    opdId: 7,
    jadwal: 'Tahunan',
    indikator: [
      ['1.03.01', 'Panjang Jalan Kabupaten', 'Kilometer', '1284', '2025'],
      ['1.03.02', 'Panjang Jalan Kondisi Baik', 'Kilometer', '731', '2025'],
      ['1.03.03', 'Jumlah Jembatan', 'Unit', '196', '2024'],
      ['1.03.04', 'Panjang Saluran Irigasi', 'Kilometer', '412', '2024'],
    ],
  },
  {
    opd: 'Badan Pengelolaan Keuangan Daerah',
    opdId: 8,
    jadwal: 'Bulanan',
    indikator: [
      ['5.02.01', 'Realisasi Pendapatan Asli Daerah', 'Rupiah', '182400000000', '2025'],
      ['5.02.02', 'Realisasi Belanja Daerah', 'Rupiah', '1284000000000', '2025'],
      ['5.02.03', 'Persentase Serapan Anggaran', 'Persen', '78.4', '2025'],
    ],
  },
  {
    opd: 'Dinas Pariwisata dan Kebudayaan',
    opdId: 9,
    jadwal: 'Triwulanan',
    indikator: [
      ['3.02.01', 'Jumlah Kunjungan Wisatawan Nusantara', 'Orang', '148300', '2025'],
      ['3.02.02', 'Jumlah Kunjungan Wisatawan Mancanegara', 'Orang', '2140', '2025'],
      ['3.02.03', 'Jumlah Destinasi Wisata Aktif', 'Lokasi', '34', '2024'],
    ],
  },
  {
    opd: 'Dinas Koperasi, UKM dan Perdagangan',
    opdId: 10,
    jadwal: 'Semesteran',
    indikator: [
      ['3.01.01', 'Jumlah UMKM Terdaftar', 'Unit', '12480', '2025'],
      ['3.01.02', 'Jumlah Koperasi Aktif', 'Unit', '218', '2025'],
      ['3.01.03', 'Harga Eceran Beras Medium', 'Rupiah/Kg', '16600', null],
      ['3.01.04', 'Harga Eceran Cabai Merah', 'Rupiah/Kg', '45000', null],
    ],
  },
  {
    opd: 'Badan Penanggulangan Bencana Daerah',
    opdId: 11,
    jadwal: 'Bulanan',
    indikator: [
      ['1.05.01', 'Jumlah Kejadian Bencana', 'Kejadian', '23', '2025'],
      ['1.05.02', 'Jumlah Desa Tangguh Bencana', 'Desa', '41', '2024'],
    ],
  },
  {
    opd: 'Dinas Lingkungan Hidup',
    opdId: 12,
    jadwal: 'Tahunan',
    indikator: [
      ['2.11.01', 'Volume Sampah Terkelola', 'Ton/Hari', '86', '2025'],
      ['2.11.02', 'Indeks Kualitas Air', 'Indeks', '62.4', '2024'],
      ['2.11.03', 'Luas Ruang Terbuka Hijau', 'Hektar', '128', '2024'],
    ],
  },
];

let cachedMock: SapaRecord[] | null = null;

/** Bangun `SapaRecord[]` sintetis dengan bentuk identik respons SAPA. */
export function buildMockSapaRecords(): SapaRecord[] {
  if (cachedMock) return cachedMock;

  const records: SapaRecord[] = [];
  let rowId = 1;
  let indicatorId = 1000;

  for (const spec of MOCK_SPECS) {
    for (const [kode, nama, satuan, nilai, tahun] of spec.indikator) {
      indicatorId += 1;
      records.push({
        id: rowId++,
        id_kode_indikator: indicatorId,
        kode_indikator_kode_indikator: kode,
        kode_indikator_nama_indikator: nama,
        id_opds: spec.opdId,
        opds_nama_opd: spec.opd,
        jadwal_pemutakhiran: spec.jadwal,
        satuan,
        tahun,
        variabel: nilai,
      });
    }
  }

  cachedMock = records;
  return records;
}

/**
 * Titik masuk tunggal untuk data SAPA.
 * Semua route/service HARUS memakai ini, bukan `fetchSapaData()` langsung.
 */
export async function getSapaRecords(): Promise<SapaRecord[]> {
  if (isMockMode()) return buildMockSapaRecords();
  const { records } = await fetchSapaData();
  return records;
}

/** Label sumber data untuk ditampilkan di UI/log. */
export function getDataSourceLabel(): string {
  return isMockMode()
    ? 'DATA CONTOH (USE_MOCK_DATA=true) — bukan angka resmi'
    : 'SAPA Aceh Tengah (api-splp.layanan.go.id)';
}
