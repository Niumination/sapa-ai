// ─── Angka SAPA: artefak pengetikan & format tampilan ───
// T-22 (desimal ber-apostrof) dan T-23 (pemisah ribuan masuk ke desimal).
// Keduanya ditemukan lewat eval set: nilai yang SAH dituding halusinasi
// ("73'5"), dan nilai kecil tampil rusak ("0,003593496" → "0,3.593.496").

import { describe, it, expect } from 'vitest';
import { normalisasiNilai } from '@/lib/parse-numeric';
import { formatRibuan } from '@/services/grounding';
import { parseNilaiSapa } from '@/lib/format-singkat';

describe('normalisasiNilai — artefak apostrof dari Excel', () => {
  it("73'5 menjadi 73,5 (bukan 735)", () => {
    expect(normalisasiNilai("73'5")).toBe('73,5');
    expect(parseNilaiSapa(normalisasiNilai("73'5"))).toBe(73.5);
  });

  it("85'71 menjadi 85,71", () => {
    expect(normalisasiNilai("85'71")).toBe('85,71');
    expect(parseNilaiSapa(normalisasiNilai("85'71"))).toBe(85.71);
  });

  it('nilai normal tidak berubah', () => {
    for (const v of ['9610', '31,4', '0,003593496', '11.503.360.000.000', '0.180', '16 16 16']) {
      expect(normalisasiNilai(v), v).toBe(v);
    }
  });

  it('apostrof yang bukan desimal (pemisah ribuan) dibiarkan', () => {
    expect(normalisasiNilai("1'234")).toBe("1'234");
  });
});

describe('formatRibuan — tidak boleh merusak desimal', () => {
  it('desimal kecil tidak disentuh (bug: 0,003593496 → 0,3.593.496)', () => {
    expect(formatRibuan('0,003593496')).toBe('0,003593496');
    expect(formatRibuan('0.180')).toBe('0.180');
    expect(formatRibuan('31,4')).toBe('31,4');
  });

  it('bilangan bulat polos tetap diberi pemisah ribuan (hotfix asli)', () => {
    expect(formatRibuan('19686')).toBe('19.686');
    expect(formatRibuan('9610')).toBe('9.610');
    expect(formatRibuan('nilai 3673 orang')).toBe('nilai 3.673 orang');
  });

  it('angka yang sudah berformat tidak diubah ganda', () => {
    expect(formatRibuan('11.503.360.000.000')).toBe('11.503.360.000.000');
    expect(formatRibuan('2.055 record dari 38 OPD')).toBe('2.055 record dari 38 OPD');
  });

  it('tahun tidak diberi pemisah ribuan', () => {
    expect(formatRibuan('tahun 2025')).toBe('tahun 2025');
    expect(formatRibuan('1990')).toBe('1990');
  });
});
