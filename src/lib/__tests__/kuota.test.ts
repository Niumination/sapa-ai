// ─── Uji P4: pagar kuota ─────────────────────────────────────────────────────
//
// Dua hal yang diuji di sini dan sengaja dipisah:
//   1. FUNGSI MURNI `tingkatKuota` — batas-batasnya diuji persis (79,9 % / 80 % /
//      100 % / 100,1 %), karena inilah satu-satunya tempat aturan itu hidup.
//   2. `ringkasKuota` — bahwa ia MEMBACA, tidak menambah (memantau tidak boleh
//      menggerogoti kuota), bahwa batas yang tak diatur tidak dilaporkan sebagai
//      "aman", dan bahwa hal yang tidak terukur dinyatakan terang-terangan.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/store', () => ({
  peekCounter: vi.fn(async () => 0),
}));

import { peekCounter } from '@/lib/store';
import {
  AMBANG_PERHATIAN,
  AMBANG_KRITIS,
  BATAS_TEGURAN_LAJU,
  KUNCI_PANGGILAN_MODEL,
  KUNCI_TEGURAN_LAJU,
  ringkasKuota,
  tanggalHariIni,
  tingkatKuota,
  type EntriKuota,
} from '@/lib/kuota';

const mockedPeek = vi.mocked(peekCounter);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_DAILY_CALL_LIMIT;
});

function entri(hasil: { entri: EntriKuota[] }, nama: string): EntriKuota {
  const e = hasil.entri.find((x) => x.nama === nama);
  if (!e) throw new Error(`entri ${nama} tidak ada`);
  return e;
}

describe('tingkatKuota — batas-batas persis', () => {
  it('79,9 % masih aman; 80 % tepat = perhatian (batas inklusif)', () => {
    expect(tingkatKuota(799, 1000)).toBe('aman');
    expect(tingkatKuota(800, 1000)).toBe('perhatian');
    expect(AMBANG_PERHATIAN).toBe(0.8);
  });

  it('100 % tepat = KRITIS (jawaban berikutnya tidak lagi memakai model)', () => {
    expect(tingkatKuota(1000, 1000)).toBe('kritis');
    expect(AMBANG_KRITIS).toBe(1);
  });

  it('melewati batas tetap kritis, bukan tingkat lain', () => {
    expect(tingkatKuota(1500, 1000)).toBe('kritis');
  });

  it('batas tak diatur (null/0) = tak-diatur, BUKAN aman', () => {
    expect(tingkatKuota(10, null)).toBe('tak-diatur');
    expect(tingkatKuota(10, 0)).toBe('tak-diatur');
  });
});

describe('tanggalHariIni', () => {
  it('memakai tanggal UTC (sejalan dengan kunci penghitung penegak batas)', () => {
    expect(tanggalHariIni(Date.parse('2026-09-27T23:30:00.000Z'))).toBe('2026-09-27');
    expect(tanggalHariIni(Date.parse('2026-09-28T00:30:00.000Z'))).toBe('2026-09-28');
  });
});

describe('ringkasKuota', () => {
  it('membaca penghitungnya sendiri dan TIDAK menambah apa pun', async () => {
    mockedPeek.mockImplementation(async (k: string) => (k.startsWith('ai:llm:') ? 1500 : 7));
    process.env.AI_DAILY_CALL_LIMIT = '2000';

    const hasil = await ringkasKuota({ sekarangMs: Date.parse('2026-09-27T10:00:00Z') });

    expect(mockedPeek).toHaveBeenCalledWith(KUNCI_PANGGILAN_MODEL('2026-09-27'));
    expect(mockedPeek).toHaveBeenCalledWith(KUNCI_TEGURAN_LAJU('2026-09-27'));
    // Hanya peek: tidak ada incrementCounter yang diimpor, apalagi dipanggil.
    expect(mockedPeek).toHaveBeenCalledTimes(2);
    expect(entri(hasil, 'ai-harian').dipakai).toBe(1500);
  });

  it('menghitung persen & sisa, dan menandai perhatian >80 %', async () => {
    mockedPeek.mockImplementation(async (k: string) => (k.startsWith('ai:llm:') ? 1750 : 0));
    process.env.AI_DAILY_CALL_LIMIT = '2000';

    const hasil = await ringkasKuota();
    const ai = entri(hasil, 'ai-harian');

    expect(ai.batas).toBe(2000);
    expect(ai.sisa).toBe(250);
    expect(ai.persen).toBe(87.5);
    expect(ai.tingkat).toBe('perhatian');
    expect(ai.pesan).toContain('87.5%');
    expect(ai.pesan).toContain('250');
    expect(hasil.adaPerhatian).toBe(true);
  });

  it('saat batas tercapai, pesannya menyebut layanan TETAP menjawab', async () => {
    mockedPeek.mockImplementation(async (k: string) => (k.startsWith('ai:llm:') ? 2000 : 0));
    process.env.AI_DAILY_CALL_LIMIT = '2000';

    const ai = entri(await ringkasKuota(), 'ai-harian');
    expect(ai.tingkat).toBe('kritis');
    expect(ai.sisa).toBe(0);
    expect(ai.pesan).toContain('TERCAPAI');
    expect(ai.pesan).toContain('deterministik');
  });

  it('teguran laju punya batasnya sendiri dan ikut dilaporkan', async () => {
    mockedPeek.mockImplementation(async (k: string) => (k.startsWith('rl:teguran:') ? BATAS_TEGURAN_LAJU : 0));
    const t = entri(await ringkasKuota(), 'teguran-laju');
    expect(t.batas).toBe(BATAS_TEGURAN_LAJU);
    expect(t.tingkat).toBe('kritis');
  });

  it('semua aman → adaPerhatian false dan pesan kosong', async () => {
    mockedPeek.mockImplementation(async (k: string) => (k.startsWith('ai:llm:') ? 10 : 1));
    process.env.AI_DAILY_CALL_LIMIT = '2000';

    const hasil = await ringkasKuota();
    expect(hasil.adaPerhatian).toBe(false);
    expect(hasil.entri.every((e) => e.pesan === '')).toBe(true);
  });

  it('tanpa AI_DAILY_CALL_LIMIT, batas bawaan 2000 tetap berlaku (bukan berarti tanpa batas)', async () => {
    mockedPeek.mockImplementation(async () => 0);
    const ai = entri(await ringkasKuota(), 'ai-harian');
    expect(ai.batas).toBe(2000);
    expect(ai.tingkat).toBe('aman');
  });

  it('batas dimatikan eksplisit (=0) → tingkat tak-diatur dan persen null (bukan 0 % yang menipu)', async () => {
    process.env.AI_DAILY_CALL_LIMIT = '0';
    mockedPeek.mockImplementation(async () => 0);
    const ai = entri(await ringkasKuota(), 'ai-harian');
    expect(ai.tingkat).toBe('tak-diatur');
    expect(ai.persen).toBeNull();
    expect(ai.sisa).toBeNull();
    // Batas tak diatur BUKAN alasan menyalakan alarm.
    expect(ai.pesan).toBe('');
  });

  it('pelaporan yang tidak terukur dinyatakan, bukan disembunyikan', async () => {
    mockedPeek.mockImplementation(async () => 0);
    const hasil = await ringkasKuota();
    expect(hasil.takTerukur.length).toBeGreaterThanOrEqual(2);
    expect(hasil.takTerukur.join(' ')).toContain('penyimpanan');
    expect(hasil.takTerukur.join(' ')).toContain('penyedia model');
  });

  it('baca() yang disuntikkan dipakai apa adanya (tanpa penyimpanan nyata)', async () => {
    const kunjungan: string[] = [];
    const hasil = await ringkasKuota({
      sekarangMs: Date.parse('2026-09-27T00:00:00Z'),
      baca: async (k: string) => {
        kunjungan.push(k);
        return 3;
      },
    });
    expect(kunjungan).toEqual([KUNCI_PANGGILAN_MODEL('2026-09-27'), KUNCI_TEGURAN_LAJU('2026-09-27')]);
    expect(entri(hasil, 'ai-harian').dipakai).toBe(3);
  });
});
