'use client';

import { useState, useEffect, useCallback } from 'react';
import ExecutiveReport from '@/components/ExecutiveReport';

interface LogEntry {
  id: string;
  query: string;
  intent: string | null;
  aiResponse: {
    narasi: string;
    visualisasi?: { tipe: string };
    rekomendasi?: string[];
    dataSource: string;
    timestamp: string;
  } | null;
  metadata: {
    opdFilter?: string;
    totalData?: number;
    filteredCount?: number;
    matchedCount?: number;
    error?: string;
  } | null;
  createdAt: string;
}

interface StatsEntry {
  intent: string;
  count: number;
}

const INTENT_LABELS: Record<string, string> = {
  tren: '📈 Tren',
  perbandingan: '⚖️ Perbandingan',
  nilai_saat_ini: '📊 Nilai Saat Ini',
  rekomendasi: '💡 Rekomendasi',
  ews: '⚠️ EWS',
  umum: '💬 Umum',
  error: '❌ Error',
};

export default function LaporanPage() {
  // PR-3: halaman ini kini punya dua tab — Laporan Eksekutif (generator naratif
  // deterministik, fitur inti yang selama ini belum ada) + Riwayat Query (log).
  const [tab, setTab] = useState<'laporan' | 'riwayat'>('laporan');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<StatsEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [intentFilter, setIntentFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (intentFilter !== 'all') params.set('intent', intentFilter);
      if (searchFilter) params.set('search', searchFilter);
      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo) params.set('to', new Date(dateTo + 'T23:59:59').toISOString());

      const res = await fetch(`/api/chat-logs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setStats(data.stats || []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, [intentFilter, searchFilter, dateFrom, dateTo]);

  // Refresh saat tab kembali visible (bukan polling berkali-kali)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchLogs(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchLogs]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Export ke CSV
  const exportCSV = () => {
    const headers = ['Waktu', 'Pertanyaan', 'Kategori', 'Ringkasan Jawaban', 'Sumber', 'Metadata'];
    const rows = logs.map((l) => [
      new Date(l.createdAt).toLocaleString('id-ID'),
      `"${l.query.replace(/"/g, '""')}"`,
      INTENT_LABELS[l.intent || ''] || l.intent || '-',
      `"${(l.aiResponse?.narasi || '').substring(0, 200).replace(/"/g, '""')}"`,
      l.aiResponse?.dataSource || '-',
      `"${JSON.stringify(l.metadata || {})}"`,
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-ai-query-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getIntentColor = (intent: string | null) => {
    const colors: Record<string, string> = {
      tren: '#1B4332', perbandingan: '#2D6A4F', nilai_saat_ini: '#8A6E1D',
      rekomendasi: '#A15C38', ews: '#B3261E', umum: '#767D6F', error: '#B3261E',
    };
    return colors[intent || ''] || '#767D6F';
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', animation: 'fadeIn 0.3s ease-out' }}>
      {/* Header */}
      <div className="print:hidden" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A6E1D', marginBottom: '4px' }}>
            📋 Laporan & Monitoring
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1E2420', margin: '0 0 6px' }}>
            {tab === 'laporan' ? 'Laporan Eksekutif' : 'Riwayat AI Query'}
          </h1>
          <p style={{ color: '#767D6F', fontSize: '0.9rem', lineHeight: 1.5 }}>
            {tab === 'laporan'
              ? 'Ringkasan naratif kondisi data daerah, disusun deterministik dari sumber — siap cetak untuk pimpinan.'
              : 'Setiap pertanyaan dan respon AI terekam otomatis. Filter, cari, dan export untuk bahan evaluasi.'}
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="print:hidden"
          style={{ padding: '8px 16px', borderRadius: '8px', background: '#1B4332', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', display: tab === 'riwayat' ? undefined : 'none' }}
        >
          🔄 Segarkan
        </button>
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
          }}
          className="print:hidden"
          style={{ padding: '8px 16px', borderRadius: '8px', background: '#B3261E', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', marginTop: '4px' }}
        >
          🚪 Logout
        </button>
      </div>

      {/* Tab bar — PR-3 */}
      <div className="print:hidden" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {([
          { id: 'laporan', label: '📄 Laporan Eksekutif' },
          { id: 'riwayat', label: '🗂️ Riwayat Query AI' },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.82rem',
              background: tab === t.id ? '#1B4332' : '#E9E6DA',
              color: tab === t.id ? '#FFFFFF' : '#4B5249',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Laporan Eksekutif (generator naratif deterministik) */}
      <div style={{ display: tab === 'laporan' ? 'block' : 'none' }}>
        <ExecutiveReport />
      </div>

      {/* Tab: Riwayat Query (konten lama, tidak berubah) */}
      <div style={{ display: tab === 'riwayat' ? 'block' : 'none' }}>

      {/* Stats bar */}
      {stats.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <div style={{ padding: '8px 14px', borderRadius: '8px', background: '#2D6A4F', color: '#fff', fontWeight: 700, fontSize: '0.82rem' }}>
            Total: {total} query
          </div>
          {stats.map((s) => (
            <div key={s.intent} style={{
              padding: '8px 14px', borderRadius: '8px', fontSize: '0.78rem',
              background: s.intent === 'error' ? '#FBE3DE' : '#E9E6DA',
              color: getIntentColor(s.intent), fontWeight: 600,
              border: `1px solid ${getIntentColor(s.intent)}20`,
            }}>
              {INTENT_LABELS[s.intent] || s.intent}: {s.count}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input
          placeholder="Cari pertanyaan..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid #C6C3B4',
            background: '#F5F3EC', color: '#1E2420', fontSize: '0.82rem', flex: 1, minWidth: '180px',
            outline: 'none',
          }}
        />
        <select
          value={intentFilter}
          onChange={(e) => setIntentFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #C6C3B4', background: '#F5F3EC', color: '#1E2420', fontSize: '0.82rem', fontWeight: 600 }}
        >
          <option value="all">Semua Kategori</option>
          {Object.entries(INTENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #C6C3B4', background: '#F5F3EC', color: '#1E2420', fontSize: '0.82rem' }} />
        <span style={{ color: '#767D6F', fontSize: '0.8rem' }}>s/d</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #C6C3B4', background: '#F5F3EC', color: '#1E2420', fontSize: '0.82rem' }} />
        <button onClick={fetchLogs}
          style={{ padding: '8px 16px', borderRadius: '8px', background: '#1B4332', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
          🔍 Cari
        </button>
        <button onClick={exportCSV}
          style={{ padding: '8px 16px', borderRadius: '8px', background: '#D9C284', color: '#1E2420', border: 'none', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#767D6F' }}>
          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
          Memuat riwayat query...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ padding: '20px', borderRadius: '12px', background: '#FBE3DE', color: '#B3261E', border: '1px solid #B3261E30', textAlign: 'center' }}>
          ❌ {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && logs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#767D6F' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🤖</div>
          <h3 style={{ color: '#1E2420', margin: '0 0 6px' }}>Belum Ada Riwayat Query</h3>
          <p style={{ fontSize: '0.9rem' }}>
            Setelah SAPA Smart AI digunakan, riwayat pertanyaan akan muncul di sini secara otomatis.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && logs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {logs.map((entry) => {
            const isExpanded = expandedId === entry.id;
            return (
              <div key={entry.id} style={{
                borderRadius: '12px', border: '1px solid #C6C3B4',
                background: '#FFFFFF', overflow: 'hidden',
                transition: 'box-shadow 0.2s',
              }}>
                {/* Collapsed row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  style={{
                    padding: '14px 18px', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      {entry.intent && <span style={{
                        fontSize: '0.68rem', fontWeight: 700, padding: '1px 8px', borderRadius: '4px',
                        background: entry.intent === 'error' ? '#FBE3DE' : '#E9E6DA',
                        color: getIntentColor(entry.intent),
                        border: `1px solid ${getIntentColor(entry.intent)}40`,
                      }}>
                        {INTENT_LABELS[entry.intent] || entry.intent}
                      </span>}
                      <span style={{ fontSize: '0.72rem', color: '#767D6F' }}>
                        {new Date(entry.createdAt).toLocaleString('id-ID')}
                      </span>
                      {entry.metadata?.error && (
                        <span style={{ fontSize: '0.68rem', color: '#B3261E', fontWeight: 600 }}>❌ Error</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1E2420', lineHeight: 1.4 }}>
                      {entry.query}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {entry.aiResponse?.visualisasi?.tipe && entry.aiResponse.visualisasi.tipe !== 'none' && (
                      <span style={{ fontSize: '0.72rem', color: '#767D6F', background: '#E9E6DA', padding: '2px 8px', borderRadius: '4px' }}>
                        {entry.aiResponse.visualisasi.tipe === 'table' ? '📊' : entry.aiResponse.visualisasi.tipe === 'chart' ? '📈' : entry.aiResponse.visualisasi.tipe === 'metric' ? '📏' : '🗺️'}
                      </span>
                    )}
                    <span style={{ fontSize: '1.1rem', color: '#767D6F', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>›</span>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '0 18px 16px', borderTop: '1px solid #E9E6DA' }}>
                    {entry.aiResponse?.narasi && (
                      <div style={{ margin: '12px 0', padding: '12px', borderRadius: '8px', background: '#F5F3EC', fontSize: '0.84rem', lineHeight: 1.6, color: '#1E2420' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#8A6E1D', marginBottom: '6px' }}>JAWABAN AI</div>
                        {(() => {
                          const n = entry.aiResponse.narasi || '';
                          const isRawJson = n.trim().startsWith('{') || n.trim().startsWith('[') || n.trim().startsWith('```');
                          return isRawJson
                            ? 'Maaf, AI gagal memformat respons. Silakan tanya ulang dengan kalimat lebih spesifik.'
                            : n;
                        })()}
                      </div>
                    )}

                    {entry.aiResponse?.rekomendasi && entry.aiResponse.rekomendasi.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.72rem', color: '#A15C38', marginBottom: '4px' }}>💡 REKOMENDASI</div>
                        {entry.aiResponse.rekomendasi.map((r, i) => (
                          <div key={i} style={{ fontSize: '0.82rem', color: '#1E2420', padding: '2px 0' }}>{i + 1}. {r}</div>
                        ))}
                      </div>
                    )}

                    {entry.metadata && (
                      <div style={{ fontSize: '0.72rem', color: '#767D6F', display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {entry.metadata.opdFilter && <span>🏢 Filter OPD: {entry.metadata.opdFilter}</span>}
                        {entry.metadata.totalData !== undefined && <span>📦 Total data: {entry.metadata.totalData}</span>}
                        {entry.metadata.filteredCount !== undefined && <span>🔍 Terfilter: {entry.metadata.filteredCount}</span>}
                        {entry.metadata.matchedCount !== undefined && <span>🎯 Cocok: {entry.metadata.matchedCount}</span>}
                        {entry.metadata.error && <span style={{ color: '#B3261E' }}>❌ {entry.metadata.error}</span>}
                      </div>
                    )}

                    <div style={{ fontSize: '0.7rem', color: '#767D6F' }}>
                      ID: {entry.id} | Sumber: {entry.aiResponse?.dataSource || '-'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      </div>{/* end tab riwayat */}
    </div>
  );
}
