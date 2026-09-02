'use client';

import { useState } from 'react';

interface QueryBarProps {
  onQuery: (query: string) => void;
  isLoading: boolean;
  onReset: () => void;
  isDefaultMode: boolean;
}

interface Chip {
  label: string;
  query: string;
  disabled?: boolean;
}

interface ChipGroup {
  id: string;
  source: string;
  hint: string;
  chips: Chip[];
  /** Group yang sumber datanya belum tersedia — chip dirender nonaktif. */
  disabled?: boolean;
}

// Chip dikelompokkan per sumber data agar pengguna tahu jawaban berasal dari mana.
// - SAPA: indikator resmi OPD (katalog data pembangunan).
// - DTSEN: agregat kemiskinan (desil, bansos) — k-anonymity.
// - Dokumen A/B/C: agregat Excel per OPD (Diknas, Dinkes, Diskominfo), deterministik.
// - Bapokting: harga bahan pokok via SPLP API (76 komoditas, live).
// Meta-query (Semua OPD, OPD Teratas, Sebaran Tahun) dijawab deterministik.
// Frasa tiap chip disesuaikan keyword di src/data/excelSources.ts agar merute ke sumber benar.
const CHIP_GROUPS: ChipGroup[] = [
  {
    id: 'sapa',
    source: 'SAPA',
    hint: 'Indikator resmi OPD',
    chips: [
      { label: '🏛️ Jumlah ASN', query: 'berapa jumlah ASN di aceh tengah' },
      { label: '👶 Stunting (SAPA)', query: 'berapa jumlah balita stunting di aceh tengah' },
      { label: '🌾 Pertanian', query: 'bagaimana data pertanian di aceh tengah' },
      { label: '📚 Pendidikan', query: 'bagaimana data pendidikan di aceh tengah' },
      { label: '🏥 Kesehatan', query: 'bagaimana data kesehatan di aceh tengah' },
      { label: '💼 Tenaga Kerja', query: 'berapa jumlah tenaga kerja di aceh tengah' },
      { label: '☕ Kopi', query: 'produksi kopi di aceh tengah' },
      { label: '📊 Semua OPD', query: 'apa saja OPD yang ada di aceh tengah' },
      { label: '🏆 OPD Teratas', query: 'OPD mana yang memiliki indikator paling banyak di Aceh Tengah' },
      { label: '📅 Sebaran Tahun', query: 'bagaimana sebaran data sapa per tahun' },
    ],
  },
  {
    id: 'dtsen',
    source: 'DTSEN',
    hint: 'Agregat kemiskinan · BAPPEDA Des 2025 · k-anonymity',
    chips: [
      { label: '👨‍👩‍👧 Desil 1 (termiskin)', query: 'berapa jumlah keluarga desil 1 di aceh tengah' },
      { label: '👨‍👩‍👧‍👦 Desil 1–3', query: 'jumlah jiwa desil 1 sampai 3 di aceh tengah' },
      { label: '📊 Sebaran Desil', query: 'berapa jumlah keluarga per desil di aceh tengah' },
      { label: '🩺 Penerima PBI', query: 'berapa penerima PBI jaminan kesehatan di aceh tengah' },
      { label: '🏘️ Desil per Kecamatan', query: 'berapa jumlah keluarga desil 1 di kecamatan Bebesen' },
      { label: '🤝 Bansos PKH', query: 'berapa penerima bansos PKH di aceh tengah' },
      { label: '💳 BPNT & PBI', query: 'berapa penerima BPNT dan PBI di aceh tengah' },
    ],
  },
  {
    id: 'dokumen',
    source: 'Dokumen A/B/C',
    hint: 'Agregat Excel per OPD · deterministik',
    chips: [
      { label: '📚 BSM 2025 (Dok. A)', query: 'data bantuan siswa miskin pendidikan 2025' },
      { label: '🎓 Santri Dalam (Dok. A)', query: 'jumlah santri dalam daerah aceh tengah 2025' },
      { label: '🎓 Mahasiswa S1 (Dok. A)', query: 'data mahasiswa S1 luar daerah aceh tengah' },
      { label: '👶 Stunting (Dok. B)', query: 'data stunting balita di aceh tengah 2026' },
      { label: '🤝 PPKS Kominfo (Dok. C)', query: 'berapa penerima bantuan sosial ppks diskominfo' },
    ],
  },
  {
    id: 'bapokting',
    source: 'Bapokting',
    hint: 'Harga bahan pokok · SPLP API 76 komoditas',
    chips: [
      { label: '🍚 Harga Beras', query: 'berapa harga beras di aceh tengah' },
      { label: '🌶️ Harga Cabe', query: 'berapa harga cabe di aceh tengah' },
      { label: '🧅 Harga Bawang', query: 'berapa harga bawang di aceh tengah' },
      { label: '🫒 Harga Minyak', query: 'berapa harga minyak goreng di aceh tengah' },
      { label: '📦 Komoditas Lainnya', query: 'apa saja harga bahan pokok di aceh tengah' },
    ],
  },
];

export default function QueryBar({ onQuery, isLoading, onReset, isDefaultMode }: QueryBarProps) {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onQuery(input.trim());
      setInput('');
    }
  };

  const handleChipClick = (query: string) => {
    if (!isLoading && query) {
      onQuery(query);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#C6C3B4] rounded-2xl overflow-hidden">
      {/* Header — centered, judul + subtext bertumpuk */}
      <div className="px-5 pt-5 pb-3 flex flex-col items-center text-center">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center text-sm shadow-lg">
            🤖
          </div>
          <span className="text-base font-bold text-[#1B4332]">SAPA Smart AI</span>
        </div>
        <span className="text-xs text-[#767D6F]">Tanya data SAPA Aceh Tengah</span>
        {!isDefaultMode && (
          <button
            onClick={onReset}
            className="absolute right-5 top-5 text-[10px] text-[#1B4332] hover:text-[#2D6A4F] transition-colors flex items-center gap-1"
          >
            <span>←</span>
            <span>Kembali ke Beranda</span>
          </button>
        )}
      </div>

      {/* Keyword Chips — grouped by source */}
      <div className="px-5 py-3 space-y-2">
        {CHIP_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5" role="group" aria-label={`Chip sumber ${group.source}`}>
            <span className="mr-1 inline-flex items-baseline gap-1.5" title={group.hint}>
              <span className="text-[9px] font-black uppercase tracking-widest text-[#2D6A4F]">{group.source}</span>
              <span className="hidden text-[9px] text-[#767D6F] sm:inline">· {group.hint}</span>
            </span>
            {group.chips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => !group.disabled && !chip.disabled && handleChipClick(chip.query)}
                disabled={isLoading || group.disabled || chip.disabled || !chip.query}
                title={chip.disabled ? `Data ${chip.label.toLowerCase()} belum tersedia di API` : undefined}
                className={`px-3 py-1.5 rounded-lg border border-[#C6C3B4] transition-all duration-200 text-[11px] ${
                  chip.disabled
                    ? 'bg-[#F5F3EC] text-[#A0A0A0] cursor-not-allowed opacity-60'
                    : 'bg-[#E9E6DA] text-[#4B5249] hover:bg-[#DCE8DE] hover:text-[#1B4332]'
                } disabled:cursor-not-allowed`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Search Input + Button — centered, button di bawah */}
      <form onSubmit={handleSubmit} className="px-5 pb-5 pt-1 flex flex-col items-center gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ketik pertanyaan tentang data Aceh Tengah..."
          className="w-full max-w-2xl px-5 py-3 rounded-xl bg-[#F5F3EC] border border-[#C6C3B4] text-base text-[#1E2420] placeholder-[#767D6F] focus:outline-none focus:ring-2 focus:ring-[#1B4332]/30 focus:border-[#1B4332]/30 transition-all"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="w-auto px-8 py-2 bg-[#1B4332] text-white rounded-xl text-sm font-medium hover:bg-[#2D6A4F] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-[#1B4332]/20 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Memproses</span>
            </>
          ) : (
            <>
              <span>Tanya</span>
              <span>→</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
