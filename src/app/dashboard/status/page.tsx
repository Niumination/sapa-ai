'use client';
import { useState, useEffect, useCallback } from 'react';

interface StatusData {
  status: string;
  source: string;
  overview: { totalRecords: number; totalOpd: number; totalIndicators: number };
  kabupaten?: { totalRecords: number; totalOpd: number; totalIndicators: number };
  lastFetched: string;
}

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const fetchStatus = useCallback(async () => {
    setBusy(true); setError('');
    const t0 = performance.now();
    try {
      const r = await fetch('/api/sapa');
      const t1 = performance.now();
      setLatencyMs(Math.round(t1 - t0));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.status === 'error' && !d.overview) throw new Error(d.error || 'Gagal memuat');
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat status sumber.');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  if (busy) return <div className="p-6 space-y-4"><div className="h-6 w-48 bg-[var(--surface-muted)] rounded animate-pulse" /><div className="grid grid-cols-3 gap-4">{[1,2,3].map(i=><div key={i} className="h-24 bg-[var(--surface-muted)] rounded-2xl animate-pulse" />)}</div></div>;
  if (error) return <div className="p-6"><div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-tint)] p-4 text-sm text-[var(--danger)]">{error} <button onClick={fetchStatus} className="ml-3 underline">Coba lagi</button></div></div>;

  const ov = data?.overview ?? data?.kabupaten;
  const isOnline = data?.status === 'ok';

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand)]">Status & Tentang</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Kesehatan SAPA SPLP + informasi aplikasi (publik tanpa login)</p>
        </div>
        <button onClick={fetchStatus} className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)]">🔄 Muat ulang</button>
      </div>

      {/* Health banner */}
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${isOnline ? 'border-[var(--brand)]/20 bg-[var(--brand-tint)]' : 'border-[var(--danger)]/30 bg-[var(--danger-tint)]'}`}>
        <span className={`w-3 h-3 rounded-full ${isOnline ? 'bg-[var(--brand)] animate-pulse' : 'bg-[var(--danger)]'}`} />
        <div className="text-sm">
          <p className={`font-bold ${isOnline ? 'text-[var(--brand)]' : 'text-[var(--danger)]'}`}>{isOnline ? '● Online' : '● Offline'} — {data?.source || 'SAPA SPLP'}</p>
          <p className="text-[var(--text-muted)] text-xs">api-splp.layanan.go.id/sapa/1.0/api/daftar_data • Latensi {latencyMs ?? '—'} ms • {data?.lastFetched ? new Date(data.lastFetched).toLocaleString('id-ID') : '—'}</p>
        </div>
        <span className="ml-auto text-xs px-3 py-1 rounded-full bg-[var(--surface-card)] border border-[var(--border)]">Publik — tanpa login</span>
      </div>

      {/* Metrics */}
      {ov && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard label="Total Records" value={ov.totalRecords} sub="Baris data SPLP" />
          <MetricCard label="OPD" value={ov.totalOpd} sub="Unit pengampu" />
          <MetricCard label="Indikator Unik" value={ov.totalIndicators} sub="Kode indikator" />
          <MetricCard label="Latensi API" value={latencyMs ?? 0} suffix=" ms" sub={latencyMs !== null && latencyMs < 800 ? 'Baik' : latencyMs !== null && latencyMs < 2000 ? 'Sedang' : 'Lambat'} />
        </div>
      )}

      {/* Detail koneksi */}
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-[var(--brand)] text-sm">Detail Koneksi</h2>
        <DetailRow label="Endpoint" value="https://api-splp.layanan.go.id/sapa/1.0/api/daftar_data" mono />
        <DetailRow label="OAuth" value="https://sapa.acehtengahkab.go.id/oauth/token (client_credentials)" mono />
        <DetailRow label="Sumber label" value={data?.source || '—'} />
        <DetailRow label="Terakhir diperbarui" value={data?.lastFetched ? new Date(data.lastFetched).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' }) : '—'} />
        <DetailRow label="Cache" value="Tidak ada — setiap request fetch ulang dari SPLP (deterministik)" />
        <p className="text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border)]">Jika Offline, periksa env <code className="px-1 py-0.5 bg-[var(--surface-muted)] rounded">SAPA_CLIENT_SECRET</code> di Vercel dan konektivitas ke api-splp.layanan.go.id</p>
      </div>

      {/* Tentang aplikasi — gabungan dari /dashboard/akun */}
      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-[var(--brand)]">🔓 Akses Publik</h2>
        <p className="text-sm text-[var(--text-body)]">Aplikasi ini berjalan <strong>tanpa autentikasi</strong>. Semua fitur dashboard, analitik, GIS, laporan, dan AI Smart Query dapat diakses siapa saja. Tidak ada manajemen akun atau reset password di versi publik.</p>
        <p className="text-xs text-[var(--text-muted)]">sapa-ai adalah aplikasi SAPA-only: seluruh jawaban dihitung deterministik dari data SAPA SPLP, tanpa model AI/LLM dan tanpa database.</p>
      </div>

      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-[var(--brand)]">📚 Sumber Data</h2>
        <ul className="text-sm text-[var(--text-body)] space-y-2 list-disc list-inside">
          <li><strong>SAPA Aceh Tengah</strong> — <a href="https://sapa.acehtengahkab.go.id" target="_blank" rel="noopener noreferrer" className="text-[var(--brand)] underline">sapa.acehtengahkab.go.id</a> via SPLP API <code className="text-xs">api-splp.layanan.go.id/sapa/1.0/api/daftar_data</code></li>
          <li><strong>Regulasi:</strong> Satu Data Indonesia — 38 OPD pengampu, 1790+ indikator</li>
          <li><strong>Pembaruan:</strong> Real-time per request (tanpa cache lokal), deterministik</li>
        </ul>
      </div>

      <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5 space-y-3">
        <h2 className="font-bold text-[var(--brand)]">🔗 Tautan</h2>
        <div className="flex flex-wrap gap-3">
          <a href="https://github.com/Niumination/sapa-ai" target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-sm rounded-xl bg-[var(--brand)] text-white hover:bg-[var(--brand-soft)]">GitHub — Niumination/sapa-ai</a>
          <a href="/dashboard" className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)]">← Dashboard</a>
          <a href="/dashboard/laporan" className="px-4 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--surface-card)] hover:bg-[var(--surface-muted)]">Laporan & Riwayat</a>
        </div>
        <p className="text-xs text-[var(--text-muted)]">Deploy: Vercel (auto dari <code>main</code>) • Next.js 16 + React 19 + Tailwind • SPLP-only</p>
      </div>

      <div className="bg-[var(--brand-tint)] border border-[var(--brand)]/20 rounded-2xl p-4 text-sm text-[var(--text-body)]">
        Data sensitif (mis. DTSEN/Bapokting) tidak dicakup sapa-ai publik — aplikasi ini hanya menyajikan data SAPA terbuka.
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, suffix='' }: { label: string; value: number; sub: string; suffix?: string }) {
  return (
    <div className="bg-[var(--surface-card)] border border-[var(--border)] rounded-2xl p-5">
      <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</p>
      <p className="text-2xl font-bold text-[var(--brand)] mt-1">{value.toLocaleString('id-ID')}{suffix}</p>
      <p className="text-xs text-[var(--text-muted)]">{sub}</p>
    </div>
  );
}
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 py-1.5 border-b border-[var(--border)]/50 last:border-0">
      <span className="text-xs text-[var(--text-muted)] w-36 shrink-0">{label}</span>
      <span className={`text-sm text-[var(--text-body)] break-all ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
