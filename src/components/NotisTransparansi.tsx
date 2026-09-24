'use client';

// ─── Notis transparansi + kanal koreksi "lapor angka" (FR-26) ─────────────────
//
// Ditaruh sebagai komponen sendiri supaya teksnya SATU tempat dengan fungsi
// `teksNotis()` (di `@/lib/umpan-balik`) — tampilan dan salinan teks tidak bisa
// berbeda. Komponen ini tampil di dasbor dalam mode apa pun, sehingga pembaca
// selalu melihat: siapa yang menyusun narasi (AI atau template), dari mana angka
// berasal, dan ke mana melapor bila ada yang keliru.

import { useState } from 'react';
import type { AiMetaSummary } from '@/types';
import { JENIS_UMPAN, LABEL_JENIS, teksNotis, type JenisUmpan } from '@/lib/umpan-balik';

export default function NotisTransparansi({
  ai,
  pertanyaan,
}: {
  ai?: AiMetaSummary | null;
  pertanyaan?: string;
}) {
  const notis = teksNotis(ai ?? null);
  const [terbuka, setTerbuka] = useState(false);
  const [jenis, setJenis] = useState<JenisUmpan>('angka-salah');
  const [catatan, setCatatan] = useState('');
  const [status, setStatus] = useState<'diam' | 'kirim' | 'sukses' | 'gagal'>('diam');
  const [pesan, setPesan] = useState('');

  async function kirim() {
    setStatus('kirim');
    setPesan('');
    try {
      const res = await fetch('/api/umpan-balik', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jenis, catatan, pertanyaan: pertanyaan ?? '' }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus('sukses');
        setPesan(json?.pesan ?? 'Terima kasih. Laporan Anda tercatat.');
        setCatatan('');
      } else {
        setStatus('gagal');
        setPesan(json?.error ?? 'Laporan tidak dapat dikirim sekarang.');
      }
    } catch {
      setStatus('gagal');
      setPesan('Tidak dapat menghubungi server. Coba lagi sebentar lagi.');
    }
  }

  return (
    <section className="bg-[#E9E6DA] border border-[#C6C3B4] rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-[#1B4332] mb-2">{notis.judul}</h2>
      <div className="space-y-2">
        {notis.paragraf.map((p, i) => (
          <p key={i} className="text-xs text-[#4B5249] leading-relaxed">
            {p}
          </p>
        ))}
      </div>

      {!terbuka && (
        <>
        <a
          href="/keterbukaan"
          className="mt-3 inline-block px-3 py-1.5 bg-[var(--surface-card)] border border-[#C6C3B4] text-[#1B4332] text-xs rounded-lg hover:bg-[#DCD8C8]"
        >
          Keterbukaan penggunaan AI (CMP-02)
        </a>
        <button
          onClick={() => setTerbuka(true)}
          className="mt-3 px-3 py-1.5 bg-[var(--surface-card)] border border-[#C6C3B4] text-[#1B4332] text-xs rounded-lg hover:bg-[#DCD8C8]"
        >
          Lapor angka / usulkan perbaikan
        </button>
        </>
      )}

      {terbuka && (
        <div className="mt-3 bg-[var(--surface-card)] border border-[#C6C3B4] rounded-xl p-4 space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-[#4B5249]">Jenis laporan</span>
            <select
              value={jenis}
              onChange={(e) => setJenis(e.target.value as JenisUmpan)}
              className="mt-1 w-full text-xs border border-[#C6C3B4] rounded-lg px-2 py-1.5 bg-white text-[#1F241F]"
            >
              {JENIS_UMPAN.map((j) => (
                <option key={j} value={j}>
                  {LABEL_JENIS[j]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#4B5249]">Keterangan (tanpa angka)</span>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              maxLength={140}
              rows={3}
              placeholder="Contoh: satuan pada indikator produksi kopi seharusnya ton per tahun, bukan kilogram."
              className="mt-1 w-full text-xs border border-[#C6C3B4] rounded-lg px-2 py-1.5 bg-white text-[#1F241F]"
            />
            <span className="text-[10px] text-[#767D6F]">
              Demi privasi, semua angka (termasuk NIK dan nomor telepon) otomatis dibuang dari laporan —
              tulis dalam kata. {catatan.length}/140
            </span>
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={kirim}
              disabled={status === 'kirim'}
              className="px-3 py-1.5 bg-[#1B4332] text-[var(--on-brand)] text-xs rounded-lg hover:bg-[#2D6A4F] disabled:opacity-60"
            >
              {status === 'kirim' ? 'Mengirim…' : 'Kirim laporan'}
            </button>
            <button
              onClick={() => setTerbuka(false)}
              className="px-3 py-1.5 text-[#4B5249] text-xs rounded-lg hover:bg-[#E9E6DA]"
            >
              Tutup
            </button>
            {pesan && (
              <span className={`text-[11px] ${status === 'gagal' ? 'text-[#B3261E]' : 'text-[#1B4332]'}`}>{pesan}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
