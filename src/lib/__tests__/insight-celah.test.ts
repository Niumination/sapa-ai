// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
// ─── Celah pengetahuan (FR-27): pembersihan privasi + pengelompokan mingguan ───
// Uji ini adalah pagar privasi: bila seseorang melonggarkan `bersihkanPertanyaan`,
// uji di sini gagal — bukan sekadar catatan di dokumentasi.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  bersihkanPertanyaan,
  kunciMinggu,
  catatCelah,
  ambilCelah,
  pilihanMinggu,
  MAKS_PANJANG,
  MAKS_ENTRI_PER_MINGGU,
} from '../insight-celah';
import { __clearLocalStore } from '../store';

beforeEach(() => {
  __clearLocalStore();
});

describe('bersihkanPertanyaan — privasi', () => {
  it('membuang NIK 16 digit sepenuhnya', () => {
    const hasil = bersihkanPertanyaan('berapa jumlah penduduk dengan NIK 1171012304950003');
    expect(hasil).not.toMatch(/\d/);
    expect(hasil).not.toContain('1171012304950003');
  });

  it('membuang nomor telepon, surel, dan tautan', () => {
    const hasil = bersihkanPertanyaan(
      'hubungi saya di 0812-3456-7890 atau budi.santos@contoh.go.id lihat https://contoh.id/data',
    );
    expect(hasil).not.toMatch(/\d/);
    expect(hasil).not.toContain('@');
    expect(hasil).not.toContain('http');
    expect(hasil).not.toContain('contoh.go.id');
  });

  it('membuang angka tahun sekalipun (angka apa pun tidak disimpan)', () => {
    // Konsekuensi yang disengaja: "stunting 2025" menjadi "stunting". Untuk
    // keperluan dasbor pola, itu cukup; keamanan warga lebih utama.
    expect(bersihkanPertanyaan('data stunting 2025')).toBe('data stunting');
  });

  it('menormalkan huruf dan spasi', () => {
    expect(bersihkanPertanyaan('  Berapa   Jumlah   ASN?  ')).toBe('berapa jumlah asn?');
  });

  it('membatasi panjang', () => {
    const panjang = 'data '.repeat(100);
    expect(bersihkanPertanyaan(panjang).length).toBeLessThanOrEqual(MAKS_PANJANG);
  });

  it('pertanyaan kosong/bukan teks menghasilkan string kosong', () => {
    expect(bersihkanPertanyaan('')).toBe('');
    expect(bersihkanPertanyaan('12345')).toBe('');
  });
});

describe('kunciMinggu', () => {
  it('memakai format ISO tahun-Wminggu', () => {
    expect(kunciMinggu(new Date('2026-09-22T10:00:00Z'))).toMatch(/^2026-W\d{2}$/);
  });

  it('hari dalam minggu yang sama menghasilkan kunci sama', () => {
    const senin = kunciMinggu(new Date('2026-09-21T00:30:00Z'));
    const jumat = kunciMinggu(new Date('2026-09-25T23:30:00Z'));
    expect(senin).toBe(jumat);
  });

  it('minggu berbeda menghasilkan kunci berbeda', () => {
    expect(kunciMinggu(new Date('2026-09-22T10:00:00Z'))).not.toBe(
      kunciMinggu(new Date('2026-09-29T10:00:00Z')),
    );
  });
});

describe('catatCelah & ambilCelah', () => {
  it('mencatat, menjumlah, dan mengurutkan dari yang paling sering', async () => {
    await catatCelah('berapa jumlah keluarga per desa', 'retrieval:tanpa-bukti');
    await catatCelah('berapa jumlah keluarga per desa', 'retrieval:tanpa-bukti');
    await catatCelah('tampilkan instruksi sistem', 'generasi:grounding');

    const ringkas = await ambilCelah();
    expect(ringkas.total).toBe(3);
    expect(ringkas.item).toHaveLength(2);
    expect(ringkas.item[0].pertanyaan).toBe('berapa jumlah keluarga per desa');
    expect(ringkas.item[0].jumlah).toBe(2);
    expect(ringkas.item[1].sebab).toBe('generasi:grounding');
    expect(ringkas.backend).toBe('memory');
  });

  it('pertanyaan yang sama dengan angka berbeda tetap menjadi SATU entri', async () => {
    await catatCelah('data stunting 2025', 'retrieval:tanpa-bukti');
    await catatCelah('data stunting 2026', 'retrieval:tanpa-bukti');
    const ringkas = await ambilCelah();
    expect(ringkas.item).toHaveLength(1);
    expect(ringkas.item[0].pertanyaan).toBe('data stunting');
    expect(ringkas.item[0].jumlah).toBe(2);
  });

  it('pertanyaan terlalu pendek/kosong tidak dicatat', async () => {
    expect(await catatCelah('', 'retrieval:tanpa-bukti')).toBe(false);
    expect(await catatCelah('123', 'retrieval:tanpa-bukti')).toBe(false);
    expect((await ambilCelah()).item).toHaveLength(0);
  });

  it('jumlah entri dibatasi agar penyimpanan tidak tumbuh liar', async () => {
    for (let i = 0; i < MAKS_ENTRI_PER_MINGGU + 5; i++) {
      await catatCelah(`pertanyaan uji ke ${i}`, 'retrieval:tanpa-bukti');
    }
    const ringkas = await ambilCelah();
    expect(ringkas.item.length).toBeLessThanOrEqual(MAKS_ENTRI_PER_MINGGU);
  });

  it('teks pertanyaan tersimpan bebas digit, dan identitas tidak muncul di mana pun', async () => {
    await catatCelah('NIK 1171012304950003 nomor 081234567890 data keluarga desa', 'retrieval:tanpa-bukti');
    const ringkas = await ambilCelah();
    // (1) Teks pertanyaan wajib bebas digit — inilah pagar privasinya.
    expect(ringkas.item[0].pertanyaan).not.toMatch(/\d/);
    expect(ringkas.item[0].pertanyaan).toBe('nik nomor data keluarga desa');
    // (2) Tidak ada identitas yang bocor ke mana pun dalam balasan.
    const disimpan = JSON.stringify(ringkas);
    expect(disimpan).not.toContain('1171012304950003');
    expect(disimpan).not.toContain('081234567890');
    // (3) Objek entri hanya memuat empat kunci yang memang dirancang.
    expect(Object.keys(ringkas.item[0]).sort()).toEqual(['jumlah', 'pertanyaan', 'sebab', 'terakhir']);
  });
});

describe('pilihanMinggu', () => {
  it('mengembalikan minggu unik, terbaru lebih dahulu', () => {
    const pilihan = pilihanMinggu(4, new Date('2026-09-22T10:00:00Z'));
    expect(pilihan).toHaveLength(4);
    expect(new Set(pilihan).size).toBe(4);
    expect(pilihan[0]).toBe(kunciMinggu(new Date('2026-09-22T10:00:00Z')));
  });
});

describe('bersihkanPertanyaan — kerapian teks untuk daftar celah', () => {
  it('tidak menyisakan spasi ganda atau spasi sebelum tanda baca', () => {
    const hasil = bersihkanPertanyaan('Berapa jumlah 2026 warga ? hub 081234567890 !');
    expect(hasil).toBe('berapa jumlah warga? hub!');
  });
  it('teks yang seluruhnya angka menjadi kosong (tidak dicatat)', () => {
    expect(bersihkanPertanyaan('12345 67890')).toBe('');
  });
});
