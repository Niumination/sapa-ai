'use client';

import { useState, useEffect, useCallback } from 'react';

interface RilisInfo {
  id: string;
  releaseNumber: string;
  status: string;
  versi: string;
  jalur: string;
  sourceSlug?: string;
  totalBaris: number;
  ditolak: number;
  uploadedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  individu?: number;
  agregat?: number;
}

interface SumberInfo {
  slug: string;
  nama: string;
  sensitivity: string;
  provenanceLabel: string | null;
  ownerInstansi: string | null;
  rilis: RilisInfo[];
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  PUBLISHED: { bg: '#DCE8DE', color: '#1B4332', label: '● Aktif' },
  STAGING: { bg: '#FFF4D6', color: '#8A6E1D', label: '◐ Staging' },
  SUPERSEDED: { bg: '#E9E6DA', color: '#767D6F', label: '○ Digantikan' },
};

const SENS_LABEL: Record<string, string> = {
  PUBLIC: 'Publik',
  RESTRICTED_AGGR: 'Terbatas (agregat)',
  RESTRICTED_PERSONAL: 'Terbatas (personal)',
};

// ─── Diagram relasi antar sumber (SVG) — kondisi aktual 29-Agu-2026 ───
function SourceRelationDiagram() {
  const box = (x: number, y: number, w: number, h: number, fill: string, stroke: string, title: string, sub?: string, textColor = '#1E2420') => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={y + (sub ? h / 2 - 2 : h / 2 + 4)} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={textColor}>{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontSize={9} fill="#767D6F">{sub}</text>}
    </g>
  );
  const arrow = (x1: number, y1: number, x2: number, y2: number, label?: string, dashed = false) => (
    <g key={`a-${x1}-${y1}-${x2}-${y2}`}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2D6A4F" strokeWidth={1.8} strokeDasharray={dashed ? '5,4' : undefined} markerEnd="url(#arr)" />
      {label && (
        <g>
          <rect x={(x1 + x2) / 2 - 55} y={(y1 + y2) / 2 - 11} width={110} height={22} rx={6} fill="#F5F3EC" stroke="#C6C3B4" strokeWidth={0.8} />
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} textAnchor="middle" fontSize={8.5} fill="#4B5249" fontWeight={600}>{label}</text>
        </g>
      )}
    </g>
  );

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #C6C3B4', borderRadius: '16px', padding: '20px', marginBottom: '20px', overflowX: 'auto' }}>
      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1B4332', margin: '0 0 4px' }}>🔗 Relasi Antar Sumber Data</h2>
      <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#767D6F' }}>
        Alur data aktual: sumber mentah → warehouse/rilis → query planner → output AI (fusion multi-sumber).
      </p>
      <svg viewBox="0 0 960 470" width="100%" style={{ minWidth: 760 }} role="img" aria-label="Diagram relasi antar sumber data DTSEN, SAPA, Bapokting, dan Dokumen">
        <defs>
          <marker id="arr" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 9 3.5, 0 7" fill="#2D6A4F" />
          </marker>
        </defs>

        {/* ===== Kolom 1: Sumber Mentah (x=20) ===== */}
        <text x={20} y={22} fontSize={10} fontWeight={800} fill="#8A6E1D" letterSpacing={1}>SUMBER MENTAH</text>
        {box(20, 32, 220, 64, '#FDE8E8', '#B3261E', 'SAPA API', 'api-splp.layanan.go.id · publik')}
        {box(20, 108, 220, 64, '#FFF4D6', '#8A6E1D', 'DTSEN BAPPEDA CSV', 'export Des 2025 · 235.011 jiwa')}
        {box(20, 184, 220, 64, '#E9E6DA', '#767D6F', 'DTSEN SPLP API', 'JWT 401 · nonaktif sementara')}
        {box(20, 260, 220, 64, '#DCE8DE', '#2D6A4F', 'Dokumen A/B/C Excel', 'Diknas · Dinkes · Kominfo')}
        {box(20, 336, 220, 64, '#DCE8DE', '#2D6A4F', 'Bapokting SPLP', '76 komoditas · harga pangan')}

        {/* ===== Kolom 2: Warehouse / Rilis (x=310) ===== */}
        <text x={310} y={22} fontSize={10} fontWeight={800} fill="#8A6E1D" letterSpacing={1}>WAREHOUSE / RILIS</text>
        {box(310, 32, 220, 64, '#F5F3EC', '#8A6E1D', 'DTSEN Release', 'BAPPEDA-DES-2025 · PUBLISHED')}
        {box(310, 108, 220, 64, '#F5F3EC', '#C6C3B4', 'DtsenIndividu', 'NIK HMAC · nama termask')}
        {box(310, 184, 220, 64, '#F5F3EC', '#C6C3B4', 'DtsenAgregatWilayah', '2.060 kelompok · k≥5')}
        {box(310, 260, 220, 64, '#F5F3EC', '#C6C3B4', 'DataSource Registry', '7 sumber terdaftar')}
        {box(310, 336, 220, 64, '#F5F3EC', '#C6C3B4', 'DataAccessAudit', 'lookup NIK tercatat')}

        {/* ===== Kolom 3: Query Planner (x=600) ===== */}
        <text x={600} y={22} fontSize={10} fontWeight={800} fill="#8A6E1D" letterSpacing={1}>QUERY PLANNER</text>
        {box(600, 32, 220, 72, '#1B4332', '#1B4332', 'AI Query Planner', 'intent · filter · sensor k-anon', '#FFFFFF')}
        {box(600, 122, 220, 72, '#1B4332', '#1B4332', 'Fusi Multi-Sumber', 'SAPA + DTSEN + Dokumen', '#FFFFFF')}
        {box(600, 212, 220, 72, '#2D6A4F', '#2D6A4F', 'Lookup by-NIK', 'role DTSEN · audit wajib', '#FFFFFF')}
        {box(600, 302, 220, 72, '#767D6F', '#767D6F', 'Defleksi Privasi', 'publik → NIK ditolak', '#FFFFFF')}

        {/* ===== Kolom 4: Output (x=880) ===== */}
        <text x={880} y={22} fontSize={10} fontWeight={800} fill="#8A6E1D" letterSpacing={1}>OUTPUT</text>
        {box(860, 32, 90, 130, '#DCE8DE', '#2D6A4F', 'Chat AI', 'dashboard')}
        {box(860, 180, 90, 130, '#DCE8DE', '#2D6A4F', 'Konsol DTSEN', 'admin')}

        {/* ===== Panah: Sumber → Warehouse ===== */}
        {arrow(240, 64, 310, 64, 'fetch')}
        {arrow(240, 140, 310, 140, 'import → publish')}
        {arrow(240, 216, 310, 216, '401 → skip', true)}
        {arrow(240, 292, 310, 292, 'deterministik')}
        {arrow(240, 368, 310, 368, 'fetch harga')}

        {/* ===== Panah: Warehouse → Query ===== */}
        {arrow(530, 64, 600, 68, 'rilis aktif')}
        {arrow(530, 140, 600, 150, 'agregat')}
        {arrow(530, 216, 600, 232, 'bansos')}
        {arrow(530, 292, 600, 318, 'registri')}
        {arrow(530, 368, 600, 368, 'audit', true)}

        {/* ===== Panah: Query → Output ===== */}
        {arrow(820, 68, 860, 70, 'SSE')}
        {arrow(820, 158, 860, 160, 'JSON')}
        {arrow(820, 248, 860, 250, 'restricted')}
        {arrow(820, 338, 860, 340, 'tolak', true)}
      </svg>
    </div>
  );
}


export default function StatusSumberPage() {
  const [data, setData] = useState<{ ringkasan: any; sumber: SumberInfo[]; rilis: RilisInfo[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  const fetchStatus = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/dtsen/status');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Gagal memuat status');
      setData(d);
    } catch (e: any) {
      setError(e.message ?? 'Gagal memuat status sumber.');
      if (String(e.message).includes('login')) window.location.href = '/login';
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // @hotfix 29-Agu-2026: halaman ini butuh login (role DTSEN/ADMIN/SUPERADMIN) —
  // publik diarahkan ke /login. Sidebar juga menyembunyikan item ini untuk publik.
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.authenticated || !d?.admin) window.location.href = '/login';
      })
      .catch(() => (window.location.href = '/login'));
  }, []);

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8A6E1D', marginBottom: '4px' }}>
            🗂️ Status Sumber Data
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1E2420', margin: '0 0 6px' }}>Sumber & Rilis Tersimpan</h1>
          <p style={{ color: '#767D6F', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Registry seluruh sumber data (SAPA, DTSEN, Bapokting, Dokumen) + rilis yang tersimpan di warehouse.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={busy}
          style={{ padding: '8px 16px', borderRadius: '8px', background: '#1B4332', color: '#fff', border: 'none', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
        >
          🔄 Segarkan
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#FDE8E8', color: '#B3261E', border: '1px solid #B3261E', marginBottom: '16px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Diagram relasi antar sumber */}
      <SourceRelationDiagram />

      {/* Ringkasan */}
      {data?.ringkasan && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total Sumber', value: data.ringkasan.totalSumber, icon: '🗃️' },
            { label: 'Total Rilis', value: data.ringkasan.totalRilis, icon: '📦' },
            { label: 'Rilis Aktif', value: data.ringkasan.rilisAktif, icon: '🟢' },
            { label: 'Individu Tersimpan', value: data.ringkasan.totalIndividu.toLocaleString('id-ID'), icon: '👥' },
            { label: 'Kelompok Agregat', value: data.ringkasan.totalAgregat.toLocaleString('id-ID'), icon: '📊' },
          ].map((k) => (
            <div key={k.label} style={{ background: '#FFFFFF', border: '1px solid #C6C3B4', borderRadius: '14px', padding: '14px 16px' }}>
              <div style={{ fontSize: '1.3rem' }}>{k.icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1B4332' }}>{k.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#767D6F', fontWeight: 600 }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Per Sumber */}
      {data?.sumber.map((s) => (
        <div key={s.slug} style={{ background: '#FFFFFF', border: '1px solid #C6C3B4', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1E2420', margin: 0 }}>
                {s.nama}
                <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: '#E9E6DA', color: '#4B5249', verticalAlign: 'middle' }}>
                  {s.slug}
                </span>
              </h2>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#767D6F' }}>
                {SENS_LABEL[s.sensitivity] ?? s.sensitivity} · {s.ownerInstansi ?? '-'}
              </p>
              {s.provenanceLabel && (
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#8A6E1D', fontStyle: 'italic' }}>{s.provenanceLabel}</p>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#767D6F', fontWeight: 600 }}>
              {s.rilis.length} rilis
            </div>
          </div>

          {s.rilis.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: '#767D6F', fontStyle: 'italic' }}>Belum ada rilis tersimpan untuk sumber ini.</p>
          ) : (
            <table className="w-full text-xs" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #C6C3B4', textAlign: 'left', color: '#767D6F' }}>
                  <th style={{ padding: '8px', fontWeight: 700 }}>Status</th>
                  <th style={{ padding: '8px', fontWeight: 700 }}>Release</th>
                  <th style={{ padding: '8px', fontWeight: 700 }}>Versi</th>
                  <th style={{ padding: '8px', fontWeight: 700 }}>Baris</th>
                  <th style={{ padding: '8px', fontWeight: 700 }}>Individu</th>
                  <th style={{ padding: '8px', fontWeight: 700 }}>Agregat</th>
                  <th style={{ padding: '8px', fontWeight: 700 }}>Diunggah</th>
                  <th style={{ padding: '8px', fontWeight: 700 }}>Dipublish</th>
                </tr>
              </thead>
              <tbody>
                {s.rilis.map((r) => {
                  const st = STATUS_STYLE[r.status] ?? { bg: '#E9E6DA', color: '#767D6F', label: r.status };
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #E9E6DA' }}>
                      <td style={{ padding: '8px' }}>
                        <span style={{ background: st.bg, color: st.color, padding: '2px 10px', borderRadius: '20px', fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px', fontWeight: 600, color: '#1E2420' }}>{r.releaseNumber}</td>
                      <td style={{ padding: '8px', color: '#4B5249' }}>{r.versi}</td>
                      <td style={{ padding: '8px', color: '#4B5249' }}>{r.totalBaris.toLocaleString('id-ID')}</td>
                      <td style={{ padding: '8px', color: '#4B5249' }}>{(r.individu ?? 0).toLocaleString('id-ID')}</td>
                      <td style={{ padding: '8px', color: '#4B5249' }}>{(r.agregat ?? 0).toLocaleString('id-ID')}</td>
                      <td style={{ padding: '8px', color: '#767D6F' }}>{r.uploadedBy ?? '-'}</td>
                      <td style={{ padding: '8px', color: '#767D6F' }}>{fmt(r.publishedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Legenda SUPERSEDED */}
      <div style={{ background: '#F5F3EC', border: '1px dashed #C6C3B4', borderRadius: '12px', padding: '14px 18px', fontSize: '0.8rem', color: '#4B5249', lineHeight: 1.6 }}>
        <strong style={{ color: '#1B4332' }}>📌 Apa itu status rilis?</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
          <li><strong>● Aktif (PUBLISHED)</strong> — rilis yang sedang dipakai untuk menjawab query. Hanya satu rilis per sumber yang aktif secara logika.</li>
          <li><strong>◐ Staging (STAGING)</strong> — hasil impor yang belum dipublish; menunggu tinjauan.</li>
          <li><strong>○ Digantikan (SUPERSEDED)</strong> — rilis lama yang otomatis diganti saat rilis baru dipublish. Ini <em>bukan</em> penghapusan: datanya tetap tersimpan untuk audit, tapi query memakai rilis terbaru (data lebih lengkap/terbaru).</li>
        </ul>
        <p style={{ margin: '8px 0 0' }}>💡 Rilis dari <strong>sumber berbeda</strong> (mis. DTSEN BAPPEDA + DTSEN SPLP API) tetap bisa hadir bersamaan di pipeline AI — penggabungan lintas sumber terjadi di lapisan query, bukan dengan mem-publish dua rilis dari sumber yang sama.</p>
      </div>
    </div>
  );
}
