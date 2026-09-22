// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { catatCelah } from '@/lib/insight-celah';
import { __clearLocalStore } from '@/lib/store';

function req(token?: string, minggu?: string): NextRequest {
  const url = `http://localhost/api/admin/celah${minggu ? `?minggu=${minggu}` : ''}`;
  return new NextRequest(url, { method: 'GET', headers: token ? { 'x-admin-token': token } : undefined });
}

beforeEach(() => {
  __clearLocalStore();
  vi.unstubAllEnvs();
  vi.stubEnv('ADMIN_TOKEN', 'rahasia-uji');
});

describe('GET /api/admin/celah', () => {
  it('tanpa token ⇒ 401 dan tidak membocorkan daftar', async () => {
    await catatCelah('berapa jumlah keluarga per desa', 'retrieval:tanpa-bukti');
    const res = await GET(req());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(JSON.stringify(body)).not.toContain('keluarga per desa');
  });

  it('token salah ⇒ 401', async () => {
    const res = await GET(req('token-palsu'));
    expect(res.status).toBe(401);
  });

  it('ADMIN_TOKEN tidak diset ⇒ 503 fail-closed', async () => {
    vi.stubEnv('ADMIN_TOKEN', '');
    const res = await GET(req('apa pun'));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('fail-closed');
  });

  it('token benar ⇒ daftar celah minggu berjalan', async () => {
    await catatCelah('berapa jumlah keluarga per desa', 'retrieval:tanpa-bukti');
    await catatCelah('berapa jumlah keluarga per desa', 'retrieval:tanpa-bukti');
    const res = await GET(req('rahasia-uji'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.total).toBe(2);
    expect(body.item[0].pertanyaan).toBe('berapa jumlah keluarga per desa');
    expect(body.item[0].sebab).toBe('retrieval:tanpa-bukti');
    expect(Array.isArray(body.pilihanMinggu)).toBe(true);
  });

  it('minggu tak berbentuk diabaikan (dianggap minggu berjalan)', async () => {
    const res = await GET(req('rahasia-uji', 'bukan-minggu'));
    const body = await res.json();
    expect(body.minggu).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('balasan tidak memuat identitas apa pun — hanya pertanyaan bersih, jumlah, sebab, waktu', async () => {
    await catatCelah('NIK 1171012304950003 keluarga', 'retrieval:tanpa-bukti');
    const body = await (await GET(req('rahasia-uji'))).json();
    const kunci = Object.keys(body.item[0] ?? {});
    expect(kunci.sort()).toEqual(['jumlah', 'pertanyaan', 'sebab', 'terakhir']);
    expect(JSON.stringify(body)).not.toContain('1171012304950003');
  });
});
