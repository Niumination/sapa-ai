// ─── Uji P6: waktu relatif → tahun konkret (FR-03 lanjutan) ─────────────────

import { describe, it, expect } from 'vitest';
import { dahulukanTahun, deteksiWaktuRelatif, kalimatPemetaan } from '@/lib/waktu-relatif';

/** 2026-06-15 → "tahun lalu" = 2025, "tahun depan" = 2027, dst. */
const SEKARANG = Date.parse('2026-06-15T00:00:00.000Z');
const di = (q: string) => deteksiWaktuRelatif(q, { sekarangMs: SEKARANG });

describe('deteksiWaktuRelatif — frasa yang dikenali', () => {
  it('"tahun lalu" (dan singkatan lazim) → tahun sebelumnya', () => {
    for (const q of ['Berapa IPM tahun lalu?', 'IPM thn lalu', 'berapa penduduk taun lalu?']) {
      const w = di(q);
      expect(w?.jenis).toBe('tahun-lalu');
      expect(w?.tahun).toEqual(['2025']);
      expect(w?.frasa).toBeTruthy();
    }
  });

  it('"tahun ini" / "tahun berjalan" → tahun kalender sekarang', () => {
    expect(di('jumlah ASN tahun ini')?.tahun).toEqual(['2026']);
    expect(di('realisasi tahun berjalan')?.tahun).toEqual(['2026']);
  });

  it('"tahun depan" → tahun berikutnya + catatan jujur', () => {
    const w = di('target stunting tahun depan');
    expect(w?.jenis).toBe('tahun-depan');
    expect(w?.tahun).toEqual(['2027']);
    expect(w?.catatan).toContain('belum bisa');
  });

  it('"3 tahun terakhir" → tiga tahun termasuk tahun sekarang', () => {
    expect(di('tren kemiskinan 3 tahun terakhir')?.tahun).toEqual(['2024', '2025', '2026']);
    expect(di('data dua tahun terakhir')?.tahun).toEqual(['2025', '2026']);
    expect(di('lima tahun belakangan')?.tahun).toEqual(['2022', '2023', '2024', '2025', '2026']);
  });

  it('"sejak 2022" → 2022 sampai tahun sekarang', () => {
    const w = di('produksi kopi sejak 2022');
    expect(w?.jenis).toBe('sejak');
    expect(w?.tahun[0]).toBe('2022');
    expect(w?.tahun[w.tahun.length - 1]).toBe('2026');
  });

  it('"sejak 2022 sampai 2024" → batas atas dihormati, bukan tahun sekarang', () => {
    expect(di('IPM sejak 2022 sampai 2024')?.tahun).toEqual(['2022', '2023', '2024']);
  });

  it('"sampai 2024" tanpa "sejak" → 5 tahun yang berakhir di tahun itu', () => {
    const w = di('berapa IPM sampai 2024');
    expect(w?.jenis).toBe('sampai');
    expect(w?.tahun).toEqual(['2020', '2021', '2022', '2023', '2024']);
    expect(w?.catatan).toContain('rentang bawah');
  });

  it('"sampai" yang melewati tahun sekarang dipangkas + diberi catatan (bukan menjanjikan masa depan)', () => {
    const w = di('target IPM sampai 2030');
    expect(w?.tahun[w.tahun.length - 1]).toBe('2026');
    expect(w?.catatan).toContain('melewati tahun sekarang');
  });
});

describe('deteksiWaktuRelatif — yang TIDAK dipetakan (menolak menebak)', () => {
  it('tanpa frasa waktu sama sekali → null', () => {
    expect(di('berapa jumlah ASN')).toBeNull();
  });

  it('"beberapa tahun terakhir" tanpa angka → null (ambigu, bukan tebakan)', () => {
    expect(di('tren beberapa tahun terakhir')).toBeNull();
  });

  it('"N tahun terakhir" di luar 1–30 → null', () => {
    expect(di('tren 99 tahun terakhir')).toBeNull();
    expect(di('data 0 tahun terakhir')).toBeNull();
  });

  it('kata "tahun" yang bukan acuan waktu (mis. satuan umur) → null', () => {
    expect(di('jumlah penduduk usia 15 tahun')).toBeNull();
    expect(di('balita 12-59 bulan')).toBeNull();
  });

  it('tahun eksplisit tanpa frasa relatif → null (ditangani extractYears)', () => {
    expect(di('IPM 2025')).toBeNull();
  });
});

describe('kalimatPemetaan — hanya menyebut tahun yang benar-benar ada di bukti', () => {
  const waktuLalu = di('Berapa IPM tahun lalu?');

  it('tahun dimaksud ADA di bukti → kalimat transparansi', () => {
    const k = kalimatPemetaan(waktuLalu, ['2025', '2024']);
    expect(k).toContain('tahun lalu');
    expect(k).toContain('2025');
    expect(k.endsWith(' ')).toBe(true);
  });

  it('tahun dimaksud TIDAK ada di bukti → kalimat KOSONG (kejujuran dibawa peringatan tahun)', () => {
    expect(kalimatPemetaan(waktuLalu, ['2023', '2024'])).toBe('');
    expect(kalimatPemetaan(waktuLalu, [])).toBe('');
    expect(kalimatPemetaan(null, ['2025'])).toBe('');
  });

  it('rentang: hanya tahun yang ada yang disebut, bukan seluruh rentang', () => {
    const tiga = di('tren 3 tahun terakhir');
    const k = kalimatPemetaan(tiga, ['2024', '2026']);
    expect(k).toContain('2024');
    expect(k).toContain('2026');
    expect(k).not.toContain('2025');
  });

  it('tahun pada bukti yang bernilai null/kosong tidak dianggap tersedia', () => {
    expect(kalimatPemetaan(waktuLalu, [null, undefined, '  ', '2023'])).toBe('');
  });
});

describe('dahulukanTahun — memindahkan, tidak membuang', () => {
  const bukti = [
    { id: 1, tahun: '2023' },
    { id: 2, tahun: '2025' },
    { id: 3, tahun: null },
    { id: 4, tahun: '2025' },
    { id: 5, tahun: '2024' },
  ];

  it('baris bertahun dimaksud naik ke depan; sisanya tetap urutannya', () => {
    const hasil = dahulukanTahun(bukti, ['2025']);
    expect(hasil.map((b) => b.id)).toEqual([2, 4, 1, 3, 5]);
  });

  it('TIDAK ada baris yang hilang atau berubah isi (cakupan jawaban utuh)', () => {
    const hasil = dahulukanTahun(bukti, ['2025']);
    expect(hasil.length).toBe(bukti.length);
    expect([...hasil].map((b) => b.id).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('tanpa tahun diminta atau tanpa yang cocok → urutan asli utuh', () => {
    expect(dahulukanTahun(bukti, []).map((b) => b.id)).toEqual([1, 2, 3, 4, 5]);
    expect(dahulukanTahun(bukti, ['1999']).map((b) => b.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rentang tahun dihormati sebagai satu himpunan', () => {
    const hasil = dahulukanTahun(bukti, ['2023', '2024']);
    expect(hasil.map((b) => b.id).slice(0, 2)).toEqual([1, 5]);
  });
});
