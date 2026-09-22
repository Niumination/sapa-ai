// ─── Uji FR-19: sitasi per klaim ──────────────────────────────────────────────
// Pagar yang dijaga di sini: modul TIDAK BOLEH mengarang rujukan. Setiap penanda
// [n] harus benar-benar menunjuk baris bukti yang memuat angka tersebut.

import { describe, it, expect } from 'vitest';
import { beriSitasi, pecahKalimat, MAKS_PENANDA } from '../sitasi-per-klaim';

const buktiAsn = [{ indikator: 'Jumlah ASN', nilai: '9610', satuan: 'Pegawai', tahun: '2026', opd: 'Badan Kepegawaian dan Pengembangan SDM' }];

describe('beriSitasi — penunjukan yang benar', () => {
  it('kalimat klaim mendapat penanda menunjuk baris bukti yang memuat angkanya', () => {
    const hasil = beriSitasi(
      'Berdasarkan data SAPA untuk "Berapa jumlah ASN?", ditemukan 1 indikator terkait: Jumlah ASN 9.610 Pegawai (BKPSDM, 2026).',
      buktiAsn,
    );
    expect(hasil.narasi).toContain('9.610 Pegawai (BKPSDM, 2026) [1].');
    expect(hasil.ringkas).toEqual({ totalKlaim: 1, bersitasi: 1, tanpaSitasi: [] });
  });

  it('penanda diletakkan SEBELUM tanda baca akhir kalimat, bukan sesudahnya', () => {
    const hasil = beriSitasi('Jumlah ASN tercatat 9.610 pegawai.', buktiAsn);
    expect(hasil.narasi).toBe('Jumlah ASN tercatat 9.610 pegawai [1].');
  });

  it('angka tahun saja BUKAN klaim (tidak perlu dirujuk)', () => {
    const hasil = beriSitasi('Data ini berlaku sejak 2026.', buktiAsn);
    expect(hasil.ringkas.totalKlaim).toBe(0);
    expect(hasil.narasi).not.toContain('[');
  });

  it('jumlah meta (indikator/OPD/record) bukan klaim', () => {
    const hasil = beriSitasi('Ditemukan 1 indikator terkait dari 3 OPD, dengan 12 record.', buktiAsn);
    expect(hasil.ringkas.totalKlaim).toBe(0);
  });

  it('kalimat tanpa angka sama sekali bukan klaim', () => {
    const hasil = beriSitasi('Lihat tabel pada visualisasi di bawah.', buktiAsn);
    expect(hasil.ringkas.totalKlaim).toBe(0);
  });
});

describe('beriSitasi — TIDAK mengarang rujukan', () => {
  it('angka yang tidak ada pada bukti ⇒ tanpa penanda + dilaporkan', () => {
    const hasil = beriSitasi('Jumlah ASN tercatat 999.999 pegawai.', buktiAsn);
    expect(hasil.narasi).not.toContain('[');
    expect(hasil.ringkas).toEqual({ totalKlaim: 1, bersitasi: 0, tanpaSitasi: ['Jumlah ASN tercatat 999.999 pegawai.'] });
  });

  it('kalimat campuran: klaim yang cocok dirujuk, yang tidak cocok dilaporkan', () => {
    const hasil = beriSitasi('ASN tercatat 9.610 pegawai. Produksi kopi 1.234 ton.', buktiAsn);
    expect(hasil.narasi).toContain('9.610 pegawai [1].');
    expect(hasil.narasi).not.toContain('1.234 ton [');
    expect(hasil.ringkas).toEqual({ totalKlaim: 2, bersitasi: 1, tanpaSitasi: ['Produksi kopi 1.234 ton.'] });
  });

  it('bukti kosong ⇒ semua klaim dilaporkan tanpa penanda', () => {
    const hasil = beriSitasi('Prevalensi stunting 31,4 persen.', []);
    expect(hasil.ringkas.bersitasi).toBe(0);
    expect(hasil.ringkas.tanpaSitasi).toHaveLength(1);
  });
});

describe('beriSitasi — pencocokan angka yang jujur', () => {
  it('pemisah ribuan dan desimal koma dikenali', () => {
    const bukti = [
      { indikator: 'Jumlah ASN', nilai: '9610' },
      { indikator: 'Prevalensi Stunting', nilai: '31,4' },
    ];
    const hasil = beriSitasi('ASN 9.610 pegawai. Stunting 31,4 persen.', bukti);
    expect(hasil.narasi).toContain('9.610 pegawai [1].');
    expect(hasil.narasi).toContain('31,4 persen [2].');
    expect(hasil.ringkas.tanpaSitasi).toEqual([]);
  });

  it('angka yang sudah disingkat tetap cocok dengan nilai penuh (1,44 Triliun ↔ nilai penuh)', () => {
    const bukti = [{ indikator: 'Belanja Daerah', nilai: '1438857592538,6', satuan: 'rupiah' }];
    const hasil = beriSitasi('Belanja 1,44 Triliun rupiah.'.replace('Belanja', 'Belanja daerah'), bukti);
    expect(hasil.narasi).toContain('[1]');
    expect(hasil.ringkas.bersitasi).toBe(1);
  });

  it('toleransi tidak berlebihan: 31,4 tidak cocok dengan 31,9', () => {
    const hasil = beriSitasi('Stunting 31,9 persen.', [{ indikator: 'Prevalensi Stunting', nilai: '31,4' }]);
    expect(hasil.ringkas.bersitasi).toBe(0);
  });

  it('satu kalimat dengan dua angka mendapat dua penanda, urut menaik', () => {
    const bukti = [
      { indikator: 'Jumlah ASN', nilai: '9610' },
      { indikator: 'Prevalensi Stunting', nilai: '31,4' },
    ];
    const hasil = beriSitasi('Stunting 31,4 persen dan ASN 9.610 pegawai.', bukti);
    expect(hasil.narasi).toContain('[1][2].');
  });

  it('bila satu angka cocok ke beberapa baris, yang indikatornya disebut dipilih lebih dahulu', () => {
    const bukti = [
      { indikator: 'Jumlah Koperasi', nilai: '159' },
      { indikator: 'Jumlah Koperasi di Kecamatan Bebesen', nilai: '159' },
    ];
    const hasil = beriSitasi('Jumlah Koperasi di Kecamatan Bebesen 159 unit.', bukti);
    expect(hasil.narasi).toContain('[2].');
  });

  it('jumlah penanda per kalimat dibatasi', () => {
    const bukti = [1, 2, 3, 4, 5].map((n) => ({ indikator: `Indikator ${n}`, nilai: String(n) }));
    const hasil = beriSitasi('Tercatat 1, 2, 3, 4, 5.', bukti);
    const penanda = hasil.narasi.match(/\[\d+\]/g) ?? [];
    expect(penanda.length).toBeLessThanOrEqual(MAKS_PENANDA);
  });
});

describe('beriSitasi — idempotensi & bentuk keluaran', () => {
  it('dipanggil dua kali tidak menumpuk penanda', () => {
    const pertama = beriSitasi('ASN tercatat 9.610 pegawai.', buktiAsn);
    const kedua = beriSitasi(pertama.narasi, buktiAsn);
    expect(kedua.narasi).toBe(pertama.narasi);
    expect(kedua.ringkas).toEqual(pertama.ringkas);
  });

  it('narasi kosong tidak meledak', () => {
    const hasil = beriSitasi('', buktiAsn);
    expect(hasil.narasi).toBe('');
    expect(hasil.ringkas.totalKlaim).toBe(0);
  });
});

describe('pecahKalimat', () => {
  it('memisah pada akhir kalimat, baris baru, dan butir', () => {
    expect(pecahKalimat('Satu. Dua! Tiga?')).toEqual(['Satu.', 'Dua!', 'Tiga?']);
    expect(pecahKalimat('Satu.\nDua.')).toEqual(['Satu.', 'Dua.']);
    expect(pecahKalimat('• Butir satu. • Butir dua.')).toEqual(['Butir satu.', 'Butir dua.']);
  });

  it('tidak memisah pada desimal atau pemisah ribuan', () => {
    expect(pecahKalimat('Nilai 9.610,5 persen.')).toEqual(['Nilai 9.610,5 persen.']);
  });
});
