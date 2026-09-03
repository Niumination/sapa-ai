import DashboardClient from './DashboardClient';
import { getKpiData } from '@/services/kpi-data';

export const revalidate = 600;

export default async function DashboardPage() {
  let initialKpiData: { kpis: any[]; source: string } | null = null;
  try {
    const d = await getKpiData();
    initialKpiData = { kpis: d.kpis, source: d.source };
  } catch {}
  return <DashboardClient initialKpiData={initialKpiData} />;
}
