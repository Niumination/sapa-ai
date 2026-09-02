// ─── PR-4c: kontrak impor multi-format DTSEN (stunting + kominfo) ───
// Fokus PRIVASI: nik mentah tidak pernah keluar; nama hanya masked;
// bansos diset false bila tidak ada informasi.

import { describe, it, expect } from 'vitest';
import { parseStuntingXlsx, parseKominfoXlsx } from '@/services/dtsen-multisource';
import { hmac, maskNama, K_MIN } from '@/services/dtsen-import';

const SECRET = 'test-secret-key-16chars';

describe('parseStuntingXlsx', () => {
  it('memproses baris valid stunting → nikHash, nama masked, desil default', () => {
    const rows = [
      {
        NIK: '1104080304610001',
        Nama: 'SITI AMINAH',
        JK: 'P',
        Kec: 'Bintang',
        'Desa/Kel': 'Kuala I',
      },
      {
        NIK: '1104080304610002',
        Nama: 'BUDI SANTOSO',
        JK: 'L',
        Kec: 'Bintang',
        'Desa/Kel': 'Kuala I',
      },
    ];
    const r = parseStuntingXlsx(rows, SECRET);
    expect(r.rejected).toHaveLength(0);
    expect(r.valid).toHaveLength(2);
    expect(r.warnings).toContain('Data stunting tidak mengandung info bansos (PKH/BPNT/PBI) — semua di-set false.');
    const v = r.valid[0];
    expect(v.nikHash).toMatch(/^[0-9a-f]{64}$/);
    expect(v.nikHash).toBe(hmac('1104080304610001', SECRET));
    expect(v.namaMasked).toBe(maskNama('SITI AMINAH'));
    expect(v.kecamatan).toBe('Bintang');
    expect(v.desa).toBe('Kuala I');
    expect(v.desil).toBe(1); // default
    expect(v.statusBansos).toEqual({ pkh: false, bpnt: false, pbi: false });
  });

  it('NIK mentah tidak bocor di output', () => {
    const rows = [{ NIK: '1104080304610001', Nama: 'RAHASIA KERABAT', JK: 'P', Kec: 'Bintang', 'Desa/Kel': 'Kuala I' }];
    const r = parseStuntingXlsx(rows, SECRET);
    const blob = JSON.stringify(r.valid);
    expect(blob).not.toContain('1104080304610001');
    expect(blob).not.toContain('RAHASIA');
    expect(blob).not.toContain('KERABAT');
  });

  it('menolak NIK tidak valid', () => {
    const rows = [{ NIK: '123', Nama: 'Nama Panjang', JK: 'P', Kec: 'Bintang', 'Desa/Kel': 'Kuala I' }];
    const r = parseStuntingXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toContain('NIK harus 16 digit');
  });

  it('menolak kecamatan tidak dikenal', () => {
    const rows = [{ NIK: '1104080304610001', Nama: 'Nama Panjang', JK: 'P', Kec: 'Kabupaten XYZ', 'Desa/Kel': 'Kuala I' }];
    const r = parseStuntingXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toContain('tidak dikenal');
  });

  it('menerima kecamatan dengan alias "LUT TAWAR" → "Laut Tawar"', () => {
    const rows = [{ NIK: '1104080304610001', Nama: 'Test Balita', JK: 'L', Kec: 'LUT TAWAR', 'Desa/Kel': 'Kuala I' }];
    const r = parseStuntingXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].kecamatan).toBe('Laut Tawar');
  });

  it('menerima NIK numerik (number type dari Excel) → di-konversi ke string', () => {
    const rows = [{ NIK: 1104080304610001, Nama: 'Test Balita', JK: 'L', Kec: 'Bintang', 'Desa/Kel': 'Kuala I' }];
    const r = parseStuntingXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].nikHash).toBe(hmac('1104080304610001', SECRET));
  });

  it('menolak NIK yang sudah masked (mengandung *)', () => {
    const rows = [{ NIK: '08022**********', Nama: 'Test User', JK: 'L', Kec: 'Ketol', 'Desa/Kel': 'Serempah' }];
    const r = parseStuntingXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toContain('NIK harus 16 digit');
  });
});

describe('parseKominfoXlsx', () => {
  it('memproses baris valid kominfo → nikHash, nama masked, desil dari kolom', () => {
    const rows = [
      {
        NIK: '1104080304610001',
        NAMA: 'SITI AMINAH',
        'KETERANGAN DESIL': 3,
        KK: '1104080304610077',
        DESA: 'Kuala I',
        KECAMATAN: 'Bintang',
      },
      {
        NIK: '1104080304610002',
        NAMA: 'BUDI SANTOSO',
        'KETERANGAN DESIL': 5,
        KK: '',
        DESA: 'Kuala I',
        KECAMATAN: 'Bintang',
      },
    ];
    const r = parseKominfoXlsx(rows, SECRET);
    expect(r.rejected).toHaveLength(0);
    expect(r.valid).toHaveLength(2);
    expect(r.warnings).toContain('Data kominfo tidak memiliki kolom bansos (PKH/BPNT/PBI) — semua di-set false.');

    const v0 = r.valid[0]!;
    expect(v0.nikHash).toBe(hmac('1104080304610001', SECRET));
    expect(v0.namaMasked).toBe(maskNama('SITI AMINAH'));
    expect(v0.kecamatan).toBe('Bintang');
    expect(v0.desa).toBe('Kuala I');
    expect(v0.desil).toBe(3);
    expect(v0.keluargaId).toBe(`kk:${hmac('1104080304610077', SECRET)}`);

    const v1 = r.valid[1]!;
    expect(v1.desil).toBe(5);
    expect(v1.keluargaId).toBeNull(); // tanpa KK valid → jumlah keluarga tidak tersedia
  });

  it('NIK mentah tidak bocor di output', () => {
    const rows = [{ NIK: '1104080304610001', NAMA: 'RAHASIA KERABAT', 'KETERANGAN DESIL': 1, DESA: 'Kuala I', KECAMATAN: 'Bintang' }];
    const r = parseKominfoXlsx(rows, SECRET);
    const blob = JSON.stringify(r.valid);
    expect(blob).not.toContain('1104080304610001');
    expect(blob).not.toContain('RAHASIA');
  });

  it('menolak desil di luar rentang 1-10', () => {
    const rows = [{ NIK: '1104080304610001', NAMA: 'Nama Panjang', 'KETERANGAN DESIL': 11, DESA: 'Kuala I', KECAMATAN: 'Bintang' }];
    const r = parseKominfoXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toContain('Desil tidak valid');
  });

  it('menerima desil range "6-10" → ambil batas bawah (6)', () => {
    const rows = [{ NIK: '1104080304610001', NAMA: 'Test User', 'KETERANGAN DESIL': '6-10', DESA: 'Kuala I', KECAMATAN: 'Bintang' }];
    const r = parseKominfoXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].desil).toBe(6);
  });

  it('menerima "Belum Ada Desl" → set desil 1 + warning', () => {
    const rows = [{ NIK: '1104080304610001', NAMA: 'Test User', 'KETERANGAN DESIL': 'Belum Ada Desl', DESA: 'Kuala I', KECAMATAN: 'Bintang' }];
    const r = parseKominfoXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].desil).toBe(1);
    expect(r.warnings.some(w => w.includes('prioritas tertinggi'))).toBe(true);
  });

  it('menerima desil kosong/undefined → set desil 1 + warning', () => {
    const rows = [{ NIK: '1104080304610001', NAMA: 'Test User', 'KETERANGAN DESIL': null, DESA: 'Kuala I', KECAMATAN: 'Bintang' }];
    const r = parseKominfoXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].desil).toBe(1);
    expect(r.warnings.some(w => w.includes('prioritas tertinggi'))).toBe(true);
  });

  it('menerima NIK numerik (number type dari Excel)', () => {
    const rows = [{ NIK: 1104080304610001, NAMA: 'Test User', 'KETERANGAN DESIL': 1, DESA: 'Kuala I', KECAMATAN: 'Bintang' }];
    const r = parseKominfoXlsx(rows, SECRET);
    expect(r.valid).toHaveLength(1);
    expect(r.valid[0].nikHash).toBe(hmac('1104080304610001', SECRET));
  });
});
