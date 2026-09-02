'use client';

import React, { useState, useEffect } from 'react';
import ExecutiveReport from '@/components/ExecutiveReport';

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
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

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
      } else setHistory(loadHistory());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('sapa-history-update' as any, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('sapa-history-update' as any, onCustom);
    };
  }, []);

  const filtered = history.filter(h => !search || h.query.toLowerCase().includes(search.toLowerCase()) || h.answer.toLowerCase().includes(search.toLowerCase()));

  const exportCSV = () => {
    const headers = ['Waktu','Pertanyaan','Jawaban','Matched','Sumber'];
    const rows = filtered.map(h => [
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--brand)]">{tab==='laporan' ? 'Laporan Eksekutif — SAPA' : 'Riwayat AI Query'}</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {tab==='laporan'
            ? 'Naratif deterministik dari SAPA SPLP — tanpa LLM, siap cetak untuk pimpinan.'
            : `${history.length} query tersimpan di browser (tanpa login, tanpa DB)`}
        </p>
      </div>

      <div className="flex gap-2">
        {(['laporan','riwayat'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm rounded-xl font-semibold border ${tab===t ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--surface-card)] text-[var(--text-body)] border-[var(--border)] hover:bg-[var(--surface-muted)]'}`}>
            {t==='laporan' ? '📄 Laporan Eksekutif' : `🗂️ Riwayat Query (${history.length})`}
          </button>
        ))}
      </div>

      {tab==='laporan' ? (
        <ExecutiveReport />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <input placeholder="Cari pertanyaan / jawaban..." value={search} onChange={e=>setSearch(e.target.value)} className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] text-sm" />
            <button onClick={exportCSV} disabled={filtered.length===0} className="px-4 py-2 text-sm rounded-xl bg-[var(--brand)] text-white disabled:opacity-50">⬇ Export CSV</button>
            <button onClick={clearHistory} disabled={history.length===0} className="px-4 py-2 text-sm rounded-xl border border-[var(--danger)]/30 text-[var(--danger)] disabled:opacity-50">🗑 Hapus</button>
          </div>
          {filtered.length===0 ? (
            <div className="text-center py-16 text-[var(--text-muted)]">
              <div className="text-4xl mb-3">🤖</div>
              <p className="font-semibold text-[var(--text-body)]">Belum Ada Riwayat</p>
              <p className="text-sm mt-1">Tanyakan sesuatu di Beranda via AI Smart Query — riwayat akan muncul di sini otomatis.</p>
              <a href="/dashboard" className="inline-block mt-4 px-4 py-2 text-sm rounded-xl bg-[var(--brand)] text-white">→ Ke Beranda</a>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(h => {
                const open = expanded===h.id;
                return (
                  <div key={h.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] overflow-hidden">
                    <button onClick={()=>setExpanded(open?null:h.id)} className="w-full text-left p-4 flex justify-between gap-3 hover:bg-[var(--surface-muted)]/50">
                      <div className="min-w-0">
                        <div className="flex gap-2 items-center text-xs text-[var(--text-muted)]"><span>{new Date(h.timestamp).toLocaleString('id-ID')}</span><span className="px-2 py-0.5 rounded-full bg-[var(--surface-muted)] border border-[var(--border)]">matched {h.matched}/{h.count}</span><span>{h.source}</span></div>
                        <p className="font-semibold text-[var(--text-body)] mt-1 line-clamp-1">{h.query}</p>
                      </div>
                      <span className={`shrink-0 text-[var(--text-muted)] transition ${open?'rotate-90':''}`}>›</span>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 border-t border-[var(--border)]/50 pt-3 space-y-2">
                        <p className="text-xs font-bold text-[var(--brand)] uppercase tracking-wider">Jawaban AI</p>
                        <p className="text-sm text-[var(--text-body)] leading-relaxed bg-[var(--surface-muted)] rounded-xl p-3 whitespace-pre-wrap">{h.answer}</p>
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
