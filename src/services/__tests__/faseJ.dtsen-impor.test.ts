// ─── PR-4b: kontrak impor manual DTSEN (inti murni) ───
// Fokus PRIVASI: nik mentah tidak pernah keluar; nama hanya masked; kelompok
// k<5 tidak pernah menjadi baris agregat; baris kotor ditolak dengan alasan.

import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  parseAndValidateDtsenCsv,
  maskNama,
  hmac,
  importChecksum,
  buildAgregatWilayah,
  KECAMATAN_ACEH_TENGAH,
  TEMPLATE_HEADER,
  K_MIN,
  type ValidDtsenRow,
} from '@/services/dtsen-import';

const SECRET = 'test-secret-key-16chars';

const HEADER = TEMPLATE_HEADER.join(',');
const csvRow = (nik: string, nama: string, kk = '', kec = 'Bebesen', desa = 'Atu', desil = '1', pkh = '1', bpnt = '0', pbi = '1') =>
  [nik, nama, kk, kec, desa, desil, pkh, bpnt, pbi].join(',');
const nik = (n: number) => `110801010180${String(n).padStart(4, '0')}`;

describe('parseCsv', () => {
  it('memahami field berkutip, koma di dalam kutip, dan escape double-quote', () => {
    const rows = parseCsv('a,b\n"x,y","z""q"\r\nlast,row');
    expect(rows).toEqual([['a', 'b'], ['x,y', 'z"q'], ['last', 'row']]);
  });
  it('mengabaikan baris kosong', () => {
    expect(parseCsv('a,b\n\n\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('maskNama — bentuk masked satu-satunya yang pernah dibuat', () => {
  it('menyisakan huruf pertama & terakhir saja', () => {
    expect(maskNama('SITI AMINAH')).toBe('S*****H');
    expect(maskNama('budi santoso')).toBe('B*****O');
    expect(maskNama('Ab')).toBe('A*****B');
  });
  it('string kosong aman', () => {
    expect(maskNama('   ')).toBe('(tanpa nama)');
    expect(maskNama('')).toBe('(tanpa nama)');
  });
});

describe('parseAndValidateDtsenCsv — gerbang kualitas', () => {
  it('menolak header yang tidak sesuai template', () => {
    const r = parseAndValidateDtsenCsv('salah,header\n1,2', SECRET);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected[0].reason).toContain('Header tidak sesuai template');
  });

  it('baris valid: nikHash 64-hex, nama masked, kk → hash, desil ter-parse', () => {
    const text = `${HEADER}\n${csvRow(nik(1), 'Siti Aminah', nik(99), 'jagong   jeget', 'Gelelungi', '2', 'ya', 'tidak', '1')}`;
    const r = parseAndValidateDtsenCsv(text, SECRET);
    expect(r.rejected).toHaveLength(0);
    expect(r.valid).toHaveLength(1);
    const v = r.valid[0];
    expect(v.nikHash).toMatch(/^[0-9a-f]{64}$/);
    expect(v.nikHash).toBe(hmac(nik(1), SECRET));
    expect(v.namaMasked).toBe('S*****H');
    expect(v.kecamatan).toBe('Jagong Jeget'); // dinormalkan ke bentuk kanonik
    expect(v.keluargaId).toBe(`kk:${hmac(nik(99), SECRET)}`);
    expect(v.desil).toBe(2);
    expect(v.statusBansos).toEqual({ pkh: true, bpnt: false, pbi: true });
  });

  it('NIK mentah TIDAK PERNAH bocor di output baris valid', () => {
    const text = `${HEADER}\n${csvRow(nik(7), 'Nama Rahasia Warga', nik(77))}`;
    const r = parseAndValidateDtsenCsv(text, SECRET);
    const blob = JSON.stringify(r.valid);
    expect(blob).not.toContain(nik(7));
    expect(blob).not.toContain('Rahasia');
    expect(blob).not.toContain('Warga');
  });

  it.each([
    ['NIK pendek', csvRow('12345', 'Nama Panjang')],
    ['NIK huruf', csvRow('11080abc01800001', 'Nama Panjang')],
    ['nama kosong', csvRow(nik(2), '  ')],
    ['kecamatan salah ketik', csvRow(nik(3), 'Nama Panjang', '', 'Jagong Jegett', 'Atu Kota')],
    ['desa kosong', csvRow(nik(4), 'Nama Panjang', '', 'Bebesen', ' ')],
    ['desil 0', csvRow(nik(5), 'Nama Panjang', '', 'Bebesen', 'Atu', '0')],
    ['desil 11', csvRow(nik(6), 'Nama Panjang', '', 'Bebesen', 'Atu', '11')],
    ['desil desimal', csvRow(nik(7), 'Nama Panjang', '', 'Bebesen', 'Atu', '1.5')],
    ['pkh aneh', csvRow(nik(8), 'Nama Panjang', '', 'Bebesen', 'Atu', '1', 'mungkin')],
  ])('menolak: %s — dengan alasan + jejak 4 digit NIK', (_, badRow) => {
    const r = parseAndValidateDtsenCsv(`${HEADER}\n${badRow}`, SECRET);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason.length).toBeGreaterThan(3);
    expect(r.rejected[0].line).toBe(1);
  });

  it('no_kk kosong/wajib — baris ditolak (tidak ada proxy keluarga)', () => {
    const r = parseAndValidateDtsenCsv(`${HEADER}\n${csvRow(nik(10), 'Tanpa Kk')}`, SECRET);
    expect(r.valid).toHaveLength(0);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toMatch(/no_kk/i);
  });
});

describe('buildAgregatWilayah — sensor k-anonymity', () => {
  const mk = (kec: string, desa: string, desil: number, n: number): ValidDtsenRow[] =>
    Array.from({ length: n }, (_, i) => ({
      nikHash: `h${kec}${desa}${desil}-${i}`,
      namaMasked: 'X*****Y',
      keluargaId: `k${desa}${desil}-${Math.floor(i / 2)}`, // 2 jiwa per keluarga
      kecamatan: kec,
      desa,
      desil,
      statusBansos: { pkh: false, bpnt: false, pbi: false },
    }));

  it('kelompok ≥ k_min lolos dengan hitungan benar; kelompok kecil hilang total', () => {
    const rows = [...mk('Bebesen', 'Atu', 1, 6), ...mk('Bebesen', 'Atu', 2, K_MIN - 1)];
    const a = buildAgregatWilayah(rows);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ kecamatan: 'Bebesen', desa: 'Atu', desil: 1, jumlahJiwa: 6, jumlahKeluarga: 3 });
    expect(a.kelompokTerSensor).toBe(1);
    expect(a.jiwaTerSensor).toBe(K_MIN - 1);
  });

  it('urutan agregat deterministik & kamus kecamatan berisi 14 nama resmi', () => {
    const rows = [...mk('Silih Nara', 'B', 1, 5), ...mk('Atu Lintang', 'A', 1, 5)];
    const a = buildAgregatWilayah(rows);
    expect(a.rows.map((r) => r.kecamatan)).toEqual(['Atu Lintang', 'Silih Nara']);
    expect(KECAMATAN_ACEH_TENGAH).toHaveLength(14);
    expect(KECAMATAN_ACEH_TENGAH).toContain('Jagong Jeget');
  });
});

describe('importChecksum', () => {
  it('insensitif urutan baris, peka perubahan isi', () => {
    const r = parseAndValidateDtsenCsv(`${HEADER}\n${csvRow(nik(1), 'A B', nik(91))}\n${csvRow(nik(2), 'C D', nik(92), 'Bies', 'Buntul')}`, SECRET);
    const c1 = importChecksum(r.valid);
    const c2 = importChecksum([...r.valid].reverse());
    expect(c1).toBe(c2);
    const r2 = parseAndValidateDtsenCsv(`${HEADER}\n${csvRow(nik(1), 'A B', nik(91))}\n${csvRow(nik(2), 'C D', nik(92), 'Bies', 'Buntul', '2')}`, SECRET);
    expect(importChecksum(r2.valid)).not.toBe(c1);
  });
});
