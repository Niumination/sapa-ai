'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// Palet kategorikal — setiap warna UNIK.
// Palet lama mengulang #2D6A4F, #A15C38, dan #1B4332 masing-masing dua kali,
// sehingga dua seri berbeda bisa tampil berwarna sama (§7.2 #10).
// Urutan disusun agar berdekatan tetap berbeda terang-gelap, membantu pembaca
// dengan defisiensi penglihatan warna.
const COLORS = [
  'var(--brand)', // hijau tua
  'var(--accent)', // terakota
  'var(--brand-soft)', // hijau sedang
  'var(--warning)', // emas tua
  'var(--text-body)', // abu zaitun
  'var(--danger)', // merah
  '#52796F', // hijau kebiruan
  '#6B4E71', // ungu tua
  '#C9803F', // oranye
  '#31708E', // biru
];

interface AnalyticsData {
  overview: { totalRecords: number; totalOpd: number; totalIndicators: number };
  opdBreakdown: { nama: string; jumlahIndikator: number; uniqueIndicators: number; totalRecords: number; hasData: boolean }[];
  indicatorFrequency: { nama: string; jumlah: number; opds: string[] }[];
  satuanDistribusi: { name: string; count: number }[];
  jadwalDistribusi: { name: string; count: number }[];
  completeness: { nama: string; completeness: number; totalRecords: number }[];
  kategoriIndikator: { name: string; count: number }[];
  lastFetched: string;
}


// Tipe payload tooltip Recharts yang benar-benar dipakai di sini.
interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  fill?: string;
  payload?: Record<string, unknown>;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}

const ChartTooltip = ({ active, payload, label }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="p-2.5 bg-[var(--surface-card)] border border-[var(--border)] rounded-lg shadow-xl text-xs">
      <p className="font-bold text-[var(--brand)] mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>{p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}</p>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const d = (payload[0].payload ?? {}) as { name?: string; count?: number };
  return (
    <div className="p-2.5 bg-[var(--surface-card)] border border-[var(--border)] rounded-lg shadow-xl text-xs">
      <p className="font-bold text-[var(--brand)]">{d.name}</p>
      <p className="text-[var(--text-body)]">Jumlah: {(d.count ?? 0).toLocaleString('id-ID')}</p>
    </div>
  );
};

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${color}`}>{icon}</div>
        <div>
          <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</p>
          <p className="text-2xl font-bold text-[var(--brand)]">{value.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      const res = await fetch('/api/analytics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal memuat data'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const id = setTimeout(() => { void fetchData(); }, 0);
    return () => clearTimeout(id);
     
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-[var(--surface-muted)] rounded-lg w-64" />
        <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-[var(--surface-muted)] rounded-2xl" />)}</div>
        <div className="h-[600px] bg-[var(--surface-muted)] rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-[var(--danger)] text-sm mb-4">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-[var(--brand)] text-[var(--on-brand)] text-sm rounded-lg hover:bg-[var(--brand-soft)]">Coba Lagi</button>
      </div>
    );
  }

  if (!data) return null;

  const opdData = [...data.opdBreakdown]
    .sort((a, b) => b.jumlahIndikator - a.jumlahIndikator)
    .map(opd => ({ ...opd, nama: opd.nama.length > 35 ? opd.nama.substring(0, 32) + '...' : opd.nama }));

  const compData = [...data.completeness]
    .sort((a, b) => b.completeness - a.completeness)
    .map(opd => ({ ...opd, nama: opd.nama.length > 35 ? opd.nama.substring(0, 32) + '...' : opd.nama }));

  const satData = [...data.satuanDistribusi].sort((a, b) => b.count - a.count).slice(0, 10);

  const topInd = [...data.indicatorFrequency]
    .sort((a, b) => b.jumlah - a.jumlah).slice(0, 20)
    .map(ind => ({ ...ind, nama: ind.nama?.length > 40 ? ind.nama.substring(0, 37) + '...' : (ind.nama || 'Unknown') }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand)]">📊 Analitik Data SAPA</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {data.lastFetched && `Terakhir diperbarui: ${new Date(data.lastFetched).toLocaleString('id-ID')}`}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon="📦" label="Total Records" value={data.overview.totalRecords} color="bg-[var(--brand-tint)]" />
        <StatCard icon="🏛️" label="Total OPD" value={data.overview.totalOpd} color="bg-[var(--brand-tint)]" />
        <StatCard icon="📈" label="Total Indikator" value={data.overview.totalIndicators} color="bg-[var(--accent-tint)]" />
      </div>

      {/* OPD Performance — full width, tall */}
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-4">🏛️ OPD Performance — Jumlah Indikator</h2>
        <ResponsiveContainer width="100%" height={Math.max(500, opdData.length * 32)}>
          <BarChart data={opdData} layout="vertical" margin={{ top: 5, right: 30, left: 200, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <YAxis dataKey="nama" type="category" width={190} stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="jumlahIndikator" name="Jumlah Indikator" fill="var(--brand)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Data Completeness — full width, tall */}
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-4">✅ Data Completeness per OPD</h2>
        <ResponsiveContainer width="100%" height={Math.max(500, compData.length * 32)}>
          <BarChart data={compData} layout="vertical" margin={{ top: 5, right: 30, left: 200, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <YAxis dataKey="nama" type="category" width={190} stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="completeness" name="Completeness %" fill="var(--brand-soft)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Kategori Indikator */}
        <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">🏷️ Kategori Indikator</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.kategoriIndikator} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="count" nameKey="name" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                {data.kategoriIndikator.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Satuan Distribution */}
        <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">📐 Satuan / Unit</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={satData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="count" nameKey="name" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                {satData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Jadwal Pemutakhiran */}
        <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
          <h2 className="text-sm font-bold text-[var(--text)] mb-3">🔄 Jadwal Pemutakhiran</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.jadwalDistribusi} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="count" nameKey="name" label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                {data.jadwalDistribusi.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 20 Indicator Frequency */}
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-4">📊 Top 20 Indikator Terbanyak</h2>
        <ResponsiveContainer width="100%" height={Math.max(400, topInd.length * 30)}>
          <BarChart data={topInd} layout="vertical" margin={{ top: 5, right: 30, left: 300, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
            <YAxis dataKey="nama" type="category" width={290} stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
            <Bar dataKey="jumlah" name="Kemunculan" fill="var(--accent)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
