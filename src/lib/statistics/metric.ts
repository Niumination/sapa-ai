// ─── MetricFactory: SapaRecord → Metric (WP1.5) ──────────────────────────────
// Satu titik konversi: apapun sumbernya → Metric berdimensi + ber-provenance.

import { parseNumericId } from '@/lib/parse-numeric';
import { normalizeUnit } from './normalize';
import { resolveConceptId } from './indicator-registry';
import type { Metric, MeasureType, Period, Geo, SourceRef, QualityFlags } from './types';

// ─── Infer measure dari satuan kanonik ───────────────────────────────────────
function inferMeasure(unitCanon: string): MeasureType {
  if (unitCanon === 'persen') return 'rate_percent';
  if (unitCanon === 'rupiah') return 'currency';
  if (unitCanon === 'indeks') return 'index';
  if (['ha', 'km2'].includes(unitCanon)) return 'area';
  if (unitCanon === 'km') return 'length';
  if (['ton', 'kg'].includes(unitCanon)) return 'weight';
  return 'count';
}

// ─── Infer period dari string tahun ──────────────────────────────────────────
export function parsePeriod(tahun: string | null | undefined): Period {
  if (!tahun) return { kind: 'none', label: 'Tidak diketahui' };
  const y = parseInt(tahun, 10);
  if (Number.isInteger(y) && y >= 2000 && y <= 2100) {
    return { kind: 'year', year: y, label: String(y) };
  }
  return { kind: 'point_in_time', asOf: tahun, label: tahun };
}

// ─── Factory dari satu record SAPA ───────────────────────────────────────────
export interface SapaRecord {
  id: number;
  nama: string;
  opd: string;
  nilai: string;
  nilaiNumber: number;
  satuan: string;
  tahun: string | null;
}

export function sapaRecordToMetric(r: SapaRecord, geo: Geo): Metric {
  const unitCanon = normalizeUnit(r.satuan);
  const measure = inferMeasure(unitCanon);
  const conceptId = resolveConceptId(r.nama) ?? `sapa:${r.id}`;
  const period = parsePeriod(r.tahun);
  const nilaiNumber = parseNumericId(r.nilai) ?? r.nilaiNumber;

  const quality: QualityFlags = {
    hasPeriod: period.kind !== 'none',
    hasGeo: true,
    hasDenominator: false,
    isZero: nilaiNumber === 0,
    isPlausible: nilaiNumber >= 0,
    warnings: [
      ...(!period.kind || period.kind === 'none' ? ['Tahun tidak tersedia'] : []),
      ...(nilaiNumber === 0 ? ['Nilai nol'] : []),
    ],
  };

  const source: SourceRef = {
    id: 'sapa',
    label: `SAPA Aceh Tengah${period.kind === 'year' && period.year ? ` ${period.year}` : ''}`,
    recordRef: String(r.id),
  };

  return {
    id: `sapa:${r.id}:${period.label}`,
    conceptId,
    label: r.nama,
    measure,
    value: nilaiNumber,
    valueRaw: r.nilai,
    unitCanonical: unitCanon,
    unitRaw: r.satuan,
    period,
    geo,
    opd: r.opd,
    source,
    quality,
  };
}

// ─── Factory dari evidence item (grounding) ───────────────────────────────────
export interface EvidenceItem {
  id: number | string;
  indikator: string;
  nilai: string;
  satuan: string;
  tahun?: string | null;
  opd: string;
  kecamatan?: string;
}

export function evidenceToMetric(e: EvidenceItem, sourceId: SourceRef['id'] = 'sapa'): Metric {
  const unitCanon = normalizeUnit(e.satuan);
  const measure = inferMeasure(unitCanon);
  const conceptId = resolveConceptId(e.indikator) ?? `evidence:${e.id}`;
  const period = parsePeriod(e.tahun);
  const nilaiNumber = parseNumericId(e.nilai) ?? 0;

  const geo: Geo = e.kecamatan
    ? { level: 'kecamatan', kabupaten: 'Aceh Tengah', kecamatan: e.kecamatan }
    : { level: 'kabupaten', kabupaten: 'Aceh Tengah' };

  const quality: QualityFlags = {
    hasPeriod: period.kind !== 'none',
    hasGeo: !!e.kecamatan,
    hasDenominator: false,
    isZero: nilaiNumber === 0,
    isPlausible: nilaiNumber >= 0,
    warnings: [
      ...(!period.kind || period.kind === 'none' ? ['Tahun tidak tersedia'] : []),
      ...(nilaiNumber === 0 ? ['Nilai nol'] : []),
    ],
  };

  return {
    id: `${sourceId}:${e.id}`,
    conceptId,
    label: e.indikator,
    measure,
    value: nilaiNumber,
    valueRaw: e.nilai,
    unitCanonical: unitCanon,
    unitRaw: e.satuan,
    period,
    geo,
    opd: e.opd,
    source: { id: sourceId, label: e.opd },
    quality,
  };
}
