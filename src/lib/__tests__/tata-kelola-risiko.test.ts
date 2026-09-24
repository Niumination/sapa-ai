import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import HalamanTataKelolaRisiko from '@/app/tata-kelola-risiko/page';
import {
  DITINJAU_PADA,
  KATA_PERAN,
  REGISTER_RISIKO,
  TINJAUAN_BERIKUTNYA,
  VERSI_REGISTER,
  jenisBuktiValid,
  pemilikTanpaPeran,
  ringkasRegister,
  risikoLewatTenggat,
  risikoTanpaBukti,
  risikoTanpaKendali,
  risikoTanpaPemilik,
  risikoTanpaTindakLanjut,
  rujukanBerkas,
  tingkatRisiko,
} from '@/lib/tata-kelola-risiko';

/**
 * CMP-03 — tata kelola risiko AI.
 *
 * Yang dijaga uji ini BUKAN "ada daftar risiko" (itu mudah), melainkan hal-hal yang
 * membuat daftar itu berguna: setiap risiko punya PEMILIK berupa PERAN, KENDALI,
 * BUKTI yang benar-benar ada di repositori, dan TINDAK LANJUT bertanggal.
 * Lima uji SABOTASE membuktikan pemeriksanya tidak vakum.
 */

describe('CMP-03 — integritas register', () => {
  it('id unik, register tidak kosong, dan setiap risiko terisi lengkap', () => {
    const id = REGISTER_RISIKO.map((r) => r.id);
    expect(new Set(id).size).toBe(id.length);
    expect(REGISTER_RISIKO.length).toBeGreaterThanOrEqual(9);
    for (const r of REGISTER_RISIKO) {
      expect(r.judul.length).toBeGreaterThan(15);
      expect(r.kategori.length).toBeGreaterThan(3);
      expect(r.nist.length).toBeGreaterThan(0);
      expect(r.kendali.length).toBeGreaterThan(0);
      expect(r.bukti.length).toBeGreaterThan(0);
      expect(r.tindakLanjut.length).toBeGreaterThan(0);
    }
  });

  it('keempat fungsi NIST AI RMF terwakili (Govern · Map · Measure · Manage)', () => {
    const { perFungsiNist } = ringkasRegister();
    for (const f of ['govern', 'map', 'measure', 'manage'] as const) {
      expect(perFungsiNist[f]).toBeGreaterThan(0);
    }
  });

  it('setiap risiko punya pemilik, kendali, bukti, dan tindak lanjut (empat pemeriksa kosong)', () => {
    expect(risikoTanpaPemilik()).toEqual([]);
    expect(risikoTanpaKendali()).toEqual([]);
    expect(risikoTanpaBukti()).toEqual([]);
    expect(risikoTanpaTindakLanjut()).toEqual([]);
  });

  it('pemilik berupa PERAN, bukan nama orang (register tidak basi saat pegawai mutasi)', () => {
    expect(pemilikTanpaPeran()).toEqual([]);
    for (const r of REGISTER_RISIKO) {
      expect(KATA_PERAN.some((k) => r.pemilik.peran.toLowerCase().includes(k))).toBe(true);
      expect(r.pemilik.tanggungJawab.length).toBeGreaterThan(20);
    }
  });
});

describe('CMP-03 — bukti kendali harus nyata', () => {
  it('setiap rujukan bukti (selain endpoint) ada sebagai berkas di repositori', () => {
    const berkas = [...new Set(rujukanBerkas())];
    expect(berkas.length).toBeGreaterThan(15);
    const hilang = berkas.filter((b) => !existsSync(join(process.cwd(), b)));
    expect(hilang).toEqual([]);
  });

  it('jenis bukti hanya dari daftar yang dikenal, dan endpoint berupa rute internal', () => {
    for (const r of REGISTER_RISIKO) {
      for (const b of r.bukti) {
        expect(jenisBuktiValid(b.jenis)).toBe(true);
        if (b.jenis === 'endpoint') expect(b.rujukan.startsWith('/api/')).toBe(true);
      }
    }
  });

  it('minimal satu risiko bersandar pada harness (bukan hanya uji unit)', () => {
    const berHarness = REGISTER_RISIKO.filter((r) => r.bukti.some((b) => b.jenis === 'harness'));
    expect(berHarness.length).toBeGreaterThanOrEqual(4);
  });
});

describe('CMP-03 — tenggat & tingkat', () => {
  it('tenggat peninjauan valid, tidak lebih dari 6 bulan sejak tinjauan terakhir, dan belum lewat', () => {
    const batas = new Date(DITINJAU_PADA);
    batas.setMonth(batas.getMonth() + 6);
    for (const r of REGISTER_RISIKO) {
      expect(r.tinjauanBerikutnya).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(r.tinjauanBerikutnya).getTime()).toBeLessThanOrEqual(batas.getTime() + 86_400_000);
    }
    expect(TINJAUAN_BERIKUTNYA).toBe('2027-03-24');
    expect(VERSI_REGISTER).toMatch(/^\d+\.\d+\.\d+$/);
    // Pemeriksa tenggat benar-benar bekerja: tanggal jauh ke depan ⇒ kosong,
    // tanggal jauh ke belakang ⇒ SEMUA risiko tercatat terlambat.
    expect(risikoLewatTenggat(REGISTER_RISIKO, new Date('2026-09-24T00:00:00Z'))).toEqual([]);
    expect(risikoLewatTenggat(REGISTER_RISIKO, new Date('2030-01-01T00:00:00Z')).length).toBe(REGISTER_RISIKO.length);
  });

  it('matriks tingkat risiko sesuai (kemungkinan × dampak)', () => {
    expect(tingkatRisiko('rendah', 'rendah')).toBe('rendah');
    expect(tingkatRisiko('rendah', 'tinggi')).toBe('sedang');
    expect(tingkatRisiko('sedang', 'sedang')).toBe('sedang');
    expect(tingkatRisiko('sedang', 'tinggi')).toBe('tinggi');
    expect(tingkatRisiko('tinggi', 'tinggi')).toBe('tinggi');
  });
});

describe('CMP-03 — SABOTASE: kelima pemeriksa terbukti menangkap kerusakan', () => {
  const contoh = REGISTER_RISIKO[0];

  it('pemilik dikosongkan ⇒ tertangkap', () => {
    const rusak = [{ ...contoh, pemilik: { peran: '', tanggungJawab: '' } }];
    expect(risikoTanpaPemilik(rusak).length).toBe(1);
    const nama = [{ ...contoh, pemilik: { peran: 'Budi Santoso', tanggungJawab: 'mengurus risiko ini' } }];
    expect(pemilikTanpaPeran(nama).length).toBe(1);
  });

  it('kendali dikosongkan ⇒ tertangkap', () => {
    expect(risikoTanpaKendali([{ ...contoh, kendali: [] }]).length).toBe(1);
  });

  it('bukti dikosongkan ⇒ tertangkap', () => {
    expect(risikoTanpaBukti([{ ...contoh, bukti: [] }]).length).toBe(1);
  });

  it('tindak lanjut tanpa tanggal sah ⇒ tertangkap', () => {
    const rusak = [{ ...contoh, tindakLanjut: [{ tanggal: 'segera', catatan: 'nanti', status: 'rencana' as const }] }];
    expect(risikoTanpaTindakLanjut(rusak).length).toBe(1);
  });

  it('tenggat lewat ⇒ tertangkap', () => {
    const rusak = [{ ...contoh, tinjauanBerikutnya: '2026-01-01' }];
    expect(risikoLewatTenggat(rusak, new Date('2026-09-24T00:00:00Z')).length).toBe(1);
  });
});

describe('CMP-03 — halaman tata kelola (markup nyata)', () => {
  it('memuat setiap id risiko, pemilik peran, dan ringkasan register', () => {
    const html = renderToStaticMarkup(HalamanTataKelolaRisiko());
    // Nama peran bisa memuat "&" yang di-escape HTML menjadi "&amp;" — dibuka
    // kembali sebelum dibandingkan supaya uji menguji ISI, bukan entitas.
    const teks = html.replace(/&amp;/g, '&').replace(/<!-- -->/g, '');
    for (const r of REGISTER_RISIKO) {
      expect(teks).toContain(r.id);
      expect(teks).toContain(r.pemilik.peran);
    }
    expect(html).toContain('Tata kelola risiko AI');
    expect(html).toContain('Ringkasan register');
    expect(html).toContain('NIST AI RMF');
  });
});
