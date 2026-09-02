// ─── WP7.3 — buildVizFromMetrics: pisah tabel per measure + geo.level ─────────
import type { Metric } from './types';
import type { HybridResponse } from '@/types';

export function buildVizFromMetrics(metrics: Metric[]): HybridResponse['visualisasi'] {
  if (metrics.length === 0) return { tipe: 'none', konfigurasi: {} };

  const groups = new Map<string, Metric[]>();
  for (const m of metrics) {
    const key = `${m.measure}|${m.geo.level}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  const tables = Array.from(groups.entries()).map(([key, ms]) => {
    const [measure, geoLevel] = key.split('|');
    const rows = ms.slice(0, 20).map((m) => [
      m.label,
      m.value.toLocaleString('id-ID'),
      m.unitCanonical,
      m.opd,
      m.period.label,
    ]);
    return {
      title: `${geoLevel === 'kecamatan' ? 'Per kecamatan' : geoLevel === 'desa' ? 'Per desa' : 'Kabupaten'} · ${measure} · ${ms[0]?.unitCanonical ?? ''}`,
      columns: ['Indikator', 'Nilai', 'Satuan', 'OPD', 'Periode'],
      rows,
    };
  });

  if (tables.length === 1) {
    const t = tables[0]!;
    return { tipe: 'table', konfigurasi: { columns: t.columns, rows: t.rows, title: t.title } };
  }

  return {
    tipe: 'table',
    konfigurasi: {
      columns: ['Kelompok', 'Indikator', 'Nilai', 'Satuan', 'OPD', 'Periode'],
      rows: tables.flatMap((t) => t.rows.map((r) => [t.title, ...r])),
    },
  };
}
