'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Dasbor celah pengetahuan (FR-27).
 *
 * Menampilkan pertanyaan yang TIDAK berhasil dilayani sistem — tanpa bukti, atau
 * jawaban AI-nya ditolak gerbang mutu — sehingga bisa dijadikan daftar kerja:
 * sinonim apa yang perlu ditambah, indikator apa yang belum ada, OPD mana yang
 * perlu dimintai data.
 *
 * Dilindungi `ADMIN_TOKEN` (fail-closed). Token dimasukkan di halaman ini dan
 * disimpan hanya di penyimpanan sesi peramban — tidak pernah ditulis ke kode
 * atau ke berkas lingkungan klien.
 */

import { labelSebab } from '@/services/sebab-kegagalan';

interface Entri {
  pertanyaan: string;
  jumlah: number;
  /** Tag sebab `lapis:rincian` (FR-20). Nilai lama (pra-FR-20) tetap mungkin. */
  sebab: string;
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

export default function CelahPengetahuanPage() {
  const [token, setToken] = useState('');
  const [minggu, setMinggu] = useState('');
  const [data, setData] = useState<Balasan | null>(null);
  const [galat, setGalat] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [disalin, setDisalin] = useState(false);

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
        const url = `/api/admin/celah${mingguPilih ? `?minggu=${encodeURIComponent(mingguPilih)}` : ''}`;
        const r = await fetch(url, { headers: { 'x-admin-token': t }, cache: 'no-store' });
        const d: Balasan = await r.json();
        if (!r.ok || d.status !== 'ok') {
          setData(null);
          setGalat(d.error ?? `Permintaan gagal (HTTP ${r.status}).`);
          return;
        }
        window.sessionStorage.setItem(KUNCI_SESI, t);
        setData(d);
        setMinggu(d.minggu ?? '');
      } catch (e) {
        setGalat(e instanceof Error ? e.message : 'Gagal menghubungi server.');
      } finally {
        setMemuat(false);
      }
    },
    [token],
  );

  function salin() {
    const teks = (data?.item ?? [])
      .map((e, i) => `${i + 1}. ${e.pertanyaan} — ${e.jumlah}× (${e.sebab})`)
      .join('\n');
    navigator.clipboard?.writeText(`Celah pengetahuan ${data?.minggu ?? ''}\n${teks}`);
    setDisalin(true);
    setTimeout(() => setDisalin(false), 1500);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <a href="#konten-utama" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">Lompati ke konten</a>
      <nav aria-label="Admin navigasi" className="mb-4 flex gap-3 text-xs"><a href="/dashboard" className="underline">Dashboard</a><a href="/admin/ai-toggle" className="underline">AI toggle</a><a href="/admin/umpan-balik" className="underline">Umpan balik</a></nav>
      <h1 id="konten-utama" className="text-lg font-bold text-[var(--brand)]">Celah Pengetahuan</h1>
      <p role="status" aria-live="polite" className="sr-only">{memuat ? 'Memuat celah pengetahuan' : galat ? `Gagal: ${galat}` : data ? `Data celah pengetahuan minggu ${data.minggu ?? ''} dimuat` : ''}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Pertanyaan yang belum dapat dilayani sistem (tanpa bukti atau jawaban AI ditolak gerbang mutu),
        dikelompokkan per minggu. Angka dan identitas sudah dibuang sebelum disimpan — tidak ada NIK,
        nomor telepon, surel, IP, maupun id pengguna pada data ini.
      </p>

      <p className="mt-1 text-[10px] text-[var(--text-muted)]">
        Lihat juga: <a className="underline" href="/admin/umpan-balik">laporan koreksi warga</a>{' '}
        (jawaban yang dianggap keliru).
      </p>

      <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-card)] p-4">
        <label htmlFor="token-admin" className="block text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Token admin
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="token-admin"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="nilai ADMIN_TOKEN"
            aria-label="Token admin"
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
          {data?.item?.length ? (
            <button
              type="button"
              onClick={salin}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--brand)]"
            >
              {disalin ? '✓ Tersalin' : '⧉ Salin daftar'}
            </button>
          ) : null}
        </div>
        {galat ? <p className="mt-2 text-xs font-semibold text-red-700">{galat}</p> : null}
      </div>

      {data?.status === 'ok' ? (
        <section className="mt-5">
          <p className="text-xs text-[var(--text-muted)]">
            Minggu <span className="font-bold text-[var(--brand)]">{data.minggu}</span> · {data.total ?? 0}{' '}
            kemunculan · {data.jumlahEntri ?? 0} pertanyaan berbeda · penyimpanan {data.backend}
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-card)]">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-[var(--surface-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">#</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Pertanyaan (sudah dibersihkan)</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Kali</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Sebab</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase text-[var(--text-muted)]">Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {(data.item ?? []).map((e, i) => (
                  <tr key={e.pertanyaan} className="border-b border-[var(--surface-muted)]">
                    <td className="px-3 py-2 text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-3 py-2 text-[var(--text-body)]">{e.pertanyaan}</td>
                    <td className="px-3 py-2 font-bold text-[var(--brand)]">{e.jumlah}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {labelSebab(e.sebab)}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{new Date(e.terakhir).toLocaleString('id-ID')}</td>
                  </tr>
                ))}
                {(data.item ?? []).length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-[var(--text-muted)]" colSpan={5}>
                      Belum ada celah tercatat pada minggu ini.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Cara memakai daftar ini: pertanyaan yang sering muncul dan mengandung istilah yang ada di katalog →
            tambahkan sinonim di <code>src/lib/sapa-client.ts</code>. Pertanyaan yang menunjuk data yang memang
            belum ada di SAPA → masukkan ke permintaan data ke OPD, bukan dipaksakan dijawab.
          </p>
        </section>
      ) : null}
    </main>
  );
}
