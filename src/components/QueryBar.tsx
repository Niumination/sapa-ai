'use client';

import { useState, useCallback } from 'react';

interface Chip {
  label: string;
  query: string;
  disabled?: boolean;
}

interface ChipGroup {
  source: string;
  chips: Chip[];
  disabled?: boolean;
}

const CHIP_GROUPS: ChipGroup[] = [
  {
    source: 'SAPA',
    chips: [
      { label: '🏛️ Jumlah ASN', query: 'Jumlah ASN Aceh Tengah' },
      { label: '👶 Stunting (SAPA)', query: 'Stunting Aceh Tengah' },
      { label: '🌾 Pertanian', query: 'Pertanian Aceh Tengah' },
      { label: '📚 Pendidikan', query: 'Pendidikan Aceh Tengah' },
      { label: '🏥 Kesehatan', query: 'Kesehatan Aceh Tengah' },
      { label: '💼 Tenaga Kerja', query: 'Tenaga Kerja Aceh Tengah' },
      { label: '☕ Kopi', query: 'Kopi Aceh Tengah' },
      { label: '📊 Semua OPD', query: 'Data SAPA semua OPD' },
      { label: '🏆 OPD Teratas', query: 'OPD teratas Aceh Tengah' },
      { label: '📅 Sebaran Tahun', query: 'Sebaran tahun data SAPA' },
    ],
  },
];

export default function QueryBar({ onQuery }: { onQuery: (q: string) => void }) {
  const [loading, setLoading] = useState(false);

  const handleChipClick = useCallback(
    async (chipQuery: string) => {
      if (loading) return;
      setLoading(true);
      try {
        await onQuery(chipQuery);
      } finally {
        setLoading(false);
      }
    },
    [onQuery, loading]
  );

  return (
    <div className="space-y-2">
      {CHIP_GROUPS.map((group) => (
        <div key={group.source} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5" role="group" aria-label={`Chip sumber ${group.source}`}>
          <span className="mr-1 inline-flex items-baseline gap-1.5" title={`Sumber ${group.source}`}>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#2D6A4F]">{group.source}</span>
          </span>
          {group.chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => handleChipClick(chip.query)}
              disabled={loading || chip.disabled || group.disabled}
              className="px-3 py-1.5 rounded-lg border border-[#C6C3B4] transition-all duration-200 text-[11px] bg-[#E9E6DA] text-[#4B5249] hover:bg-[#DCE8DE] hover:text-[#1B4332] disabled:cursor-not-allowed"
            >
              {chip.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
