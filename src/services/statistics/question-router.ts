// ─── Question Router (WP2.1) ──────────────────────────────────────────────────
// Berbasis skor, bukan first-match. Tidak ada pendek-sirkuit.

import type { Archetype, QuestionPlan, MeasureType, GeoLevel } from '@/lib/statistics/types';
import { resolveConceptId } from '@/lib/statistics/indicator-registry';

// ─── Keyword banks ───────────────────────────────────────────────────────────
const TREND_KW = /tren|perkembangan|naik\s+turun|perubahan\s+dari\s+tahun|dari\s+tahun\s+ke\s+tahun|historis|histori|time\s+series|deret/i;
const COMP_KW  = /bandingkan|perbandingan|\bvs\b|versus|dibanding|antar\s+(kecamatan|desa|opd)|perbedaan/i;
const RANK_KW  = /tertinggi|terendah|terbesar|terkecil|top\s*\d|peringkat|rangking|urutan/i;
const COMP2_KW = /sebaran|proporsi|komposisi|distribusi|breakdown|rincian\s+per/i;
const DIST_KW  = /per\s+(kecamatan|desa|wilayah|opd)\b|setiap\s+kecamatan|masing.masing\s+kecamatan|tiap\s+kecamatan/i;
const CORR_KW  = /hubungan|kaitan|korelasi|pengaruh|dampak|berkaitan/i;
const ANOM_KW  = /anomali|waspada|tidak\s+wajar|outlier|lonjakan|penurunan\s+drastis/i;
const META_KW  = /berapa\s+opd|berapa\s+indikator|fitur\s+apa|bisa\s+tanya\s+apa|sumber\s+data\s+apa|sistem\s+ini|portal\s+ini/i;
const PER_KW   = /\bnik\b|nama\s+lengkap|data\s+pribadi|per\s+orang|individu\s+tertentu/i;
const PERSEN_KW = /persen|\brate\b|prevalensi|proporsi|share|bagian\s+dari|dari\s+total/i;
const GEO_KW   = /kecamatan|desa|wilayah\s+mana|di\s+mana|lokasi/i;

// OPD pendek-sirkuit lama → hapus; gunakan pencocokan indikator
const PERIOD_YEAR_RE = /\b(20\d{2})\b/g;

// ─── Score per archetype ──────────────────────────────────────────────────────
function scoreArchetype(query: string): { archetype: Archetype; score: number; trace: string }[] {
  const q = query;
  const scores: { archetype: Archetype; score: number; trace: string }[] = [
    { archetype: 'personal',      score: PER_KW.test(q)   ? 100 : 0,  trace: 'NIK/pribadi' },
    { archetype: 'meta',          score: META_KW.test(q)  ? 80  : 0,  trace: 'tentang portal' },
    { archetype: 'trend',         score: TREND_KW.test(q) ? 60  : 0,  trace: 'kata tren' },
    { archetype: 'comparison',    score: COMP_KW.test(q)  ? 55  : 0,  trace: 'kata bandingkan' },
    { archetype: 'ranking',       score: RANK_KW.test(q)  ? 50  : 0,  trace: 'kata tertinggi/terendah' },
    { archetype: 'distribution',  score: DIST_KW.test(q)  ? 50  : 0,  trace: 'per kecamatan/desa' },
    { archetype: 'composition',   score: COMP2_KW.test(q) ? 45  : 0,  trace: 'kata sebaran/proporsi' },
    { archetype: 'correlation',   score: CORR_KW.test(q)  ? 45  : 0,  trace: 'kata hubungan/korelasi' },
    { archetype: 'anomaly',       score: ANOM_KW.test(q)  ? 45  : 0,  trace: 'kata anomali/waspada' },
    { archetype: 'level',         score: 10,                           trace: 'default level' },
  ];
  // "persen" tambah skor trend/distribution/composition
  if (PERSEN_KW.test(q)) {
    for (const s of scores) {
      if (['trend', 'distribution', 'composition', 'level'].includes(s.archetype)) {
        s.score += 15;
        s.trace += '+persen';
      }
    }
  }
  return scores.sort((a, b) => b.score - a.score);
}

// ─── Detect geo level ────────────────────────────────────────────────────────
function detectGeoLevel(query: string): GeoLevel {
  if (/\bdesa\b/i.test(query)) return 'desa';
  if (/\bkecamatan\b/i.test(query)) return 'kecamatan';
  return 'kabupaten';
}

// ─── Extract years from query ─────────────────────────────────────────────────
function extractYears(query: string): number[] {
  const matches = [...query.matchAll(PERIOD_YEAR_RE)];
  return [...new Set(matches.map((m) => parseInt(m[1], 10)))].sort();
}

// ─── Main router ─────────────────────────────────────────────────────────────
export function routeQuestion(query: string): QuestionPlan {
  const scored = scoreArchetype(query);
  const best = scored[0];
  const archetype = best.archetype;
  const confidence = Math.min(best.score / 100, 1);

  const trace: string[] = [`archetype=${archetype} (score=${best.score})`];
  if (best.trace) trace.push(best.trace);

  // Concepts: scan query words against registry
  const words = query.split(/\s+/);
  const concepts = new Set<string>();
  for (let i = 0; i < words.length; i++) {
    // try bigrams
    const bigram = words.slice(i, i + 3).join(' ');
    const cid = resolveConceptId(bigram) ?? resolveConceptId(words.slice(i, i + 2).join(' ')) ?? resolveConceptId(words[i]!);
    if (cid) concepts.add(cid);
  }
  if (concepts.size > 0) trace.push(`concepts=[${[...concepts].join(',')}]`);

  // measureNeed
  let measureNeed: MeasureType | null = null;
  if (PERSEN_KW.test(query)) { measureNeed = 'rate_percent'; trace.push('measureNeed=rate_percent'); }

  // period
  const years = extractYears(query);
  const periodReq = years.length > 0 ? { kind: 'year' as const, year: years[0]!, label: String(years[0]) } : null;

  // geo
  const geoLevel = detectGeoLevel(query);
  if (geoLevel !== 'kabupaten') trace.push(`geo=${geoLevel}`);

  // sources: always try all, ordered by freshness
  const sources = ['sapa', 'dtsen-db', 'dtsen-bappeda', 'dok-a', 'dok-b', 'dok-c', 'bapokting'] as const;

  // needs
  const minSeries = archetype === 'trend' ? 3 : 1;
  const minGroup  = ['distribution', 'correlation'].includes(archetype) ? 5 : 1;

  return {
    archetype,
    confidence,
    concepts: [...concepts],
    measureNeed,
    period: { requested: periodReq, available: years.map((y) => ({ kind: 'year', year: y, label: String(y) })) },
    geo: { level: geoLevel },
    compare: { dimension: 'geo', items: [] },
    needs: { minSeriesLength: minSeries, minGroupCount: minGroup },
    sources: [...sources],
    trace,
  };
}
