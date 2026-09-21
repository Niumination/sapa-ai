// Uji pagar /api/revalidate: fail-closed di produksi tanpa secret, tetap
// terbuka untuk pengembangan, dan 401 untuk secret yang salah.
import { describe, expect, it } from 'vitest';

import { samaAman, verifikasiAksesRevalidate } from '@/lib/revalidate-guard';

describe('verifikasiAksesRevalidate', () => {
  it('produksi tanpa secret → 503 fail-closed (bukan terbuka)', () => {
    const hasil = verifikasiAksesRevalidate({ nodeEnv: 'production' });
    expect(hasil.ok).toBe(false);
    if (!hasil.ok) {
      expect(hasil.status).toBe(503);
      expect(hasil.pesan).toContain('REVALIDATE_SECRET');
    }
  });

  it('produksi dengan secret: tanpa kiriman → 401, salah → 401, benar → ok', () => {
    const dasar = { nodeEnv: 'production', secretEnv: 'rahasia-uji' } as const;
    expect(verifikasiAksesRevalidate({ ...dasar }).ok).toBe(false);
    expect(verifikasiAksesRevalidate({ ...dasar, headerSecret: 'salah' }).ok).toBe(false);
    expect(verifikasiAksesRevalidate({ ...dasar, bodySecret: 'salah' }).ok).toBe(false);
    const benar = verifikasiAksesRevalidate({ ...dasar, headerSecret: 'rahasia-uji' });
    expect(benar.ok).toBe(true);
    if (benar.ok) expect(benar.mode).toBe('bertanda');
  });

  it('pengembangan tanpa secret tetap berjalan (npm run dev tidak terganggu)', () => {
    const hasil = verifikasiAksesRevalidate({ nodeEnv: 'development' });
    expect(hasil.ok).toBe(true);
    if (hasil.ok) expect(hasil.mode).toBe('terbuka-dev');
  });

  it('pelarian darurat REVALIDATE_ALLOW_UNSIGNED=true disengaja dan tercatat', () => {
    const hasil = verifikasiAksesRevalidate({ nodeEnv: 'production', allowUnsigned: 'true' });
    expect(hasil.ok).toBe(true);
    if (hasil.ok) expect(hasil.mode).toBe('terbuka-dev');
  });

  it('samaAman: beda panjang / beda isi / sama', () => {
    expect(samaAman('a', 'a')).toBe(true);
    expect(samaAman('a', 'aa')).toBe(false);
    expect(samaAman('abcdef', 'abcdeg')).toBe(false);
  });
});
