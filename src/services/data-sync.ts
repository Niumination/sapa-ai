// ─── Background Sync: SAPA → Database (optional) ───
// Sync data dari SAPA API ke PostgreSQL via Prisma.
// Saat ini optional — app bisa langsung fetch SAPA tanpa DB.

import { prisma } from '@/lib/prisma';
import { fetchSapaData } from '@/lib/sapa-client';

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function syncDataset(datasetSlug: string) {
  const dataset = await prisma.dataset.findUnique({ where: { slug: datasetSlug } });
  if (!dataset) throw new Error(`Dataset ${datasetSlug} not found`);

  const records = await fetchSapaData();

  await prisma.datasetRecord.create({
    data: {
      datasetId: dataset.id,
      data: records as any,
      periode: getCurrentPeriod(),
    },
  });

  await prisma.dataset.update({
    where: { id: dataset.id },
    data: { lastSync: new Date() },
  });
}

export async function syncAllDatasets() {
  const datasets = await prisma.dataset.findMany({ where: { isActive: true } });
  const results: { slug: string; status: 'ok' | 'error'; error?: string }[] = [];

  for (const ds of datasets) {
    try {
      await syncDataset(ds.slug);
      results.push({ slug: ds.slug, status: 'ok' });
    } catch (err) {
      results.push({
        slug: ds.slug,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
