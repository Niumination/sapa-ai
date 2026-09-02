// ─── WP7.1 — toMetrics produsen Metric[] per sumber ────────────────────────────
// Aturan: measure wajib benar, pakai parseNumericId, unitCanonical wajib,
// period wajib, geo.level wajib, numerator/denominator bila rate_percent.

import { parseNumericId } from '@/lib/parse-numeric';
import { normalizeUnit } from './normalize';
import { resolveConceptId } from './indicator-registry';
import { sapaRecordToMetric, parsePeriod, type SapaRecord as MetricSapaRecord } from './metric';
import type { SapaRecord } from '@/lib/sapa-client';
import type { Metric, MeasureType, Period, Geo, SourceRef, QualityFlags } from './types';
import type { AgregatRow } from '@/services/dtsen-import';
import type { BapoktingStats } from '@/lib/bapokting-stats';

function inferMeasure(unitCanon: string): MeasureType {
  if (unitCanon === 'persen') return 'rate_percent';
  if (unitCanon === 'rupiah') return 'currency';
  if (unitCanon === 'indeks') return 'index';
  if (['ha', 'km2'].includes(unitCanon)) return 'area';
  if (unitCanon === 'km') return 'length';
  if (['ton', 'kg'].includes(unitCanon)) return 'weight';
  return 'count';
}

function makeQuality(value: number | null, period: Period, geo: Geo): QualityFlags {
  const hasPeriod = period.kind !== 'none';
  return {
    hasPeriod,
    hasGeo: true,
    hasDenominator: false,
    isZero: value === 0,
    isPlausible: value !== null && value >= 0,
    warnings: [
      ...(!hasPeriod ? ['Periode tidak tersedia'] : []),
      ...(value === null ? ['Nilai tidak ter-parse'] : []),
    ],
  };
}

// ─── Sapa ────────────────────────────────────────────────────────────────────
export function metricsFromSapa(rows: SapaRecord[]): Metric[] {
  return rows.map((r) => {
    const geo: Geo = { level: 'kabupaten', kabupaten: 'Aceh Tengah' };
    return sapaRecordToMetric(
      { id: r.id ?? 0, nama: r.kode_indikator_nama_indikator ?? '', opd: r.opds_nama_opd ?? '', nilai: r.variabel ?? '', nilaiNumber: parseNumericId(r.variabel ?? '') ?? 0, satuan: r.satuan ?? '', tahun: r.tahun ?? null },
      geo,
    );
  });
}

// ─── DTSEN agregat ───────────────────────────────────────────────────────────
export function metricsFromDtsen(rows: AgregatRow[]): Metric[] {
  const out: Metric[] = [];
  for (const r of rows) {
    const period: Period = { kind: 'point_in_time', label: 'DTSEN-BAPPEDA Des 2025', asOf: '2025-12' };
    const geoJiwa: Geo = r.desa ? { level: 'desa', kabupaten: 'Aceh Tengah', kecamatan: r.kecamatan, desa: r.desa } : { level: 'kecamatan', kabupaten: 'Aceh Tengah', kecamatan: r.kecamatan };
    const conceptJiwa = `dtsen.desil-${r.desil}.jiwa`;
    const qJiwa = makeQuality(r.jumlahJiwa, period, geoJiwa);
    out.push({
      id: `dtsen:${r.kecamatan}:${r.desa}:${r.desil}:jiwa`,
      conceptId: conceptJiwa,
      label: `DTSEN desil ${r.desil} — jiwa`,
      measure: 'count',
      value: r.jumlahJiwa,
      valueRaw: String(r.jumlahJiwa),
      unitCanonical: 'jiwa',
      unitRaw: 'jiwa',
      period,
      geo: geoJiwa,
      opd: 'DTSEN-BAPPEDA',
      source: { id: 'dtsen-bappeda', label: 'DTSEN-BAPPEDA Des 2025' },
      quality: qJiwa,
    });
    // keluarga sebagai metric terpisah (measure sama tapi label beda — tidak dicampur di fusion bila conceptId beda)
    const conceptKeluarga = `dtsen.desil-${r.desil}.keluarga`;
    out.push({
      id: `dtsen:${r.kecamatan}:${r.desa}:${r.desil}:keluarga`,
      conceptId: conceptKeluarga,
      label: `DTSEN desil ${r.desil} — keluarga`,
      measure: 'count',
      value: r.jumlahKeluarga,
      valueRaw: String(r.jumlahKeluarga),
      unitCanonical: 'keluarga',
      unitRaw: 'keluarga',
      period,
      geo: geoJiwa,
      opd: 'DTSEN-BAPPEDA',
      source: { id: 'dtsen-bappeda', label: 'DTSEN-BAPPEDA Des 2025' },
      quality: makeQuality(r.jumlahKeluarga, period, geoJiwa),
    });
  }
  return out;
}

// ─── Excel Dokumen A/B/C (agregat bebas-PII) ─────────────────────────────────
export interface ExcelDocJson {
  judul: string;
  opd: string;
  dokumen: string;
  sumber_file?: string;
  ringkasan?: Record<string, unknown>;
  per_kecamatan?: Array<{ kecamatan: string; jumlah: number }>;
  per_jenis_kelamin?: Array<{ jenis_kelamin: string; jumlah: number }>;
  metadata?: { periode?: string; satuan?: string };
}

function parseExcelPeriod(meta?: { periode?: string }): Period {
  if (!meta?.periode) return { kind: 'none', label: 'Tidak diketahui' };
  const p = meta.periode.trim();
  // "2026-07" → month
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (m) return { kind: 'month', year: parseInt(m[1]!, 10), month: parseInt(m[2]!, 10) as any, label: p };
  // "2023" → year
  const y = parseInt(p, 10);
  if (String(y) === p && y >= 2000 && y <= 2100) return { kind: 'year', year: y, label: p };
  return { kind: 'point_in_time', asOf: p, label: p };
}

export function metricsFromExcelDoc(doc: ExcelDocJson): Metric[] {
  const period = parseExcelPeriod(doc.metadata);
  const unitRaw = doc.metadata?.satuan ?? '';
  const unitCanon = normalizeUnit(unitRaw) || 'other';
  const measure = inferMeasure(unitCanon);
  const docId = `dok-${(doc.dokumen ?? 'x').toLowerCase()}`;
  const source: SourceRef = { id: docId as any, label: doc.judul ?? doc.sumber_file ?? 'Dokumen Excel' };
  const out: Metric[] = [];

  // per_kecamatan → satu metric per baris (count balita)
  for (const row of doc.per_kecamatan ?? []) {
    const geo: Geo = { level: 'kecamatan', kabupaten: 'Aceh Tengah', kecamatan: row.kecamatan };
    const conceptId = resolveConceptId(doc.judul) ?? `excel:${doc.dokumen}:kecamatan`;
    const val = row.jumlah;
    out.push({
      id: `excel:${doc.dokumen}:${row.kecamatan}`,
      conceptId,
      label: `${doc.judul} — ${row.kecamatan}`,
      measure,
      value: val,
      valueRaw: String(val),
      unitCanonical: unitCanon,
      unitRaw,
      period,
      geo,
      opd: doc.opd ?? '',
      source,
      quality: makeQuality(val, period, geo),
    });
  }
  // per_jenis_kelamin bila ada — geo kabupaten, konsep terpisah
  for (const row of doc.per_jenis_kelamin ?? []) {
    const geo: Geo = { level: 'kabupaten', kabupaten: 'Aceh Tengah' };
    const conceptId = `${resolveConceptId(doc.judul) ?? `excel:${doc.dokumen}`}:jk-${row.jenis_kelamin}`;
    out.push({
      id: `excel:${doc.dokumen}:jk:${row.jenis_kelamin}`,
      conceptId,
      label: `${doc.judul} — JK ${row.jenis_kelamin}`,
      measure,
      value: row.jumlah,
      valueRaw: String(row.jumlah),
      unitCanonical: unitCanon,
      unitRaw,
      period,
      geo,
      opd: doc.opd ?? '',
      source,
      quality: makeQuality(row.jumlah, period, geo),
    });
  }
  // ringkasan.total bila tidak ada per_kecamatan (fallback)
  if (out.length === 0 && doc.ringkasan) {
    const total = (doc.ringkasan as any).total_balita_stunting ?? (doc.ringkasan as any).total ?? null;
    if (typeof total === 'number') {
      const geo: Geo = { level: 'kabupaten', kabupaten: 'Aceh Tengah' };
      const conceptId = resolveConceptId(doc.judul) ?? `excel:${doc.dokumen}:total`;
      out.push({
        id: `excel:${doc.dokumen}:total`,
        conceptId,
        label: doc.judul,
        measure,
        value: total,
        valueRaw: String(total),
        unitCanonical: unitCanon,
        unitRaw,
        period,
        geo,
        opd: doc.opd ?? '',
        source,
        quality: makeQuality(total, period, geo),
      });
    }
  }
  return out;
}

// ─── Bapokting ───────────────────────────────────────────────────────────────
export function metricsFromBapokting(stats: BapoktingStats): Metric[] {
  const out: Metric[] = [];
  const period: Period = { kind: 'point_in_time', label: 'Bapokting hari ini', asOf: new Date().toISOString().slice(0, 10) };
  for (const [nama, s] of Object.entries(stats.komoditas ?? {})) {
    const geo: Geo = { level: 'kabupaten', kabupaten: 'Aceh Tengah' };
    const conceptId = `bapokting:${nama.toLowerCase().replace(/\s+/g, '-')}`;
    out.push({
      id: `bapokting:${nama}`,
      conceptId,
      label: `Harga ${nama}`,
      measure: 'currency',
      value: s.hargaCurrent,
      valueRaw: String(s.hargaCurrent),
      unitCanonical: 'rupiah',
      unitRaw: 'Rp',
      period,
      geo,
      opd: 'Bapokting',
      source: { id: 'bapokting', label: 'Bapokting SPLP' },
      quality: makeQuality(s.hargaCurrent, period, geo),
    });
  }
  return out;
}
