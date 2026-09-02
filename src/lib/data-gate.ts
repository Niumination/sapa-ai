// ─── Data Gate (PR-4a / Lapis 3) — satu-satunya gerbang data restricted ───
// Hak akses mengikuti Permen PPN/Bappenas No. 7/2025 (klasifikasi per jabatan)
// dan UU 27/2022 (UU PDP). NON-NEGOTIABLE (desain §3):
//   1. Fail-closed: tanpa sesi → 401; sesi tanpa role → 403. Default = menolak.
//   2. Pipeline publik (/api/query) TIDAK PERNAH menerima data restricted —
//      pemisahan fisik tabel & modul; gate ini hanya dipakai route /api/dtsen/*.
//   3. Setiap akses restricted (izinkan atau tolak, selama ada sesi) diaudit.
// Inti keputusan MURNI (tanpa IO) supaya seluruh matriks hak akses teruji unit.

import type { AdminPayload } from '@/lib/auth';

export type DataSensitivity = 'PUBLIC' | 'RESTRICTED_AGGR' | 'RESTRICTED_PERSONAL';

/** Role yang memenuhi syarat per tingkat sensitivitas (SUPERADMIN selalu boleh). */
export const ROLES_AGGR = ['DTSEN_ANALYST', 'DTSEN_LOOKUP', 'SUPERADMIN', 'DTSEN_ROOT'] as const;
export const ROLES_PERSONAL = ['DTSEN_LOOKUP', 'SUPERADMIN', 'DTSEN_ROOT'] as const;

export function requiredRolesFor(sensitivity: DataSensitivity): readonly string[] | null {
  if (sensitivity === 'PUBLIC') return null; // tanpa sesi pun boleh
  return sensitivity === 'RESTRICTED_PERSONAL' ? ROLES_PERSONAL : ROLES_AGGR;
}

export interface AccessDecision {
  ok: boolean;
  status: 200 | 401 | 403;
  reason?: 'AUTH_REQUIRED' | 'ROLE_INSUFFICIENT';
  requiredRoles?: readonly string[];
}

export function decideDataAccess(role: string | null, sensitivity: DataSensitivity): AccessDecision {
  const required = requiredRolesFor(sensitivity);
  if (required === null) return { ok: true, status: 200 };
  if (!role) {
    return { ok: false, status: 401, reason: 'AUTH_REQUIRED', requiredRoles: required };
  }
  if (!(required as readonly string[]).includes(role)) {
    return { ok: false, status: 403, reason: 'ROLE_INSUFFICIENT', requiredRoles: required };
  }
  return { ok: true, status: 200 };
}

// ─── Audit trail (UU PDP: akuntabilitas akses data pribadi) ───

export type AuditAction =
  | 'QUERY_DTSEN'
  | 'QUERY_DTSEN_DITOLAK'
  | 'LOOKUP_NIK'
  | 'LOOKUP_NIK_DITOLAK'
  | 'IMPORT'
  | 'IMPORT_DITOLAK'
  | 'PUBLISH'
  | 'PUBLISH_DITOLAK'
  | 'BREAKDOWN_INDIVIDU';

const AUDIT_DETAIL_MAX = 200;

export interface AuditEntry {
  adminId: string;
  adminNama: string;
  aksi: AuditAction;
  detail: string; // teks query / ringkasan target — JANGAN PERNAH berisi data hasil
  rowCount: number;
  ip: string | null;
}

/** Rakit entri audit (murni): detail dipotong & dibersihkan dari karakter kontrol. */
export function buildAuditEntry(params: {
  admin: AdminPayload;
  aksi: AuditAction;
  detail?: string;
  rowCount?: number;
  ip?: string | null;
}): AuditEntry {
  const detail = (params.detail ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AUDIT_DETAIL_MAX);
  return {
    adminId: params.admin.id,
    adminNama: params.admin.nama,
    aksi: params.aksi,
    detail,
    rowCount: params.rowCount ?? 0,
    ip: params.ip ?? null,
  };
}

// ─── Seed registry sumber data ───
// Di-upsert oleh ensureDtsenTables() (db-migration) saat /api/setup.
// 'dtsen' diberi sensitivitas tertinggi (PERSONAL): tingkat AGGR diputuskan
// per-request oleh planner (PR-4c); sampai saat itu default = paling ketat.

export interface DataSourceSeed {
  slug: string;
  nama: string;
  sensitivity: DataSensitivity;
  provenanceLabel: string;
  ownerInstansi: string;
}

export const DATA_SOURCE_SEEDS: DataSourceSeed[] = [
  {
    slug: 'sapa',
    nama: 'SAPA Kabupaten Aceh Tengah',
    sensitivity: 'PUBLIC',
    provenanceLabel: 'SAPA Aceh Tengah (data agregat publik)',
    ownerInstansi: 'Diskominfo Kab. Aceh Tengah',
  },
  {
    slug: 'dtsen',
    nama: 'Data Tunggal Sosial dan Ekonomi Nasional (DTSEN)',
    sensitivity: 'RESTRICTED_PERSONAL',
    provenanceLabel: 'DTSEN — Kemensos/BPS (menunggu rilis resmi)',
    ownerInstansi: 'Kemensos RI / BPS RI',
  },
  {
    slug: 'dtsen-splp',
    nama: 'DTSEN via Portal SDI (SPLP)',
    sensitivity: 'RESTRICTED_PERSONAL',
    provenanceLabel: 'DTSEN — Portal SDI (api-splp.layanan.go.id)',
    ownerInstansi: 'Kemensos RI / BPS RI',
  },
  {
    slug: 'dtsen-kominfo',
    nama: 'Data Sosial Kominfo Aceh Tengah',
    sensitivity: 'RESTRICTED_PERSONAL',
    provenanceLabel: 'Kominfo Aceh Tengah — data penerima bantuan',
    ownerInstansi: 'Diskominfo Kab. Aceh Tengah',
  },
  {
    slug: 'dtsen-stunting',
    nama: 'Data Stunting Aceh Tengah',
    sensitivity: 'RESTRICTED_PERSONAL',
    provenanceLabel: 'Data Stunting — Kemenko PMK / BPS (manual import)',
    ownerInstansi: 'Dinas Kesehatan Kab. Aceh Tengah',
  },
];
