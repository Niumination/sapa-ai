// ─── Meta-Query — jawaban statistik portal secara deterministik (PR Lapis 1) ───
// Pertanyaan tentang PORTAL itu sendiri (daftar OPD, total data, sebaran tahun)
// tidak memerlukan LLM: jawab langsung dari agregat. Hasilnya instan (<1 s),
// bebas halusinasi, dan memperbaiki chip homepage yang sebelumnya dijamin gagal.

import { HybridResponse } from '@/types';
import {
  dataSourceLabel,
  getUniqueIndicators,
  getUniqueOpd,
  normalizeText,
  type SapaDataOrigin,
  type SapaRecord,
} from '@/lib/sapa-client';

export type MetaKind = 'daftar_opd' | 'statistik_portal' | 'sebaran_tahun';

// Kata-kata "pembungkus" pertanyaan meta — bukan topik substantif.
const META_STOPWORDS = new Set([
  'apa', 'apakah', 'saja', 'yang', 'ada', 'di', 'ke', 'dari', 'untuk', 'dan', 'atau',
  'berapa', 'jumlah', 'banyaknya', 'total', 'semua', 'seluruh', 'keseluruhan',
  'sapa', 'data', 'rekam', 'record', 'indikator', 'opd', 'skpd', 'skpk',
  'perangkat', 'daerah', 'organisasi', 'instansi', 'dinas', 'badan', 'kantor',
  'kabupaten', 'aceh', 'tengah', 'portal', 'sistem', 'statistik', 'ringkasan',
  'sebaran', 'distribusi', 'tahun', 'waktu', 'periode', 'per', 'dalam', 'ini',
  'tolong', 'tampilkan', 'perlihatkan', 'sebutkan', 'mohon', 'dong', 'coba',
  'list', 'daftar', 'tersedia', 'tercatat', 'terdaftar', 'saat', 'terkini', 'sekarang',
  'bagaimana', 'gimana', 'kapan', 'mengapa', 'kenapa', 'siapa', 'dimana', 'kemana',
  'apakah', 'sudahkah', 'bagaimanakah', 'boleh', 'minta',
]);

function contentWords(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter((w) => w && !META_STOPWORDS.has(w) && !/^\d+$/.test(w));
}

/**
 * Deteksi pertanyaan meta tentang portal (bukan tentang data substantif).
 * Syarat ketat: tidak boleh ada kata konten di luar kata pembungkus meta —
// * supaya "berapa jumlah ASN" TIDAK terklasifikasi meta.
 */
export function detectMetaQuery(query: string): MetaKind | null {
  const q = normalizeText(query);
  const words = contentWords(q);
  if (words.length > 0) return null; // ada topik substantif → jalur evidence biasa

  const mentionsOpd = /\b(opd|skpd|skpk|perangkat daerah|organisasi|instansi)\b/.test(q);
  const asks = /(apa saja|daftar|semua|berapa|tampilkan|list|sebutkan|mana saja)/.test(q);
  if (mentionsOpd && asks) return 'daftar_opd';

  const sebaranTahun = /(sebaran|distribusi)/.test(q) && /(tahun|waktu|periode)/.test(q);
  if (sebaranTahun) return 'sebaran_tahun';

  if (/(statistik|ringkasan|berapa|total|jumlah)/.test(q)) return 'statistik_portal';

  return null;
}

export function buildMetaResponse(
  kind: MetaKind,
  records: SapaRecord[],
  origin: SapaDataOrigin,
): HybridResponse {
  const base = {
    rekomendasi: [],
    dataSource: dataSourceLabel(origin),
    timestamp: new Date().toISOString(),
  };

  if (kind === 'daftar_opd') {
    const opds = getUniqueOpd(records);
    const top5 = opds.slice(0, 5).map((o) => `${o.nama} (${o.jumlah})`).join(', ');
    return {
      ...base,
      narasi: `SAPA mencatat ${opds.length} OPD aktif di Kabupaten Aceh Tengah. Lima dengan jumlah data indikator terbanyak: ${top5}. Tabel di bawah memuat seluruhnya.`,
      visualisasi: {
        tipe: 'table',
        konfigurasi: {
          columns: ['Nama OPD', 'Jumlah Data Indikator'],
          rows: opds.map((o) => [o.nama, String(o.jumlah)]),
        },
      },
    };
  }

  if (kind === 'sebaran_tahun') {
    const yearMap = new Map<string, number>();
    for (const r of records) {
      const y = (r.tahun ?? '').trim();
      yearMap.set(y || 'Tidak tercantum', (yearMap.get(y || 'Tidak tercantum') ?? 0) + 1);
    }
    const entries = [...yearMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const listed = entries.map(([t, n]) => `${t}: ${n}`).join('; ');
    return {
      ...base,
      narasi: `Sebaran ${records.length} data indikator SAPA menurut tahun (${entries.length} kelompok): ${listed}.`,
      visualisasi: {
        tipe: 'chart',
        konfigurasi: {
          type: 'bar',
          xKey: 'tahun',
          data: entries.map(([tahun, n]) => ({ tahun, jumlah: n })),
          bars: ['jumlah'],
        },
      },
    };
  }

  // statistik_portal
  const opds = getUniqueOpd(records);
  const indicators = getUniqueIndicators(records);
  return {
    ...base,
    narasi:
      `Portal SAPA Kabupaten Aceh Tengah saat ini memuat ${records.length} data indikator ` +
      `dari ${opds.length} OPD, mencakup ${indicators.length} jenis indikator unik. ` +
      `Angka ini dihitung langsung dari respons API SAPA pada saat permintaan.`,
    visualisasi: {
      tipe: 'metric',
      konfigurasi: {
        metrics: [
          { label: 'Total Data Indikator', value: records.length, unit: 'rekam data' },
          { label: 'OPD Terdaftar', value: opds.length, unit: 'OPD' },
          { label: 'Indikator Unik', value: indicators.length, unit: 'jenis indikator' },
        ],
      },
    },
  };
}
