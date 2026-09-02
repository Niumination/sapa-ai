// ─── Intent Detection — SAPA-aware ───
// Deteksi intent + match ke data SAPA real (905 records, 35+ OPD)

import { IntentResult } from '@/types';

// ─── Keyword → OPD filter mapping (real SAPA OPD names) ───
const OPD_KEYWORDS: Record<string, string> = {
  'kesehatan': 'Dinas Kesehatan',
  'dinkes': 'Dinas Kesehatan',
  'puskesmas': 'Dinas Kesehatan',
  'stunting': 'Dinas Kesehatan',
  'dbd': 'Dinas Kesehatan',
  'gizi': 'Dinas Kesehatan',
  'rs': 'Rumah Sakit',
  'rsu': 'Rumah Sakit',
  'rumah sakit': 'Rumah Sakit',
  'pendidikan': 'Dinas Pendidikan',
  'sekolah': 'Dinas Pendidikan',
  'guru': 'Dinas Pendidikan',
  'siswa': 'Dinas Pendidikan',
  'paud': 'Dinas Pendidikan',
  'smp': 'Dinas Pendidikan',
  'pertanian': 'Dinas Pertanian',
  'padi': 'Dinas Pertanian',
  'gabah': 'Dinas Pertanian',
  'perkebunan': 'Dinas Perkebunan',
  'kopi': 'Dinas Perkebunan',
  'tembakau': 'Dinas Perkebunan',
  'kakao': 'Dinas Perkebunan',
  'sosial': 'Dinas Sosial',
  'kemiskinan': 'Dinas Sosial',
  'bansos': 'Dinas Sosial',
  'bantuan sosial': 'Dinas Sosial',
  'pkh': 'Dinas Sosial',
  'infrastruktur': 'Pekerjaan Umum',
  'jalan': 'Pekerjaan Umum',
  'jembatan': 'Pekerjaan Umum',
  'irigasi': 'Pekerjaan Umum',
  'pupr': 'Pekerjaan Umum',
  'anggaran': 'Badan Pengelolaan Keuangan',
  'apbd': 'Badan Pengelolaan Keuangan',
  'pajak': 'Badan Pengelolaan Keuangan',
  'pendapatan': 'Badan Pengelolaan Keuangan',
  'kepegawaian': 'Badan Kepegawaian',
  'asn': 'Badan Kepegawaian',
  'pns': 'Badan Kepegawaian',
  'pppk': 'Badan Kepegawaian',
  'perizinan': 'Penanaman Modal',
  'investasi': 'Penanaman Modal',
  'umkm': 'Koperasi dan UKM',
  'koperasi': 'Koperasi dan UKM',
  'wirausaha': 'Koperasi dan UKM',
  'pariwisata': 'Dinas Pariwisata',
  'wisata': 'Dinas Pariwisata',
  'hotel': 'Dinas Pariwisata',
  'perpustakaan': 'Perpustakaan',
  'arsip': 'Perpustakaan',
  'lingkungan': 'Lingkungan Hidup',
  'bencana': 'Penanggulangan Bencana',
  'bpbd': 'Penanggulangan Bencana',
  'dayah': 'Pendidikan Dayah',
  'pesantren': 'Pendidikan Dayah',
  'syariat': 'Syari\'at Islam',
  'zis': 'Baitul Mal',
  'zakat': 'Baitul Mal',
};

// ─── Intent pattern matching ───
const INTENT_PATTERNS: Record<string, RegExp[]> = {
  tren: [
    /tren/i, /perkembangan/i, /perubahan/i, /naik|turun/i,
    /bulan (terakhir|ini)/i, /tahun (terakhir|ini)/i,
    /dalam (3|6|12) (bulan|tahun)/i, /sejak/i,
  ],
  perbandingan: [
    /banding/i, /vs/i, /versus/i, /lebih (tinggi|rendah|besar)/i,
    /dibanding/i, /antar/i, /per (kecamatan|opd|skpk|dinas)/i,
    /tertinggi/i, /terendah/i, /terbanyak/i, /paling/i,
  ],
  ews: [
    /peringatan/i, /warning/i, /alert/i, /ambang/i,
    /kritis/i, /darurat/i, /waspada/i, /melebihi/i,
  ],
  rekomendasi: [
    /rekomendasi/i, /saran/i, /solusi/i, /tindakan/i,
    /apa yang harus/i, /langkah/i, /sebaiknya/i,
  ],
};

/** Detect OPD from query */
export function detectOpd(query: string): string | undefined {
  const q = query.toLowerCase();
  for (const [keyword, opd] of Object.entries(OPD_KEYWORDS)) {
    // Keyword pendek (2 huruf, misal 'rs') hanya match sebagai kata utuh (word boundary)
    if (keyword.length <= 2) {
      const re = new RegExp(`(^|[^a-z])${keyword}([^a-z]|$)`, 'i');
      if (re.test(q)) return opd;
    } else if (q.includes(keyword)) {
      return opd;
    }
  }
  return undefined;
}

/** Detect intent category */
function detectIntentCategory(query: string): IntentResult['kategori'] {
  for (const [kategori, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some(p => p.test(query))) {
      return kategori as IntentResult['kategori'];
    }
  }
  return 'nilai_saat_ini';
}

/** Main intent detection */
export async function detectIntent(query: string): Promise<IntentResult> {
  const opdFilter = detectOpd(query);
  const kategori = detectIntentCategory(query);

  return {
    kategori,
    datasetSlug: opdFilter ? 'sapa' : undefined,
    lokasi: undefined, // SAPA tidak punya data kecamatan-level secara langsung
    butuhData: true,
    intentRaw: kategori,
    // Extend with SAPA-specific filter
    ...(opdFilter && { opdFilter }),
  } as IntentResult & { opdFilter?: string };
}
