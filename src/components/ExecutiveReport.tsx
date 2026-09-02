'use client';

// ─── Laporan Eksekutif (PR-3) — render hasil /api/report ───
// Naratif laporan dirakit server-side secara deterministik; komponen ini murni
// menampilkan + menyediakan tombol cetak (window.print → simpan PDF).

import { useEffect, useState } from 'react';

interface AngkaKunci {
  label: string;
  nilai: string;
}

interface ReportAlert {
  indikator: string;
  satuan: string;
  pesan: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  createdAt: string;
}

interface KpiItem {
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

interface ExecutiveReport {
  judul: string;
  generatedAt: string;
  sumberLabel: string;
  ringkasan: { narasi: string; angkaKunci: AngkaKunci[] };
  kpi: KpiItem[];
  ews: { status: 'aktif' | 'belum_aktif'; narasi: string; alerts: ReportAlert[] };
  perubahan: { tersedia: boolean; narasi: string };
  kualitasData: { cakupanTahunPct: number; narasi: string; temuan: string[] };
}

const SEV_STYLES: Record<string, string> = {
  CRITICAL: 'bg-[#FBE3DE] text-[#B3261E] border-[#B3261E]/25',
  WARNING: 'bg-[#F3DCC9] text-[#A15C38] border-[#A15C38]/25',
  INFO: 'bg-[#DCE8DE] text-[#1B4332] border-[#C6C3B4]',
};

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#C6C3B4] rounded-2xl p-5 print:border-[#999] print:break-inside-avoid">
      <h2 className="text-xs font-bold text-[#1B4332] uppercase tracking-wider mb-3">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function KpiDelta({ kpi }: { kpi: KpiItem }) {
  if (kpi.deltaPct === null || !kpi.deltaDir) {
    return <span className="text-[10px] text-[#767D6F]">Δ thn lalu n/a</span>;
  }
  const styles = {
    up: 'text-[#B3261E]',
    down: 'text-[#2D6A4F]',
    flat: 'text-[#767D6F]',
  } as const;
  const arrow = kpi.deltaDir === 'up' ? '▲' : kpi.deltaDir === 'down' ? '▼' : '•';
  return (
    <span className={`text-[10px] font-semibold ${styles[kpi.deltaDir]}`}>
      {arrow} {kpi.deltaPct >= 0 ? '+' : ''}
      {kpi.deltaPct.toFixed(1)}% thd thn lalu
    </span>
  );
}

export default function ExecutiveReport() {
  const [report, setReport] = useState<ExecutiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    fetch('/api/report')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setReport(d.report ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat laporan'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-36 rounded-2xl bg-[#E9E6DA] border border-[#C6C3B4] animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="bg-white border border-[#C6C3B4] rounded-2xl p-8 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-sm text-[#B3261E] mb-4">Gagal memuat laporan: {error ?? 'tidak ada data'}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-[#1B4332] text-white text-sm rounded-lg hover:bg-[#2D6A4F]"
        >
          Coba Lagi
        </button>
      </div>
    );
  }

  const tanggalGenerate = new Date(report.generatedAt).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-4">
      {/* Kepala laporan */}
      <div className="bg-white border border-[#C6C3B4] rounded-2xl p-5 print:border-[#999]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-[#1B4332] leading-tight">{report.judul}</h1>
            <p className="text-xs text-[#767D6F] mt-1">
              Disusun {tanggalGenerate} · Sumber: {report.sumberLabel} · Dihimpun deterministik, tanpa penafsiran AI atas angka
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="print:hidden px-4 py-2 bg-[#1B4332] text-white text-xs font-semibold rounded-lg hover:bg-[#2D6A4F] transition-colors"
          >
            🖨️ Cetak / Simpan PDF
          </button>
        </div>
      </div>

      {/* 1 · Ringkasan Eksekutif */}
      <SectionCard icon="📋" title="Ringkasan Eksekutif">
        <p className="text-sm text-[#4B5249] leading-relaxed mb-4">{report.ringkasan.narasi}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {report.ringkasan.angkaKunci.map((a) => (
            <div key={a.label} className="bg-[#F5F3EC] border border-[#C6C3B4] rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-[#1B4332] leading-tight">{a.nilai}</p>
              <p className="text-[10px] text-[#767D6F] uppercase tracking-wide mt-0.5">{a.label}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 2 · KPI Prioritas */}
      {report.kpi.length > 0 && (
        <SectionCard icon="🎯" title="KPI Prioritas Daerah">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {report.kpi.map((k) => (
              <div key={k.id} className="bg-white border border-[#C6C3B4] rounded-xl p-3" title={`${k.indikator} — ${k.opd}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-sm">{k.icon}</span>
                  <span className="text-[10px] font-semibold text-[#767D6F] uppercase tracking-wide truncate">{k.label}</span>
                </div>
                <p className="text-base font-bold text-[#1B4332] leading-tight">
                  {k.nilai}
                  {k.satuan && <span className="text-[10px] font-medium text-[#767D6F] ml-1">{k.satuan}</span>}
                </p>
                <p className="text-[10px] text-[#767D6F] mt-0.5 truncate">
                  {k.tahun ? `Tahun ${k.tahun}` : 'Tahun tidak tercantum'}
                </p>
                <div className="mt-1.5">
                  <KpiDelta kpi={k} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* 3 · EWS */}
      <SectionCard icon="⚠️" title="Peringatan Dini (EWS)">
        <p className="text-sm text-[#4B5249] leading-relaxed">{report.ews.narasi}</p>
        {report.ews.alerts.length > 0 && (
          <ul className="mt-3 space-y-2">
            {report.ews.alerts.map((a, i) => (
              <li
                key={`${a.indikator}-${i}`}
                className={`border rounded-xl px-3 py-2 text-[11px] leading-relaxed ${SEV_STYLES[a.severity] ?? SEV_STYLES.INFO}`}
              >
                <span className="font-bold uppercase tracking-wide mr-1.5">{a.severity}</span>
                {a.pesan}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 4 · Perubahan Warehouse */}
      <SectionCard icon="🗄️" title="Perubahan Data Antar-Periode">
        <p className="text-sm text-[#4B5249] leading-relaxed">{report.perubahan.narasi}</p>
      </SectionCard>

      {/* 5 · Kualitas Data */}
      <SectionCard icon="🧹" title="Kualitas & Tata Kelola Data">
        <p className="text-sm text-[#4B5249] leading-relaxed">{report.kualitasData.narasi}</p>
        {report.kualitasData.temuan.length > 0 && (
          <ul className="mt-3 space-y-1.5 list-disc list-inside text-sm text-[#4B5249] leading-relaxed">
            {report.kualitasData.temuan.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Kaki */}
      <p className="text-[10px] text-[#767D6F] text-center pb-2 print:text-black">
        Angka dalam laporan ini disalin deterministik dari sumber ({report.sumberLabel}) — bukan hasil penafsiran AI.
      </p>
    </div>
  );
}
