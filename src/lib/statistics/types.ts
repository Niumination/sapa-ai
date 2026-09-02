// ─── Semantic Layer — Type Definitions (WP1.1) ───────────────────────────────
// Single source of truth untuk taksonomi metrik, periode, geografi, sumber.

export type MeasureType =
  | 'count'          // cacahan: jiwa, KK, unit, orang, kasus
  | 'rate_percent'   // punya penyebut eksplisit: prevalensi, persen, cakupan
  | 'ratio'          // punya penyebut, bukan persen: rasio, per kapita
  | 'index'          // skala 0–100 tanpa satuan fisik: IPM, indeks
  | 'currency'       // Rp
  | 'area'           // ha, km²
  | 'length'         // km, m
  | 'weight'         // ton, kg
  | 'duration'       // tahun, bulan
  | 'temperature'
  | 'other';

export type PeriodKind = 'none' | 'year' | 'quarter' | 'month' | 'point_in_time';

export interface Period {
  kind: PeriodKind;
  year?: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: number;
  asOf?: string;
  label: string;
}

export type GeoLevel = 'kabupaten' | 'kecamatan' | 'desa';

export interface Geo {
  level: GeoLevel;
  kabupaten?: string;
  kecamatan?: string;
  desa?: string;
}

export type SourceId =
  | 'sapa'
  | 'dtsen-bappeda'
  | 'dtsen-splp'
  | 'dtsen-db'
  | 'dtsen-demo'
  | 'dok-a'
  | 'dok-b'
  | 'dok-c'
  | 'bapokting';

export interface SourceRef {
  id: SourceId;
  label: string;
  releaseNumber?: string;
  asOf?: string;
  isDemo?: boolean;
  recordRef?: string;
}

export interface QualityFlags {
  hasPeriod: boolean;
  hasGeo: boolean;
  hasDenominator: boolean;
  isZero: boolean;
  isPlausible: boolean;
  warnings: string[];
}

export interface Metric {
  id: string;
  conceptId: string;
  label: string;
  measure: MeasureType;
  value: number;
  valueRaw: string;
  unitCanonical: string;
  unitRaw: string;
  period: Period;
  geo: Geo;
  numerator?: Metric;
  denominator?: Metric;
  opd: string;
  source: SourceRef;
  quality: QualityFlags;
}

// ─── Question Router Types (WP2) ─────────────────────────────────────────────

export type Archetype =
  | 'level'        // "berapa X"
  | 'trend'        // "tren / perkembangan / naik turun"
  | 'comparison'   // "bandingkan / vs / antar"
  | 'composition'  // "sebaran / proporsi / komposisi"
  | 'distribution' // "per kecamatan / per desa"
  | 'ranking'      // "tertinggi / terendah / top N"
  | 'correlation'  // "hubungan / kaitan / pengaruh"
  | 'anomaly'      // "waspada / tidak wajar / outlier"
  | 'meta'         // tentang portal
  | 'personal'     // NIK / per-orang → defleksi
  | 'unanswerable';

export interface QuestionPlan {
  archetype: Archetype;
  confidence: number;
  concepts: string[];
  measureNeed: MeasureType | null;
  period: { requested: Period | null; available: Period[] };
  geo: { level: GeoLevel; filter?: Geo };
  compare: { dimension: 'geo' | 'opd' | 'concept' | 'period'; items: string[] };
  needs: {
    denominatorConcept?: string;
    minSeriesLength: number;
    minGroupCount: number;
  };
  sources: SourceId[];
  trace: string[];
}
