// ─── Pagar admin (FR-27): fail-closed, token tidak bocor, waktu-tetap ─────────

import { describe, it, expect } from 'vitest';
import { izinAdmin, samakanWaktuTetap, tokenDariPermintaan } from '../admin-guard';

const req = (url: string, header?: string) =>
  new Request(url, { headers: header ? { 'x-admin-token': header } : undefined });

describe('izinAdmin', () => {
  it('ADMIN_TOKEN kosong ⇒ MENOLAK semua (fail-closed), dengan penjelasan', () => {
    const izin = izinAdmin(req('http://uji/api/admin/celah'), { ADMIN_TOKEN: '' });
    expect(izin.ok).toBe(false);
    expect(izin.status).toBe(503);
    expect(izin.pesan).toContain('ADMIN_TOKEN');
    expect(izin.pesan).toContain('fail-closed');
  });

  it('token kosong pada permintaan ⇒ 401', () => {
    const izin = izinAdmin(req('http://uji/api/admin/celah'), { ADMIN_TOKEN: 'rahasia' });
    expect(izin.ok).toBe(false);
    expect(izin.status).toBe(401);
  });

  it('token salah ⇒ 401 tanpa membocorkan token yang benar', () => {
    const izin = izinAdmin(req('http://uji/api/admin/celah', 'token-palsu'), { ADMIN_TOKEN: 'rahasia-betul' });
    expect(izin.ok).toBe(false);
    expect(izin.status).toBe(401);
    expect(izin.pesan).not.toContain('rahasia-betul');
  });

  it('token benar lewat header ⇒ izin', () => {
    expect(izinAdmin(req('http://uji/api/admin/celah', 'rahasia'), { ADMIN_TOKEN: 'rahasia' }).ok).toBe(true);
  });

  it('token benar lewat parameter kueri ⇒ izin (untuk dibuka di peramban)', () => {
    const izin = izinAdmin(req('http://uji/api/admin/celah?token=rahasia'), { ADMIN_TOKEN: 'rahasia' });
    expect(izin.ok).toBe(true);
  });

  it('spasi berlebih di sekitar token dimaafkan', () => {
    expect(izinAdmin(req('http://uji/api/admin/celah', '  rahasia  '), { ADMIN_TOKEN: 'rahasia' }).ok).toBe(true);
  });
});

describe('samakanWaktuTetap', () => {
  it('benar hanya bila sama persis', () => {
    expect(samakanWaktuTetap('abc', 'abc')).toBe(true);
    expect(samakanWaktuTetap('abc', 'abd')).toBe(false);
    expect(samakanWaktuTetap('abc', 'abcd')).toBe(false);
    expect(samakanWaktuTetap('', '')).toBe(true);
  });
});

describe('tokenDariPermintaan', () => {
  it('mengutamakan header, lalu kueri', () => {
    expect(tokenDariPermintaan(req('http://uji/x?token=kueri', 'header'))).toBe('header');
    expect(tokenDariPermintaan(req('http://uji/x?token=kueri'))).toBe('kueri');
    expect(tokenDariPermintaan(req('http://uji/x'))).toBe('');
  });
});
