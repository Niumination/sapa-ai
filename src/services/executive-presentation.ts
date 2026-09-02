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

// ── Helpers untuk P1+P2 ──

function distinct(values: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = (v ?? '').trim();
    if (!t || t === '—' || t === '-') continue;
    // Normalisasi singkat OPD: "Dinas Kesehatan" tetap, "Badan Perencanaan Pembangunan Daerah." → "Bappeda"
    const short = t.replace(/^Badan Perencanaan Pembangunan Daerah\.?$/i, 'Bappeda')
      .replace(/^Dinas Komunikasi dan Informatika$/i, 'Diskominfo');
    if (!seen.has(short)) { seen.add(short); out.push(short); }
  }
  return out;
}

function tahunSummary(evidence: ExecutiveEvidence[]): string {
  const tahuns = distinct(evidence.map((e) => e.tahun));
  if (tahuns.length === 0) return 'tanpa tahun eksplisit';
  if (tahuns.length === 1) return tahuns[0]!;
  const sorted = [...tahuns].sort();
  return sorted.join(', ');
}

function extractTopic(narrative: string): string | null {
  const m = narrative.match(/untuk\s+"([^"]+)"/i) ?? narrative.match(/untuk\s+“([^”]+)”/);
  if (m?.[1]) return m[1].trim();
  const m2 = narrative.match(/Berdasarkan data SAPA untuk\s+([^\.,:]+)/i);
  return m2?.[1] ? m2[1].trim().replace(/\s+menurut.*$/i, '') : null;
}

function shortLabel(indikator: string): string {
  let t = indikator.trim();
  t = t.replace(/^Jumlah\s+/i, '');
  t = t.replace(/\s*\(JAB[^)]*\)\s*/gi, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  // Ambil segmen sebelum koma panjang bila ada
  if (t.length > 44) {
    const cut = t.slice(0, 43);
    const lastSpace = cut.lastIndexOf(' ');
    return `${cut.slice(0, lastSpace > 20 ? lastSpace : 43).trim()}…`;
  }
  return t;
}

function parseNilaiNum(s: string): number | null {
  if (!s || s === '—' || s === '-') return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function rankEvidence(evidence: ExecutiveEvidence[], topic: string | null): ExecutiveEvidence[] {
  if (!topic) return evidence;
  const toks = topic.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (toks.length === 0) return evidence;
  const scored = evidence.map((e, idx) => {
    const ind = e.indikator.toLowerCase();
    let hits = 0;
    for (const t of toks) if (ind.includes(t)) hits++;
    return { e, hits, idx };
  });
  // Prioritaskan yang mengandung topik, baru urutan asli (nilai desc sudah ada)
  scored.sort((a, b) => b.hits - a.hits || a.idx - b.idx);
  return scored.map((s) => s.e);
}

function headlineRekomendasi(topic: string | null, evidence: ExecutiveEvidence[]): string | null {
  const t = (topic ?? '').toLowerCase();
  // Rekomendasi deterministik, tidak mengarang angka — hanya tafsir dari evidence yang ada
  if (t.includes('stunting')) {
    const prev = evidence.find((e) => e.satuan.toLowerCase().includes('persen') && e.indikator.toLowerCase().includes('prevalensi'));
    const n = prev ? parseNilaiNum(prev.nilai) : null;
    if (n !== null && n > 20) return 'prevalensi di atas ambang 20% — rekomendasikan percepatan intervensi gizi spesifik & sensitif bersama Dinkes & Bappeda';
    if (n !== null) return 'prevalensi terkendali — pertahankan intervensi 1000 HPK dan pemantauan rutin';
    return 'rekomendasikan validasi lapangan & pendampingan keluarga berisiko bersama Dinkes';
  }
  if (t.includes('kopi')) return 'potensi ekspor & luas areal kuat — dorong hilirisasi, kemitraan eksportir, dan peremajaan kebun bersama Disbun/Disdag';
  if (t.includes('ipm')) return 'IPM kategori tinggi — pertahankan capaian pendidikan, kesehatan, dan daya beli';
  if (t.includes('pdrb')) return 'dorong diversifikasi sektor dan penguatan PAD berbasis data PDRB terbaru';
  if (t.includes('kemiskinan') || t.includes('miskin')) return 'rekomendasikan pemutakhiran DTKS dan intervensi bantuan tepat sasaran';
  if (t.includes('jalan')) return 'rekomendasikan prioritisasi pemeliharaan & pembangunan jalan sesuai OPD pengampu';
  if (t.includes('putus sekolah') || t.includes('pendidikan')) return 'rekomendasikan intervensi pencegahan putus sekolah & pemantauan APK/APM';
  return null;
}

function buildLead(evidence: ExecutiveEvidence[], answerType: ExecutiveAnswerType, narrative: string): string {
  if (answerType === 'not_available' || evidence.length === 0) {
    const first = narrative.split(/\. +/)[0]?.trim();
    return first ? `${first}.` : 'Data belum dapat disimpulkan — evidence spesifik belum cukup.';
  }
  const topic = extractTopic(narrative);
  // Ranking: jangan ambil evidence[0] mentah (sorted by nilai desc = 16.936 bisa di atas 730 bila query balita+stunting)
  const ranked = rankEvidence(evidence, topic);
  const primary = ranked[0]!;
  // Secondary: satuan berbeda yang juga relevan dengan topik, bukan sekadar baris ke-2
  const secondary = ranked.slice(1).find((e) => e.satuan && e.satuan !== primary.satuan && e.nilai !== '—' && e.nilai !== primary.nilai) ?? null;
  const pLabel = shortLabel(primary.indikator);
  const sLabel = secondary ? shortLabel(secondary.indikator) : '';
  const pPart = `${primary.nilai} ${primary.satuan}`.trim() + ` — ${pLabel}` + (primary.tahun ? ` (${primary.tahun})` : '');
  let conclusion = pPart;
  if (secondary) {
    const sPart = `${secondary.nilai} ${secondary.satuan}`.trim() + ` — ${sLabel}` + (secondary.tahun ? ` (${secondary.tahun})` : '');
    conclusion = `${pPart} · ${sPart}`;
  } else if (ranked.length > 1 && !secondary) {
    conclusion = `${pPart} — ${ranked.length} indikator terkait`;
  }
  if (topic) {
    const topicCap = topic.length <= 30 ? topic : topic.slice(0, 30);
    conclusion = `${topicCap}: ${conclusion}`;
  }
  // Kesimpulan + rekomendasi tindak lanjut (baru): headline menjawab apa adanya, lalu memberi arah aksi
  const rekom = headlineRekomendasi(topic, ranked);
  if (rekom) conclusion = `${conclusion} — ${rekom}`;
  const opds = distinct(ranked.map((e) => e.opd));
  const opdPart = opds.length === 0 ? 'lintas OPD' : opds.length <= 2 ? opds.join(' & ') : `${opds.slice(0, 2).join(', ')} +${opds.length - 2} OPD`;
  const coverage = ranked.filter((e) => e.tahun && e.tahun !== '—').length;
  const tahunExtra = coverage < ranked.length ? ` · ${coverage}/${ranked.length} bertahun` : '';
  let lead = `${conclusion} — ${ranked.length} indikator · ${opdPart}${tahunExtra}`;
  if (lead.length > 320) lead = `${lead.slice(0, 317)}…`;
  return lead;
}

function buildInsights(response: HybridResponse, answerType: ExecutiveAnswerType, evidenceCount: number, evidence: ExecutiveEvidence[]): ExecutiveInsight[] {
  const insights: ExecutiveInsight[] = [];
  if (evidenceCount > 0) {
    const withTahun = evidence.filter((e) => e.tahun && e.tahun !== '—').length;
    if (withTahun === evidenceCount) {
      insights.push({ tone: 'ok', label: 'Keriangan tahun', text: `Semua ${evidenceCount} evidence mencantumkan tahun (${tahunSummary(evidence)}).` });
    } else if (withTahun > 0) {
      insights.push({ tone: 'info', label: 'Keriangan tahun', text: `${withTahun}/${evidenceCount} evidence bertahun (${tahunSummary(evidence)}); ${evidenceCount - withTahun} tanpa tahun — tafsirkan sebagai snapshot terbaru.` });
    } else {
      insights.push({ tone: 'warn', label: 'Keriangan tahun', text: 'Tidak ada evidence yang mencantumkan tahun — perlakukan sebagai potret terbaru, bukan tren.' });
    }
  } else {
    insights.push({ tone: 'warn', label: 'Batas data', text: 'Evidence spesifik belum cukup; AI menahan kesimpulan yang berisiko menyesatkan.' });
  }

  // Bentuk analisis — spesifik satuan/OPD
  if (answerType === 'trend') {
    insights.push({ tone: 'info', label: 'Bentuk analisis', text: 'Data disajikan sebagai perubahan antar-periode; periksa kesamaan indikator dan satuan.' });
  } else if (evidenceCount > 1) {
    const satuans = distinct(evidence.map((e) => e.satuan));
    if (satuans.length > 1) {
      insights.push({ tone: 'warn', label: 'Satuan campur', text: `Evidence memakai ${satuans.length} satuan berbeda (${satuans.slice(0, 3).join(', ')}). Bandingkan hanya yang satuannya sama.` });
    } else {
      insights.push({ tone: 'info', label: 'Bentuk analisis', text: `Perbandingan ${evidenceCount} indikator dengan satuan seragam (${satuans[0] ?? '—'}).` });
    }
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

function buildQuickWins(response: HybridResponse, answerType: ExecutiveAnswerType, evidence: ExecutiveEvidence[]): ExecutiveQuickWin[] {
  const existing = Array.isArray(response.rekomendasi)
    ? response.rekomendasi.filter((item) => typeof item === 'string' && item.trim()).slice(0, 3)
    : [];

  // P2: perkaya dengan OPD aktual dari evidence, bukan "OPD pengampu" generik
  const opds = distinct(evidence.map((e) => e.opd));
  const primaryOpd = opds[0] ?? 'OPD pengampu';
  const secondaryOpd = opds[1];

  if (existing.length > 0) {
    return existing.map((action, index) => ({
      title: `Tindak lanjut ${index + 1}`,
      action,
      owner: index === 0 ? primaryOpd : index === 1 && secondaryOpd ? secondaryOpd : 'Tim terkait',
      horizon: 'Tindak lanjut terdekat',
    }));
  }

  if (answerType === 'not_available') {
    return [
      { title: 'Minta evidence pembanding', action: 'Lengkapi indikator, periode, atau wilayah yang dibutuhkan sebelum menarik kesimpulan.', owner: primaryOpd, horizon: 'Brief berikutnya' },
      { title: 'Simpan alasan belum tersedia', action: 'Jadikan batas data sebagai agenda tindak lanjut, bukan sebagai angka nol.', owner: 'Pengelola data', horizon: 'Tindak lanjut terdekat' },
      { title: 'Jalankan ulang query setelah data masuk', action: 'Gunakan pertanyaan yang sama agar perubahan dapat ditelusuri secara konsisten.', owner: 'Tim data', horizon: 'Siklus berikutnya' },
    ];
  }

  // Deterministik: quick wins kontekstual berdasarkan OPD & tahun
  const tahun = tahunSummary(evidence);
  return [
    { title: `Validasi dengan ${primaryOpd}`, action: `Konfirmasi definisi indikator & satuan dengan ${primaryOpd} sebelum dipakai di rapat pimpinan.`, owner: primaryOpd, horizon: '0–7 hari' },
    { title: 'Jadikan baseline', action: `Simpan snapshot ${tahun} ini sebagai baseline; bandingkan saat SAPA update berikutnya.`, owner: secondaryOpd ?? 'Pengelola data', horizon: 'Siklus berikutnya' },
    { title: 'Telusuri evidence sumber', action: 'Buka rincian Indikator/Nilai/OPD/Tahun di tabel untuk klarifikasi atau bahan laporan.', owner: 'Tim analitik', horizon: 'Saat dibutuhkan' },
  ];
}

function buildDataQuality(response: HybridResponse, answerType: ExecutiveAnswerType, evidenceCount: number, evidence: ExecutiveEvidence[]) {
  const withTahun = evidence.filter((e) => e.tahun && e.tahun !== '—').length;
  const tahunText = evidenceCount === 0 ? '—'
    : withTahun === 0 ? 'Tanpa tahun'
    : withTahun === evidenceCount ? `${withTahun}/${evidenceCount} · ${tahunSummary(evidence)}`
    : `${withTahun}/${evidenceCount} bertahun · ${tahunSummary(evidence)}`;
  const tahunStatus: 'ok' | 'info' | 'warn' = withTahun === evidenceCount ? 'ok' : withTahun === 0 ? 'warn' : 'info';
  return [
    { label: 'Evidence', status: evidenceCount > 0 ? 'ok' as const : 'warn' as const, text: evidenceCount > 0 ? `${evidenceCount} baris` : 'Belum cukup' },
    { label: 'Sumber', status: response.dataSource ? 'ok' as const : 'warn' as const, text: response.dataSource ? 'Tercantum' : 'Tidak tercantum' },
    { label: 'Visual', status: answerType === 'not_available' ? 'info' as const : 'ok' as const, text: answerType === 'not_available' ? 'Ditahan dengan alasan' : 'Sesuai bentuk data' },
    { label: 'Tahun/periode', status: tahunStatus, text: tahunText },
  ];
}

function buildFollowUps(answerType: ExecutiveAnswerType, evidence: ExecutiveEvidence[]): string[] {
  const opds = distinct(evidence.map((e) => e.opd));
  const tahuns = distinct(evidence.map((e) => e.tahun)).sort();
  if (answerType === 'not_available') {
    return opds.length > 0
      ? [`Coba: ${opds[0]}`, 'Tampilkan indikator terkait', 'Persempit periode pertanyaan']
      : ['Tampilkan snapshot yang tersedia', 'Data apa yang masih kurang?', 'Persempit periode pertanyaan'];
  }
  if (opds.length > 1 && tahuns.length > 1) return [`Filter hanya ${opds[0]}`, `Bandingkan ${tahuns[0]} vs ${tahuns[tahuns.length - 1]}`, 'Buat ringkasan satu halaman'];
  if (opds.length > 1) return [`Filter hanya ${opds[0]}`, `Bandingkan ${opds[0]} vs ${opds[1]}`, 'Tampilkan tren per tahun'];
  if (tahuns.length > 1) return [`Fokus tahun ${tahuns[tahuns.length - 1]}`, `Bandingkan ${tahuns[0]} vs ${tahuns[tahuns.length - 1]}`, 'Tampilkan per OPD'];
  // Default kontekstual: sisipkan indikator utama bila ada
  const hint = evidence[0]?.indikator ? evidence[0].indikator.slice(0, 28) : '';
  if (hint) return [`Tampilkan rincian: ${hint}`, 'Periksa tahun dan satuan', 'Buat ringkasan satu halaman'];
  switch (answerType) {
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
  const lead = buildLead(evidence, answerType, primaryLead);
  const presentation: ExecutivePresentation = {
    version: 'v1',
    answerType,
    title,
    lead,
    narrative: primaryLead || 'Tidak ada narasi yang dapat ditampilkan.',
    metrics,
    visual,
    insights: buildInsights(response, answerType, evidence.length, evidence),
    quickWins: buildQuickWins(response, answerType, evidence),
    dataQuality: buildDataQuality(response, answerType, evidence.length, evidence),
    evidence,
    followUps: buildFollowUps(answerType, evidence),
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
