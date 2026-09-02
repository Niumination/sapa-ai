'use client';

// ─── Admin DTSEN (PR-4b/4c) — impor manual, tinjau staging, publish, konsol query ───
// Halaman terproteksi middleware; gate tambahan per-role di setiap API.
// Data yang tampil selalu bentuk terminimasi (nama masked); tidak ada PII.
// PR-4c: Konsol Query — jawaban membawa provenance 3 tempat (header narasi,
// chip visual, metadata dataOrigin); lookup by-NIK hanya untuk DTSEN_LOOKUP.

import { useEffect, useState, useCallback } from 'react';

interface Release {
  id: string;
  versi: string;
  jalur: string;
  status: 'STAGING' | 'PUBLISHED' | 'SUPERSEDED';
  totalBaris: number;
  ditolak: number;
  uploadedBy: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface Detail {
  release: Release;
  sampelTerkover: { namaMasked: string; kecamatan: string; desa: string; desil: number }[];
  sebaranKecamatan: { kecamatan: string; jiwa: number }[];
  agregatPreview: {
    kelompokWilayahDesil: number;
    jiwaTerSensor: number;
    kelompokTerSensor: number;
    contoh: { kecamatan: string; desa: string; desil: number; jumlahJiwa: number; jumlahKeluarga: number }[];
  };
}

const STATUS_STYLE: Record<string, string> = {
  STAGING: 'bg-[#F3DCC9] text-[#A15C38]',
  PUBLISHED: 'bg-[#DCE8DE] text-[#2D6A4F]',
  SUPERSEDED: 'bg-[#E9E6DA] text-[#767D6F]',
};

// ─── PR-4c: tipe respons konsol query ───
interface QueryResponse {
  ok: boolean;
  error?: string;
  dataOrigin?: string;
  provenance?: { label: string; versi?: string; jalur?: string; publishedAt?: string | null };
  plan?: { scope?: string; kecamatan?: string | null; desa?: string | null; desil?: number[] | null; bansos?: string[] | null };
  narasi?: string;
  message?: string;
  individu?: {
    namaMasked: string;
    kecamatan: string;
    desa: string;
    desil: number | null;
    statusBansos: { pkh: boolean; bpnt: boolean; pbi: boolean } | null;
  } | null;
  jawaban?: {
    scopeLabel: string;
    totalJiwa: number;
    totalKeluarga: number;
    byDesil: { desil: number; jiwa: number; keluarga: number }[];
    byWilayah: { nama: string; jiwa: number; keluarga: number }[];
    bansos: { program: string; jiwa: number | null }[] | null;
    sensor: string[];
  };
}

const CONTOH_QUERY = [
  'berapa jiwa desil 1-2 di Kecamatan Linge',
  'sebaran desil seluruh kabupaten',
  'berapa penerima PKH di Kecamatan Laut Tawar',
  'jumlah jiwa desil 1 di kecamatan Bebesen',
  'berapa penerima PBI jaminan kesehatan di aceh tengah',
  'jumlah keluarga desil 1 sampai 3 di aceh tengah',
  'berapa jumlah keluarga per desil di aceh tengah',
  'tempel NIK 16 digit di sini untuk lookup per-orang',
];

export default function AdminDtsenPage() {
  const [role, setRole] = useState<string | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [rejectedOut, setRejectedOut] = useState<{ line: number; reason: string; nikAwal?: string }[]>([]);
  const [q, setQ] = useState('');
  const [qRes, setQRes] = useState<QueryResponse | null>(null);
  const [qBusy, setQBusy] = useState(false);

  const canWrite = role === 'DTSEN_LOOKUP' || role === 'SUPERADMIN' || role === 'DTSEN_ROOT';
  const canRead = canWrite || role === 'DTSEN_ANALYST' || role === 'DTSEN_ROOT';

  const loadReleases = useCallback(async () => {
    try {
      const r = await fetch('/api/dtsen/releases');
      if (r.status === 403 || r.status === 401) {
        setReleases([]);
        return;
      }
      const d = await r.json();
      setReleases(d.releases ?? []);
    } catch {
      /* diam — panel menampilkan kosong */
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(d?.admin?.role ?? null))
      .then(loadReleases)
      .catch(() => setRole(null));
  }, [loadReleases]);

  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    setNotice('');
    setRejectedOut([]);
    try {
      const text = await file.text();
      const r = await fetch(`/api/dtsen/import?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      });
      const d = await r.json();
      if (!r.ok || d.ok === false) {
        setError(d.error ?? `HTTP ${r.status}`);
        setRejectedOut(d.rejected ?? []);
      } else {
        setNotice(
          `Staging OK: ${d.valid} baris valid, ${d.ditolak} ditolak. ` +
            `Preview agregat: ${d.agregatPreview.kelompokWilayahDesil} kelompok wilayah·desil ` +
            `(${d.agregatPreview.jiwaTerSensor} jiwa dari ${d.agregatPreview.kelompokTerSensor} kelompok kecil disensor k-anonymity).`,
        );
        setRejectedOut(d.rejectedSample ?? []);
        await loadReleases();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengunggah');
    } finally {
      setBusy(false);
    }
  };

  const loadDetail = async (id: string) => {
    setDetail(null);
    setError('');
    try {
      const r = await fetch(`/api/dtsen/release/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat detail');
    }
  };

  const publish = async (id: string) => {
    if (!confirm('Publish rilis ini? Rilis lama akan SUPERSEDED dan data individunya dipurge.')) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/dtsen/release/${id}/publish`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      setNotice(
        `Rilis aktif: ${d.agregat.kelompokWilayahDesil} kelompok wilayah·desil; ` +
          `${d.agregat.jiwaTerSensor} jiwa ter-sensor (kelompok <5); ${d.individuRilisLamaDihapus} baris individu rilis lama dihapus.`,
      );
      setDetail(null);
      await loadReleases();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal publish');
    } finally {
      setBusy(false);
    }
  };

  const tanyakan = async () => {
    const query = q.trim();
    if (query.length < 3) return;
    setQBusy(true);
    setQRes(null);
    setError('');
    try {
      const r = await fetch('/api/dtsen/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const d: QueryResponse = await r.json();
      if (!r.ok) {
        setQRes({ ok: false, error: `(${r.status}) ${d.error ?? 'Gagal'}` });
      } else {
        setQRes(d);
      }
    } catch (e) {
      setQRes({ ok: false, error: e instanceof Error ? e.message : 'Gagal menanyakan' });
    } finally {
      setQBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <div className="text-[0.78rem] font-bold uppercase tracking-wider text-[#8A6E1D] mb-1">🔐 Admin · Data Terbatas</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h1 className="text-2xl font-extrabold text-[#1E2420]">Manajemen Rilis DTSEN</h1>
            <p className="text-sm text-[#767D6F]">
              Data by-name by-address (UU PDP): NIK disimpan HMAC, nama ter-mask, agregat disensor k&lt;5.
              Role Anda: <b>{role ?? '…'}</b>
              {!canRead && role && <span className="text-[#B3261E]"> — tidak berhak membaca jalur ini.</span>}
            </p>
          </div>
          <a
            href="/dashboard/status"
            style={{ padding: '8px 16px', borderRadius: '10px', background: '#1B4332', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            🗂️ Status Sumber & Rilis
          </a>
        </div>
      </div>

      {/* Upload */}
      <section className="bg-white border border-[#C6C3B4] rounded-2xl p-5">
        <h2 className="text-xs font-bold text-[#1B4332] uppercase tracking-wider mb-2">📤 Impor CSV (template baku)</h2>
        <p className="text-xs text-[#767D6F] mb-3">
          Kolom: <code>nik, nama, no_kk, kecamatan, desa, desil, pkh, bpnt, pbi_jk</code> — CSV (UTF-8).{' '}
          {canWrite ? 'Berkas divalidasi per baris; hanya baris valid yang distaging.' : 'Butuh role DTSEN_LOOKUP/SUPERADMIN untuk mengimpor.'}
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={!canWrite || busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          className="text-sm file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-[#1B4332] file:text-white file:font-semibold disabled:opacity-50"
        />
        {busy && <p className="text-xs text-[#767D6F] mt-2 animate-pulse">Memproses…</p>}
        {error && <p className="text-xs text-[#B3261E] mt-3">❌ {error}</p>}
        {notice && <p className="text-xs text-[#2D6A4F] mt-3">✅ {notice}</p>}
        {rejectedOut.length > 0 && (
          <div className="mt-3 max-h-52 overflow-y-auto border border-[#C6C3B4] rounded-xl p-3">
            <p className="text-[11px] font-bold text-[#A15C38] mb-1">Baris ditolak (maks ditampilkan):</p>
            <ul className="text-[11px] text-[#4B5249] space-y-0.5">
              {rejectedOut.map((r) => (
                <li key={r.line}>
                  Baris {r.line}
                  {r.nikAwal ? ` (NIK ${r.nikAwal}…)` : ''}: {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Daftar rilis */}
      <section className="bg-white border border-[#C6C3B4] rounded-2xl p-5">
        <h2 className="text-xs font-bold text-[#1B4332] uppercase tracking-wider mb-3">🗃️ Rilis Tersimpan</h2>
        {releases.length === 0 ? (
          <p className="text-xs text-[#767D6F]">Belum ada rilis (atau role tidak berhak membaca).</p>
        ) : (
          <ul className="space-y-2">
            {releases.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 flex-wrap border border-[#E9E6DA] rounded-xl px-3 py-2 hover:border-[#2D6A4F]/50 cursor-pointer"
                onClick={() => loadDetail(r.id)}
              >
                <div className="text-xs">
                  <span className="font-bold text-[#1B4332]">{r.versi}</span>
                  <span className="text-[#767D6F] ml-2">
                    {r.totalBaris.toLocaleString('id-ID')} baris · ditolak {r.ditolak} · {new Date(r.createdAt).toLocaleDateString('id-ID')}
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Detail + publish */}
      {detail && (
        <section className="bg-white border border-[#C6C3B4] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-xs font-bold text-[#1B4332] uppercase tracking-wider">
              🔎 Tinjau Rilis {detail.release.versi} <span className="text-[#767D6F]">({detail.release.status})</span>
            </h2>
            {detail.release.status === 'STAGING' && canWrite && (
              <button
                onClick={() => publish(detail.release.id)}
                disabled={busy}
                className="px-4 py-2 bg-[#1B4332] text-white text-xs font-bold rounded-lg hover:bg-[#2D6A4F] disabled:opacity-50"
              >
                🚀 Publish (gantikan rilis aktif)
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] font-bold text-[#767D6F] uppercase mb-1">Sebaran Kecamatan</p>
              <ul className="text-xs text-[#4B5249] space-y-0.5">
                {detail.sebaranKecamatan.map((s) => (
                  <li key={s.kecamatan} className="flex justify-between border-b border-[#F5F3EC] py-0.5">
                    <span>{s.kecamatan}</span>
                    <span className="font-semibold">{s.jiwa.toLocaleString('id-ID')}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#767D6F] uppercase mb-1">Sampel Terminimasi</p>
              <ul className="text-xs text-[#4B5249] space-y-0.5">
                {detail.sampelTerkover.map((s, i) => (
                  <li key={i}>
                    {s.namaMasked} — {s.desa}, {s.kecamatan} · desil {s.desil}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-[#767D6F] uppercase mb-1">
              Preview Agregat Publikasi ({detail.agregatPreview.kelompokWilayahDesil} kelompok; {detail.agregatPreview.jiwaTerSensor} jiwa disensor)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-[#767D6F] border-b border-[#C6C3B4]">
                    <th className="py-1 pr-2">Kecamatan</th>
                    <th className="py-1 pr-2">Desa</th>
                    <th className="py-1 pr-2">Desil</th>
                    <th className="py-1 pr-2 text-right">Jiwa</th>
                    <th className="py-1 text-right">Keluarga</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.agregatPreview.contoh.map((a, i) => (
                    <tr key={i} className="border-b border-[#F5F3EC]">
                      <td className="py-1 pr-2">{a.kecamatan}</td>
                      <td className="py-1 pr-2">{a.desa}</td>
                      <td className="py-1 pr-2">{a.desil}</td>
                      <td className="py-1 pr-2 text-right font-semibold">{a.jumlahJiwa}</td>
                      <td className="py-1 text-right">{a.jumlahKeluarga}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ─── PR-4c: Konsol Query DTSEN (audit penuh, provenance 3 tempat) ─── */}
      <section className="bg-white border border-[#C6C3B4] rounded-2xl p-5 space-y-3">
        <div>
          <h2 className="text-xs font-bold text-[#1B4332] uppercase tracking-wider mb-1">💬 Konsol Query DTSEN</h2>
          <p className="text-xs text-[#767D6F]">
            Planner deterministik: query berisi <b>NIK 16 digit</b> → lookup per-orang (khusus DTSEN_LOOKUP);
            lainnya → agregat agregat k-anonymity. <b>Setiap query tercatat di audit trail</b> — gunakan sewajarnya.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !qBusy && tanyakan()}
            disabled={!canRead || qBusy}
            placeholder="mis. berapa jiwa desil 1-2 di Kecamatan Linge — atau tempel NIK 16 digit untuk lookup"
            className="flex-1 text-sm border border-[#C6C3B4] rounded-lg px-3 py-2 disabled:opacity-50"
          />
          <button
            onClick={tanyakan}
            disabled={!canRead || qBusy || q.trim().length < 3}
            className="px-4 py-2 bg-[#1B4332] text-white text-xs font-bold rounded-lg hover:bg-[#2D6A4F] disabled:opacity-50"
          >
            {qBusy ? '…' : 'Tanyakan'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CONTOH_QUERY.map((c) => (
            <button
              key={c}
              onClick={() => setQ(c)}
              disabled={!canRead}
              className="text-[10px] px-2 py-1 rounded-md bg-[#F5F3EC] text-[#4B5249] hover:bg-[#E9E6DA] disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>

        {qRes && (
          <div className="border border-[#E9E6DA] rounded-xl p-4 space-y-3">
            {!qRes.ok ? (
              <p className="text-xs text-[#B3261E]">❌ {qRes.error}</p>
            ) : (
              <>
                {/* Chip visual provenance (tempat #2) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#DCE8DE] text-[#2D6A4F]">
                    {qRes.provenance?.label ?? 'DTSEN'}
                  </span>
                  {qRes.plan?.scope && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#F3DCC9] text-[#A15C38]">
                      scope {qRes.plan.scope}
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#E9E6DA] text-[#767D6F]">
                    dataOrigin: {qRes.dataOrigin}
                  </span>
                </div>
                {/* Narasi (memuat header provenance — tempat #1) */}
                {qRes.narasi && <p className="text-xs text-[#1E2420] whitespace-pre-line leading-relaxed">{qRes.narasi}</p>}
                {!qRes.narasi && qRes.message && <p className="text-xs text-[#4B5249]">{qRes.message}</p>}

                {/* Kartu individu (lookup by-NIK) — bentuk terminimasi */}
                {qRes.individu && (
                  <div className="bg-[#F5F3EC] rounded-lg p-3 text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <p className="text-[10px] text-[#767D6F] uppercase">Nama (termask)</p>
                      <p className="font-bold">{qRes.individu.namaMasked}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#767D6F] uppercase">Wilayah</p>
                      <p className="font-semibold">
                        {qRes.individu.desa}, {qRes.individu.kecamatan}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#767D6F] uppercase">Desil</p>
                      <p className="font-semibold">{qRes.individu.desil ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[#767D6F] uppercase">Bansos</p>
                      <p className="font-semibold">
                        {qRes.individu.statusBansos
                          ? [
                              qRes.individu.statusBansos.pkh ? 'PKH' : null,
                              qRes.individu.statusBansos.bpnt ? 'BPNT' : null,
                              qRes.individu.statusBansos.pbi ? 'PBI' : null,
                            ]
                              .filter(Boolean)
                              .join(', ') || 'bukan penerima'
                          : '—'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Breakdown agregat */}
                {qRes.jawaban && (
                  <div className="grid md:grid-cols-2 gap-3">
                    {qRes.jawaban.byDesil.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#767D6F] uppercase mb-1">Per Desil — {qRes.jawaban.scopeLabel}</p>
                        <table className="w-full text-xs">
                          <tbody>
                            {qRes.jawaban.byDesil.map((d) => (
                              <tr key={d.desil} className="border-b border-[#F5F3EC]">
                                <td className="py-1">Desil {d.desil}</td>
                                <td className="py-1 text-right font-semibold">{d.jiwa.toLocaleString('id-ID')} jiwa</td>
                                <td className="py-1 text-right text-[#767D6F]">{d.keluarga.toLocaleString('id-ID')} keluarga</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {qRes.jawaban.byWilayah.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#767D6F] uppercase mb-1">Per Wilayah</p>
                        <table className="w-full text-xs">
                          <tbody>
                            {qRes.jawaban.byWilayah.slice(0, 10).map((w) => (
                              <tr key={w.nama} className="border-b border-[#F5F3EC]">
                                <td className="py-1">{w.nama}</td>
                                <td className="py-1 text-right font-semibold">{w.jiwa.toLocaleString('id-ID')} jiwa</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {qRes.jawaban.bansos && qRes.jawaban.bansos.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-[#767D6F] uppercase mb-1">Bansos</p>
                        <ul className="text-xs space-y-0.5">
                          {qRes.jawaban.bansos.map((b) => (
                            <li key={b.program} className="flex justify-between">
                              <span className="uppercase">{b.program}</span>
                              <span className="font-semibold">{b.jiwa === null ? 'disensor (k<5)' : `${b.jiwa.toLocaleString('id-ID')} jiwa`}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {qRes.jawaban && qRes.jawaban.sensor.length > 0 && (
                  <p className="text-[10px] text-[#A15C38]">🛡️ Sensor k-anonymity aktif pada {qRes.jawaban.sensor.length} kelompok/program.</p>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
