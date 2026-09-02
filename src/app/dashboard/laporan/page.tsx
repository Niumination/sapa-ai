'use client';

import React, { useState, useEffect } from 'react';

interface OpdItem {
  nama: string;
  jumlahIndikator: number;
  indikatorUnik: number;
  totalRecords: number;
  kontribusiPersen: number;
}

interface ReportSummary {
  totalRecords: number;
  totalOpd: number;
  totalIndikatorUnik: number;
  timestamp: string;
  sumber: string;
  catatan: string;
}

interface ReportResponse {
  status: string;
  source: string;
  summary: ReportSummary;
  opdBreakdown: OpdItem[];
}

export default function LaporanPage() {
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/report')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: ReportResponse & { error?: string }) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat laporan'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-[var(--surface-muted)] rounded-lg w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--surface-muted)] rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-[400px] bg-[var(--surface-muted)] rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-[var(--danger)] text-sm mb-4">{error}</p>
        <button
          onClick={() => { window.location.reload(); }}
          className="px-4 py-2 bg-[var(--brand)] text-[var(--on-brand)] text-sm rounded-lg hover:bg-[var(--brand-soft)]"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  if (!data) return null;

  const maxRecords = Math.max(...data.opdBreakdown.map((o) => o.jumlahIndikator), 1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--brand)]">Laporan Eksekutif SAPA</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Laporan deterministik dari data SAPA SPLP — Dihasilkan {new Date(data.summary.timestamp).toLocaleString('id-ID')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
          <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">Total Data</p>
          <p className="text-3xl font-bold text-[var(--brand)] mt-1">{data.summary.totalRecords.toLocaleString()}</p>
          <p className="text-xs text-[var(--text-muted)]">Record SAPA SPLP</p>
        </div>
        <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
          <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">Total OPD</p>
          <p className="text-3xl font-bold text-[var(--brand)] mt-1">{data.summary.totalOpd}</p>
          <p className="text-xs text-[var(--text-muted)]">Unit Kerja</p>
        </div>
        <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
          <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">Indikator Unik</p>
          <p className="text-3xl font-bold text-[var(--brand)] mt-1">{data.summary.totalIndikatorUnik}</p>
          <p className="text-xs text-[var(--text-muted)]">Variabel Data</p>
        </div>
      </div>

      {/* Sumber & Catatan */}
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-2">
        <p className="text-sm text-[var(--text-body)]">
          <strong className="text-[var(--brand)]">Sumber:</strong> {data.summary.sumber}
        </p>
        <p className="text-xs text-[var(--text-muted)]">{data.summary.catatan}</p>
      </div>

      {/* Laporan Detail per OPD */}
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-lg font-bold text-[var(--brand)] mb-4">📋 Distribusi Data per OPD</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                <th className="text-left py-3 px-3">OPD</th>
                <th className="text-right py-3 px-3">Jumlah Data</th>
                <th className="text-right py-3 px-3">Indikator Unik</th>
                <th className="text-right py-3 px-3">Kontribusi</th>
                <th className="text-left py-3 px-3">Persentase</th>
              </tr>
            </thead>
            <tbody>
              {data.opdBreakdown.map((opd, i) => (
                <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]">
                  <td className="py-3 px-3 text-[var(--text-body)]">{opd.nama}</td>
                  <td className="py-3 px-3 text-right text-[var(--text-body)]">{opd.jumlahIndikator.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right text-[var(--text-body)]">{opd.indikatorUnik}</td>
                  <td className="py-3 px-3 text-right">
                    <div className="w-full bg-[var(--surface-muted)] rounded-full h-2">
                      <div
                        className="bg-[var(--brand)] h-2 rounded-full"
                        style={{ width: `${(opd.jumlahIndikator / maxRecords) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-medium text-[var(--brand)]">{opd.kontribusiPersen}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-[var(--text-muted)]">
        Laporan dihasilkan secara deterministik dari feed SAPA SPLP — tanpa cache, tanpa data PII.
      </div>
    </div>
  );
}
