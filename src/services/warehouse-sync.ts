// ─── Warehouse Sync (PR Lapis 2) — SAPA → snapshot append-only + katalog + EWS ───
// Alur: fetch SAPA → checksum → jika berubah: simpan snapshot + nilai per record,
// pastikan rantai katalog (Skpd/Dataset/Indicator) ada → evaluasi EWS vs snapshot
// sebelumnya → tulis EwsAlert (dedupe alert terbuka yang identik).

import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { fetchSapaData, type SapaRecord } from '@/lib/sapa-client';
import {
  evaluateEws,
  DEFAULT_EWS_THRESHOLDS,
  type IndicatorPoint,
  type EwsThresholds,
} from './ews-engine';
import type { WarehouseMeta } from './report-generator';

const SKPD_KODE = 'SAPA-AT';
const DATASET_SLUG = 'sapa';

/** Checksum kanonik payload: urut by id → deteksi perubahan tanpa peduli urutan. */
export function snapshotChecksum(records: SapaRecord[]): string {
  const canonical = records
    .map(
      (r) =>
        `${r.id}|${r.id_kode_indikator}|${r.variabel}|${r.tahun ?? ''}|${r.opds_nama_opd}|${r.kode_indikator_nama_indikator ?? ''}`,
    )
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

function parseTahun(tahun: string | null): number | null {
  const t = (tahun ?? '').trim();
  return /^\d{4}$/.test(t) ? Number(t) : null;
}

function parseNilai(nilai: string): number | null {
  const n = Number(String(nilai).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Pastikan baris katalog Skpd('SAPA-AT') + Dataset('sapa') ada; kembalikan datasetId. */
async function ensureCatalogRoot(): Promise<string> {
  const skpd = await prisma.skpd.upsert({
    where: { kode: SKPD_KODE },
    update: {},
    create: { kode: SKPD_KODE, nama: 'SAPA Kabupaten Aceh Tengah', kategori: 'LAINNYA' },
  });
  const dataset = await prisma.dataset.upsert({
    where: { slug: DATASET_SLUG },
    update: { lastSync: new Date(), isActive: true },
    create: {
      skpdId: skpd.id,
      slug: DATASET_SLUG,
      nama: 'Data Indikator SAPA',
      deskripsi: 'Katalog indikator SAPA Kabupaten Aceh Tengah (sinkron otomatis).',
      schema: { sumber: 'SAPA daftar_data' },
      endpointSplp: 'https://api-splp.layanan.go.id/sapa/1.0/api/daftar_data',
    },
  });
  return dataset.id;
}

/** Upsert baris Indicator untuk setiap indikator unik di records. */
async function ensureIndicators(datasetId: string, records: SapaRecord[]): Promise<Map<string, string>> {
  const seen = new Map<string, { nama: string; satuan: string }>();
  for (const r of records) {
    const nama = (r.kode_indikator_nama_indikator ?? '').trim();
    if (!nama) continue;
    const satuan = (r.satuan ?? '').trim() || '-';
    const key = `${nama}|||${satuan}`;
    if (!seen.has(key)) seen.set(key, { nama, satuan });
  }

  const existing = await prisma.indicator.findMany({
    where: { datasetId },
    select: { id: true, nama: true, satuan: true },
  });
  const idByKey = new Map(existing.map((i) => [`${i.nama}|||${i.satuan}`, i.id]));

  const toCreate = [...seen.values()].filter((v) => !idByKey.has(`${v.nama}|||${v.satuan}`));
  if (toCreate.length > 0) {
    await prisma.indicator.createMany({
      data: toCreate.map((v) => ({ datasetId, nama: v.nama, satuan: v.satuan })),
      skipDuplicates: true,
    });
    const refreshed = await prisma.indicator.findMany({
      where: { datasetId },
      select: { id: true, nama: true, satuan: true },
    });
    idByKey.clear();
    for (const i of refreshed) idByKey.set(`${i.nama}|||${i.satuan}`, i.id);
  }
  return idByKey;
}

function toPoint(v: {
  idKodeIndikator: number;
  indikator: string;
  satuan: string;
  opd: string;
  nilaiNumber: number | null;
  tahun: string | null;
}): IndicatorPoint | null {
  if (v.nilaiNumber === null || !Number.isFinite(v.nilaiNumber)) return null;
  return {
    idKodeIndikator: v.idKodeIndikator,
    indikator: v.indikator,
    satuan: v.satuan,
    opd: v.opd,
    nilaiNumber: v.nilaiNumber,
    tahun: v.tahun,
  };
}

export interface WarehouseSyncResult {
  changed: boolean;
  snapshotId?: string;
  totalRecords: number;
  origin: string;
  checksum: string;
  alertsCreated: number;
  indicatorsInCatalog: number;
}

/**
 * Meta warehouse untuk Laporan Eksekutif (PR-3): jumlah snapshot, snapshot
 * terakhir, dan hitungan perubahan vs snapshot sebelumnya (memakai ambang sangat
 * rendah agar SEMUA perubahan terhitung — bukan hanya yang lolos ambang EWS).
 * null bila tabel warehouse belum ada (setup belum dijalankan) / query gagal.
 */
export async function getWarehouseReportMeta(): Promise<WarehouseMeta | null> {
  try {
    const snapshotCount = await prisma.sapaSnapshot.count();
    const latest = await prisma.sapaSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    if (!latest) return { snapshotCount, lastSync: new Date(0).toISOString(), diffVsPrev: null };

    const prev = await prisma.sapaSnapshot.findFirst({
      orderBy: { createdAt: 'desc' },
      skip: 1,
      select: { id: true },
    });
    if (!prev) {
      return { snapshotCount, lastSync: latest.createdAt.toISOString(), diffVsPrev: null };
    }

    const rowsOf = (snapshotId: string) =>
      prisma.sapaIndicatorValue.findMany({
        where: { snapshotId },
        select: { idKodeIndikator: true, indikator: true, satuan: true, opd: true, nilaiNumber: true, tahun: true },
      });
    const [prevRows, currRows] = await Promise.all([rowsOf(prev.id), rowsOf(latest.id)]);
    const prevPts = prevRows.map(toPoint).filter((p): p is IndicatorPoint => p !== null);
    const currPts = currRows.map(toPoint).filter((p): p is IndicatorPoint => p !== null);
    const decisions = evaluateEws(prevPts, currPts, {
      info: 0.0001, // hitung semua perubahan, sekecil apa pun
      warning: 1,
      critical: 2,
      maxAlerts: 1_000_000,
    });
    return {
      snapshotCount,
      lastSync: latest.createdAt.toISOString(),
      diffVsPrev: {
        changed: decisions.filter((d) => d.kind === 'change').length,
        baru: decisions.filter((d) => d.kind === 'new').length,
        hilang: decisions.filter((d) => d.kind === 'missing').length,
      },
    };
  } catch {
    return null; // tabel belum ada / DB bermasalah → seksi laporan jujur menjelaskan
  }
}

/**
 * Sinkronisasi warehouse. Snapshot HANYA dibuat jika payload berubah (checksum)
 * — append-only, sehingga histori = deret perubahan nyata, bukan duplikat.
 */
export async function syncSapaWarehouse(
  thresholds: EwsThresholds = DEFAULT_EWS_THRESHOLDS,
): Promise<WarehouseSyncResult> {
  const { records, origin } = await fetchSapaData();
  const checksum = snapshotChecksum(records);

  const latest = await prisma.sapaSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, checksum: true },
  });

  const datasetId = await ensureCatalogRoot();
  const indicatorIds = await ensureIndicators(datasetId, records);

  if (latest?.checksum === checksum) {
    return {
      changed: false,
      snapshotId: latest.id,
      totalRecords: records.length,
      origin,
      checksum,
      alertsCreated: 0,
      indicatorsInCatalog: indicatorIds.size,
    };
  }

  const snapshot = await prisma.sapaSnapshot.create({
    data: { origin, totalRecords: records.length, checksum },
  });

  await prisma.sapaIndicatorValue.createMany({
    data: records.map((r) => ({
      snapshotId: snapshot.id,
      idKodeIndikator: r.id_kode_indikator,
      kodeIndikator: r.kode_indikator_kode_indikator,
      indikator: (r.kode_indikator_nama_indikator ?? '').trim() || '(tanpa nama)',
      opd: r.opds_nama_opd,
      idOpd: r.id_opds,
      nilai: r.variabel,
      nilaiNumber: parseNilai(r.variabel),
      satuan: r.satuan ?? '',
      tahun: r.tahun,
      tahunNumber: parseTahun(r.tahun),
      jadwalPemutakhiran: r.jadwal_pemutakhiran ?? null,
    })),
  });

  // ─── EWS: bandingkan dengan snapshot sebelumnya ───
  let alertsCreated = 0;
  if (latest) {
    const prevRows = await prisma.sapaIndicatorValue.findMany({
      where: { snapshotId: latest.id },
      select: { idKodeIndikator: true, indikator: true, satuan: true, opd: true, nilaiNumber: true, tahun: true },
    });
    const prev = prevRows.map(toPoint).filter((p): p is IndicatorPoint => p !== null);
    const curr = records
      .map((r) =>
        toPoint({
          idKodeIndikator: r.id_kode_indikator,
          indikator: (r.kode_indikator_nama_indikator ?? '').trim() || '(tanpa nama)',
          satuan: r.satuan ?? '',
          opd: r.opds_nama_opd,
          nilaiNumber: parseNilai(r.variabel),
          tahun: r.tahun,
        }),
      )
      .filter((p): p is IndicatorPoint => p !== null);

    const decisions = evaluateEws(prev, curr, thresholds);

    for (const d of decisions) {
      const indicatorId = indicatorIds.get(`${d.indikator}|||${d.satuan.trim() || '-'}`);
      if (!indicatorId) continue;
      // Dedupe: alert terbuka identik (indikator + nilai) tidak dibuat ulang.
      const openDuplicate = await prisma.ewsAlert.findFirst({
        where: { indicatorId, resolvedAt: null, nilaiAktual: d.nilaiAktual },
        select: { id: true },
      });
      if (openDuplicate) continue;
      await prisma.ewsAlert.create({
        data: {
          indicatorId,
          nilaiAktual: d.nilaiAktual,
          threshold: d.threshold,
          pesan: d.pesan,
          severity: d.severity,
        },
      });
      alertsCreated++;
    }
  }

  return {
    changed: true,
    snapshotId: snapshot.id,
    totalRecords: records.length,
    origin,
    checksum,
    alertsCreated,
    indicatorsInCatalog: indicatorIds.size,
  };
}
