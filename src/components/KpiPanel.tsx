'use client';

// ─── KPI Pimpinan (PR Lapis 2) — kartu indikator prioritas terkurasi ───
// Data dari /api/kpi: dihitung deterministik dari SAPA (tanpa LLM).

import { useEffect, useState } from 'react';

interface Kpi {
  id: string;
  label: string;
  icon: string;
  indikator: string;
  opd: string;
  nilai: string;
  satuan: string;
  tahun: string | null;
  deltaPct: number | null;
  deltaDir: 'up' | 'down' | 'flat' | null;
}

function DeltaBadge({ kpi }: { kpi: Kpi }) {
  if (kpi.deltaPct === null || !kpi.deltaDir) {
    return <span className="text-[10px] text-[#767D6F]">— perubahan antar-tahun n/a</span>;
  }
  const styles = {
    up: 'text-[#B3261E] bg-[#FBE3DE]',
    down: 'text-[#2D6A4F] bg-[#DCE8DE]',
    flat: 'text-[#767D6F] bg-[#E9E6DA]',
  } as const;
  const arrow = kpi.deltaDir === 'up' ? '▲' : kpi.deltaDir === 'down' ? '▼' : '•';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${styles[kpi.deltaDir]}`}>
      {arrow} {kpi.deltaPct >= 0 ? '+' : ''}
      {kpi.deltaPct.toFixed(1)}% thn lalu
    </span>
  );
}

export default function KpiPanel() {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    let alive = true;
    fetch('/api/kpi')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!alive) return;
        setKpis(d.kpis ?? []);
        setSource(d.source ?? '');
      })
      .catch(() => {
        if (!alive) return;
        setKpis([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-[#E9E6DA] border border-[#C6C3B4] animate-pulse" />
        ))}
      </div>
    );
  }

  if (kpis.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-bold text-[#1B4332] uppercase tracking-wider">
          🎯 KPI Prioritas Daerah
        </h2>
        <span className="text-[10px] text-[#767D6F]">deterministik dari SAPA · {source}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div
            key={k.id}
            className="bg-[#FFFFFF] border border-[#C6C3B4] rounded-2xl p-4 hover:border-[#2D6A4F]/50 hover:shadow-lg hover:shadow-[#1B4332]/5 transition-all"
            title={`${k.indikator} — ${k.opd}`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-base">{k.icon}</span>
              <span className="text-[10px] font-semibold text-[#767D6F] uppercase tracking-wide truncate">
                {k.label}
              </span>
            </div>
            <p className="text-xl font-bold text-[#1B4332] leading-tight">
              {k.nilai}
              {k.satuan && <span className="text-xs font-medium text-[#767D6F] ml-1">{k.satuan}</span>}
            </p>
            <p className="text-[10px] text-[#767D6F] mt-0.5 truncate">
              {k.tahun ? `Tahun ${k.tahun}` : 'Tahun tidak tercantum'} · {k.opd}
            </p>
            <div className="mt-2">
              <DeltaBadge kpi={k} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
