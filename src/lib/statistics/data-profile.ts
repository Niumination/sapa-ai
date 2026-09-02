// ─── Data Profile (WP4.4) ────────────────────────────────────────────────────
// Metadata ringkas dari sekumpulan Metric: sumber, satuan, tahun, geo.
// Dipakai UI + observability + narrative.

import type { Metric } from './types';

export interface DataProfile {
  metricCount: number;
  conceptIds: string[];
  sources: { id: string; label: string }[];
  unitCanonicals: string[];
  unitRaws: string[];
  yearRange: { min: number | null; max: number | null };
  geoLevels: string[];
  hasDemo: boolean;
  hasDiscrepancy: boolean;
}

export function buildDataProfile(metrics: Metric[], hasDiscrepancy = false): DataProfile {
  const conceptIds = [...new Set(metrics.map(m => m.conceptId))];
  const sources = [...new Map(metrics.map(m => [m.source.id, { id: m.source.id, label: m.source.label }])).values()];
  const unitCanonicals = [...new Set(metrics.map(m => m.unitCanonical).filter(Boolean))];
  const unitRaws = [...new Set(metrics.map(m => m.unitRaw).filter(Boolean))];
  const years = metrics.map(m => m.period.year).filter((y): y is number => typeof y === 'number');
  const yearMin = years.length ? Math.min(...years) : null;
  const yearMax = years.length ? Math.max(...years) : null;
  const geoLevels = [...new Set(metrics.map(m => m.geo.level))];
  const hasDemo = metrics.some(m => m.source.isDemo);

  return {
    metricCount: metrics.length,
    conceptIds,
    sources,
    unitCanonicals,
    unitRaws,
    yearRange: { min: yearMin, max: yearMax },
    geoLevels,
    hasDemo,
    hasDiscrepancy,
  };
}
