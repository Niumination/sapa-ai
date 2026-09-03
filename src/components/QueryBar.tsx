'use client';

import { useState } from 'react';

interface QueryBarProps {
  onQuery: (query: string) => void;
  isLoading?: boolean;
  onReset?: () => void;
  isDefaultMode?: boolean;
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
  disabled?: boolean;
}

const CHIP_GROUPS: ChipGroup[] = [
  {
    id: 'sapa',
    source: 'SAPA · SPLP',
    hint: '2.048 record · 38 OPD · SPLP only',
    chips: [
      { label: '👶 Stunting', query: 'stunting' },
      { label: '📈 Prevalensi Stunting', query: 'prevalensi stunting' },
      { label: '📊 IPM', query: 'IPM' },
      { label: '💰 PDRB', query: 'PDRB' },
      { label: '☕ Kopi Arabika', query: 'kopi arabika' },
      { label: '🏛️ ASN', query: 'ASN' },
      { label: '🏥 Kesehatan', query: 'kesehatan' },
      { label: '📚 Pendidikan', query: 'pendidikan' },
      { label: '💼 Belanja APBD', query: 'Belanja APBD' },
      { label: '📅 Sebaran Tahun', query: 'sebaran data sapa per tahun' },
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
      <div className="px-5 pt-5 pb-3 flex flex-col items-center text-center relative">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center text-sm shadow-lg">🤖</div>
          <span className="text-base font-bold text-[#1B4332]">SAPA Smart AI</span>
        </div>
        <span className="text-xs text-[#767D6F]">Tanya data SAPA Aceh Tengah</span>
        {!isDefaultMode && (
          <button onClick={onReset} className="absolute right-5 top-5 text-[10px] text-[#1B4332] hover:text-[#2D6A4F] transition-colors flex items-center gap-1">
            <span>←</span>
            <span>Kembali ke Beranda</span>
          </button>
        )}
      </div>

      <div className="px-5 py-3 space-y-2">
        {CHIP_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5" role="group" aria-label={`Chip sumber ${group.source}`}>
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
