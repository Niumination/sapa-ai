// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST, tentukanSebabCelah, catatCelahBilaPerlu } from './route';
import { ambilCelah } from '@/lib/insight-celah';
import { __clearLocalStore } from '@/lib/store';
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
  __clearLocalStore();
  mockedFetch.mockResolvedValue({
    records: fakeRecords,
    origin: 'splp',
    meta: { diambilPada: '2026-09-22T10:00:00.000Z', sidik: 'abcd1234' },
  });
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

// ─── FR-25 & DS-03 (gelombang 3 lanjutan): kesegaran data + sidik korpus ───────
describe('POST /api/query — kesegaran data & sidik korpus', () => {
  it('menyertakan dataFetchedAt, dataFingerprint, dan dataYears pada jawaban ber-bukti', async () => {
    const res = await POST(req({ query: 'Berapa jumlah ASN di Aceh Tengah?' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dataFetchedAt).toBe('2026-09-22T10:00:00.000Z');
    expect(body.dataFingerprint).toBe('abcd1234');
    expect(body.dataYears).toEqual(['2026']);
  });

  it('jawaban tanpa bukti tetap menyertakan stempel & sidik, dengan dataYears kosong', async () => {
    const res = await POST(req({ query: 'qwertyzzz tidak ada di katalog' }));
    const body = await res.json();
    expect(body.evidence).toHaveLength(0);
    expect(body.dataFetchedAt).toBe('2026-09-22T10:00:00.000Z');
    expect(body.dataFingerprint).toBe('abcd1234');
    expect(body.dataYears).toEqual([]);
  });

  it('kunci lama TIDAK hilang (kontrak aditif)', async () => {
    const body = await (await POST(req({ query: 'Berapa jumlah ASN di Aceh Tengah?' }))).json();
    for (const k of ['narasi', 'answer', 'source', 'count', 'matched', 'aggregated', 'opds', 'evidence', 'query', 'ai', 'visualisasi', 'rekomendasi', 'timestamp', 'dataSource']) {
      expect(body).toHaveProperty(k);
    }
  });
});

// ─── FR-27: pencatatan celah pengetahuan ──────────────────────────────────────
describe('tentukanSebabCelah — aturan sebab (satu sumber untuk JSON & streaming)', () => {
  it('tanpa bukti ⇒ tanpa-bukti', () => {
    expect(tentukanSebabCelah(0, undefined)).toBe('tanpa-bukti');
  });
  it('bukti ada tetapi jawaban AI ditolak gerbang ⇒ ai-ditolak', () => {
    expect(tentukanSebabCelah(5, 'ditolak-grounding')).toBe('ai-ditolak');
    expect(tentukanSebabCelah(3, 'ditolak-tidak-menambah')).toBe('ai-ditolak');
  });
  it('jawaban normal TIDAK dicatat (hemat penyimpanan)', () => {
    expect(tentukanSebabCelah(5, 'dipakai')).toBeNull();
    expect(tentukanSebabCelah(5, 'dipakai-dengan-catatan')).toBeNull();
    expect(tentukanSebabCelah(2, undefined)).toBeNull();
  });
});

describe('catatCelahBilaPerlu', () => {
  it('mencatat ke penyimpanan saat tanpa bukti, dan menyanitasi teksnya', async () => {
    await catatCelahBilaPerlu('berapa jumlah keluarga NIK 1171012304950003', 0, undefined);
    const ringkas = await ambilCelah();
    expect(ringkas.item).toHaveLength(1);
    expect(ringkas.item[0].pertanyaan).not.toMatch(/\d/);
    expect(ringkas.item[0].sebab).toBe('tanpa-bukti');
  });

  it('tidak mencatat saat jawaban normal', async () => {
    await catatCelahBilaPerlu('berapa jumlah ASN', 5, 'dipakai');
    expect((await ambilCelah()).item).toHaveLength(0);
  });
});

// ─── FR-19: sitasi per klaim pada balasan API ─────────────────────────────────
describe('POST /api/query — sitasi per klaim', () => {
  it('menyertakan narasiBersitasi dan ringkasan sitasi', async () => {
    const res = await POST(req({ query: 'Berapa jumlah ASN di Aceh Tengah?' }));
    const body = await res.json();
    expect(typeof body.narasiBersitasi).toBe('string');
    expect(body.sitasi).toBeTruthy();
    expect(body.sitasi.totalKlaim).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.sitasi.tanpaSitasi)).toBe(true);
  });

  it('klaim pada jawaban ber-bukti SELALU dapat dirujuk (tanpaSitasi kosong)', async () => {
    const body = await (await POST(req({ query: 'Berapa jumlah ASN di Aceh Tengah?' }))).json();
    expect(body.sitasi.totalKlaim).toBeGreaterThan(0);
    expect(body.sitasi.tanpaSitasi).toEqual([]);
    // Penanda harus benar-benar ada pada narasi yang bersitasi.
    expect(body.narasiBersitasi).toMatch(/\[\d+\]/);
  });

  it('jawaban tanpa bukti tidak mengarang penanda', async () => {
    const body = await (await POST(req({ query: 'qwertyzzz tidak ada di katalog' }))).json();
    expect(body.evidence).toHaveLength(0);
    expect(body.narasiBersitasi).not.toMatch(/\[\d+\]/);
  });
});
