'use client';

import { useCallback, useEffect, useState } from 'react';
import { LABEL_JENIS, type JenisUmpan } from '@/lib/umpan-balik';

/**
 * Dasbor laporan koreksi warga (FR-26).
 *
 * Pasangan alami dari dasbor celah pengetahuan (FR-27): yang satu mencatat
 * pertanyaan yang TIDAK terjawab, yang ini mencatat jawaban yang dianggap KELIRU.
 * Bersama-sama keduanya menjadi daftar kerja tim data — tanpa menyimpan identitas
 * pelapor maupun angka apa pun dari laporannya.
 *
 * Dilindungi `ADMIN_TOKEN` (fail-closed) dengan token yang sama; token hanya
 * disimpan di penyimpanan sesi peramban (`sapa-admin-token`), tidak pernah
 * ditulis ke kode atau berkas lingkungan klien.
 */

interface Entri {
  jenis: JenisUmpan;
  catatan: string;
  pertanyaan: string;
  jumlah: number;
  terakhir: string;
}

interface Balasan {
  status: string;
  minggu?: string;
  total?: number;
  jumlahEntri?: number;
  backend?: 'redis' | 'memory';
  pilihanMinggu?: string[];
  item?: Entri[];
  error?: string;
}

const KUNCI_SESI = 'sapa-admin-token';

export default function UmpanBalikPage() {
  const [token, setToken] = useState('');
  const [minggu, setMinggu] = useState('');
  const [data, setData] = useState<Balasan | null>(null);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);

  useEffect(() => {
    const tersimpan = typeof window !== 'undefined' ? window.sessionStorage.getItem(KUNCI_SESI) : null;
    if (tersimpan) setToken(tersimpan);
  }, []);

  const muat = useCallback(
    async (mingguPilih?: string) => {
      const t = token.trim();
      if (!t) {
        setGalat('Masukkan token admin terlebih dahulu (nilai ADMIN_TOKEN di lingkungan aplikasi).');
        return;
      }
      setMemuat(true);
      setGalat('');
      try {
        const url = `/api/admin/umpan-balik${mingguPilih ? `?minggu=${encodeURIComponent(mingguPilih)}` : ''}`;
        const res = await fetch(url, { headers: { 'x-admin-token': t } });
        const json = (await res.json()) as Balasan;
        if (!res.ok) {
          setData(null);
          setGalat(json?.error ?? `Permintaan ditolak (HTTP ${res.status}).`);
          return;
        }
        window.sessionStorage.setItem(KUNCI_SESI, t);
        setData(json);
      } catch {
        setData(null);
        setGalat('Tidak dapat menghubungi server.');
      } finally {
        setMemuat(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (token) void muat();
    // sengaja hanya saat token pertama kali terisi dari sesi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-lg font-bold text-[var(--brand)]">Laporan koreksi warga</h1>
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
        Laporan dari kanal &quot;Lapor angka&quot; pada dasbor. Setiap laporan sudah dibersihkan: seluruh angka,
        surel, tautan, dan nomor telepon dibuang sebelum disimpan — tidak ada NIK, IP, maupun id pengguna.
        Kanal publik dibatasi 200 laporan per hari.
      </p>
      <p className="mt-1 text-[10px] text-[var(--text-muted)]">
        Lihat juga: <a className="underline" href="/admin/celah-pengetahuan">dasbor celah pengetahuan</a>{' '}
        (pertanyaan yang belum terlayani).
      </p>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Token admin
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="nilai ADMIN_TOKEN"
            className="min-w-[240px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-xs text-[var(--text-body)]"
          />
          <select
            value={minggu}
            onChange={(e) => setMinggu(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-container-low)] px-3 py-2 text-xs text-[var(--text-body)]"
          >
            <option value="">minggu berjalan</option>
            {(data?.pilihanMinggu ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => muat(minggu || undefined)}
            disabled={memuat}
            className="rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-bold text-[var(--on-brand)] disabled:opacity-60"
          >
            {memuat ? 'Memuat…' : 'Muat'}
          </button>
        </div>
        {galat ? <p className="mt-2 text-xs font-semibold text-red-700">{galat}</p> : null}
      </div>

      {data?.status === 'ok' ? (
        <section className="mt-5">
          <p className="text-xs text-[var(--text-muted)]">
            Minggu <span className="font-bold text-[var(--brand)]">{data.minggu}</span> · {data.total ?? 0} laporan ·{' '}
            {data.jumlahEntri ?? 0} laporan berbeda · penyimpanan {data.backend}
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-card)]">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="bg-[var(--surface-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Jenis</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Keterangan (tanpa angka)</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Pertanyaan terkait</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Kali</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {(data.item ?? []).map((e, i) => (
                  <tr key={`${e.jenis}-${i}`} className="border-b border-[var(--surface-muted)]">
                    <td className="px-3 py-2 text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-3 py-2 text-[var(--text-body)]">{LABEL_JENIS[e.jenis] ?? e.jenis}</td>
                    <td className="px-3 py-2 text-[var(--text-body)]">{e.catatan || '—'}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{e.pertanyaan || '—'}</td>
                    <td className="px-3 py-2 font-bold text-[var(--brand)]">{e.jumlah}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{new Date(e.terakhir).toLocaleString('id-ID')}</td>
                  </tr>
                ))}
                {(data.item ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={6}>
                      Belum ada laporan koreksi pada minggu ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Cara memakai daftar ini: &quot;angka/satuan/tahun salah&quot; yang berulang menunjuk pada pemetaan
            kolom atau satuan yang perlu diperbaiki; &quot;indikator belum ada&quot; menjadi permintaan data ke OPD;
            &quot;pertanyaan dipahami keliru&quot; biasanya cukup ditambahkan sinonim atau contoh frasa di set evaluasi.
          </p>
        </section>
      ) : null}
    </main>
  );
}
