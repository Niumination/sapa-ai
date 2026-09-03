'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface OpdRow {
  nama: string;
  jumlahIndikator: number;
  uniqueIndicators: number;
  totalRecords: number;
  hasData: boolean;
}

const TOP_N = 10;

/** Widget ringkas Top OPD di beranda — sumber: GET /api/sapa (opdBreakdown).
 *  Deterministik, tanpa penafsiran AI. Klik OPD → drill-down analitik per OPD. */
export default function TopOpdWidget() {
  const [rows, setRows] = useState<OpdRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/sapa');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { opdBreakdown?: OpdRow[]; error?: string };
      if (json.error) throw new Error(json.error);
      if (!json.opdBreakdown?.length) throw new Error('Data OPD kosong');
      setRows(
        [...json.opdBreakdown]
          .sort((a, b) => b.jumlahIndikator - a.jumlahIndikator)
          .slice(0, TOP_N),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    }
  }, []);

  React.useEffect(() => {
    const id = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(id);
  }, [load]);

  if (error) {
    return (
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Top OPD</h2>
        <p className="text-xs text-[var(--text-muted)]">
          Data Top OPD belum tersedia ({error}). Coba muat ulang halaman.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-bold text-[var(--text)]">Top {TOP_N} OPD — Jumlah Indikator</h2>
        <Link
          href="/dashboard/analytics"
          className="text-[11px] font-semibold text-[var(--brand)] hover:text-[var(--brand-soft)]"
        >
          Analitik lengkap →
        </Link>
      </div>

      {!rows ? (
        <div className="space-y-2 animate-pulse" aria-label="Memuat data Top OPD">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-9 bg-[var(--surface-muted)] rounded-lg w-full" />
          ))}
        </div>
      ) : (
        <>
          <ol className="divide-y divide-[var(--border)]">
            {rows.map((r, i) => (
              <li key={r.nama}>
                <Link
                  href={`/dashboard/analytics?opd=${encodeURIComponent(r.nama)}`}
                  className="flex items-center gap-3 py-2 group"
                  title={`Lihat analitik ${r.nama}`}
                >
                  <span className="w-6 h-6 flex-shrink-0 rounded-md bg-[var(--brand-tint)] text-[var(--brand)] text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-xs text-[var(--text-body)] group-hover:text-[var(--brand)]">
                    {r.nama}
                  </span>
                  {!r.hasData && (
                    <span className="flex-shrink-0 text-[10px] text-[var(--text-muted)] italic">tanpa nilai terisi</span>
                  )}
                  <span className="flex-shrink-0 w-12 text-right text-xs font-bold text-[var(--brand)] tabular-nums">
                    {r.jumlahIndikator.toLocaleString('id-ID')}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[10px] text-[var(--text-muted)]">
            Sumber: SAPA Aceh Tengah · Jumlah indikator terdaftar per OPD · Klik untuk detail per OPD.
          </p>
        </>
      )}
    </div>
  );
}
