import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { catatUmpan } from '@/lib/umpan-balik';
import { __clearLocalStore } from '@/lib/store';

function req(token?: string, minggu?: string): NextRequest {
  const url = `http://localhost/api/admin/umpan-balik${minggu ? `?minggu=${minggu}` : ''}`;
  return new NextRequest(url, { method: 'GET', headers: token ? { 'x-admin-token': token } : undefined });
}

beforeEach(() => {
  __clearLocalStore();
  vi.unstubAllEnvs();
  vi.stubEnv('ADMIN_TOKEN', 'rahasia-uji');
});

describe('GET /api/admin/umpan-balik (FR-26)', () => {
  it('tanpa token ⇒ 401 dan isi laporan tidak bocor', async () => {
    await catatUmpan({ jenis: 'angka-salah', catatan: 'produksi kopi keliru' });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain('produksi kopi');
  });

  it('token salah ⇒ 401', async () => {
    expect((await GET(req('token-palsu'))).status).toBe(401);
  });

  it('ADMIN_TOKEN tidak diset ⇒ 503 fail-closed', async () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    const res = await GET(req('apa pun'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('fail-closed');
  });

  it('token benar ⇒ daftar laporan minggu berjalan, terurut dari yang paling sering', async () => {
    await catatUmpan({ jenis: 'satuan-salah', catatan: 'satuan produksi kopi' });
    await catatUmpan({ jenis: 'satuan-salah', catatan: 'satuan produksi kopi' });
    await catatUmpan({ jenis: 'indikator-hilang', catatan: 'indikator koperasi' });

    const res = await GET(req('rahasia-uji'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.minggu).toMatch(/^\d{4}-W\d{2}$/);
    expect(body.total).toBe(3);
    expect(body.item).toHaveLength(2);
    expect(body.item[0].jenis).toBe('satuan-salah');
    expect(body.item[0].jumlah).toBe(2);
    expect(Array.isArray(body.pilihanMinggu)).toBe(true);
  });

  it('kunci balasan tepat: jenis, catatan, pertanyaan, jumlah, terakhir', async () => {
    await catatUmpan({ jenis: 'lainnya', catatan: 'catatan singkat' });
    const body = await (await GET(req('rahasia-uji'))).json();
    expect(Object.keys(body.item[0]).sort()).toEqual(['catatan', 'jenis', 'jumlah', 'pertanyaan', 'terakhir']);
  });

  it('minggu tak berbentuk diabaikan (dianggap minggu berjalan)', async () => {
    const body = await (await GET(req('rahasia-uji', 'bukan-minggu'))).json();
    expect(body.minggu).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('minggu tanpa data ⇒ daftar kosong, bukan galat', async () => {
    const body = await (await GET(req('rahasia-uji', '2020-W01'))).json();
    expect(body.status).toBe('ok');
    expect(body.total).toBe(0);
    expect(body.item).toEqual([]);
  });
});
