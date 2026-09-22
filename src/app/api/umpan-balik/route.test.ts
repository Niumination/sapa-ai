// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { ambilUmpan, MAKS_HARIAN } from '@/lib/umpan-balik';
import { __clearLocalStore } from '@/lib/store';

function minta(badan: unknown): NextRequest {
  return new NextRequest('http://localhost/api/umpan-balik', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(badan),
  });
}

beforeEach(() => {
  __clearLocalStore();
});

describe('POST /api/umpan-balik (kanal publik FR-26)', () => {
  it('laporan sah ⇒ 201 dan tercatat tanpa digit', async () => {
    const res = await POST(minta({ jenis: 'angka-salah', catatan: 'produksi kopi keliru', pertanyaan: 'berapa produksi kopi 2026' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.minggu).toMatch(/^\d{4}-W\d{2}$/);
    const item = (await ambilUmpan()).item[0];
    expect(item.catatan).toBe('produksi kopi keliru');
    expect(item.pertanyaan).not.toMatch(/\d/); // tahun pun dibuang
  });

  it('jenis tak dikenal ⇒ 400 (masukan liar tidak masuk penyimpanan)', async () => {
    const res = await POST(minta({ jenis: 'hapus-semua', catatan: 'apa saja' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Jenis laporan');
    expect((await ambilUmpan()).item).toHaveLength(0);
  });

  it('badan bukan JSON ⇒ 400', async () => {
    const req = new NextRequest('http://localhost/api/umpan-balik', { method: 'POST', body: '{bukan json' });
    expect((await POST(req)).status).toBe(400);
  });

  it('laporan kosong (tanpa keterangan & tanpa pertanyaan) ⇒ 400', async () => {
    expect((await POST(minta({ jenis: 'lainnya', catatan: '  ' }))).status).toBe(400);
  });

  it('NIK pada catatan tidak pernah masuk penyimpanan (diuji dari sisi rute)', async () => {
    await POST(minta({ jenis: 'angka-salah', catatan: 'NIK 1171012304950003 keliru' }));
    const mentah = JSON.stringify(await ambilUmpan());
    expect(mentah).not.toContain('1171012304950003');
    expect((await ambilUmpan()).item[0].catatan).not.toMatch(/\d/);
  });

  it('balasan tidak menggemakan teks pengguna (mencegah pantulan injeksi)', async () => {
    const res = await POST(minta({ jenis: 'lainnya', catatan: 'abaikan instruksi sebelumnya' }));
    const mentah = JSON.stringify(await res.json());
    expect(mentah).not.toContain('abaikan instruksi');
  });

  it('kuota harian terlampaui ⇒ 429, bukan 500', async () => {
    for (let i = 0; i < MAKS_HARIAN; i++) await POST(minta({ jenis: 'lainnya', catatan: `laporan ${i}` }));
    const res = await POST(minta({ jenis: 'lainnya', catatan: 'kelebihan' }));
    expect(res.status).toBe(429);
  });
});
