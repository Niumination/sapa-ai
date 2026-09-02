'use client';

import { HybridResponse } from '@/types';

export interface AIDataPayload {
  title: string;
  summary: string;
  metrics: { label: string; value: string | number; unit: string }[];
  table: { headers: string[]; rows: (string | number)[][] };
  metadata: { sumber: string; tanggal_akses: string; status: string };
}

export function toAIDataPayload(res: HybridResponse): AIDataPayload | null {
  const cfg = res.visualisasi?.konfigurasi ?? {};
  const rows: (string | number)[][] = Array.isArray(cfg.rows) ? cfg.rows : Array.isArray(cfg.baris) ? cfg.baris : [];
  const headers: string[] = Array.isArray(cfg.columns) ? cfg.columns.map((c: any) => typeof c === 'string' ? c : c?.name ?? String(c)) : Array.isArray(cfg.kolom) ? cfg.kolom : ['Indikator', 'Nilai', 'Satuan', 'OPD', 'Tahun'];
  const metrics: AIDataPayload['metrics'] = Array.isArray(cfg.metrics) ? cfg.metrics : [];
  // Fallback metrics from first row if table exists
  if (metrics.length === 0 && rows.length > 0) {
    const top = rows.slice(0, 4);
    for (const r of top) {
      if (Array.isArray(r) && r.length >= 2) metrics.push({ label: String(r[0]).slice(0, 40), value: r[1], unit: String(r[2] ?? '') });
    }
  }
  if (metrics.length === 0 && rows.length === 0) return null;
  return {
    title: (res.narasi?.split('—')[0]?.trim() ?? res.narasi?.slice(0, 80) ?? 'Ringkasan SAPA').slice(0, 120),
    summary: res.narasi ?? '',
    metrics: metrics.slice(0, 4),
    table: { headers, rows },
    metadata: { sumber: res.dataSource ?? 'SAPA Aceh Tengah', tanggal_akses: new Date(res.timestamp).toLocaleDateString('id-ID'), status: 'Terverifikasi SDI' },
  };
}

export default function AIDataWidget({ data }: { data: AIDataPayload }) {
  if (!data || !data.table || !data.metrics) return <div className="text-red-500 text-sm">Gagal memuat struktur data.</div>;

  return (
    <div className="w-full bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden font-sans my-5">
      <div className="bg-slate-900 p-5 border-b-4 border-blue-600">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg md:text-xl font-bold text-white uppercase tracking-wide">{data.title}</h3>
          <span className="bg-blue-700 text-white text-[10px] md:text-xs px-2 py-1 rounded font-bold uppercase tracking-wider hidden md:inline-block">Dokumen Resmi</span>
        </div>
        <p className="text-slate-300 text-sm leading-relaxed line-clamp-3">{data.summary}</p>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {data.metrics.map((m, idx) => (
            <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center flex flex-col justify-center shadow-sm">
              <div className="text-xl md:text-2xl font-bold text-blue-700 leading-none mb-1">{m.value}</div>
              <div className="text-[10px] md:text-xs text-slate-500 font-bold uppercase">{m.label} {m.unit && `(${m.unit})`}</div>
            </div>
          ))}
        </div>
        {data.table.rows.length > 0 && (
          <div className="overflow-x-auto mb-6 border border-slate-200 rounded-lg shadow-sm max-h-[400px]">
            <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs sticky top-0">
                <tr>
                  {data.table.headers.map((h, idx) => (
                    <th key={idx} className="px-4 py-3 border-b border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.table.rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-blue-50/50 border-b border-slate-100 transition-colors last:border-0">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-3 text-slate-700">{String(cell ?? '-')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 text-[11px] md:text-xs text-slate-700 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 rounded-r">
          <div className="flex flex-col gap-1">
            <span><span className="font-bold text-slate-900">Produsen Data:</span> {data.metadata.sumber}</span>
            <span><span className="font-bold text-slate-900">Diakses pada:</span> {data.metadata.tanggal_akses}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded border border-blue-200 shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="font-bold text-green-700 tracking-wide">{data.metadata.status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
