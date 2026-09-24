// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { catatJejak, RETENSI_HARI, hariIni } from '@/lib/jejak-audit';
import { __clearLocalStore } from '@/lib/store';

/**
 * CMP-04 — endpoint jejak audit.
 *
 * Yang dijaga: (1) fail-closed seperti endpoint admin lain, (2) isinya lengkap
 * untuk pemeriksaan (pertanyaan, bukti, gerbang, sebab), (3) ekspor CSV/NDJSON aman,
 * (4) hari di luar retensi TIDAK mengeluarkan data — bukan sekadar kosong karena
 * kebetulan tidak ada catatan.
 */

function req(token?: string, params: Record<string, string> = {}): NextRequest {
  const q = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/admin/jejak-audit${q ? `?${q}` : ''}`, {
    method: 'GET',
    headers: token ? { 'x-admin-token': token } : undefined,
  });
}

beforeEach(() => {
  __clearLocalStore();
  vi.unstubAllEnvs();
  vi.stubEnv('ADMIN_TOKEN', 'rahasia-uji');
});

describe('GET /api/admin/jejak-audit (CMP-04)', () => {
  it('tanpa token ⇒ 401 dan isi jejak tidak bocor', async () => {
    await catatJejak({ kueri: 'berapa jumlah penduduk', mode: 'deterministik', sebab: 'selesai:leksikal' });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain('jumlah penduduk');
  });

  it('token salah ⇒ 401; ADMIN_TOKEN tidak diset ⇒ 503 fail-closed', async () => {
    expect((await GET(req('token-palsu'))).status).toBe(401);
    vi.stubEnv('ADMIN_TOKEN', '');
    const res = await GET(req('apa pun'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('fail-closed');
  });

  it('token benar ⇒ jejak hari ini lengkap + metadata retensi', async () => {
    await catatJejak({
      kueri: 'cek NIK 1234567890123456',
      mode: 'ditolak-pagar',
      sebab: 'pagar:nik',
      status: 'ditolak',
    });
    const json = await (await GET(req('rahasia-uji'))).json();
    expect(json.status).toBe('ok');
    expect(json.jumlah).toBe(1);
    expect(json.retensiHari).toBe(RETENSI_HARI);
    expect(json.piiDisamarkan).toBe(1);
    expect(json.pemeriksaanPii.bersih).toBe(true);
    expect(json.item[0].kueri).toContain('[NIK]');
    expect(json.pilihanHari.length).toBe(RETENSI_HARI);
    expect(JSON.stringify(json)).not.toMatch(/\d{16}/);
  });

  it('format=csv ⇒ text/csv dengan baris kepala; format=ndjson ⇒ satu JSON per baris', async () => {
    await catatJejak({ kueri: 'jumlah penduduk kecamatan Bebesen', mode: 'deterministik', sebab: 'selesai:leksikal' });
    const csv = await GET(req('rahasia-uji', { format: 'csv' }));
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('x-pii-terdeteksi')).toBe('false');
    const teksCsv = await csv.text();
    expect(teksCsv.split('\n')[0]).toContain('waktu,kueri');
    expect(teksCsv).toContain('jumlah penduduk kecamatan Bebesen');

    const nd = await GET(req('rahasia-uji', { format: 'ndjson' }));
    expect(nd.headers.get('content-type')).toContain('ndjson');
    expect(JSON.parse((await nd.text()).trim().split('\n')[0]).mode).toBe('deterministik');
  });

  it('hari di luar retensi ⇒ kosong dan ditandai (bukan data yang disembunyikan)', async () => {
    const lama = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const json = await (await GET(req('rahasia-uji', { hari: lama }))).json();
    expect(json.hari).toBe(lama);
    expect(json.diluarRetensi).toBe(true);
    expect(json.jumlah).toBe(0);
    expect(json.item).toEqual([]);
  });

  it('batas memotong jumlah baris; hari tidak sah ⇒ kembali ke hari ini', async () => {
    for (let i = 0; i < 3; i += 1) {
      await catatJejak({ kueri: `pertanyaan ${i}`, mode: 'deterministik', sebab: 'selesai:leksikal' });
    }
    const dibatasi = await (await GET(req('rahasia-uji', { batas: '2' }))).json();
    expect(dibatasi.item.length).toBe(2);
    expect(dibatasi.jumlah).toBe(3);
    const takSah = await (await GET(req('rahasia-uji', { hari: 'kemarin' }))).json();
    expect(takSah.hari).toBe(hariIni());
  });
});
