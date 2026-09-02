/**
 * Sumber DTSEN OFFLINE — Agregat BAPPEDA Aceh Tengah (DTSEN Versi 4, Des 2025).
 *
 * @hotfix 28 Agu 2026 — SPLP DTSEN API masih 401 (JWT expired). Sambil menunggu
 * JWT baru, pipeline memakai agregat statistik bebas-PII dari export BAPPEDA
 * (`data/dtsen-raw/` — RAW ber-PII, git-ignored; JSON agregat di
 * `src/data/dtsen-agregat-bappeda.json` — bebas-PII, di-commit).
 *
 * Urutan sumber DTSEN di `fetchDtsenAgregatPublik`:
 *   1. SPLP API (live, butuh JWT valid)
 *   2. → BAPPEDA offline (file ini)  ← aktif saat API 401
 *   3. → DB Prisma (warehouse release)
 *   4. → null (orchestrator jatuh ke demo data)
 */
import bappeda from '@/data/dtsen-agregat-bappeda.json';
import {
  buildAgregatAnswer,
  type PublicAgregatFilter,
  type PublicAgregatResult,
} from '@/services/dtsen-planner';
import { type AgregatRow } from '@/services/dtsen-import';

const RELEASE_NUMBER = 'BAPPEDA-DES-2025';
const LABEL = 'DTSEN (BAPPEDA Des 2025 — offline)';

export function isBappedaAvailable(): boolean {
  return Array.isArray((bappeda as any)?.per_kecamatan_desil) && (bappeda as any).per_kecamatan_desil.length > 0;
}

/** Bangun rows AgregatRow dari JSON agregat sesuai filter. */
function buildRows(filter: PublicAgregatFilter): AgregatRow[] {
  const kec = filter.kecamatan?.toUpperCase() ?? null;
  const desa = filter.desa?.toUpperCase() ?? null;
  const desilSet = filter.desil && filter.desil.length > 0 ? new Set(filter.desil) : null;
  const rows: AgregatRow[] = [];

  if (desa && kec) {
    // Granularity desa: per_desa (total semua desil per desa)
    for (const d of (bappeda as any).per_desa ?? []) {
      if (d.kecamatan === kec && d.desa === desa) {
        rows.push({ kecamatan: d.kecamatan, desa: d.desa, desil: 0, jumlahJiwa: d.jiwa, jumlahKeluarga: d.keluarga });
      }
    }
  } else if (kec) {
    // Granularity kecamatan x desil
    for (const r of (bappeda as any).per_kecamatan_desil ?? []) {
      if (r.kecamatan !== kec) continue;
      if (desilSet && !desilSet.has(r.desil)) continue;
      rows.push({ kecamatan: r.kecamatan, desa: '', desil: r.desil, jumlahJiwa: r.jiwa, jumlahKeluarga: r.keluarga });
    }
  } else {
    // Kabupaten penuh
    for (const r of (bappeda as any).per_kecamatan_desil ?? []) {
      if (desilSet && !desilSet.has(r.desil)) continue;
      rows.push({ kecamatan: r.kecamatan, desa: '', desil: r.desil, jumlahJiwa: r.jiwa, jumlahKeluarga: r.keluarga });
    }
  }
  return rows;
}

/** Hitung bansos dari agregat BAPPEDA: PBI nasional + PBI pemda → program 'pbi'. */
function buildBansos(filter: PublicAgregatFilter): { program: 'pbi'; jiwa: number }[] | null {
  const kec = filter.kecamatan?.toUpperCase() ?? null;
  let jiwa = 0;
  for (const k of (bappeda as any).bansos_per_kecamatan ?? []) {
    if (kec && k.kecamatan !== kec) continue;
    jiwa += (k.pbi_nas?.jiwa ?? 0) + (k.pbi_pemda?.jiwa ?? 0);
  }
  // K-anonimitas: PBI nasional saja sudah > K_MIN di semua kecamatan; aman tampil.
  return jiwa > 0 ? [{ program: 'pbi', jiwa }] : null;
}

/** Bangun hasil agregat dari sumber BAPPEDA offline (sinkron; data statis di-commit). */
export function fetchDtsenAgregatBappeda(filter: PublicAgregatFilter): PublicAgregatResult | null {
  if (!isBappedaAvailable()) return null;
  const rows = buildRows(filter);
  if (rows.length === 0) return null;

  const releaseRef = {
    releaseNumber: RELEASE_NUMBER,
    status: 'PUBLISHED' as const,
    publishedAt: new Date('2026-02-18T00:00:00+07:00'),
  };
  const bansosCounts = buildBansos(filter);
  const jawaban = buildAgregatAnswer({
    rows,
    release: releaseRef,
    kecamatan: filter.kecamatan ?? null,
    desa: filter.desa ?? null,
    desil: filter.desil ?? null,
    bansosCounts,
  });

  const sensor = [
    'Data agregat DTSEN Versi 4 (Desember 2025) dari BAPPEDA Kabupaten Aceh Tengah (export 18/02/2026) — offline, bebas-PII.',
    ...jawaban.sensor,
  ];

  return {
    release: releaseRef,
    provenance: { label: LABEL, releaseNumber: RELEASE_NUMBER, status: 'PUBLISHED', publishedAt: releaseRef.publishedAt },
    rows,
    totalJiwa: rows.reduce((a, r) => a + r.jumlahJiwa, 0),
    totalKeluarga: rows.reduce((a, r) => a + r.jumlahKeluarga, 0),
    byDesil: jawaban.byDesil,
    byWilayah: jawaban.byWilayah,
    bansos: bansosCounts,
    sensor,
    narasi: jawaban.narasi,
  };
}
