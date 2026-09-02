'use client';

// ─── /dashboard/gis — Peta wilayah Kabupaten Aceh Tengah ───
//
// Peta ini menampilkan LETAK 14 kecamatan sebagai konteks wilayah.
// Peta ini TIDAK menampilkan sebaran nilai indikator per kecamatan, karena
// SAPA tidak menyediakan data pada granularitas tersebut.
// Lihat: LAPORAN_AUDIT_PRODUCTION_READINESS.md §P1-03

import React, { useEffect, useState } from 'react';
import dynamicImport from 'next/dynamic';

const MapContainer = dynamicImport(() => import('react-leaflet').then((m) => m.MapContainer), {
  ssr: false,
});
const TileLayer = dynamicImport(() => import('react-leaflet').then((m) => m.TileLayer), {
  ssr: false,
});
const CircleMarker = dynamicImport(() => import('react-leaflet').then((m) => m.CircleMarker), {
  ssr: false,
});
const Tooltip = dynamicImport(() => import('react-leaflet').then((m) => m.Tooltip), { ssr: false });
const Popup = dynamicImport(() => import('react-leaflet').then((m) => m.Popup), { ssr: false });

interface Kecamatan {
  nama: string;
  lat: number;
  lng: number;
  wikidataId: string;
}

interface SumberItem {
  label: string;
  url: string;
}

interface GeoData {
  kecamatan: Kecamatan[];
  bounds: { center: [number, number]; zoom: number };
  kabupaten: {
    totalRecords: number;
    totalOpd: number;
    totalIndicators: number;
    opdTeratas: { nama: string; jumlah: number } | null;
  } | null;
  dataScope: { level: string; kecamatanBreakdownTersedia: boolean; catatan: string };
  sumber: { nama: SumberItem[]; koordinat: SumberItem[]; peta: SumberItem[] };
  error?: string;
  lastFetched: string;
}

function LeafletMap({ data }: { data: GeoData }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('leaflet/dist/leaflet.css')
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div
        role="status"
        className="flex h-[600px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] text-sm text-[var(--text-muted)]"
      >
        Memuat pustaka peta…
      </div>
    );
  }

  return (
    <MapContainer
      center={data.bounds.center}
      zoom={data.bounds.zoom}
      scrollWheelZoom={false}
      className="h-[600px] rounded-2xl border border-[var(--border)]"
      style={{ background: 'var(--surface-muted)' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {data.kecamatan.map((kec) => (
        <CircleMarker
          key={kec.nama}
          center={[kec.lat, kec.lng]}
          radius={9}
          pathOptions={{
            color: 'var(--brand)',
            fillColor: 'var(--brand-soft)',
            fillOpacity: 0.75,
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            {kec.nama}
          </Tooltip>
          <Popup>
            <div className="min-w-[220px] text-sm">
              <h3 className="mb-1 text-base font-bold text-[var(--brand)]">Kecamatan {kec.nama}</h3>
              <p className="text-xs text-[var(--text-body)]">
                Koordinat: {kec.lat.toFixed(5)}, {kec.lng.toFixed(5)}
              </p>
              <p className="mt-2 rounded bg-[var(--warning-tint)] px-2 py-1.5 text-xs text-[var(--text-body)]">
                Data SAPA tersedia pada tingkat kabupaten/OPD. Rincian indikator untuk kecamatan ini
                belum tersedia dari sumber data.
              </p>
              <a
                href={`https://www.wikidata.org/wiki/${kec.wikidataId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-[var(--brand)] underline"
              >
                Sumber koordinat ({kec.wikidataId})
              </a>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default function GisPage() {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // setState hanya di dalam callback promise, bukan sinkron di body effect
  // (react-hooks/set-state-in-effect). Reset state dilakukan di handler "Coba lagi".
  useEffect(() => {
    let cancelled = false;

    fetch('/api/geodata')
      .then(async (res) => ({ ok: res.ok, json: await res.json() }))
      .then(({ ok, json }) => {
        if (cancelled) return;
        // 503 tetap membawa lapisan wilayah — tampilkan peta + banner peringatan.
        setData(json);
        if (!ok) setError(json.error ?? 'Gagal memuat data');
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Gagal menghubungi server');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--brand)]">Peta Wilayah Aceh Tengah</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Letak 14 kecamatan sebagai konteks wilayah
          </p>
        </div>
        {data && (
          <p className="text-xs text-[var(--text-muted)]">
            Diperbarui: {new Date(data.lastFetched).toLocaleString('id-ID')}
          </p>
        )}
      </header>

      {/* Deklarasi granularitas data — mencegah salah tafsir */}
      {data && (
        <div
          role="note"
          className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-tint)] px-4 py-3 text-sm text-[var(--text-body)]"
        >
          <strong className="text-[var(--warning)]">Cakupan data:</strong> {data.dataScope.catatan}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-tint)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setReloadKey((k) => k + 1);
            }}
            className="rounded-lg border border-[var(--danger)]/40 px-3 py-1.5 text-xs font-medium hover:bg-[var(--danger)]/10"
          >
            Coba lagi
          </button>
        </div>
      )}

      {/* Ringkasan tingkat kabupaten — angka nyata dari SAPA */}
      <section aria-label="Ringkasan data kabupaten" className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <SummaryCard label="Kecamatan" value={data ? data.kecamatan.length : null} sub="Wilayah administratif" />
        <SummaryCard label="Total Data SAPA" value={data?.kabupaten?.totalRecords ?? null} sub="Tingkat kabupaten" />
        <SummaryCard label="OPD" value={data?.kabupaten?.totalOpd ?? null} sub="Penyedia data" />
        <SummaryCard label="Indikator" value={data?.kabupaten?.totalIndicators ?? null} sub="Indikator unik" />
      </section>

      {loading ? (
        <div
          role="status"
          className="flex h-[600px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] text-sm text-[var(--text-muted)]"
        >
          Memuat peta…
        </div>
      ) : data ? (
        <LeafletMap data={data} />
      ) : null}

      {/* Daftar kecamatan */}
      {data && (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-card)]">
          <div className="border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-sm font-bold text-[var(--brand)]">
              Daftar Kecamatan ({data.kecamatan.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Daftar 14 kecamatan di Kabupaten Aceh Tengah beserta koordinat titik pusatnya
              </caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <th scope="col" className="px-4 py-3 font-semibold">#</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Kecamatan</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Lintang</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Bujur</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Sumber</th>
                </tr>
              </thead>
              <tbody>
                {data.kecamatan.map((kec, idx) => (
                  <tr key={kec.nama} className="border-b border-[var(--surface-muted-2)] hover:bg-[var(--surface)]">
                    <td className="px-4 py-2.5 text-[var(--text-muted)]">{idx + 1}</td>
                    <th scope="row" className="px-4 py-2.5 text-left font-medium text-[var(--text)]">
                      {kec.nama}
                    </th>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--text-body)]">
                      {kec.lat.toFixed(5)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[var(--text-body)]">
                      {kec.lng.toFixed(5)}
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`https://www.wikidata.org/wiki/${kec.wikidataId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--brand)] underline"
                      >
                        {kec.wikidataId}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Atribusi sumber */}
      {data && (
        <footer className="text-xs text-[var(--text-muted)]">
          <p className="font-semibold text-[var(--text-body)]">Sumber data wilayah:</p>
          <ul className="mt-1 space-y-0.5">
            {[...data.sumber.nama, ...data.sumber.koordinat, ...data.sumber.peta].map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | null;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-card)] p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--brand)]">
        {value === null ? <span className="text-[var(--text-muted)]">—</span> : value.toLocaleString('id-ID')}
      </p>
      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{value === null ? 'Tidak tersedia' : sub}</p>
    </div>
  );
}
