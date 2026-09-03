import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { fetchSapaData, type SapaRecord } from '@/lib/sapa-client';

vi.mock('@/lib/sapa-client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/sapa-client')>();
  return { ...mod, fetchSapaData: vi.fn() };
});

const mockedFetch = vi.mocked(fetchSapaData);

const fakeRecords: SapaRecord[] = [
  {
    id: 1, id_kode_indikator: 1, kode_indikator_kode_indikator: 'X.1',
    kode_indikator_nama_indikator: 'Jumlah ASN', id_opds: 1,
    opds_nama_opd: 'Badan Kepegawaian dan Pengembangan SDM',
    jadwal_pemutakhiran: 'Tahunan', satuan: 'pegawai', tahun: '2026', variabel: '9610',
  },
  {
    id: 2, id_kode_indikator: 2, kode_indikator_kode_indikator: 'X.2',
    kode_indikator_nama_indikator: 'Jumlah Guru SD PNS', id_opds: 2,
    opds_nama_opd: 'Dinas Pendidikan dan Kebudayaan',
    jadwal_pemutakhiran: 'Tahunan', satuan: 'Orang', tahun: '2026', variabel: '819',
  },
];

function req(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/query', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedFetch.mockResolvedValue({ records: fakeRecords, origin: 'splp' });
});

describe('POST /api/query', () => {
  it('400 untuk query < 3 karakter (tanpa fetch SPLP)', async () => {
    const res = await POST(req({ query: 'ab' }));
    expect(res.status).toBe(400);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('503 graceful saat SPLP mati', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('SPLP API error 401'));
    const res = await POST(req({ query: 'ASN' }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.stage).toBe('splp');
  });

  it('hit: ASN mengembalikan Jumlah ASN', async () => {
    const res = await POST(req({ query: 'ASN' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matched).toBeGreaterThan(0);
    expect(body.narasi).toContain('9.610');
  });

  it('miss: keyword tak dikenal mengembalikan matched 0', async () => {
    const res = await POST(req({ query: 'qwertyzzz' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matched).toBe(0);
  });
});
