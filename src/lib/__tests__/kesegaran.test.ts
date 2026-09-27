// ─── Uji P3: alarm kesegaran data ────────────────────────────────────────────
//
// Uji ini sengaja memakai jam YANG DIINJEKSI. Menguji ambang waktu dengan
// "tunggu 36 jam" tidak mungkin, dan menguji dengan `Date.now()` nyata membuat
// hasilnya bergantung pada kapan uji dijalankan — dua hal yang membuat uji
// semacam ini berhenti bermakna.

import { describe, it, expect } from 'vitest';
import {
  AMBANG_BAWAAN,
  ambangKesegaran,
  labelTingkat,
  nilaiKesegaran,
  ringkasKesegaran,
  tahunTerbesar,
} from '@/lib/kesegaran';

const SEKARANG = Date.parse('2026-09-26T12:00:00.000Z');

function jamLalu(jam: number): string {
  return new Date(SEKARANG - jam * 3_600_000).toISOString();
}

describe('tahunTerbesar', () => {
  it('membaca tahun tunggal', () => {
    expect(tahunTerbesar(['2025', '2026', '2024'])).toBe(2026);
  });

  it('membaca rentang dengan en-dash dan hyphen, mengambil ujung terbesar', () => {
    expect(tahunTerbesar(['2022–2026'])).toBe(2026);
    expect(tahunTerbesar(['2019-2023'])).toBe(2023);
  });

  it('mengabaikan null/kosong dan tahun tak masuk akal', () => {
    expect(tahunTerbesar([null, undefined, '', '2025'])).toBe(2025);
    expect(tahunTerbesar([null, undefined, ''])).toBeNull();
    expect(tahunTerbesar([])).toBeNull();
    expect(tahunTerbesar(['1899', '2025'])).toBe(2025); // 1899 ditolak, bukan dianggap terbesar/terkecil
    expect(tahunTerbesar(['9999'])).toBeNull();
  });
});

describe('nilaiKesegaran — segar', () => {
  it('tarikan 2 jam lalu dengan tahun katalog tahun berjalan = segar, tanpa pesan', () => {
    const n = nilaiKesegaran(
      { diambilPada: jamLalu(2), tahunData: ['2025', '2026'] },
      { sekarangMs: SEKARANG },
    );
    expect(n.tingkat).toBe('segar');
    expect(n.sebab).toEqual([]);
    expect(n.pesan).toBe('');
    expect(n.umurJam).toBe(2);
    expect(n.tahunTerbaru).toBe(2026);
    expect(n.lagTahun).toBe(0);
  });

  it('tepat di bawah ambang perhatian tetap segar (35,9 jam)', () => {
    const n = nilaiKesegaran({ diambilPada: jamLalu(35.9) }, { sekarangMs: SEKARANG });
    expect(n.tingkat).toBe('segar');
  });
});

describe('nilaiKesegaran — sebab tarikan lama', () => {
  it('36 jam tepat = mulai perlu perhatian (batas inklusif)', () => {
    const n = nilaiKesegaran({ diambilPada: jamLalu(36) }, { sekarangMs: SEKARANG });
    expect(n.tingkat).toBe('perhatian');
    expect(n.sebab).toContain('tarikan-lama');
    expect(n.pesan).toContain('perlu perhatian');
  });

  it('9 hari = basi, dan pesan menyebut jumlah hari + ambang', () => {
    const n = nilaiKesegaran({ diambilPada: jamLalu(9 * 24) }, { sekarangMs: SEKARANG });
    expect(n.tingkat).toBe('basi');
    expect(n.umurHari).toBe(9);
    expect(n.pesan).toContain('sudah basi');
    expect(n.pesan).toContain('9 hari');
    expect(n.pesan).toContain('7 hari');
  });

  it('stempel di masa depan (jam server salah) = perhatian dengan sebab tersendiri', () => {
    const masaDepan = new Date(SEKARANG + 3 * 3_600_000).toISOString();
    const n = nilaiKesegaran({ diambilPada: masaDepan }, { sekarangMs: SEKARANG });
    expect(n.tingkat).toBe('perhatian');
    expect(n.sebab).toEqual(['stempel-masa-depan']);
    expect(n.pesan).toContain('masa depan');
  });
});

describe('nilaiKesegaran — sebab tahun katalog tertinggal', () => {
  it('lag 1 tahun masih segar (rilis statistik memang terlambat setahun)', () => {
    const n = nilaiKesegaran(
      { diambilPada: jamLalu(1), tahunData: ['2025'] },
      { sekarangMs: SEKARANG },
    );
    expect(n.tingkat).toBe('segar');
    expect(n.lagTahun).toBe(1);
  });

  it('lag 2 tahun = perhatian walau baru ditarik', () => {
    const n = nilaiKesegaran(
      { diambilPada: jamLalu(1), tahunData: ['2024'] },
      { sekarangMs: SEKARANG },
    );
    expect(n.tingkat).toBe('perhatian');
    expect(n.sebab).toEqual(['tahun-katalog-tertinggal']);
    expect(n.pesan).toContain('tertinggal 2 tahun');
  });

  it('lag 3 tahun = basi', () => {
    const n = nilaiKesegaran(
      { diambilPada: jamLalu(1), tahunData: ['2022', '2023'] },
      { sekarangMs: SEKARANG },
    );
    expect(n.tingkat).toBe('basi');
    expect(n.tahunTerbaru).toBe(2023);
    expect(n.lagTahun).toBe(3);
  });

  it('dua sebab sekaligus dilaporkan keduanya, tingkat tertinggi menang', () => {
    const n = nilaiKesegaran(
      { diambilPada: jamLalu(40), tahunData: ['2024'] },
      { sekarangMs: SEKARANG },
    );
    expect(n.tingkat).toBe('perhatian');
    expect(n.sebab).toEqual(['tarikan-lama', 'tahun-katalog-tertinggal']);
    expect(n.pesan).toContain('korpus terakhir ditarik');
    expect(n.pesan).toContain('tahun data terbaru');
  });
});

describe('nilaiKesegaran — sinyal pembantu jadwal penyegaran (OPS-03)', () => {
  it('jadwal terlewat menaikkan ke perhatian walau tarikan & tahun segar', () => {
    const n = nilaiKesegaran(
      { diambilPada: jamLalu(1), tahunData: ['2026'], penyegaranTerlewat: true },
      { sekarangMs: SEKARANG },
    );
    expect(n.tingkat).toBe('perhatian');
    expect(n.sebab).toEqual(['jadwal-segarkan-terlewat']);
    expect(n.penyegaranTerlewat).toBe(true);
  });

  it('jadwal terlewat TIDAK menurunkan tingkat yang sudah basi', () => {
    const n = nilaiKesegaran(
      { diambilPada: jamLalu(9 * 24), penyegaranTerlewat: true },
      { sekarangMs: SEKARANG },
    );
    expect(n.tingkat).toBe('basi');
    expect(n.sebab).toContain('tarikan-lama');
    expect(n.sebab).toContain('jadwal-segarkan-terlewat');
  });
});

describe('nilaiKesegaran — kejujuran saat bahan kurang', () => {
  it('tanpa bahan apa pun = tak-diketahui, BUKAN segar, dan pesannya menyebut apa yang kurang', () => {
    const n = nilaiKesegaran({}, { sekarangMs: SEKARANG });
    expect(n.tingkat).toBe('tak-diketahui');
    expect(n.sebab).toEqual(['bahan-kurang']);
    expect(n.pesan.length).toBeGreaterThan(0);
    expect(n.umurJam).toBeNull();
    expect(n.tahunTerbaru).toBeNull();
  });

  it('stempel tidak terbaca (bukan ISO) diperlakukan sebagai bahan kurang', () => {
    const n = nilaiKesegaran({ diambilPada: 'kemarin' }, { sekarangMs: SEKARANG });
    expect(n.tingkat).toBe('tak-diketahui');
    expect(n.umurJam).toBeNull();
  });

  it('tahun data kosong TIDAK memicu sebab tahun (null bukan berarti basi)', () => {
    const n = nilaiKesegaran({ diambilPada: jamLalu(1), tahunData: [] }, { sekarangMs: SEKARANG });
    expect(n.tingkat).toBe('segar');
    expect(n.lagTahun).toBeNull();
  });
});

describe('ambangKesegaran — dari lingkungan, dengan penjaga nilai tak sah', () => {
  it('bawaan sesuai dokumen (36 jam · 7 hari · 2 tahun · 3 tahun)', () => {
    expect(ambangKesegaran({})).toEqual(AMBANG_BAWAAN);
    expect(AMBANG_BAWAAN).toEqual({
      perhatianJam: 36,
      basiJam: 168,
      lagPerhatianTahun: 2,
      lagBasiTahun: 3,
    });
  });

  it('nilai lingkungan yang sah dipakai', () => {
    const a = ambangKesegaran({ SAPA_KESEGARAN_PERHATIAN_JAM: '1', SAPA_KESEGARAN_BASI_JAM: '2' });
    expect(a.perhatianJam).toBe(1);
    expect(a.basiJam).toBe(2);
  });

  it('nilai tak sah / nol / negatif diabaikan — bukan menjadi NaN', () => {
    const a = ambangKesegaran({
      SAPA_KESEGARAN_PERHATIAN_JAM: 'abc',
      SAPA_KESEGARAN_BASI_JAM: '0',
      SAPA_KESEGARAN_LAG_PERHATIAN: '-3',
    });
    expect(a.perhatianJam).toBe(AMBANG_BAWAAN.perhatianJam);
    expect(a.basiJam).toBe(AMBANG_BAWAAN.basiJam);
    expect(a.lagPerhatianTahun).toBe(AMBANG_BAWAAN.lagPerhatianTahun);
  });

  it('ambang yang diubah lingkungan benar-benar mengubah keputusan', () => {
    const n = nilaiKesegaran(
      { diambilPada: jamLalu(2) },
      { sekarangMs: SEKARANG, ambang: { ...AMBANG_BAWAAN, perhatianJam: 1 } },
    );
    expect(n.tingkat).toBe('perhatian');
  });
});

describe('label & ringkasan untuk UI', () => {
  it('label tiap tingkat', () => {
    expect(labelTingkat('segar')).toBe('Data segar');
    expect(labelTingkat('perhatian')).toBe('Data perlu perhatian');
    expect(labelTingkat('basi')).toBe('Data basi');
    expect(labelTingkat('tak-diketahui')).toBe('Kesegaran tidak diketahui');
  });

  it('ringkasKesegaran membawa tingkat, label, sebab, dan pesan — tanpa ambang internal', () => {
    const n = nilaiKesegaran({ diambilPada: jamLalu(9 * 24) }, { sekarangMs: SEKARANG });
    const r = ringkasKesegaran(n);
    expect(r.tingkat).toBe('basi');
    expect(r.label).toBe('Data basi');
    expect(r.sebab).toContain('tarikan-lama');
    expect(r.pesan).toContain('sudah basi');
    expect(Object.keys(r)).not.toContain('ambang');
  });
});
