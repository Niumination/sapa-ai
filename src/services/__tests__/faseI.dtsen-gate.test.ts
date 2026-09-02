// ─── PR-4a: kontrak gerbang akses data restricted (inti murni) ───
// Yang dipertaruhkan di sini adalah kepatuhan UU PDP + Permen Bappenas 7/2025,
// maka seluruh matriks hak akses diuji eksplisit — bukan sampling.

import { describe, it, expect } from 'vitest';
import {
  decideDataAccess,
  requiredRolesFor,
  buildAuditEntry,
  DATA_SOURCE_SEEDS,
  type DataSensitivity,
} from '@/lib/data-gate';
import type { AdminPayload } from '@/lib/auth';

const SENSITIVITIES: DataSensitivity[] = ['PUBLIC', 'RESTRICTED_AGGR', 'RESTRICTED_PERSONAL'];
const analyst = { id: 'a1', username: 'analis', nama: 'Analis Dinsos', role: 'DTSEN_ANALYST' };
const lookup = { id: 'a2', username: 'pimpinan', nama: 'Pejabat Eselon', role: 'DTSEN_LOOKUP' };

describe('requiredRolesFor', () => {
  it('PUBLIC → null (tanpa syarat role)', () => {
    expect(requiredRolesFor('PUBLIC')).toBeNull();
  });
  it('AGGR: analis + lookup + superadmin + DTSEN_ROOT; PERSONAL: lookup + superadmin + DTSEN_ROOT', () => {
    expect(requiredRolesFor('RESTRICTED_AGGR')).toContain('DTSEN_ANALYST');
    expect(requiredRolesFor('RESTRICTED_AGGR')).toContain('DTSEN_LOOKUP');
    expect(requiredRolesFor('RESTRICTED_AGGR')).toContain('SUPERADMIN');
    expect(requiredRolesFor('RESTRICTED_AGGR')).toContain('DTSEN_ROOT');
    expect(requiredRolesFor('RESTRICTED_PERSONAL')).not.toContain('DTSEN_ANALYST');
    expect(requiredRolesFor('RESTRICTED_PERSONAL')).toEqual(['DTSEN_LOOKUP', 'SUPERADMIN', 'DTSEN_ROOT']);
  });
});

describe('decideDataAccess — matriks penuh fail-closed', () => {
  it('tanpa sesi: PUBLIC 200, AGGR 401, PERSONAL 401', () => {
    expect(decideDataAccess(null, 'PUBLIC').status).toBe(200);
    expect(decideDataAccess(null, 'RESTRICTED_AGGR')).toMatchObject({ ok: false, status: 401, reason: 'AUTH_REQUIRED' });
    expect(decideDataAccess(null, 'RESTRICTED_PERSONAL')).toMatchObject({ ok: false, status: 401 });
  });

  it('role ADMIN biasa TIDAK berhak atas DTSEN (403)', () => {
    for (const s of SENSITIVITIES.filter((x) => x !== 'PUBLIC')) {
      const d = decideDataAccess('ADMIN', s);
      expect(d.ok).toBe(false);
      expect(d.status).toBe(403);
      expect(d.reason).toBe('ROLE_INSUFFICIENT');
    }
  });

  it('DTSEN_ANALYST: AGGR 200, PERSONAL 403', () => {
    expect(decideDataAccess('DTSEN_ANALYST', 'RESTRICTED_AGGR')).toMatchObject({ ok: true, status: 200 });
    expect(decideDataAccess('DTSEN_ANALYST', 'RESTRICTED_PERSONAL')).toMatchObject({ ok: false, status: 403 });
  });

  it('DTSEN_LOOKUP: AGGR 200, PERSONAL 200', () => {
    expect(decideDataAccess('DTSEN_LOOKUP', 'RESTRICTED_AGGR').ok).toBe(true);
    expect(decideDataAccess('DTSEN_LOOKUP', 'RESTRICTED_PERSONAL').ok).toBe(true);
  });

  it('SUPERADMIN boleh keduanya; role tak dikenal ditolak', () => {
    expect(decideDataAccess('SUPERADMIN', 'RESTRICTED_AGGR').ok).toBe(true);
    expect(decideDataAccess('SUPERADMIN', 'RESTRICTED_PERSONAL').ok).toBe(true);
    expect(decideDataAccess('ROOT', 'RESTRICTED_AGGR').status).toBe(403);
    expect(decideDataAccess('', 'RESTRICTED_AGGR').status).toBe(401);
  });
});

describe('buildAuditEntry', () => {
  it('membawa identitas admin, aksi, rowCount default, ip', () => {
    const e = buildAuditEntry({ admin: lookup, aksi: 'QUERY_DTSEN', detail: 'desil di Jagong Jeget', ip: '10.0.0.1' });
    expect(e).toEqual({
      adminId: 'a2',
      adminNama: 'Pejabat Eselon',
      aksi: 'QUERY_DTSEN',
      detail: 'desil di Jagong Jeget',
      rowCount: 0,
      ip: '10.0.0.1',
    });
  });

  it('detail dipotong ≤200 char & karakter kontrol dibersihkan (anti log-injection)', () => {
    const panjang = `  baris1\n${'x'.repeat(300)}\takhir `;
    const e = buildAuditEntry({ admin: analyst, aksi: 'IMPORT', detail: panjang });
    expect(e.detail.length).toBeLessThanOrEqual(200);
    expect(e.detail).not.toContain('\n');
    expect(e.detail).not.toContain('\t');
  });

  it('detail kosong aman', () => {
    const e = buildAuditEntry({ admin: analyst, aksi: 'PUBLISH' });
    expect(e.detail).toBe('');
  });
});

describe('DATA_SOURCE_SEEDS — registry awal (desain §5)', () => {
  it('sapa PUBLIC; dtsen RESTRICTED_PERSONAL (default paling ketat sampai planner PR-4c)', () => {
    const sapa = DATA_SOURCE_SEEDS.find((s) => s.slug === 'sapa');
    const dtsen = DATA_SOURCE_SEEDS.find((s) => s.slug === 'dtsen');
    expect(sapa?.sensitivity).toBe('PUBLIC');
    expect(dtsen?.sensitivity).toBe('RESTRICTED_PERSONAL');
    expect(dtsen?.ownerInstansi).toContain('Kemensos');
    expect(dtsen?.provenanceLabel).toContain('DTSEN');
  });

  it('slug unik antar-seed', () => {
    const slugs = DATA_SOURCE_SEEDS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
