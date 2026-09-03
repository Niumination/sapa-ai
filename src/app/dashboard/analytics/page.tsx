'use client';
import dynamic from 'next/dynamic';

// Recharts-heavy: dynamic ssr:false agar grafik tidak masuk bundle awal
const ChartsView = dynamic(() => import('./ChartsView'), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-[#767D6F]">Memuat grafik…</p>,
});

export default function AnalyticsPage() {
  return <ChartsView />;
}
