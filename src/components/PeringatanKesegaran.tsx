'use client';

// ─── P3: lencana & peringatan kesegaran data ─────────────────────────────────
//
// Kenapa komponen sendiri, dan kenapa teksnya datang dari SERVER:
//
//   Kewajiban FR-25/DS-03 sudah menampilkan "Data SPLP ditarik …", tetapi
//   tampilan itu tidak pernah menyimpulkan apa pun. Menghitung "basi atau
//   tidak" di peramban berarti jam peramban menjadi hakimnya — dan jam
//   peramban bisa salah, beda zona waktu, atau sengaja diubah. Karena itu
//   penilaiannya dilakukan di server (`dataKesegaran` pada balasan /api/query)
//   dan komponen ini hanya menampilkannya, apa adanya.
//
// Aturan tampil:
//   • `segar`        → lencana kecil hijau (menegaskan, bukan mengganggu);
//   • `perhatian`    → kotak kuning dengan kalimat sebab;
//   • `basi`         → kotak merah dengan kalimat sebab;
//   • `tak-diketahui`→ kotak abu-abu: pembaca diberi tahu bahwa kesegaran
//                      TIDAK bisa dipastikan — lebih jujur daripada diam.
//
// Aksesibilitas: kotak memakai `role="status"` (diumumkan pembaca layar tanpa
// merebut fokus) dan teksnya bukan satu-satunya penanda — setiap tingkat punya
// label kata yang eksplisit, jadi warna buta tidak menghilangkan maknanya.

import type { KesegaranRingkas } from '@/types';

const GAYA: Record<
  KesegaranRingkas['tingkat'],
  { kotak: string; lencana: string; ikon: string }
> = {
  segar: {
    kotak: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    lencana: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    ikon: '✓',
  },
  perhatian: {
    kotak: 'border-amber-300 bg-amber-50 text-amber-900',
    lencana: 'bg-amber-100 text-amber-900 border-amber-300',
    ikon: '!',
  },
  basi: {
    kotak: 'border-red-300 bg-red-50 text-red-900',
    lencana: 'bg-red-100 text-red-900 border-red-300',
    ikon: '!!',
  },
  'tak-diketahui': {
    kotak: 'border-slate-300 bg-slate-50 text-slate-800',
    lencana: 'bg-slate-100 text-slate-700 border-slate-300',
    ikon: '?',
  },
};

export default function PeringatanKesegaran({ kesegaran }: { kesegaran?: KesegaranRingkas | null }) {
  if (!kesegaran) return null;
  const gaya = GAYA[kesegaran.tingkat] ?? GAYA['tak-diketahui'];

  return (
    <div
      role="status"
      aria-label={`Kesegaran data: ${kesegaran.label}`}
      className={`mt-2 rounded border px-3 py-2 text-xs leading-relaxed ${gaya.kotak}`}
      data-kesegaran={kesegaran.tingkat}
    >
      <span
        className={`mr-2 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold align-middle ${gaya.lencana}`}
      >
        <span aria-hidden="true">{gaya.ikon}</span>
        {kesegaran.label}
      </span>
      {kesegaran.pesan ? (
        <span>{kesegaran.pesan}</span>
      ) : (
        <span>
          Semua angka pada jawaban ini berasal dari tarikan data yang masih dalam ambang kesegaran.
        </span>
      )}
    </div>
  );
}
