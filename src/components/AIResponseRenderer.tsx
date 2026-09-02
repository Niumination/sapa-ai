'use client';

import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { HybridResponse } from '@/types';
import AIDataWidget, { toAIDataPayload } from './AIDataWidget';
import BreakdownExplorer from './BreakdownExplorer';
import { formatBapoktingData, groupBapoktingByCategory, getBapoktingStats, formatBapoktingForChart } from '@/lib/bapokting-service';

const COLORS = ['#1B4332', '#2D6A4F', '#A15C38', '#B3261E', '#767D6F', '#2D6A4F', '#A15C38', '#C6C3B4', '#1B4332', '#4B5249'];

interface Props {
  response: HybridResponse;
}

export default function AIResponseRenderer({ response }: Props) {
  const { narasi, visualisasi, rekomendasi } = response;
  const sdiPayload = visualisasi && visualisasi.tipe !== 'none' ? toAIDataPayload(response) : null;
  const useSdi = !!sdiPayload && sdiPayload.table.rows.length > 0;

  // @hotfix 29-Agu-2026: tombol "Pecah Jawaban" muncul untuk jawaban berangka
  // (metric/table) — eksplorasi deterministik tanpa LLM (hemat usage model AI).
  // Deteksi program PBI otomatis dari narasi (chip PBI → metric "Penerima PBI").
  const isDtsen = (response.dataSource ?? '').toLowerCase().includes('dtsen');
  const programHint = /pbi|jaminan kesehatan|bantuan iuran|bantuan inisiatif/i.test(narasi ?? '') ? 'pbi' : null;
  const showBreakdown = (isDtsen || programHint) && visualisasi && visualisasi.tipe !== 'none';

  // @hotfix 31-Agu-2026: deteksi bapokting data dan render agregat siklus
  const isBapokting = (response.dataSource ?? '').toLowerCase().includes('bapokting');
  const bapoktingStats = isBapokting ? getBapoktingStats(response) : null;
  const bapoktingChartData = isBapokting && bapoktingStats ? formatBapoktingForChart(bapoktingStats) : null;
  const bapoktingData = isBapokting && response.visualisasi?.data ? formatBapoktingData(response.visualisasi.data) : null;
  const bapoktingGrouped = isBapokting && bapoktingData ? groupBapoktingByCategory(response.visualisasi.data) : null;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Query Title */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0F2A1E] to-[#1B4332] flex items-center justify-center text-sm">
          📊
        </div>
        <div>
          <h2 className="text-base font-bold text-[#1B4332]">Hasil Analisis AI</h2>
          <p className="text-[10px] text-[#767D6F]">
            {response.dataSource} · {new Date(response.timestamp).toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      {/* Pecah Jawaban — @hotfix 29-Agu-2026: PALING ATAS (setelah judul),
          eksplorasi deterministik tanpa LLM (hemat usage model AI). */}
      {showBreakdown && (
        <BreakdownExplorer sourceLabel={response.dataSource} program={programHint} />
      )}

      {/* Dynamic Visualization — SDI widget for table, else metric/chart */}
      {useSdi && sdiPayload ? (
        <AIDataWidget data={sdiPayload} />
      ) : visualisasi && visualisasi.tipe !== 'none' ? (
        <div className="bg-[#FFFFFF] border border-[#C6C3B4] rounded-2xl p-5">
          {visualisasi.tipe === 'metric' && <MetricRenderer config={visualisasi.konfigurasi} />}
          {visualisasi.tipe === 'table' && <TableRenderer config={visualisasi.konfigurasi} />}
          {visualisasi.tipe === 'chart' && <ChartRenderer config={visualisasi.konfigurasi} />}
        </div>
      ) : null}

      {/* Narasi */}
      {narasi && (
        <div className="bg-[#FFFFFF]/60 border border-[#C6C3B4] rounded-2xl p-5">
          <p className="text-sm text-[#4B5249] leading-relaxed whitespace-pre-wrap">{narasi}</p>
        </div>
      )}

      {/* Rekomendasi */}
      {rekomendasi && rekomendasi.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-500/10 border border-[#A15C38]/20 rounded-2xl p-5 shadow-lg shadow-amber-500/5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full -translate-y-16 translate-x-16 blur-2xl" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-[#F3DCC9] flex items-center justify-center text-sm">💡</div>
            <p className="text-xs font-bold text-[#1B4332] uppercase tracking-wider">Rekomendasi AI</p>
          </div>
          <ul className="space-y-2.5 relative">
            {rekomendasi.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-[#4B5249]">
                <span className="flex-shrink-0 w-5 h-5 rounded-md bg-[#F3DCC9] flex items-center justify-center text-[10px] font-bold text-[#1B4332]">{i + 1}</span>
                <span className="leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Format angka konsisten id-ID (ribuan pakai titik) ───
// @hotfix 29-Agu-2026: angka dari seluruh sumber (SAPA/DTSEN/Bapokting/Excel)
// ditampilkan konsisten "12.345" bukan "12345" — termasuk string numerik.
function formatAngka(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number' && Number.isFinite(v)) return v.toLocaleString('id-ID');
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || t === '-' || t === '—') return t || '-';
    // Sudah berformat id-ID ("12.345") atau punya koma/teks → biarkan
    if (/[a-zA-Z(),]/.test(t) && !/^-?\d[\d.,]*$/.test(t)) return t;
    const n = Number(t.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n)) return n.toLocaleString('id-ID');
    return t;
  }
  return String(v);
}

// ─── Metric Renderer ───
function MetricRenderer({ config }: { config: any }) {
  const metrics = config?.metrics ?? [];
  if (metrics.length === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metrics.map((m: any, i: number) => (
        <div key={i} className="bg-[#E9E6DA] rounded-xl p-4 text-center border border-[#C6C3B4]">
          <p className="text-[10px] text-[#767D6F] uppercase tracking-wider mb-1">{m.label}</p>
          <p className="text-xl font-bold text-[#1B4332]">{formatAngka(m.value)}</p>
          {m.unit && <p className="text-[10px] text-[#767D6F] mt-0.5">{m.unit}</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Table Renderer ───
function TableRenderer({ config }: { config: any }) {
  const columns: any[] = config?.columns ?? [];
  const rawRows: any[] = config?.rows ?? [];

  if (columns.length === 0 || rawRows.length === 0) return null;

  // Handle dua format columns: array of strings ATAU array of objects {key, name}
  const colMeta = columns.map((c: any) =>
    typeof c === 'string' ? { key: c, name: c } : { key: c?.key ?? c?.name ?? String(c), name: c?.name ?? c?.key ?? String(c) }
  );

  return (
    <div className="overflow-x-auto max-h-[500px]">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-[#E9E6DA]">
          <tr className="border-b border-[#C6C3B4]">
            {colMeta.map((col: any) => (
              <th key={col.key} className="text-left py-2.5 px-3 font-semibold text-[#767D6F] whitespace-nowrap">
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rawRows.map((row: any, i: number) => (
            <tr key={i} className="border-b border-[#C6C3B4] hover:bg-[#E9E6DA] transition-colors">
              {colMeta.map((col: any, ci: number) => (
                <td key={col.key} className="py-2 px-3 text-[#4B5249]">
                  {formatAngka(Array.isArray(row) ? (row[ci] ?? '-') : (row[col.key] ?? row[col.name] ?? '-'))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Chart Renderer ───
function ChartRenderer({ config }: { config: any }) {
  const chartType = config?.type ?? 'bar';
  const data = config?.data ?? [];
  const xKey = config?.xKey ?? 'name';
  const lines = config?.lines ?? config?.bars ?? [];

  if (data.length === 0 || lines.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={350}>
      {chartType === 'line' ? (
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#C6C3B4" />
          <XAxis dataKey={xKey} stroke="#767D6F" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis stroke="#767D6F" tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          {lines.map((line: string, i: number) => (
            <Line key={line} type="monotone" dataKey={line} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      ) : chartType === 'area' ? (
        <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <defs>
            {lines.map((line: string, i: number) => (
              <linearGradient key={line} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.6} />
                <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#C6C3B4" />
          <XAxis dataKey={xKey} stroke="#767D6F" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis stroke="#767D6F" tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          {lines.map((line: string, i: number) => (
            <Area key={line} type="monotone" dataKey={line} stroke={COLORS[i % COLORS.length]} fill={`url(#grad-${i})`} strokeWidth={2} />
          ))}
        </AreaChart>
      ) : chartType === 'pie' || chartType === 'donut' ? (
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie
            data={data}
            dataKey={lines[0] ?? 'value'}
            nameKey={xKey}
            cx="50%" cy="50%"
            innerRadius={chartType === 'donut' ? 60 : 0}
            outerRadius={120}
            paddingAngle={2}
            label={({ name, percent }: any) => `${(percent * 100).toFixed(0)}%`}
          >
            {data.map((_: any, i: number) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      ) : (
        <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#C6C3B4" />
          <XAxis dataKey={xKey} stroke="#767D6F" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis stroke="#767D6F" tick={{ fontSize: 11 }} />
          <Tooltip content={<ChartTooltip />} />
          {lines.map((bar: string, i: number) => (
            <Bar key={bar} dataKey={bar} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

// ─── Chart Tooltip ───
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="p-2.5 bg-[#FFFFFF] border border-[#C6C3B4] rounded-lg shadow-xl text-xs">
      <p className="font-bold text-[#1B4332] mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('id-ID') : formatAngka(p.value)}
        </p>
      ))}
    </div>
  );
}
