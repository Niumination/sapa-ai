'use client';

import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { ExecutivePresentation, HybridResponse } from '@/types';
import { getExecutivePresentation } from '@/services/executive-presentation';

interface Props {
  response: HybridResponse;
  onFollowUp?: (query: string) => void;
}

const TYPE_LABEL: Record<ExecutivePresentation['answerType'], string> = {
  metric: 'Nilai utama',
  comparison: 'Perbandingan',
  distribution: 'Distribusi',
  trend: 'Tren',
  not_available: 'Batas data',
  table: 'Evidence terpilih',
  map: 'Data spasial',
};

const STATUS_STYLES = {
  ok: { dot: 'bg-[#52B788]', text: 'text-[#2D6A4F]' },
  info: { dot: 'bg-[#3F6D87]', text: 'text-[#3F6D87]' },
  warn: { dot: 'bg-[#A15C38]', text: 'text-[#A15C38]' },
} as const;

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('id-ID');
  return String(value);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || 'Waktu tidak tercantum';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(value: unknown, length = 28): string {
  const text = formatCell(value);
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** Parse number formats commonly returned by SAPA without changing displayed text. */
function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!raw || raw === '-' || raw === '.' || raw === ',') return null;

  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = raw.replace(',', '.');
  } else if ((raw.match(/\./g) ?? []).length > 1) {
    normalized = raw.replace(/\./g, '');
  }
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function AnswerBadge({ presentation }: { presentation: ExecutivePresentation }) {
  const originLabel = presentation.provenance.origin === 'direct'
    ? 'Direct API'
    : presentation.provenance.origin === 'splp'
      ? 'Fallback SPLP'
      : 'Sumber SAPA';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4E6D6] bg-[#EDF4ED] px-2.5 py-1 text-[10px] font-bold text-[#1B4332]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#52B788]" />
        Evidence terstruktur
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
        {TYPE_LABEL[presentation.answerType]}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-card)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
        {originLabel}
      </span>
    </div>
  );
}

function PrimaryMetric({ presentation }: { presentation: ExecutivePresentation }) {
  const metric = presentation.metrics[0];
  const unavailable = presentation.answerType === 'not_available';
  return (
    <div className="mt-5 flex flex-wrap items-end gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Headline</p>
        <p className={`mt-1 text-4xl font-black tracking-[-0.06em] md:text-6xl ${unavailable ? 'text-[#A15C38]' : 'text-[var(--brand)]'}`}>
          {unavailable ? 'Belum tersedia' : metric ? formatCell(metric.value) : '—'}
        </p>
      </div>
      {metric?.unit && !unavailable && <p className="pb-1 text-sm font-bold text-[var(--text-body)]">{metric.unit}</p>}
      <div className="ml-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 md:ml-auto">
        <p className="text-[9px] text-[var(--text-muted)]">Tipe jawaban</p>
        <p className="mt-0.5 text-xs font-bold text-[var(--brand)]">{TYPE_LABEL[presentation.answerType]}</p>
      </div>
    </div>
  );
}

function MetricGrid({ presentation }: { presentation: ExecutivePresentation }) {
  if (presentation.metrics.length === 0) return null;
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {presentation.metrics.slice(0, 6).map((metric, index) => (
        <div key={`${metric.label}-${index}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-3.5">
          <p className="line-clamp-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{metric.label}</p>
          <p className="mt-2 text-xl font-black tracking-tight text-[var(--brand)]">{formatCell(metric.value)}</p>
          {metric.unit && <p className="mt-1 text-[10px] text-[var(--text-muted)]">{metric.unit}</p>}
        </div>
      ))}
    </div>
  );
}

type ChartTooltipProps = Partial<Pick<TooltipContentProps, 'active' | 'payload' | 'label'>>;

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-bold text-[var(--brand)]">{formatCell(label)}</p>
      {payload.map((item, index) => (
        <p key={`${item.dataKey ?? item.name ?? 'series'}-${index}`} style={{ color: item.color ?? item.stroke ?? item.fill }}>
          {formatCell(item.name ?? item.dataKey)}: {formatCell(item.value)}
        </p>
      ))}
    </div>
  );
}

function ChartView({ presentation }: { presentation: ExecutivePresentation }) {
  const visual = presentation.visual;
  const chartData = useMemo(() => {
    if (!visual.xKey) return [];
    return visual.data.map((row) => {
      const next: Record<string, unknown> = { ...row };
      visual.series.forEach((series) => {
        const numeric = numericValue(row[series.key]);
        next[series.key] = numeric ?? row[series.key] ?? null;
      });
      return next;
    });
  }, [visual.data, visual.series, visual.xKey]);

  if (!visual.xKey || chartData.length === 0 || visual.series.length === 0) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-5 text-center text-xs text-[var(--text-muted)]">
        Data numerik belum cukup untuk menggambar visual secara aman.
      </div>
    );
  }

  const common = { data: chartData, margin: { top: 8, right: 12, left: 4, bottom: 35 } };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#D9E0D6" />
      <XAxis dataKey={visual.xKey} tickFormatter={(value) => truncate(value)} angle={-18} textAnchor="end" height={55} tick={{ fontSize: 10, fill: '#6F7D73' }} stroke="#9AA69C" />
      <YAxis tick={{ fontSize: 10, fill: '#6F7D73' }} stroke="#9AA69C" />
      <Tooltip content={<ChartTooltip />} />
    </>
  );

  return (
    <div className="h-[320px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        {visual.type === 'line' ? (
          <LineChart {...common}>
            {axes}
            {visual.series.map((series) => <Line key={series.key} type="monotone" dataKey={series.key} name={series.name} stroke={series.color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />)}
          </LineChart>
        ) : visual.type === 'area' ? (
          <AreaChart {...common}>
            {axes}
            {visual.series.map((series, index) => <Area key={series.key} type="monotone" dataKey={series.key} name={series.name} stroke={series.color} fill={index === 0 ? `${series.color}33` : `${series.color}1A`} strokeWidth={2.5} />)}
          </AreaChart>
        ) : (
          <BarChart {...common}>
            {axes}
            {visual.series.map((series) => <Bar key={series.key} dataKey={series.key} name={series.name} fill={series.color} radius={[5, 5, 0, 0]} maxBarSize={46} />)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function TableView({ presentation }: { presentation: ExecutivePresentation }) {
  const { columns, rows } = presentation.visual;
  if (columns.length === 0 || rows.length === 0) {
    return <div className="rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-6 text-center text-xs text-[var(--text-muted)]">Evidence tabel belum tersedia.</div>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-card)]">
      <table className="w-full min-w-[620px] text-xs">
        <thead className="sticky top-0 z-[1] bg-[var(--surface-muted)]">
          <tr className="border-b border-[var(--border)]">
            {columns.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{column.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[var(--surface-muted)] last:border-0 hover:bg-[var(--surface-container-low)]">
              {columns.map((column, columnIndex) => <td key={`${column.key}-${columnIndex}`} className={`px-3 py-2.5 align-top ${columnIndex === 1 ? 'font-bold text-[var(--brand)]' : 'text-[var(--text-body)]'}`}>{formatCell(row[column.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisualSection({ presentation }: { presentation: ExecutivePresentation }) {
  const { visual } = presentation;
  if (visual.type === 'metric') return <MetricGrid presentation={presentation} />;
  if (visual.type === 'table') return <TableView presentation={presentation} />;
  if (visual.type === 'bar' || visual.type === 'line' || visual.type === 'area') return <ChartView presentation={presentation} />;
  if (visual.type === 'map') return <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-5 text-center text-xs text-[var(--text-muted)]">Detail spasial tersedia di halaman Peta GIS.</div>;
  return <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-[#E5CDBE] bg-[#FAF1EB] px-5 text-center text-xs text-[#8B684F]">Visual ditahan karena evidence belum cukup untuk kesimpulan yang aman.</div>;
}

function InsightGrid({ presentation }: { presentation: ExecutivePresentation }) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
      {presentation.insights.map((insight, index) => {
        const style = STATUS_STYLES[insight.tone];
        return (
          <div key={`${insight.label}-${index}`} className="min-h-[92px] rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-3.5">
            <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${style.dot}`} /><span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>{insight.label}</span></div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-body)]">{insight.text}</p>
          </div>
        );
      })}
    </div>
  );
}

function QuickWins({ presentation }: { presentation: ExecutivePresentation }) {
  return (
    <section className="border-b border-[var(--border)] py-4 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[var(--brand)]">Quick win</h3><span className="text-[10px] text-[var(--text-muted)]">Aksi terdekat</span></div>
      <div className="space-y-3">
        {presentation.quickWins.map((win, index) => (
          <div key={`${win.title}-${index}`} className="grid grid-cols-[24px_1fr] gap-2.5">
            <div className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--warning-tint)] text-[10px] font-black text-[var(--brand)]">{index + 1}</div>
            <div><p className="text-xs font-bold leading-snug text-[var(--text-body)]">{win.title}</p><p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">{win.action}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{win.owner && <span className="rounded-full bg-[var(--brand-tint)] px-1.5 py-1 text-[9px] font-semibold text-[var(--brand)]">{win.owner}</span>}{win.horizon && <span className="rounded-full bg-[var(--surface-muted)] px-1.5 py-1 text-[9px] font-semibold text-[var(--text-muted)]">{win.horizon}</span>}</div></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QualityPanel({ presentation }: { presentation: ExecutivePresentation }) {
  return (
    <section className="border-b border-[var(--border)] py-4">
      <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[var(--brand)]">Kualitas jawaban</h3><span className="text-[10px] text-[var(--text-muted)]">Bukan confidence score</span></div>
      <div className="space-y-2.5">
        {presentation.dataQuality.map((item) => { const style = STATUS_STYLES[item.status]; return <div key={item.label} className="flex items-center justify-between gap-3 text-[10px]"><span className="text-[var(--text-muted)]">{item.label}</span><span className={`inline-flex items-center gap-1.5 font-bold ${style.text}`}><span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />{item.text}</span></div>; })}
      </div>
    </section>
  );
}

function ProvenancePanel({ presentation, onFollowUp }: { presentation: ExecutivePresentation; onFollowUp?: (query: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const copyText = `${presentation.title}\n\n${presentation.narrative}\n\nQuick win:\n${presentation.quickWins.map((win, index) => `${index + 1}. ${win.title}: ${win.action}`).join('\n')}\n\nSumber: ${presentation.provenance.source}\nDiakses: ${formatTimestamp(presentation.provenance.fetchedAt)}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(copyText); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setCopied(false); }
  };
  const exportBrief = () => {
    const blob = new Blob([copyText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'sapa-executive-brief.txt'; link.click(); URL.revokeObjectURL(url); setExported(true); setTimeout(() => setExported(false), 1800);
  };

  return (
    <>
      <section className="border-b border-[var(--border)] py-4">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[var(--brand)]">Sumber & provenance</h3><span className="text-[10px] text-[var(--text-muted)]">Audit trail</span></div>
        <div className="rounded-xl border border-[#D4E6D6] bg-[var(--brand-tint)] p-3"><div className="flex items-start gap-2"><span className="mt-0.5 text-sm">◉</span><div><p className="text-[10px] font-bold leading-relaxed text-[var(--brand)]">{presentation.provenance.source}</p><p className="mt-1 text-[9px] leading-relaxed text-[var(--text-muted)]">Diakses {formatTimestamp(presentation.provenance.fetchedAt)}<br />{presentation.provenance.evidenceCount} evidence terstruktur · nilai tidak ditambah oleh UI.</p></div></div></div>
        <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={copy} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[10px] font-bold text-[var(--brand)] transition hover:bg-[var(--surface-muted)]">{copied ? '✓ Tersalin' : '⧉ Salin ringkasan'}</button><button type="button" onClick={exportBrief} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--brand)] px-3 py-2 text-[10px] font-bold text-[var(--on-brand)] transition hover:bg-[var(--brand-soft)]">{exported ? '✓ Tersimpan' : '↓ Ekspor brief'}</button></div>
      </section>
      <section className="pt-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[var(--brand)]">Pertanyaan lanjutan</h3><span className="text-[10px] text-[var(--text-muted)]">Follow-up</span></div><div className="flex flex-wrap gap-1.5">{presentation.followUps.map((query) => <button type="button" key={query} onClick={() => onFollowUp?.(query)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-card)] px-2.5 py-2 text-left text-[10px] font-semibold leading-snug text-[var(--brand)] transition hover:border-[#B8D1BB] hover:bg-[var(--brand-tint)]">{query} ↗</button>)}</div></section>
    </>
  );
}

function EvidenceSummary({ presentation }: { presentation: ExecutivePresentation }) {
  if (presentation.evidence.length === 0) return null;
  return (
    <section className="mt-5"><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-xs font-bold text-[var(--brand)]">Evidence yang dipakai</h3><span className="text-[10px] text-[var(--text-muted)]">{presentation.provenance.evidenceCount} item terstruktur</span></div><div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-card)]"><table className="w-full min-w-[620px] text-xs"><thead className="bg-[var(--surface-muted)]"><tr><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Indikator</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Nilai</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Satuan</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">OPD</th><th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Tahun</th></tr></thead><tbody>{presentation.evidence.slice(0, 12).map((row, index) => <tr key={`${row.id}-${index}`} className="border-t border-[var(--surface-muted)]"><td className="px-3 py-2.5 text-[var(--text-body)]">{row.indikator}</td><td className="px-3 py-2.5 font-bold text-[var(--brand)]">{row.nilai}</td><td className="px-3 py-2.5 text-[var(--text-body)]">{row.satuan || '—'}</td><td className="px-3 py-2.5 text-[var(--text-muted)]">{row.opd || '—'}</td><td className="px-3 py-2.5 text-[var(--text-muted)]">{row.tahun || '—'}</td></tr>)}</tbody></table></div></section>
  );
}

export default function ExecutiveAnswerRenderer({ response, onFollowUp }: Props) {
  const presentation = getExecutivePresentation(response);
  return (
    <div className="animate-fadeIn space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand-deep)] to-[var(--brand-soft)] text-base text-white shadow-lg">✦</div><div><h2 className="text-sm font-black uppercase tracking-[0.08em] text-[var(--brand)]">Executive answer</h2><p className="text-[10px] text-[var(--text-muted)]">Visual dan narasi disesuaikan dengan bentuk evidence</p></div></div><AnswerBadge presentation={presentation} /></div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] shadow-sm">
          <div className="border-b border-[var(--border)] p-5 md:p-6"><div className="mb-4 flex items-start justify-between gap-3"><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Jawaban AI · {TYPE_LABEL[presentation.answerType]}</div><div className="text-right text-[10px] text-[var(--text-muted)]">{presentation.provenance.evidenceCount} evidence<br />{formatTimestamp(presentation.provenance.fetchedAt)}</div></div><h3 className="max-w-4xl text-2xl font-black leading-tight tracking-[-0.035em] text-[var(--brand-deep)] md:text-3xl">{presentation.title}</h3><p className="mt-3 max-w-4xl text-sm leading-relaxed text-[var(--text-body)]">{presentation.lead}</p><PrimaryMetric presentation={presentation} /></div>
          <div className="p-5 md:p-6"><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[var(--brand)]">Executive narrative</h3><span className="text-[10px] text-[var(--text-muted)]">Berdasarkan response ter-grounding</span></div><div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[var(--brand-deep)] to-[var(--brand)] p-4 text-[var(--on-brand)] md:p-5"><div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-[#D9C284]/20" /><p className="relative text-sm leading-relaxed text-[#F0F6EE]">{presentation.narrative}</p><p className="relative mt-3 text-[10px] text-[#B8CBBE]">Sumber: {presentation.provenance.source}</p></div>{presentation.visual.type !== 'metric' && <MetricGrid presentation={presentation} />}<section className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-container-low)] p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-xs font-bold text-[var(--brand)]">{presentation.visual.title}</h3>{presentation.visual.subtitle && <p className="mt-1 text-[10px] text-[var(--text-muted)]">{presentation.visual.subtitle}</p>}</div><span className="rounded-full border border-[#D4E6D6] bg-[var(--surface-card)] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[var(--brand)]">{TYPE_LABEL[presentation.answerType]}</span></div><VisualSection presentation={presentation} /></section><InsightGrid presentation={presentation} /><EvidenceSummary presentation={presentation} /></div>
        </article>
        <aside className="sticky top-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] p-4 shadow-sm"><div className="mb-1 flex items-start justify-between gap-3"><div><h3 className="text-sm font-black text-[var(--brand-deep)]">Panel keputusan</h3><p className="mt-1 text-[10px] leading-relaxed text-[var(--text-muted)]">Jembatan dari data menuju aksi yang aman.</p></div><span className="text-lg text-[var(--accent)]">✦</span></div><div className="mt-4"><QuickWins presentation={presentation} /><QualityPanel presentation={presentation} /><ProvenancePanel presentation={presentation} onFollowUp={onFollowUp} /></div></aside>
      </div>
    </div>
  );
}
