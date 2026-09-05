// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
// ─── Pagar masuk query (src/lib/ai/guard.ts) ───
// T-21: pagar NIK harus berlaku di SEMUA jalur, bukan hanya jalur model.

import { describe, it, expect } from 'vitest';
import {
  cekDataPribadi,
  cekPermintaanPerOrang,
  guardQuery,
  sanitizeQuery,
  MAX_QUERY_CHARS,
} from '@/lib/ai/guard';

describe('cekDataPribadi', () => {
  it('menolak NIK 16 digit tanpa pemisah', () => {
    expect(cekDataPribadi('Cari data NIK 1234567890123456')).toMatch(/NIK/);
  });

  it('menolak NIK yang ditulis dengan pemisah ribuan atau spasi', () => {
    expect(cekDataPribadi('data NIK 1.234.567.890.123.456')).toMatch(/NIK/);
    expect(cekDataPribadi('data NIK 1234 5678 9012 3456')).toMatch(/NIK/);
  });

  it('tidak memblokir pertanyaan agregat yang kebetulan banyak angka', () => {
    expect(cekDataPribadi('Berapa jumlah penduduk Aceh Tengah tahun 2025?')).toBeNull();
    expect(cekDataPribadi('Belanja daerah 2020 sampai 2025')).toBeNull();
    // 15 digit — di bawah ambang NIK
    expect(cekDataPribadi('nilai 123456789012345')).toBeNull();
    expect(cekDataPribadi('PDRB 11.503.360.000.000')).toBeNull();
    expect(cekDataPribadi('Belanja 1.438.857.592.538,6 rupiah')).toBeNull();
  });

  it('TIDAK memblokir rentang tahun — spasi & strip tidak boleh dihapus', () => {
    // Regresi yang ditemukan saat audit: empat tahun bergabung jadi 16 digit
    // bila spasi ikut dibuang, sehingga pertanyaan sah ikut tertolak.
    expect(cekDataPribadi('Bandingkan data 2020 2021 2022 2023')).toBeNull();
    expect(cekDataPribadi('tren 2019-2020-2021-2022')).toBeNull();
    expect(cekDataPribadi('data 2020, 2021, 2022, 2023')).toBeNull();
  });

  it('NIK berkelompok 4-4-4-4 tetap tertolak walau memakai spasi', () => {
    expect(cekDataPribadi('data NIK 1234 5678 9012 3456')).toMatch(/NIK/);
    expect(cekDataPribadi('data NIK 1985 0121 0987 6543')).toMatch(/NIK/);
  });
});

describe('guardQuery', () => {
  it('memotong query yang kepanjangan', () => {
    const panjang = 'a'.repeat(MAX_QUERY_CHARS + 500);
    const hasil = guardQuery(panjang);
    expect(hasil.ok).toBe(true);
    expect(hasil.query).toHaveLength(MAX_QUERY_CHARS);
  });

  it('menolak query yang terlalu pendek', () => {
    expect(guardQuery('ab').ok).toBe(false);
  });

  it('menolak query ber-NIK', () => {
    const hasil = guardQuery('cari 1234567890123456');
    expect(hasil.ok).toBe(false);
    expect(hasil.reason).toMatch(/NIK/);
  });

  it('mempertahankan pertanyaan wajar', () => {
    expect(guardQuery('Berapa prevalensi stunting?').ok).toBe(true);
  });
});

describe('sanitizeQuery', () => {
  it('merapikan spasi berlebih', () => {
    expect(sanitizeQuery('  berapa   stunting  ')).toBe('berapa stunting');
  });
});

// ─── Permintaan data per-orang (reviu 2026-09-04) ───
// SAPA hanya menyimpan indikator agregat. "Siapa nama penerima PKH di Desa
// Kemili" tidak boleh dijawab dengan angka agregat — seolah-olah sistem tahu
// siapa orangnya. Permintaan agregat yang sah harus tetap dilayani.
describe('cekPermintaanPerOrang', () => {
  const ditolak = [
    'Siapa nama penerima PKH di Desa Kemili?',
    'Tampilkan daftar warga miskin di Kecamatan Ketol',
    'Berikan identitas penerima bansos di Desa Bebesen',
    'Saya butuh nama penerima bantuan sosial tahun 2025',
  ];
  const dilayani = [
    'Berapa jumlah penerima PKH di Aceh Tengah?',
    'Daftar OPD yang melaporkan data',
    'Jumlah penerima bantuan sosial per kecamatan',
    'Berapa jumlah warga miskin di Aceh Tengah?',
  ];

  it('menolak permintaan yang meminta nama/identitas orang', () => {
    for (const q of ditolak) expect(cekPermintaanPerOrang(q), q).toBeTruthy();
  });

  it('tetap melayani permintaan agregat', () => {
    for (const q of dilayani) expect(cekPermintaanPerOrang(q), q).toBeNull();
  });

  it('pagar utama ikut menolaknya', () => {
    expect(guardQuery('Siapa nama penerima PKH di Desa Kemili?').ok).toBe(false);
    expect(guardQuery('Berapa jumlah penerima PKH di Aceh Tengah?').ok).toBe(true);
  });
});
