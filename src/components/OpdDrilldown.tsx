'use client';

import React from 'react';
import Link from 'next/link';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface IndicatorSeries {
  idKodeIndikator: number;
  nama: string;
  satuan: string;
  points: { tahun: number; nilai: number }[];
  recordsWithoutYear: number;
}

interface OpdDetail {
  nama: string;
  totalRecords: number;
  uniqueIndicators: number;
  recordsWithoutYear: number;
  trends: IndicatorSeries[];
  indicatorsWithoutTrend: number;
  topIndicators: { nama: string; nilai: string | null; satuan: string; tahun: string | null }[];
  sourceLabel: string;
  lastFetched: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: { value?: number | string }[];
  label?: string | number;
}

function TrendTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  return (
    <div className="p-2 bg-[var(--surface-card)] border border-[var(--border)] rounded-lg shadow-xl text-xs">
      <p className="font-bold text-[var(--brand)]">{label}</p>
      <p className="text-[var(--text-body)]">{typeof v === 'number' ? v.toLocaleString('id-ID') : v}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface-muted)] rounded-xl px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="text-sm font-bold text-[var(--brand)] tabular-nums">{value}</p>
    </div>
  );
}

/** Drill-down analitik satu OPD — sumber: GET /api/analytics/opd/[slug].
 *  Deterministik; deret tren hanya untuk indikator dengan ≥2 titik tahunan valid,
 *  record tanpa tahun dilaporkan jujur (tidak dipaksakan jadi tren). */
export default function OpdDrilldown({ opd }: { opd: string }) {
  const [data, setData] = React.useState<OpdDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setError(null);
      setData(null);
      const res = await fetch(`/api/analytics/opd/${encodeURIComponent(opd)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json as OpdDetail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data');
    }
  }, [opd]);

  React.useEffect(() => {
    const id = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(id);
  }, [load]);

  return (
    <div className="bg-[var(--surface-card)] border border-[var(--brand)]/30 rounded-2xl p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Detail Analitik OPD</p>
          <h2 className="text-lg font-bold text-[var(--brand)] truncate" title={opd}>{data?.nama ?? opd}</h2>
        </div>
        <Link
          href="/dashboard/analytics"
          className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-[var(--border)] text-[11px] font-semibold text-[var(--text-body)] hover:border-[var(--brand)] hover:text-[var(--brand)]"
        >
          Tutup
        </Link>
      </div>

      {error && (
        <div className="text-center py-6">
          <p className="text-xs text-[var(--danger)] mb-3">{error}</p>
          <button onClick={() => void load()} className="px-3 py-1.5 bg-[var(--brand)] text-[var(--on-brand)] text-xs rounded-lg hover:bg-[var(--brand-soft)]">
            Coba Lagi
          </button>
        </div>
      )}

      {!error && !data && (
        <div className="space-y-2 animate-pulse" aria-label="Memuat detail OPD">
          <div className="h-16 bg-[var(--surface-muted)] rounded-xl w-full" />
          <div className="h-48 bg-[var(--surface-muted)] rounded-xl w-full" />
          <div className="h-32 bg-[var(--surface-muted)] rounded-xl w-full" />
        </div>
      )}

      {data && (
        <>
          {/* Stat ringkas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat label="Record" value={data.totalRecords.toLocaleString('id-ID')} />
            <MiniStat label="Indikator Unik" value={data.uniqueIndicators.toLocaleString('id-ID')} />
            <MiniStat label="Tanpa Tahun" value={data.recordsWithoutYear.toLocaleString('id-ID')} />
            <MiniStat label="Ada Tren" value={(data.trends.length).toLocaleString('id-ID')} />
          </div>

          {/* Tren tahunan */}
          {data.trends.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.trends.slice(0, 4).map(t => (
                <div key={t.idKodeIndikator} className="border border-[var(--border)] rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-[var(--text)] mb-1 line-clamp-2" title={t.nama}>
                    {t.nama}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] mb-2">
                    Satuan: {t.satuan} · {t.points.length} titik tahun ({t.points[0]?.tahun}–{t.points[t.points.length - 1]?.tahun})
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={t.points} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="tahun" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} width={54} />
                      <Tooltip content={<TrendTooltip />} />
                      <Line type="monotone" dataKey="nilai" stroke="var(--brand)" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ))}
              {data.trends.length > 4 && (
                <p className="text-[10px] text-[var(--text-muted)] lg:col-span-2">
                  Menampilkan 4 dari {data.trends.length} indikator ber-tren (diurutkan jumlah titik terbanyak).
                </p>
              )}
            </div>
          ) : (
            <div className="border border-dashed border-[var(--border)] rounded-xl p-4 text-center">
              <p className="text-xs text-[var(--text-body)]">
                Belum ada indikator dengan deret tahunan lengkap (≥2 titik tahun bernilai numerik).
              </p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                Tren tidak dipaksakan bila data tidak menyediakan deret waktu.
              </p>
            </div>
          )}

          {/* Tabel indikator */}
          {data.topIndicators.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-[var(--text)] mb-2">Indikator dan Nilai Terakhir</h3>
              <div className="overflow-x-auto max-h-72 overflow-y-auto border border-[var(--border)] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--surface-muted)] sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-[var(--text-body)]">Indikator</th>
                      <th className="px-3 py-2 font-semibold text-[var(--text-body)] text-right">Nilai</th>
                      <th className="px-3 py-2 font-semibold text-[var(--text-body)]">Satuan</th>
                      <th className="px-3 py-2 font-semibold text-[var(--text-body)]">Tahun</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {data.topIndicators.map((r, i) => (
                      <tr key={`${r.nama}-${i}`}>
                        <td className="px-3 py-2 text-[var(--text-body)]">{r.nama}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--brand)] tabular-nums">{r.nilai ?? '-'}</td>
                        <td className="px-3 py-2 text-[var(--text-muted)]">{r.satuan}</td>
                        <td className="px-3 py-2 text-[var(--text-muted)]">{r.tahun ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Provenance */}
          <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
            Sumber: {data.sourceLabel} · Diakses {new Date(data.lastFetched).toLocaleString('id-ID')} ·
            {' '}{data.recordsWithoutYear.toLocaleString('id-ID')} record tanpa tahun tidak dihitung sebagai tren ·
            {' '}{data.indicatorsWithoutTrend.toLocaleString('id-ID')} indikator tanpa deret cukup. Tampilan ini deterministik, bukan penafsiran AI.
          </p>
        </>
      )}
    </div>
  );
}
