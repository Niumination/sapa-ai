'use client';

import React, { useState, useEffect, useCallback } from 'react';

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
interface HistoryItem {
  id: string;
  query: string;
  answer: string;
  source: string;
  matched: number;
  count: number;
  timestamp: string;
}

const HISTORY_KEY = 'sapa-ai-history';
const MAX_HISTORY = 50;

function loadHistory(): HistoryItem[] {
  try { const raw = localStorage.getItem(HISTORY_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveHistory(items: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch {}
}

export default function LaporanPage() {
  const [tab, setTab] = useState<'laporan' | 'riwayat'>('laporan');
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Listen for new queries from dashboard QueryBar via custom event + storage
  useEffect(() => {
    setHistory(loadHistory());
    const onStorage = () => setHistory(loadHistory());
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as HistoryItem | undefined;
      if (detail) {
        const cur = loadHistory();
        const next = [detail, ...cur.filter(h => h.id !== detail.id)].slice(0, MAX_HISTORY);
        saveHistory(next);
        setHistory(next);
      } else {
        setHistory(loadHistory());
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('sapa-history-update' as any, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('sapa-history-update' as any, onCustom);
    };
  }, []);

  useEffect(() => {
    fetch('/api/report')
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((json: ReportResponse & { error?: string }) => { if (json.error) throw new Error(json.error); setData(json); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat laporan'))
      .finally(() => setLoading(false));
  }, []);

  const filteredHistory = history.filter(h => !search || h.query.toLowerCase().includes(search.toLowerCase()) || h.answer.toLowerCase().includes(search.toLowerCase()));

  const exportCSV = () => {
    const headers = ['Waktu','Pertanyaan','Jawaban','Matched','Sumber'];
    const rows = filteredHistory.map(h => [
      new Date(h.timestamp).toLocaleString('id-ID'),
      `"${h.query.replace(/"/g,'""')}"`,
      `"${h.answer.replace(/"/g,'""')}"`,
      String(h.matched),
      h.source,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`sapa-ai-riwayat-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    if (!confirm('Hapus semua riwayat query lokal?')) return;
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
    window.dispatchEvent(new Event('storage'));
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-[var(--surface-muted)] rounded-lg w-48" />
        <div className="grid grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-[var(--surface-muted)] rounded-2xl animate-pulse" />)}</div>
        <div className="h-[400px] bg-[var(--surface-muted)] rounded-2xl animate-pulse" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-[var(--danger)] text-sm mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[var(--brand)] text-white text-sm rounded-lg">Coba Lagi</button>
      </div>
    );
  }
  if (!data) return null;

  const maxRecords = Math.max(...data.opdBreakdown.map(o => o.jumlahIndikator), 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand)]">{tab==='laporan' ? 'Laporan Eksekutif SAPA' : 'Riwayat AI Query'}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{tab==='laporan' ? `Deterministik dari SPLP — ${new Date(data.summary.timestamp).toLocaleString('id-ID')}` : `${history.length} query tersimpan lokal (tanpa login, tanpa DB)`}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {(['laporan','riwayat'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm rounded-xl font-semibold border ${tab===t ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--surface-card)] text-[var(--text-body)] border-[var(--border)] hover:bg-[var(--surface-muted)]'}`}>
            {t==='laporan' ? '📄 Laporan Eksekutif' : `🗂️ Riwayat Query (${history.length})`}
          </button>
        ))}
      </div>

      {tab==='laporan' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5"><p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">Total Data</p><p className="text-3xl font-bold text-[var(--brand)] mt-1">{data.summary.totalRecords.toLocaleString()}</p><p className="text-xs text-[var(--text-muted)]">Record SPLP</p></div>
            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5"><p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">Total OPD</p><p className="text-3xl font-bold text-[var(--brand)] mt-1">{data.summary.totalOpd}</p><p className="text-xs text-[var(--text-muted)]">Unit Kerja</p></div>
            <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5"><p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">Indikator Unik</p><p className="text-3xl font-bold text-[var(--brand)] mt-1">{data.summary.totalIndikatorUnik}</p><p className="text-xs text-[var(--text-muted)]">Variabel</p></div>
          </div>
          <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-2">
            <p className="text-sm text-[var(--text-body)]"><strong className="text-[var(--brand)]">Sumber:</strong> {data.summary.sumber}</p>
            <p className="text-xs text-[var(--text-muted)]">{data.summary.catatan}</p>
          </div>
          <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
            <h2 className="text-lg font-bold text-[var(--brand)] mb-4">📋 Distribusi Data per OPD</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)] text-[var(--text-muted)]"><th className="text-left py-3 px-3">OPD</th><th className="text-right py-3 px-3">Jumlah</th><th className="text-right py-3 px-3">Indikator Unik</th><th className="text-left py-3 px-3">Kontribusi</th><th className="text-right py-3 px-3">%</th></tr></thead>
                <tbody>{data.opdBreakdown.map((opd,i) => (
                  <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-muted)]"><td className="py-3 px-3">{opd.nama}</td><td className="py-3 px-3 text-right">{opd.jumlahIndikator.toLocaleString()}</td><td className="py-3 px-3 text-right">{opd.indikatorUnik}</td><td className="py-3 px-3"><div className="w-full bg-[var(--surface-muted)] rounded-full h-2"><div className="bg-[var(--brand)] h-2 rounded-full" style={{width:`${(opd.jumlahIndikator/maxRecords)*100}%`}} /></div></td><td className="py-3 px-3 text-right font-medium text-[var(--brand)]">{opd.kontribusiPersen}%</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="text-center text-xs text-[var(--text-muted)]">Laporan deterministik dari feed SPLP — tanpa cache, tanpa PII. Riwayat query ada di tab sebelah.</div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <input placeholder="Cari pertanyaan / jawaban..." value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] text-sm" />
            <button onClick={exportCSV} disabled={filteredHistory.length===0} className="px-4 py-2 text-sm rounded-xl bg-[var(--brand)] text-white disabled:opacity-50">⬇ Export CSV</button>
            <button onClick={clearHistory} disabled={history.length===0} className="px-4 py-2 text-sm rounded-xl border border-[var(--danger)]/30 text-[var(--danger)] disabled:opacity-50">🗑 Hapus</button>
          </div>
          {filteredHistory.length===0 ? (
            <div className="text-center py-16 text-[var(--text-muted)]">
              <div className="text-4xl mb-3">🤖</div>
              <p className="font-semibold text-[var(--text-body)]">Belum Ada Riwayat</p>
              <p className="text-sm mt-1">Tanyakan sesuatu di Beranda via AI Smart Query — riwayat akan muncul di sini otomatis (disimpan di browser, tanpa login).</p>
              <a href="/dashboard" className="inline-block mt-4 px-4 py-2 text-sm rounded-xl bg-[var(--brand)] text-white">→ Ke Beranda</a>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredHistory.map(h => {
                const isOpen = expanded===h.id;
                return (
                  <div key={h.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden">
                    <button onClick={()=>setExpanded(isOpen?null:h.id)} className="w-full text-left p-4 flex justify-between gap-3 hover:bg-[var(--surface-muted)]/50">
                      <div className="min-w-0">
                        <div className="flex gap-2 items-center text-xs text-[var(--text-muted)]"><span>{new Date(h.timestamp).toLocaleString('id-ID')}</span><span className="px-2 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)]">matched {h.matched}/{h.count}</span><span>{h.source}</span></div>
                        <p className="font-semibold text-[var(--text-body)] mt-1 line-clamp-1">{h.query}</p>
                      </div>
                      <span className={`shrink-0 text-[var(--text-muted)] transition ${isOpen?'rotate-90':''}`}>›</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-[var(--border)]/50 pt-3 space-y-2">
                        <p className="text-xs font-bold text-[var(--brand)] uppercase tracking-wider">Jawaban AI</p>
                        <p className="text-sm text-[var(--text-body)] leading-relaxed bg-[var(--surface-muted)] rounded-xl p-3">{h.answer}</p>
                        <p className="text-xs text-[var(--text-muted)]">ID: {h.id}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
