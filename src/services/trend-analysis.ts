// ─── Tren & Perbandingan Deterministik (PR Lapis 2) — murni, tanpa IO ───
// Dua kemampuan yang selama ini dijanjikan UI tapi mustahil di pipeline lama:
//   1. TREN: dibangun dari baris multi-tahun yang MEMANG ADA di payload SAPA
//      (135+ indikator punya >1 titik tahun) — sebelumnya dibuang agregasi.
//   2. PERBANDINGAN antar-OPD: deteksi ≥2 nama OPD nyata di query, bandingkan
//      secara deterministik — sebelumnya hanya OPD pertama yang dipakai.
// Keduanya dijawab TANPA LLM: angka dijamin dari sumber, latensi ~0.

import { HybridResponse } from '@/types';
import { dataSourceLabel, normalizeText, type SapaDataOrigin, type SapaRecord } from '@/lib/sapa-client';

// ─── TREN ───

export interface TrendPoint {
  tahun: string;
  nilai: string;
  nilaiNumber: number;
}

export interface TrendCandidate {
  idKodeIndikator: number;
  indikator: string;
  opd: string;
  satuan: string;
  series: TrendPoint[]; // urut tahun naik, ≥2 titik
}

function toNumber(nilai: string): number | null {
  const n = Number(String(nilai).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Deret waktu satu indikator dari baris mentah (hanya tahun & nilai valid).
 * Tahun yang sama didedupe (pertahankan kemunculan pertama = relevansi
 * retrieval tertinggi) — payload SAPA nyata punya baris duplikat satu-tahun
 * dengan dua nilai berbeda ("2025: 13,45" vs "2025: 13,62") yang kalau
 * dibiarkan menghasilkan tren semu "dari 2025 ke 2025".
 */
export function buildIndicatorSeries(records: SapaRecord[], idKodeIndikator: number): TrendPoint[] {
  const byYear = new Map<string, TrendPoint>();
  for (const r of records) {
    if (r.id_kode_indikator !== idKodeIndikator) continue;
    const tahun = (r.tahun ?? '').trim();
    if (!/^\d{4}$/.test(tahun)) continue;
    const n = toNumber(r.variabel);
    if (n === null) continue;
    if (!byYear.has(tahun)) byYear.set(tahun, { tahun, nilai: r.variabel, nilaiNumber: n });
  }
  return [...byYear.values()].sort((a, b) => a.tahun.localeCompare(b.tahun));
}

/**
 * Kandidat tren teratas dari hasil retrieval: indikator pertama (urutan input
 * sudah berdasar relevansi) yang punya ≥2 titik tahun. null jika tidak ada.
 */
export function findTrendCandidate(filteredData: SapaRecord[]): TrendCandidate | null {
  const seen = new Set<number>();
  for (const r of filteredData) {
    const id = r.id_kode_indikator;
    if (seen.has(id)) continue;
    seen.add(id);
    const series = buildIndicatorSeries(filteredData, id);
    if (series.length >= 2) {
      return {
        idKodeIndikator: id,
        indikator: (r.kode_indikator_nama_indikator ?? '').trim(),
        opd: r.opds_nama_opd.trim(),
        satuan: r.satuan ?? '',
        series,
      };
    }
  }
  return null;
}

/** true bila query bernada tren */
export function isTrendQuery(query: string): boolean {
  return /(tren|perkembangan|perubahan|fluktuasi|naik|turun|meningkat|menurun|dari tahun)/i.test(query);
}

/**
 * Jawaban JUJUR saat query tren tapi indikator hasil retrieval tidak punya ≥2
 * tahun berbeda (kasus umum SAPA: mayoritas indikator hanya 1 titik tahun).
 * Lebih baik menyatakan keterbatasan + menyajikan nilai terakhir daripada
 * melempar kata "tren" ke LLM — itu undangan halusinasi tren.
 * null bila tidak ada indikator sama sekali (biar jalur evidence-kosong SoT
 * yang menjawab).
 */
export function buildTrendUnavailableResponse(
  filteredData: SapaRecord[],
  origin: SapaDataOrigin,
): HybridResponse | null {
  const first = filteredData.find((r) => (r.kode_indikator_nama_indikator ?? '').trim());
  if (!first) return null;
  const series = buildIndicatorSeries(filteredData, first.id_kode_indikator);
  const years = series.map((p) => p.tahun);
  const nama = (first.kode_indikator_nama_indikator ?? '').trim();
  const opd = first.opds_nama_opd.trim();
  const satuan = (first.satuan ?? '').trim();
  const tahunStr = years.length > 0 ? years.join(', ') : 'tahun tidak tercantum di payload';
  const nilaiStr =
    series.length > 0
      ? ` Nilai terakhir: ${series[series.length - 1].nilai} ${satuan} (${years[years.length - 1]}).`
      : ` Nilai tercatat: ${first.variabel} ${satuan} (tahun tidak tercantum).`;
  const narasi =
    `Tren historis untuk "${nama}" (${opd}) belum bisa dihitung: portal SAPA hanya memuat ` +
    `${years.length || 1} titik tahun (${tahunStr}), sehingga perbandingan antar-tahun tidak tersedia.${nilaiStr} ` +
    `Dilaporkan apa adanya dari data sumber — tanpa tafsiran tren oleh AI.`;
  return {
    narasi,
    visualisasi: { tipe: 'none', konfigurasi: {} },
    rekomendasi: [],
    dataSource: dataSourceLabel(origin),
    timestamp: new Date().toISOString(),
  };
}

export function buildTrendResponse(query: string, cand: TrendCandidate, origin: SapaDataOrigin): HybridResponse {
  const first = cand.series[0];
  const last = cand.series[cand.series.length - 1];
  const rel = first.nilaiNumber !== 0 ? (last.nilaiNumber - first.nilaiNumber) / Math.abs(first.nilaiNumber) : null;
  const arah = rel === null ? 'berubah' : rel > 0.001 ? 'naik' : rel < -0.001 ? 'turun' : 'relatif stabil';
  const perjalanan = cand.series.map((p) => `${p.tahun}: ${p.nilai}`).join('; ');
  const narasi =
    `Tren "${cand.indikator}" (${cand.opd}) menurut data SAPA: ${perjalanan} ${cand.satuan}. ` +
    `Dari ${first.tahun} ke ${last.tahun} nilai ${arah}${rel === null ? '' : ` sebesar ${rel >= 0 ? '+' : ''}${(rel * 100).toFixed(1)}%`} — ` +
    `dihitung deterministik dari ${cand.series.length} titik data, tanpa penafsiran AI.`;
  return {
    narasi,
    visualisasi: {
      tipe: 'chart',
      konfigurasi: {
        type: 'line',
        xKey: 'tahun',
        data: cand.series.map((p) => ({ tahun: p.tahun, nilai: p.nilaiNumber })),
        lines: ['nilai'],
      },
    },
    rekomendasi: [],
    dataSource: dataSourceLabel(origin),
    timestamp: new Date().toISOString(),
  };
}

// ─── PERBANDINGAN ANTAR-OPD ───

// Kata generik dalam nama OPD yang tidak membedakan.
const OPD_GENERIC_WORDS = new Set([
  'dinas', 'badan', 'kantor', 'sekretariat', 'dan', 'daerah', 'kabupaten',
  'rumah', 'sakit', 'umum', 'satuan', 'polisi', 'pamong', 'praja', 'wilayatul',
  'hisbah', 'perencanaan', 'pembangunan', 'pengelolaan', 'pemberdayaan', 'penanaman',
]);

// Alias umum → fragmen nama OPD (normalized)
export const OPD_ALIASES: Record<string, string> = {
  dinkes: 'kesehatan',
  disdikbud: 'pendidikan kebudayaan',
  disdik: 'pendidikan kebudayaan',
  bappeda: 'badan perencanaan',
  bpbd: 'penanggulangan bencana',
  dinsos: 'sosial',
  pupr: 'pekerjaan umum',
  dpupr: 'pekerjaan umum',
  disbun: 'perkebunan',
  distan: 'pertanian',
  dishub: 'perhubungan',
  diskominfo: 'komunikasi informatika',
  dpmptsp: 'penanaman modal',
  pmi: 'penanaman modal',
  disparekraf: 'pariwisata',
  dispar: 'pariwisata',
  bkpsdm: 'kepegawaian',
  bpkad: 'pengelolaan keuangan',
  dinkop: 'koperasi',
  rsud: 'rumah sakit',
  dpmk: 'pemberdayaan masyarakat kampung',
  dp3a: 'keluarga berencana',
  dkb: 'keluarga berencana',
};

function significantWords(opdName: string): Set<string> {
  return new Set(
    normalizeText(opdName)
      .split(' ')
      .filter((w) => w.length >= 3 && !OPD_GENERIC_WORDS.has(w)),
  );
}

/**
 * Deteksi OPD yang disebut dalam query berdasarkan NAMA NYATA (bukan peta
 * keyword hardcoded). Skema rasio: cocok penuh bila semua kata signifikan nama
 * OPD hadir; toleransi setengah-cocok (rasio ≥ 0,5, kata terpanjang ≥5 huruf)
 * untuk penyebutan parsial lazim ("dinas pendidikan" → "Dinas Pendidikan dan
 * Kebudayaan"). Alias umum (dinkes, disdik, bappeda, ...) juga dikenali.
 * Maksimal 4 OPD agar tabel pembanding tetap terbaca.
 */
export function detectOpdsInQuery(query: string, opdNames: string[]): string[] {
  const q = normalizeText(query);
  const qWords = new Set(q.split(' ').filter(Boolean));

  const aliasHits: string[] = [];
  for (const [alias, fragment] of Object.entries(OPD_ALIASES)) {
    if (new RegExp(`(^|[^a-z])${alias}([^a-z]|$)`, 'i').test(q)) aliasHits.push(fragment);
  }

  const scored: { name: string; present: number; total: number; ratio: number; aliasHit: boolean }[] = [];
  for (const name of opdNames) {
    const normName = normalizeText(name);
    const aliasHit = aliasHits.some((frag) => frag.split(' ').every((w) => normName.includes(w)));
    const sig = [...significantWords(name)];
    if (sig.length === 0 && !aliasHit) continue;
    const presentWords = sig.filter((w) => qWords.has(w));
    const ratio = sig.length > 0 ? presentWords.length / sig.length : 0;
    const maxLen = presentWords.reduce((m, w) => Math.max(m, w.length), 0);
    if (aliasHit || ratio === 1 || (ratio >= 0.5 && maxLen >= 5)) {
      scored.push({ name, present: presentWords.length, total: sig.length, ratio, aliasHit });
    }
  }

  return scored
    .sort((a, b) => {
      const alias = Number(b.aliasHit) - Number(a.aliasHit);
      if (alias !== 0) return alias;
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return b.present - a.present;
    })
    .slice(0, 4)
    .map((s) => s.name);
}

export function isComparisonQuery(query: string): boolean {
  return /(banding|dibanding|perbandingan|vs\b|versus|antar|tertinggi|terendah|terbanyak|paling)/i.test(query);
}

export interface OpdComparisonRow {
  nama: string;
  jumlahData: number;
  indikatorUnik: number;
  nilaiTeratas: { indikator: string; nilai: string; satuan: string; tahun: string | null } | null;
}

export function buildOpdComparisonRows(matches: string[], records: SapaRecord[]): OpdComparisonRow[] {
  return matches.map((nama) => {
    const rows = records.filter((r) => normalizeText(r.opds_nama_opd) === normalizeText(nama));
    const uniqueIndicators = new Set(rows.map((r) => r.id_kode_indikator)).size;
    let top: OpdComparisonRow['nilaiTeratas'] = null;
    let topN = -Infinity;
    for (const r of rows) {
      const n = toNumber(r.variabel);
      if (n !== null && n > topN) {
        topN = n;
        top = {
          indikator: (r.kode_indikator_nama_indikator ?? '').trim(),
          nilai: r.variabel,
          satuan: r.satuan ?? '',
          tahun: r.tahun,
        };
      }
    }
    return { nama, jumlahData: rows.length, indikatorUnik: uniqueIndicators, nilaiTeratas: top };
  });
}

export function buildComparisonResponse(
  matches: string[],
  rows: OpdComparisonRow[],
  origin: SapaDataOrigin,
): HybridResponse {
  const parts = rows.map((r) => `${r.nama}: ${r.jumlahData} data indikator (${r.indikatorUnik} jenis)`);
  const topNotes = rows
    .filter((r) => r.nilaiTeratas)
    .map((r) => {
      const t = r.nilaiTeratas!;
      const tahunStr = t.tahun && /^\d{4}$/.test(t.tahun.trim()) ? t.tahun.trim() : 'tahun tidak tercantum';
      return `nilai teratas di ${r.nama}: ${t.indikator} = ${t.nilai} ${t.satuan} (${tahunStr})`;
    });
  const narasi =
    `Perbandingan ${rows.length} OPD menurut katalog SAPA (dihitung deterministik): ${parts.join('; ')}. ` +
    (topNotes.length ? `Sebagai konteks, ${topNotes.join('; ')}.` : '');
  return {
    narasi,
    visualisasi: {
      tipe: 'table',
      konfigurasi: {
        columns: ['OPD', 'Jumlah Data', 'Indikator Unik', 'Indikator Nilai Teratas', 'Nilai', 'Satuan', 'Tahun'],
        rows: rows.map((r) => [
          r.nama,
          String(r.jumlahData),
          String(r.indikatorUnik),
          r.nilaiTeratas?.indikator ?? '-',
          r.nilaiTeratas?.nilai ?? '-',
          r.nilaiTeratas?.satuan ?? '-',
          r.nilaiTeratas?.tahun ?? '-',
        ]),
      },
    },
    rekomendasi: [],
    dataSource: dataSourceLabel(origin),
    timestamp: new Date().toISOString(),
  };
}
