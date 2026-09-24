import { describe, it, expect } from 'vitest';
import { GET } from './route';

/**
 * CMP-03 — endpoint register risiko.
 *
 * Endpoint ini sengaja terbuka (isinya memang untuk dibaca publik), tetapi harus
 * benar-benar mengembalikan register lengkap — bukan ringkasan kosong — karena
 * harness memeriksa rujukan bukti dari sini.
 */
describe('GET /api/tata-kelola-risiko (CMP-03)', () => {
  it('mengembalikan register lengkap dengan tingkat, pemilik, bukti, dan tindak lanjut', async () => {
    const json = await (await GET()).json();
    expect(json.status).toBe('ok');
    expect(json.jumlah).toBe(json.item.length);
    expect(json.jumlah).toBeGreaterThanOrEqual(9);
    for (const r of json.item) {
      expect(['rendah', 'sedang', 'tinggi']).toContain(r.tingkat);
      expect(r.pemilik.peran.length).toBeGreaterThan(5);
      expect(r.bukti.length).toBeGreaterThan(0);
      expect(r.tindakLanjut.length).toBeGreaterThan(0);
    }
  });

  it('tidak memuat kredensial apa pun', async () => {
    const teks = JSON.stringify(await (await GET()).json()).toLowerCase();
    for (const terlarang of ['api_key', 'apitoken', 'admin_token', 'rahasia', 'password', 'secret']) {
      expect(teks).not.toContain(terlarang);
    }
  });
});
