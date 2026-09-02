// ─── Executive Presentation Adapter ────────────────────────────────────────
// Pure, backward-compatible adapter dari HybridResponse lama ke model presentasi
// eksekutif. Tidak melakukan fetch, LLM, Prisma, atau mengubah angka.

import type {
  ExecutiveAnswerType,
  ExecutiveEvidence,
  ExecutiveInsight,
  ExecutiveMetric,
  ExecutivePresentation,
  ExecutiveQuickWin,
  ExecutiveVisual,
  HybridResponse,
} from '@/types';

type AnyRecord = Record<string, unknown>;

const PALETTE = ['#1B4332', '#2D6A4F', '#A15C38', '#8A6E1D', '#3F6D87', '#B3261E'];

function asText(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};
}

function isUnavailableText(text: string): boolean {
  return /tidak (ditemukan|tersedia)|belum tersedia|tidak cukup|tidak dapat disimpulkan|gagal memformat/i.test(text);
}

function normalizeColumns(columns: unknown): { key: string; name: string }[] {
  if (!Array.isArray(columns)) return [];
  return columns.map((column, index) => {
    if (typeof column === 'string') return { key: column, name: column };
    const obj = asRecord(column);
    const key = asText(obj.key ?? obj.name, `kolom_${index + 1}`);
    const name = asText(obj.name ?? obj.key, key);
    return { key, name };
  });
}

function readCell(row: unknown, column: { key: string; name: string }, index: number): unknown {
  if (Array.isArray(row)) return row[index];
  const obj = asRecord(row);
  return obj[column.key] ?? obj[column.name];
}

function normalizeRows(rows: unknown, columns: { key: string; name: string }[]): AnyRecord[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const normalized: AnyRecord = {};
    columns.forEach((column, index) => {
      normalized[column.key] = readCell(row, column, index) ?? '—';
    });
    return normalized;
  });
}

function normalizeSeries(series: unknown, fallbackKeys: string[]): { key: string; name: string; color: string }[] {
  const raw = Array.isArray(series) ? series : [];
  const mapped = raw.map((entry, index) => {
    if (typeof entry === 'string') {
      return { key: entry, name: entry, color: PALETTE[index % PALETTE.length] };
    }
    const obj = asRecord(entry);
    const key = asText(obj.key ?? obj.name, `series_${index + 1}`);
    return {
      key,
      name: asText(obj.name ?? obj.label, key),
      color: asText(obj.color, PALETTE[index % PALETTE.length]),
    };
  });
  if (mapped.length > 0) return mapped;
  return fallbackKeys.map((key, index) => ({ key, name: key, color: PALETTE[index % PALETTE.length] }));
}

function toEvidenceFromMetrics(metrics: ExecutiveMetric[]): ExecutiveEvidence[] {
  return metrics.slice(0, 30).map((metric, index) => ({
    id: `metric:${index}`,
    indikator: asText(metric.label),
    nilai: asText(metric.value),
    satuan: asText(metric.unit, ''),
    opd: metric.opd,
    tahun: metric.tahun ?? null,
  }));
}

function toEvidenceFromTable(
  rows: AnyRecord[],
  columns: { key: string; name: string }[],
): ExecutiveEvidence[] {
  return rows.slice(0, 30).map((row, index) => {
    const values = columns.map((column) => asText(row[column.key], '—'));
    return {
      id: `row:${index}`,
      indikator: values[0] ?? `Baris ${index + 1}`,
      nilai: values[1] ?? '—',
      satuan: values[2] ?? '',
      opd: values[3],
      tahun: values[4] && values[4] !== '—' ? values[4] : null,
    };
  });
}

function toEvidenceFromChart(
  data: AnyRecord[],
  xKey: string,
  series: { key: string; name: string; color: string }[],
): ExecutiveEvidence[] {
  return data.slice(0, 30).flatMap((row, rowIndex) =>
    series.slice(0, 4).map((item) => ({
      id: `chart:${rowIndex}:${item.key}`,
      indikator: asText(row[xKey], `Baris ${rowIndex + 1}`),
      nilai: asText(row[item.key]),
      satuan: '',
      opd: undefined,
      tahun: null,
    })),
  );
}

function inferAnswerType(response: HybridResponse, evidenceCount: number): ExecutiveAnswerType {
  const narrative = response.narasi ?? '';
  if (isUnavailableText(narrative) && response.visualisasi?.tipe === 'none') return 'not_available';

  const tipe = response.visualisasi?.tipe;
  const cfg = asRecord(response.visualisasi?.konfigurasi);
  if (tipe === 'metric') return 'metric';
  if (tipe === 'table') return evidenceCount > 1 ? 'table' : 'metric';
  if (tipe === 'map') return 'map';
  if (tipe === 'chart') {
    const chartType = asText(cfg.type ?? cfg.jenis, 'bar').toLowerCase();
    if (chartType === 'line' || chartType === 'area') return 'trend';
    if (/sebaran|distribusi|tahun|periode/i.test(`${asText(cfg.title, '')} ${narrative}`)) return 'distribution';
    return 'comparison';
  }
  return isUnavailableText(narrative) ? 'not_available' : 'table';
}

function buildMetrics(response: HybridResponse): ExecutiveMetric[] {
  const cfg = asRecord(response.visualisasi?.konfigurasi);
  const rawMetrics = Array.isArray(cfg.metrics) ? cfg.metrics : [];
  if (rawMetrics.length > 0) {
    return rawMetrics.slice(0, 6).map((raw) => {
      const metric = asRecord(raw);
      const value = metric.value ?? metric.nilai;
      return {
        label: asText(metric.label ?? metric.nama, 'Nilai'),
        value: typeof value === 'string' || typeof value === 'number' ? value : '—',
        unit: asText(metric.unit ?? metric.satuan, ''),
        opd: typeof metric.opd === 'string' ? metric.opd : undefined,
        tahun: typeof metric.tahun === 'string' ? metric.tahun : null,
      };
    });
  }

  if (response.visualisasi?.tipe === 'table') {
    const columns = normalizeColumns(cfg.columns ?? cfg.kolom);
    const rows = normalizeRows(cfg.rows ?? cfg.baris, columns);
    return toEvidenceFromTable(rows, columns).slice(0, 3).map((item) => ({
      label: item.indikator,
      value: item.nilai,
      unit: item.satuan,
      opd: item.opd,
      tahun: item.tahun,
    }));
  }

  return [];
}

function buildVisual(response: HybridResponse): ExecutiveVisual {
  const tipe = response.visualisasi?.tipe ?? 'none';
  const cfg = asRecord(response.visualisasi?.konfigurasi);

  if (tipe === 'metric') {
    return {
      type: 'metric',
      title: 'Nilai utama',
      subtitle: 'Ringkasan indikator dari evidence yang dipilih',
      data: [],
      series: [],
      columns: [],
      rows: [],
    };
  }

  if (tipe === 'table') {
    const columns = normalizeColumns(cfg.columns ?? cfg.kolom);
    const rows = normalizeRows(cfg.rows ?? cfg.baris, columns);
    return {
      type: 'table',
      title: asText(cfg.title, 'Evidence yang dipakai'),
      subtitle: 'Baris terpilih dari respons SAPA',
      data: [],
      series: [],
      columns,
      rows,
    };
  }

  if (tipe === 'chart') {
    const rawData = Array.isArray(cfg.data) ? cfg.data.map(asRecord) : [];
    const xKey = asText(cfg.xKey ?? cfg.sumbuX, 'name');
    const rawSeries = cfg.lines ?? cfg.garis ?? cfg.bars;
    const fallbackKeys = rawData.length > 0
      ? Object.keys(rawData[0]).filter((key) => key !== xKey && typeof rawData[0][key] !== 'string')
      : [];
    const series = normalizeSeries(rawSeries, fallbackKeys);
    const chartType = asText(cfg.type ?? cfg.jenis, 'bar').toLowerCase();
    const type = chartType === 'line' || chartType === 'area' ? chartType : 'bar';
    return {
      type,
      title: asText(cfg.title, type === 'bar' ? 'Perbandingan data' : 'Perubahan data'),
      subtitle: 'Visual dibentuk dari nilai pada evidence',
      data: rawData,
      xKey,
      series,
      columns: [],
      rows: [],
    };
  }

  if (tipe === 'map') {
    return { type: 'map', title: 'Peta data', subtitle: 'Gunakan peta GIS untuk detail spasial', data: [], series: [], columns: [], rows: [] };
  }

  return { type: 'none', title: 'Visual belum tersedia', subtitle: 'Evidence belum cukup untuk visual yang aman', data: [], series: [], columns: [], rows: [] };
}

function buildInsights(response: HybridResponse, answerType: ExecutiveAnswerType, evidenceCount: number): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  if (evidenceCount > 0) {
    insights.push({ tone: 'ok', label: 'Terjawab', text: 'Jawaban dirakit dari evidence yang terstruktur, bukan dari angka bebas.' });
  } else {
    insights.push({ tone: 'warn', label: 'Batas data', text: 'Evidence spesifik belum cukup; AI menahan kesimpulan yang berisiko menyesatkan.' });
  }

  if (answerType === 'trend') {
    insights.push({ tone: 'info', label: 'Bentuk analisis', text: 'Data disajikan sebagai perubahan antar-periode; periksa kesamaan indikator dan satuan.' });
  } else if (answerType === 'distribution') {
    insights.push({ tone: 'info', label: 'Bentuk analisis', text: 'Data dikelompokkan sebagai distribusi, bukan peringkat kinerja.' });
  } else if (answerType === 'comparison') {
    insights.push({ tone: 'info', label: 'Bentuk analisis', text: 'Nilai ditampilkan untuk membantu perbandingan pada dimensi yang sama.' });
  } else if (answerType === 'not_available') {
    insights.push({ tone: 'info', label: 'Langkah data', text: 'Ajukan periode, indikator, atau wilayah yang lebih spesifik untuk memperkaya evidence.' });
  } else {
    insights.push({ tone: 'info', label: 'Bentuk analisis', text: 'Metric utama diletakkan di depan agar cepat dipakai dalam briefing.' });
  }

  if (!response.dataSource) {
    insights.push({ tone: 'warn', label: 'Provenance', text: 'Sumber data belum tercantum pada respons.' });
  } else {
    insights.push({ tone: 'ok', label: 'Provenance', text: 'Sumber dan waktu respons ditampilkan di panel audit trail.' });
  }
  return insights.slice(0, 3);
}

function buildQuickWins(response: HybridResponse, answerType: ExecutiveAnswerType): ExecutiveQuickWin[] {
  const existing = Array.isArray(response.rekomendasi)
    ? response.rekomendasi.filter((item) => typeof item === 'string' && item.trim()).slice(0, 3)
    : [];

  if (existing.length > 0) {
    return existing.map((action, index) => ({
      title: `Tindak lanjut ${index + 1}`,
      action,
      owner: 'OPD pengampu',
      horizon: 'Tindak lanjut terdekat',
    }));
  }

  if (answerType === 'not_available') {
    return [
      { title: 'Minta evidence pembanding', action: 'Lengkapi indikator, periode, atau wilayah yang dibutuhkan sebelum menarik kesimpulan.', owner: 'OPD pengampu', horizon: 'Brief berikutnya' },
      { title: 'Simpan alasan belum tersedia', action: 'Jadikan batas data sebagai agenda tindak lanjut, bukan sebagai angka nol.', owner: 'Pengelola data', horizon: 'Tindak lanjut terdekat' },
      { title: 'Jalankan ulang query setelah data masuk', action: 'Gunakan pertanyaan yang sama agar perubahan dapat ditelusuri secara konsisten.', owner: 'Tim data', horizon: 'Siklus berikutnya' },
    ];
  }

  return [
    { title: 'Validasi definisi indikator', action: 'Pastikan nama indikator, satuan, produsen, dan periode dipahami sama sebelum dipakai dalam rapat.', owner: 'OPD pengampu', horizon: '0–7 hari' },
    { title: 'Jadikan jawaban sebagai baseline', action: 'Simpan snapshot ini dan bandingkan dengan pembaruan SAPA berikutnya.', owner: 'Pengelola data', horizon: 'Siklus berikutnya' },
    { title: 'Telusuri evidence sumber', action: 'Buka rincian evidence bila diperlukan untuk klarifikasi atau bahan laporan.', owner: 'Tim analitik', horizon: 'Saat dibutuhkan' },
  ];
}

function buildDataQuality(response: HybridResponse, answerType: ExecutiveAnswerType, evidenceCount: number) {
  return [
    { label: 'Evidence', status: evidenceCount > 0 ? 'ok' as const : 'warn' as const, text: evidenceCount > 0 ? 'Tersedia' : 'Belum cukup' },
    { label: 'Sumber', status: response.dataSource ? 'ok' as const : 'warn' as const, text: response.dataSource ? 'Tercantum' : 'Tidak tercantum' },
    { label: 'Visual', status: answerType === 'not_available' ? 'info' as const : 'ok' as const, text: answerType === 'not_available' ? 'Ditahan dengan alasan' : 'Sesuai bentuk data' },
    { label: 'Tahun/periode', status: 'info' as const, text: 'Ikuti metadata evidence' },
  ];
}

function buildFollowUps(answerType: ExecutiveAnswerType): string[] {
  switch (answerType) {
    case 'not_available': return ['Tampilkan snapshot yang tersedia', 'Data apa yang masih kurang?', 'Persempit periode pertanyaan'];
    case 'trend': return ['Tampilkan tabel per periode', 'Periksa indikator pembanding', 'Buat ringkasan satu halaman'];
    case 'distribution': return ['Tampilkan rincian per OPD', 'Cari metadata yang kosong', 'Buat agenda perbaikan data'];
    case 'comparison': return ['Tampilkan evidence detail', 'Filter berdasarkan tahun', 'Buat ringkasan satu halaman'];
    default: return ['Tampilkan indikator terkait', 'Periksa tahun dan satuan', 'Buat ringkasan satu halaman'];
  }
}

function detectOrigin(dataSource: string): 'direct' | 'splp' | 'unknown' {
  const lower = dataSource.toLowerCase();
  if (lower.includes('api-splp')) return 'splp';
  if (lower.includes('sapa.acehtengahkab.go.id')) return 'direct';
  return 'unknown';
}

export function buildExecutivePresentation(response: HybridResponse): ExecutivePresentation {
  const metrics = buildMetrics(response);
  const visual = buildVisual(response);
  let evidence: ExecutiveEvidence[] = [];

  if (visual.type === 'table') evidence = toEvidenceFromTable(visual.rows, visual.columns);
  else if (visual.type === 'metric') evidence = toEvidenceFromMetrics(metrics);
  else if ((visual.type === 'bar' || visual.type === 'line' || visual.type === 'area') && visual.xKey) {
    evidence = toEvidenceFromChart(visual.data, visual.xKey, visual.series);
  }

  const answerType = inferAnswerType(response, evidence.length);
  const title = visual.title !== 'Nilai utama' && visual.title !== 'Visual belum tersedia'
    ? visual.title
    : metrics[0]?.label ?? (answerType === 'not_available' ? 'Data belum dapat disimpulkan' : 'Ringkasan jawaban SAPA');
  const primaryLead = (response.narasi ?? '').trim();
  const lead = primaryLead.length > 320 ? `${primaryLead.slice(0, 317)}…` : primaryLead;
  const presentation: ExecutivePresentation = {
    version: 'v1',
    answerType,
    title,
    lead: lead || 'Ringkasan data belum tersedia.',
    narrative: primaryLead || 'Tidak ada narasi yang dapat ditampilkan.',
    metrics,
    visual,
    insights: buildInsights(response, answerType, evidence.length),
    quickWins: buildQuickWins(response, answerType),
    dataQuality: buildDataQuality(response, answerType, evidence.length),
    evidence,
    followUps: buildFollowUps(answerType),
    provenance: {
      source: response.dataSource || 'Sumber tidak tercantum',
      origin: detectOrigin(response.dataSource || ''),
      fetchedAt: response.timestamp,
      evidenceCount: evidence.length,
    },
  };
  return presentation;
}

function isExecutivePresentation(value: unknown): value is ExecutivePresentation {
  const object = asRecord(value);
  const visual = asRecord(object.visual);
  const provenance = asRecord(object.provenance);
  return (
    object.version === 'v1' &&
    typeof object.title === 'string' &&
    typeof object.lead === 'string' &&
    typeof object.narrative === 'string' &&
    Array.isArray(object.metrics) &&
    Array.isArray(object.insights) &&
    Array.isArray(object.quickWins) &&
    Array.isArray(object.dataQuality) &&
    Array.isArray(object.evidence) &&
    Array.isArray(object.followUps) &&
    (visual.type === 'metric' || visual.type === 'bar' || visual.type === 'line' || visual.type === 'area' || visual.type === 'table' || visual.type === 'map' || visual.type === 'none') &&
    Array.isArray(visual.data) &&
    Array.isArray(visual.series) &&
    Array.isArray(visual.columns) &&
    Array.isArray(visual.rows) &&
    typeof provenance.source === 'string' &&
    typeof provenance.fetchedAt === 'string' &&
    typeof provenance.evidenceCount === 'number'
  );
}

export function getExecutivePresentation(response: HybridResponse): ExecutivePresentation {
  if (isExecutivePresentation(response.presentation)) return response.presentation;
  return buildExecutivePresentation(response);
}

export { normalizeColumns, normalizeRows, readCell };
