'use client';

import nextDynamic from 'next/dynamic';

const ChartsView = nextDynamic(() => import('./ChartsView'), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-[#767D6F]">Memuat grafik…</p>,
});

export default function AnalyticsClient({ initialData }: { initialData: import('@/services/analytics-data').AnalyticsData | null }) {
  return <ChartsView initialData={initialData} />;
}
