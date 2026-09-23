// ─── Uji FR-24: pemeriksa pasangan entitas ───────────────────────────────────
//
// Cara menguji pemeriksa semacam ini: JANGAN menguji "ia menerima narasi yang
// benar" saja — harus ada narasi yang SENGAJA dirusak (nilai benar, pasangan
// salah), karena itulah satu-satunya kegagalan yang tidak tertangkap gerbang
// grounding lama. Setiap uji "keras" di bawah adalah satu bentuk perusakan.

import { describe, it, expect } from 'vitest';
import {
  angkaDalamTeks,
  atribusiOpd,
  bersihkanNarasi,
  daftarKecamatanDariIndikator,
  kecamatanIndikator,
  kataSatuan,
  normalisasiAngka,
  pecahKalimat,
  kunciOpd,
  pemilikAngka,
  periksaPasanganEntitas,
  penjelasanPemeriksaan,
  ringkasPemeriksaan,
  satuanSetelahAngka,
  type BarisBukti,
} from '../pemeriksa-entitas';
import { daftarKecamatan } from '@/lib/sapa-client';
import type { SapaRecord } from '@/lib/sapa-client';

const BUKTI: BarisBukti[] = [
  { indikator: 'Jumlah produksi komoditas perkebunan Kopi Arabika', opd: 'Dinas Pertanian', nilai: '29019', satuan: 'Ton/Tahun', tahun: '2025' },
  { indikator: 'Jumlah ASN', opd: 'Sekretariat Daerah', nilai: '9588', satuan: 'Pegawai', tahun: '2026' },
  { indikator: 'Prevalensi Stunting', opd: 'Dinas Kesehatan', nilai: '31,4', satuan: 'Persen', tahun: '2025' },
  { indikator: 'Prevalensi Stunting di Kecamatan Bebesen', opd: 'Dinas Kesehatan', nilai: '18,2', satuan: 'Persen', tahun: '2025' },
  { indikator: 'Jumlah Koperasi di Kecamatan Bebesen', opd: 'Dinas Koperasi', nilai: '159', satuan: 'Unit', tahun: '2026' },
  { indikator: 'Jumlah Penduduk', opd: 'Dinas Kependudukan', nilai: '236866', satuan: 'Jiwa', tahun: '2026' },
];

const KEC = ['Bebesen', 'Celala', 'Linge', 'Silih Nara'];

describe('normalisasi & pemecahan teks', () => {
  it('titik = pemisah ribuan, koma = desimal (sama dengan uji invarian eval)', () => {
    expect(normalisasiAngka('2.065')).toBe('2065');
    expect(normalisasiAngka('31,4')).toBe('31.4');
    expect(angkaDalamTeks('dari 2.065 record, 31,4 persen')).toEqual(['2065', '31.4']);
  });

  it('kutipan pertanyaan, rujukan peraturan, dan kalimat ketiadaan data dibuang', () => {
    const bersih = bersihkanNarasi(
      'Berdasarkan data SAPA untuk "berapa data tahun 1999?", ditemukan 2 indikator. ' +
        'Tidak ada data untuk tahun 1999 di SAPA. Sesuai UU No. 27/2022, angka ini 31,4 Persen.',
    );
    expect(bersih).not.toMatch(/1999/);
    expect(bersih).not.toMatch(/27\/2022/);
    expect(bersih).toMatch(/31,4/);
  });

  it('daftar bukti dipisah titik koma menjadi klausa sendiri', () => {
    expect(pecahKalimat('Satu 1. Dua 2; Tiga 3.')).toHaveLength(3);
  });

  it('koma PEMISAH memecah klausa, koma DESIMAL tidak', () => {
    const k = pecahKalimat('Angka 892,26 Orang, dengan rincian terbesar pada 8313 Orang.');
    expect(k).toHaveLength(2);
    expect(k[0]).toContain('892,26');
    expect(angkaDalamTeks(k[0])).toContain('892.26');
  });

  it('angka milik baris lain di klausa berikutnya TIDAK dianggap wilayah klausa ini', () => {
    const bukti: BarisBukti[] = [
      { indikator: 'Jumlah Tenaga Kesehatan Puskesmas di Kecamatan Celala', opd: 'Dinas Pendidikan', nilai: '892,26', satuan: 'Orang' },
      { indikator: 'Jumlah Tenaga Kesehatan Puskesmas', opd: 'Dinas Kependudukan', nilai: '8313', satuan: 'Orang' },
    ];
    const narasi =
      'Jumlah Tenaga Kesehatan Puskesmas di Kecamatan Celala tercatat 892,26 Orang, dengan rincian terbesar pada 8313 Orang.';
    const h = periksaPasanganEntitas(narasi, bukti, { kecamatan: ['Celala'] });
    expect(h.temuan.filter((t) => t.jenis === 'entitas-bertabrakan')).toHaveLength(0);
    expect(h.ok).toBe(true);
  });

  it('pemilikAngka menemukan baris dengan nilai sama dan rentang tahun', () => {
    expect(pemilikAngka('29019', BUKTI).map((b) => b.opd)).toEqual(['Dinas Pertanian']);
    expect(pemilikAngka('999', BUKTI)).toHaveLength(0);
    expect(pemilikAngka('2024', [{ indikator: 'X', opd: 'Y', nilai: '2022–2024' }])).toHaveLength(1);
  });

  it('satuanSetelahAngka membaca satuan yang menempel pada angka', () => {
    expect(satuanSetelahAngka('tercatat 29.019 ton pada 2025', '29019')).toBe('ton');
    expect(satuanSetelahAngka('tercatat 29.019 pada 2025', '29019')).toBeNull();
    expect(kataSatuan('Ton/Tahun')).toBe('ton');
  });
});

describe('periksaPasanganEntitas — narasi BENAR lolos', () => {
  it('pasangan lengkap (nilai + satuan + OPD + tahun) tidak menghasilkan temuan', () => {
    const narasi =
      'Jumlah produksi komoditas perkebunan Kopi Arabika 29.019 Ton/Tahun (Dinas Pertanian, 2025). ' +
      'Jumlah ASN 9.588 Pegawai (Sekretariat Daerah, 2026).';
    const h = periksaPasanganEntitas(narasi, BUKTI, { kecamatan: KEC });
    expect(h.temuan).toEqual([]);
    expect(h.ok).toBe(true);
    expect(h.jumlahNilai).toBe(2);
  });

  it('narasi dengan wilayah yang benar untuk angka wilayah lolos', () => {
    const h = periksaPasanganEntitas('Jumlah Koperasi di Kecamatan Bebesen 159 Unit.', BUKTI, { kecamatan: KEC });
    expect(h.ok).toBe(true);
  });

  it('konstanta sistem (jumlah baris bukti) tidak dianggap angka asing', () => {
    const h = periksaPasanganEntitas('Ditemukan 6 indikator terkait.', BUKTI, { nilaiDiizinkan: [6] });
    expect(h.ok).toBe(true);
    expect(h.jumlahNilai).toBe(0);
  });

  it('angka yang ada di LABEL bukti (mis. "Usia 7-12 Tahun") bukan klaim nilai', () => {
    const bukti: BarisBukti[] = [{ indikator: 'Cakupan imunisasi usia 7-12 Tahun', opd: 'Dinas Kesehatan', nilai: '88', satuan: 'Persen' }];
    expect(periksaPasanganEntitas('Cakupan untuk usia 7-12 Tahun sebesar 88 Persen.', bukti).ok).toBe(true);
  });
});

describe('periksaPasanganEntitas — narasi DIRUSAK wajib tertangkap', () => {
  it('nilai benar dipasangkan ke OPD/satuan/tahun milik baris lain ⇒ tertangkap', () => {
    // Inilah deceptive grounding: 29.019 memang ada di bukti, tetapi bukan Jiwa,
    // bukan Dinas Kesehatan, bukan 2024. Grounding lama meloloskannya.
    const narasi = 'Produksi kopi 29.019 Jiwa menurut Dinas Kesehatan pada 2024.';
    const h = periksaPasanganEntitas(narasi, BUKTI, { kecamatan: KEC });
    expect(h.ok).toBe(false);
    expect(h.temuan.some((t) => t.jenis === 'satuan-bertabrakan' && t.diklaim === 'jiwa')).toBe(true);
    expect(h.temuan.find((t) => t.jenis === 'satuan-bertabrakan')?.sebenarnya).toEqual(['satuan Ton/Tahun']);
  });

  it('angka kabupaten dipasangkan ke kecamatan ⇒ entitas-bertabrakan', () => {
    const narasi = 'Prevalensi Stunting di Kecamatan Bebesen mencapai 31,4 Persen.';
    const h = periksaPasanganEntitas(narasi, BUKTI, { kecamatan: KEC });
    const t = h.temuan.find((x) => x.jenis === 'entitas-bertabrakan');
    expect(t).toBeDefined();
    expect(t?.diklaim).toBe('Bebesen');
    expect(t?.sebenarnya).toEqual(['angka tingkat kabupaten (tanpa wilayah)']);
  });

  it('angka milik kecamatan lain dipasangkan ke kecamatan ini ⇒ entitas-bertabrakan', () => {
    const bukti: BarisBukti[] = [
      ...BUKTI,
      { indikator: 'Prevalensi Stunting di Kecamatan Linge', opd: 'Dinas Kesehatan', nilai: '24,9', satuan: 'Persen', tahun: '2025' },
    ];
    const h = periksaPasanganEntitas('Prevalensi Stunting di Kecamatan Bebesen 24,9 Persen.', bukti, { kecamatan: KEC });
    const t = h.temuan.find((x) => x.jenis === 'entitas-bertabrakan');
    expect(t?.sebenarnya).toEqual(['wilayah Linge']);
  });

  it('satuan katalog yang tertukar ("persen" pada nilai bersatuan ton) ⇒ tertangkap', () => {
    const h = periksaPasanganEntitas('Produksi kopi arabika 29.019 persen.', BUKTI, { kecamatan: KEC });
    expect(h.temuan.some((t) => t.jenis === 'satuan-bertabrakan' && t.diklaim === 'persen')).toBe(true);
  });

  it('satuan yang BUKAN kosakata katalog tidak divonis (parafrase wajar, bukan tertukar)', () => {
    const h = periksaPasanganEntitas('Jumlah penduduk 236.866 orang.', BUKTI, { kecamatan: KEC });
    expect(h.temuan.filter((t) => t.jenis === 'satuan-bertabrakan')).toHaveLength(0);
  });

  it('angka dipasangkan ke OPD lain (satu OPD disebut di kalimat) ⇒ opd-bertabrakan', () => {
    // Inilah bentuk paling halus: angka, satuan, dan tahun semuanya benar; hanya
    // penghasil datanya yang ditukar. Gerbang grounding & anti-halu meloloskannya.
    const narasi = 'Jumlah produksi komoditas perkebunan Kopi Arabika 29.019 Ton/Tahun menurut Dinas Kesehatan pada tahun 2025.';
    const h = periksaPasanganEntitas(narasi, BUKTI, { kecamatan: KEC });
    const t = h.temuan.find((x) => x.jenis === 'opd-bertabrakan');
    expect(t).toBeDefined();
    expect(t?.diklaim).toBe('Dinas Kesehatan');
    expect(t?.sebenarnya).toEqual(['penghasil Dinas Pertanian']);
    expect(h.ok).toBe(false);
  });

  it('kalimat yang menyebut BEBERAPA OPD tidak divonis (perbandingan wajar)', () => {
    const narasi =
      'Jumlah produksi komoditas perkebunan Kopi Arabika 29.019 Ton/Tahun (Dinas Pertanian) lebih besar daripada Jumlah ASN 9.588 Pegawai (Sekretariat Daerah).';
    const h = periksaPasanganEntitas(narasi, BUKTI, { kecamatan: KEC });
    expect(h.temuan.filter((t) => t.jenis === 'opd-bertabrakan')).toHaveLength(0);
  });

  it('kata OPD yang berimpit dengan nama indikator BUKAN penyebutan OPD', () => {
    // "komoditas perkebunan" memuat kata "perkebunan" — kata itu juga kunci
    // "Dinas Perkebunan". Tanpa syarat atribusi, narasi yang benar ditolak
    // (terukur 23 Sep 2026: 8 dari 50 keluaran mode AI).
    const kalimat = 'Jumlah produksi komoditas perkebunan Kopi Arabika 29.019 Ton/Tahun';
    expect(atribusiOpd(kalimat, 'dinas perkebunan')).toBe(false);
    expect(periksaPasanganEntitas(kalimat + '.', BUKTI, { kecamatan: KEC }).keras).toBe(0);
  });

  it('atribusiOpd mengenali bentuk baku dan bentuk kata sambung', () => {
    expect(atribusiOpd('29.019 Ton/Tahun (Dinas Pertanian, 2025).', 'dinas pertanian')).toBe(true);
    expect(atribusiOpd('29.019 ton menurut Dinas Pertanian pada 2025.', 'dinas pertanian')).toBe(true);
    expect(atribusiOpd('Dinas Pertanian melaporkan 29.019 ton.', 'dinas pertanian')).toBe(true);
    expect(atribusiOpd('Kami membahas sektor pertanian.', 'dinas pertanian')).toBe(false);
    expect(atribusiOpd('Jumlah produksi komoditas perkebunan 29.019 ton.', 'dinas perkebunan')).toBe(false);
  });

  it('nama OPD bertanda pisah tetap dikenali (kelas palsu kedua, 23 Sep 2026)', () => {
    // "Dinas Kesehatan — Bidang Gizi": tanda pisah membuat pencocokan berbasis
    // regex gagal, sehingga narasi yang BENAR dituduh memasangkan angka ke OPD
    // lain. Sekarang pencocokan memakai bentuk ternormalisasi.
    const kunci = 'dinas kesehatan bidang gizi';
    expect(atribusiOpd('860,37 Kampung (Dinas Kesehatan — Bidang Gizi, tahun tidak tercantum);', kunci)).toBe(true);
    const bukti: BarisBukti[] = [
      { indikator: 'Jumlah Kampung', opd: 'Dinas Kesehatan — Bidang Gizi', nilai: '860,37', satuan: 'Kampung' },
      { indikator: 'Jumlah ASN', opd: 'Dinas Kesehatan', nilai: '9588', satuan: 'Pegawai' },
    ];
    const h = periksaPasanganEntitas('Jumlah Kampung 860,37 Kampung (Dinas Kesehatan — Bidang Gizi, tahun tidak tercantum).', bukti);
    expect(h.temuan.filter((t) => t.jenis === 'opd-bertabrakan')).toHaveLength(0);
  });

  it('kunciOpd memakai nama OPD utuh (bentuk yang benar-benar ditulis narasi)', () => {
    expect(kunciOpd('Dinas Kesehatan')).toBe('dinas kesehatan');
    expect(kunciOpd('Rumah Sakit Umum Daerah Datu Beru')).toBe('rumah sakit umum daerah datu beru');
    expect(kunciOpd('Dinas Pendidikan dan Kebudayaan')).toBe('dinas pendidikan dan kebudayaan');
  });

  it('angka karangan (tidak ada di bukti) ⇒ nilai-tak-ada', () => {
    const h = periksaPasanganEntitas('Jumlah penduduk 999.999 Jiwa.', BUKTI, { kecamatan: KEC });
    expect(h.temuan[0]?.jenis).toBe('nilai-tak-ada');
    expect(h.temuan[0]?.keras).toBe(true);
  });

  it('tahun milik baris lain ⇒ tahun-bertabrakan tetapi LUNASKAN (bukan penolakan)', () => {
    const narasi = 'Jumlah produksi komoditas perkebunan Kopi Arabika 29.019 Ton/Tahun pada tahun 2026.';
    const bukti: BarisBukti[] = [
      ...BUKTI,
      { indikator: 'Jumlah ASN', opd: 'Sekretariat Daerah', nilai: '9588', satuan: 'Pegawai', tahun: '2026' },
    ];
    const h = periksaPasanganEntitas(narasi, bukti, { kecamatan: KEC });
    const t = h.temuan.find((x) => x.jenis === 'tahun-bertabrakan');
    expect(t?.keras).toBe(false);
    expect(h.ok).toBe(true);
    expect(h.lunak).toBe(1);
  });

  it('angka yang dipakai banyak baris tanpa menyebut entitasnya ⇒ nilai-ambigu (lunak)', () => {
    const bukti: BarisBukti[] = [
      { indikator: 'Jumlah Sarana Ibadah Terdata', opd: 'Dinas A', nilai: '88', satuan: 'Unit' },
      { indikator: 'Angka Partisipasi Sekolah', opd: 'Dinas B', nilai: '88', satuan: 'Persen' },
    ];
    const h = periksaPasanganEntitas('Nilainya 88.', bukti);
    expect(h.temuan[0]?.jenis).toBe('nilai-ambigu');
    expect(h.ok).toBe(true);
  });
});

describe('laporan hasil', () => {
  it('penjelasan untuk pengguna bebas angka (aturan prosa FR-12/FR-20)', () => {
    const h = periksaPasanganEntitas('Produksi kopi 29.019 Jiwa.', BUKTI, { kecamatan: KEC });
    const p = penjelasanPemeriksaan(h);
    expect(p).toBeTruthy();
    expect(p).not.toMatch(/\d/);
  });

  it('tidak ada penjelasan bila pemeriksaan bersih', () => {
    expect(penjelasanPemeriksaan(periksaPasanganEntitas('Tidak ada data.', BUKTI))).toBeNull();
  });

  it('ringkasan membatasi jumlah temuan yang dibawa ke balasan API', () => {
    const narasi = Array.from({ length: 12 }, (_, i) => `Angka karangan ${100 + i}.`).join(' ');
    const h = ringkasPemeriksaan(periksaPasanganEntitas(narasi, BUKTI), 5);
    expect(h.temuan).toHaveLength(5);
    expect(h.keras).toBe(12);
    expect(h.ok).toBe(false);
  });
});

// ─── Kosakata kecamatan (dipakai pemeriksa sebagai daftar tertutup) ──────────
describe('daftarKecamatan', () => {
  const rec = (nama: string, opd = 'Dinas X'): SapaRecord =>
    ({
      id: 1,
      id_kode_indikator: 1,
      kode_indikator_kode_indikator: 'k',
      kode_indikator_nama_indikator: nama,
      id_opds: 1,
      opds_nama_opd: opd,
      jadwal_pemutakhiran: 'Tahunan',
      satuan: 'Unit',
      tahun: '2026',
      variabel: '1',
    }) as SapaRecord;

  it('memangkas ekor umum ("Kecamatan Celala Tahun 2025" → "Celala")', () => {
    const daftar = daftarKecamatan([
      rec('Jumlah Keluarga di Kecamatan Celala Tahun 2025'),
      rec('Jumlah Penduduk di Kecamatan Celala'),
      rec('Jumlah Sekolah di Kecamatan Celala Tahun 2026'),
    ]);
    expect(daftar).toContain('Celala');
    expect(daftar).not.toContain('Celala Tahun');
  });

  it('membuang kandidat yang muncul sekali (bukan nama wilayah, melainkan ekor kalimat)', () => {
    const daftar = daftarKecamatan([
      rec('Jumlah Desa di Kecamatan Bebesen'),
      rec('Jumlah Koperasi di Kecamatan Bebesen'),
      rec('Indeks Pembangunan Manusia di Kecamatan Silih Nara Tahun Anggaran'),
    ]);
    expect(daftar).toEqual(['Bebesen']);
  });

  it('kecamatanIndikator mencari wilayah di dalam nama indikator', () => {
    expect(kecamatanIndikator('Jumlah Koperasi di Kecamatan Bebesen', ['Bebesen', 'Linge'])).toEqual(['Bebesen']);
    expect(kecamatanIndikator('Jumlah ASN', ['Bebesen'])).toEqual([]);
  });

  it('daftarKecamatanDariIndikator (bantu uji/harness) sama isinya dengan daftarKecamatan', () => {
    const dinilai = daftarKecamatanDariIndikator([
      'Jumlah Koperasi di Kecamatan Bebesen',
      'Prevalensi Stunting di Kecamatan Bebesen',
    ]);
    const lewatRecord = daftarKecamatan([rec('Jumlah Koperasi di Kecamatan Bebesen'), rec('Prevalensi Stunting di Kecamatan Bebesen')]);
    expect(dinilai).toEqual(lewatRecord);
  });
});
