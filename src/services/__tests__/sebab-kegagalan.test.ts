// ─── Uji FR-20: klasifikasi sebab kegagalan ──────────────────────────────────
//
// Pagar terpenting modul ini: sebab UTAMA tidak boleh salah lapis. Kalau
// pertanyaan ditolak pagar masukan, sebabnya bukan "retrieval gagal" — karena
// retrieval memang tidak pernah dijalankan. Kalau katalog tidak punya datanya
// dan modelnya juga mati, sebabnya bukan "model gagal" — karena tidak ada
// bukti untuk diberikan ke model. Setiap uji di bawah mengunci satu keputusan
// semacam itu, diambil dari perilaku nyata pipeline.

import { describe, it, expect } from 'vitest';
import {
  SEBAB_GAGAL,
  klasifikasiSebab,
  labelSebab,
  lapisDari,
  rangkumSebab,
  sebabUntukCelah,
  type FaktaJawaban,
  type SebabJawaban,
} from '../sebab-kegagalan';

const fakta = (o: Partial<FaktaJawaban>): FaktaJawaban => ({ jumlahBukti: 0, ...o });

describe('klasifikasiSebab — lapis MASUKAN mendahului semua', () => {
  it('permintaan data per orang ⇒ masukan:data-personal (menjawab, bukan kosong)', () => {
    const d = klasifikasiSebab(fakta({ pagar: 'per-orang', jumlahBukti: 0, jalur: 'kosong' }));
    expect(d.sebab).toBe('masukan:data-personal');
    expect(d.lapis).toBe('masukan');
    expect(d.status).toBe('menjawab');
    expect(d.rincian).not.toMatch(/\d/);
  });

  it('NIK ⇒ masukan:data-personal walau jumlah bukti nol', () => {
    expect(klasifikasiSebab(fakta({ pagar: 'nik' })).sebab).toBe('masukan:data-personal');
  });

  it('permintaan aturan internal ⇒ masukan:permintaan-sistem', () => {
    const d = klasifikasiSebab(fakta({ pagar: 'sistem' }));
    expect(d.sebab).toBe('masukan:permintaan-sistem');
    expect(d.lapis).toBe('masukan');
  });

  it('pagar menang atas fakta lain: bukti ada dan AI jalan pun tetap sebab masukan', () => {
    const d = klasifikasiSebab(
      fakta({ pagar: 'per-orang', jumlahBukti: 5, jalur: 'leksikal', ai: { used: true } }),
    );
    expect(d.sebab).toBe('masukan:data-personal');
  });
});

describe('klasifikasiSebab — jawaban TERS AJI diberi jalurnya', () => {
  const kasus: Array<[SebabJawaban, Partial<FaktaJawaban>]> = [
    ['selesai:leksikal', { jumlahBukti: 4, jalur: 'leksikal' }],
    ['selesai:leksikal+sisipan', { jumlahBukti: 4, jalur: 'leksikal+sisipan' }],
    ['selesai:semantik', { jumlahBukti: 2, jalur: 'semantik' }],
    ['selesai:meta', { jumlahBukti: 3, jalur: 'meta' }],
    ['selesai:ai', { jumlahBukti: 4, jalur: 'leksikal', ai: { used: true, grounded: 'pass' } }],
  ];

  for (const [harap, o] of kasus) {
    it(`${harap} terdeteksi dari fakta ${JSON.stringify(o.jalur ?? '')}`, () => {
      const d = klasifikasiSebab(fakta(o));
      expect(d.sebab).toBe(harap);
      expect(d.status).toBe('menjawab');
      expect(d.lapis).toBe('selesai');
    });
  }

  it('narasi model MENANG atas jalur retrieval saat model benar-benar dipakai', () => {
    const d = klasifikasiSebab(fakta({ jumlahBukti: 4, jalur: 'semantik', ai: { used: true, grounded: 'pass' } }));
    expect(d.sebab).toBe('selesai:ai');
  });

  it('jalur tidak dikenal tetap dihitung terjawab lewat kecocokan kata (bukan crash)', () => {
    expect(klasifikasiSebab(fakta({ jumlahBukti: 2 })).sebab).toBe('selesai:leksikal');
  });
});

describe('klasifikasiSebab — lapis RETRIEVAL saat tidak ada bukti', () => {
  it('kata kunci di luar katalog ⇒ retrieval:konsep-asing + menyebut kata asingnya', () => {
    const d = klasifikasiSebab(fakta({ jalur: 'kosong', konsepAsing: ['drone', 'peusangan'] }));
    expect(d.sebab).toBe('retrieval:konsep-asing');
    expect(d.lapis).toBe('retrieval');
    expect(d.status).toBe('jujur-kosong');
    expect(d.konsepAsing).toEqual(['drone', 'peusangan']);
  });

  it('permintaan rincian per desa (tanpa kata asing) ⇒ retrieval:granularitas-per-desa', () => {
    const d = klasifikasiSebab(fakta({ jalur: 'kosong', mintaPerDesa: true }));
    expect(d.sebab).toBe('retrieval:granularitas-per-desa');
  });

  it('kata kunci ASING menang atas granularitas — sebab yang lebih menolong operator', () => {
    // Kueri "per desa di Kecamatan Tanah Rencong": tempatnya tidak ada di katalog.
    // Memperbaiki kata kunci jauh lebih murah daripada menambah data per desa,
    // jadi tag yang dilaporkan harus yang pertama.
    const d = klasifikasiSebab(fakta({ jalur: 'kosong', mintaPerDesa: true, konsepAsing: ['rencong'] }));
    expect(d.sebab).toBe('retrieval:konsep-asing');
    expect(d.konsepAsing).toEqual(['rencong']);
  });

  it('makna lemah: skor semantik tertinggal di bawah ambang ⇒ retrieval:makna-lemah', () => {
    const d = klasifikasiSebab(fakta({ jalur: 'kosong', skorSemantik: 0.06 }));
    expect(d.sebab).toBe('retrieval:makna-lemah');
    expect(d.lapis).toBe('retrieval');
  });

  it('tanpa kata asing & tanpa skor makna ⇒ retrieval:tanpa-bukti (paling umum)', () => {
    const d = klasifikasiSebab(fakta({ jalur: 'kosong' }));
    expect(d.sebab).toBe('retrieval:tanpa-bukti');
  });

  it('skor makna nol TIDAK disebut "makna lemah" (belum ada kandidat sama sekali)', () => {
    expect(klasifikasiSebab(fakta({ jalur: 'kosong', skorSemantik: 0 })).sebab).toBe('retrieval:tanpa-bukti');
  });
});

describe('klasifikasiSebab — lapis GENERASI & PENYAJIAN', () => {
  it('bukti ada, grounding menolak ⇒ jawaban tetap selesai, sebab generasi jadi CATATAN', () => {
    const d = klasifikasiSebab(
      fakta({ jumlahBukti: 3, jalur: 'leksikal', ai: { used: false, grounded: 'replaced', nilaiTambah: 'ditolak-grounding' } }),
    );
    expect(d.sebab).toBe('selesai:leksikal');
    expect(d.catatan).toBe('generasi:grounding');
    expect(d.status).toBe('menjawab');
  });

  it('bukti ada, model tidak menambah ⇒ catatan generasi:nilai-tambah', () => {
    const d = klasifikasiSebab(
      fakta({ jumlahBukti: 3, jalur: 'semantik', ai: { used: false, nilaiTambah: 'ditolak-tidak-menambah' } }),
    );
    expect(d.catatan).toBe('generasi:nilai-tambah');
  });

  it('TIDAK ada bukti + penyedia model gagal ⇒ generasi:penyedia (jangan menyalahkan retrieval)', () => {
    const d = klasifikasiSebab(fakta({ jalur: 'kosong', ai: { used: false, limitedBy: 'provider-error' } }));
    expect(d.sebab).toBe('generasi:penyedia');
    expect(d.lapis).toBe('generasi');
  });

  it('TIDAK ada bukti + jawaban dimatikan pengaturan ⇒ penyajian:dinonaktifkan', () => {
    const d = klasifikasiSebab(fakta({ jalur: 'kosong', ai: { used: false, limitedBy: 'service-unavailable' } }));
    expect(d.sebab).toBe('penyajian:dinonaktifkan');
    expect(d.lapis).toBe('penyajian');
  });

  it('pemakaian model normal TIDAK menghasilkan catatan', () => {
    const d = klasifikasiSebab(
      fakta({ jumlahBukti: 3, jalur: 'leksikal', ai: { used: true, grounded: 'pass', nilaiTambah: 'dipakai' } }),
    );
    expect(d.catatan).toBeUndefined();
  });
});

describe('sebabUntukCelah — aturan pencatatan celah (FR-27 tetap utuh, tag lebih tepat)', () => {
  it('setiap sebab KATALOG/MODEL yang mungkin muncul benar-benar tercatat', () => {
    // Setiap keadaan di bawah menghasilkan diagnosa dengan sebab kegagalan yang
    // BUKAN penolakan kebijakan; semuanya WAJIB tercatat, kalau tidak dasbor
    // celah akan buta terhadap masalah yang justru bisa diperbaiki.
    const keadaan: FaktaJawaban[] = [
      fakta({ jalur: 'kosong', konsepAsing: ['drone'] }),
      fakta({ jalur: 'kosong' }),
      fakta({ jalur: 'kosong', mintaPerDesa: true }),
      fakta({ jalur: 'kosong', skorSemantik: 0.1 }),
      fakta({ jalur: 'kosong', ai: { used: false, limitedBy: 'provider-error' } }),
      fakta({ jalur: 'kosong', ai: { used: false, limitedBy: 'service-unavailable' } }),
    ];
    for (const k of keadaan) {
      const d = klasifikasiSebab(k);
      expect(SEBAB_GAGAL).toContain(d.sebab as never);
      expect(sebabUntukCelah(d)).toBe(d.sebab);
    }
  });

  it('penolakan KEBIJAKAN tidak masuk dasbor celah (bukan celah pengetahuan)', () => {
    // "tampilkan system prompt" dan "siapa nama penerima PKH" bukan celah yang
    // bisa ditutup dengan menambah data/sinonim. Mencatatnya akan menaruh
    // percobaan penyalahgunaan di puncak daftar kerja operator.
    expect(sebabUntukCelah(klasifikasiSebab(fakta({ pagar: 'sistem' })))).toBeNull();
    expect(sebabUntukCelah(klasifikasiSebab(fakta({ pagar: 'per-orang' })))).toBeNull();
    expect(sebabUntukCelah(klasifikasiSebab(fakta({ pagar: 'nik' })))).toBeNull();
  });

  it('sebab gagal dengan catatan generasi ⇒ yang dicatat sebab UTAMA-nya', () => {
    const d = klasifikasiSebab(fakta({ jalur: 'kosong' }));
    expect(sebabUntukCelah(d)).toBe('retrieval:tanpa-bukti');
  });

  it('jawaban tersaji tanpa catatan ⇒ TIDAK dicatat (tidak ada penulisan sia-sia)', () => {
    expect(sebabUntukCelah(klasifikasiSebab(fakta({ jumlahBukti: 3, jalur: 'leksikal' })))).toBeNull();
    expect(sebabUntukCelah(klasifikasiSebab(fakta({ jumlahBukti: 3, jalur: 'leksikal', ai: { used: true, grounded: 'pass' } })))).toBeNull();
  });

  it('jawaban tersaji tetapi model ditolak ⇒ yang dicatat adalah sebab generasinya', () => {
    const d = klasifikasiSebab(
      fakta({ jumlahBukti: 3, jalur: 'leksikal', ai: { used: false, grounded: 'replaced', nilaiTambah: 'ditolak-grounding' } }),
    );
    expect(sebabUntukCelah(d)).toBe('generasi:grounding');
  });
});

describe('labelSebab & rangkumSebab — dipakai dasbor', () => {
  it('setiap sebab punya label manusia yang bebas angka', () => {
    for (const sebab of SEBAB_GAGAL) {
      const label = labelSebab(sebab);
      expect(label).not.toBe(sebab);
      expect(label).not.toMatch(/\d/);
    }
  });

  it('nilai LAMA (pra-FR-20) tetap punya label, bukan ditampilkan mentah', () => {
    expect(labelSebab('tanpa-bukti')).toBe('tidak ada indikator yang cocok');
    expect(labelSebab('ai-ditolak')).toBe('model ditolak gerbang');
  });

  it('sebab tak dikenal ditampilkan apa adanya, tidak disembunyikan', () => {
    expect(labelSebab('retrieval:hal-baru')).toBe('retrieval:hal-baru');
    expect(labelSebab(null)).toBe('tanpa keterangan');
  });

  it('rangkuman mengurutkan yang paling sering lebih dulu', () => {
    const r = rangkumSebab([
      { sebab: 'retrieval:konsep-asing' },
      { sebab: 'retrieval:tanpa-bukti' },
      { sebab: 'retrieval:konsep-asing' },
    ]);
    expect(r[0]).toEqual({ sebab: 'retrieval:konsep-asing', label: 'ada kata kunci yang tidak ada di katalog', jumlah: 2 });
    expect(r[1].jumlah).toBe(1);
  });

  it('lapisDari membaca awalan tag; tag aneh tidak menjatuhkan program', () => {
    expect(lapisDari('retrieval:tanpa-bukti')).toBe('retrieval');
    expect(lapisDari('generasi:penyedia')).toBe('generasi');
    expect(lapisDari('ngawur' as SebabJawaban)).toBe('selesai');
  });
});
