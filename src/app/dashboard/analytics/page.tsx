import { Suspense } from 'react';
import { getAnalyticsData } from '@/services/analytics-data';
import AnalyticsClient from './AnalyticsClient';

// Server component — fetch agregat SAPA server-side (RSC pilot)
// agar tidak roundtrip client→/api/sapa. ChartsView tetap client
// (recharts) tapi menerima initialData via wrapper.
export const revalidate = 600;

export default async function AnalyticsPage() {
  try {
    const data = await getAnalyticsData();
    return (
      <Suspense fallback={<p className="p-6 text-sm text-[#767D6F]">Memuat analitik…</p>}>
        <AnalyticsClient initialData={data} />
      </Suspense>
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Gagal memuat analitik';
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-[var(--danger)] text-sm mb-4">{msg}</p>
      </div>
    );
  }
}
