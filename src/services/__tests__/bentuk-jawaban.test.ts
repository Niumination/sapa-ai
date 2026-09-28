import { afterEach, describe, expect, it } from 'vitest';
import {
  KONTRAK_BENTUK,
  terapkanBentuk,
  NIAT_BERBENTUK,
  angkaDari,
  bentukUntukNiat,
  hitungPorsi,
  susunBaris,
  tampakTotal,
  type BarisBukti,
} from '@/services/bentuk-jawaban';

/**
 * FR-18 — bentuk jawaban per niat.
 *
 * Kriteria terima dokumen 10: **≥ 3 item per niat lulus**. Uji ini memeriksa
 * langsung kontrak bentuknya: urutan, batas baris, visual, kolom turunan, dan
 * catatan kejujuran. Setiap niat berbentuk diuji dengan ≥ 3 keadaan berbeda —
 * termasuk keadaan yang HARUS menghasilkan catatan (bukti tidak cukup).
 */

const baris = (id: number, indikator: string, nilai: string, tahun: string | null = '2024', satuan = 'Persen'): BarisBukti => ({
  id,
  indikator,
  nilai,
  satuan,
  opd: 'Dinas Uji',
  tahun,
});

afterEach(() => {
  delete process.env.SAPA_BENTUK_NIAT;
});

describe('bentuk-jawaban — pembaca angka & total', () => {
  it('membaca nilai SAPA berformat Indonesia', () => {
    expect(angkaDari('1.234,56')).toBeCloseTo(1234.56, 2);
    expect(angkaDari('31,4')).toBeCloseTo(31.4, 2);
    expect(angkaDari('29.019')).toBe(29019);
    expect(angkaDari('—')).toBeNull();
    expect(angkaDari('')).toBeNull();
  });

  it('mengenali baris total tanpa tertukar dengan bagian', () => {
    expect(tampakTotal('Total balita')).toBe(true);
    expect(tampakTotal('Jumlah penduduk')).toBe(true);
    expect(tampakTotal('Balita stunting')).toBe(false);
  });
});

describe('bentuk-jawaban — kontrak dasar per niat', () => {
  it('setiap niat berbentuk punya kontrak lengkap', () => {
    for (const niat of NIAT_BERBENTUK) {
      const k = KONTRAK_BENTUK[niat];
      expect(k.label.length).toBeGreaterThan(3);
      expect(k.visual.length).toBeGreaterThan(2);
      expect(['menurun', 'menaik', 'kronologis', 'tetap']).toContain(k.urutan);
    }
  });
});

// ── TREN (≥ 3 item) ────────────────────────────────────────────────────────
describe('niat "tren" — bentuk garis kronologis', () => {
  const enam = [
    baris(6, 'Prevalensi stunting', '31,4', '2024'),
    baris(1, 'Prevalensi stunting', '24,1', '2019'),
    baris(3, 'Prevalensi stunting', '27,8', '2021'),
    baris(2, 'Prevalensi stunting', '26,3', '2020'),
  ];

  it('1) urutan KRONOLOGIS (bukan menurun — tren harus dibaca menurut waktu)', () => {
    const bentuk = bentukUntukNiat('tren', 'tren stunting 5 tahun', enam);
    const hasil = susunBaris(enam, bentuk);
    expect(bentuk.visual).toBe('garis');
    expect(bentuk.urutan).toBe('kronologis');
    expect(hasil.map((b) => b.tahun)).toEqual(['2019', '2020', '2021', '2024']);
  });

  it('2) tidak dibatasi lima baris — tren butuh seluruh periode', () => {
    const bentuk = bentukUntukNiat('tren', 'tren stunting', enam);
    expect(bentuk.batas).toBeNull();
    expect(susunBaris(enam, bentuk)).toHaveLength(4);
  });

  it('3) bukti hanya satu tahun → CATATAN kejujuran, bukan tren karangan', () => {
    const satu = [baris(9, 'Produksi kopi arabika', '29019', '2025', 'Ton')];
    const bentuk = bentukUntukNiat('tren', 'tren produksi kopi', satu);
    expect(bentuk.catatan).toMatch(/satu titik data/i);
  });

  it('4) tahun kosong/"—" tidak dianggap tahun dan tetap di urutan belakang', () => {
    const campur = [...enam, baris(7, 'Prevalensi stunting', '31,0', null)];
    const hasil = susunBaris(campur, bentukUntukNiat('tren', 'tren', campur));
    expect(hasil[hasil.length - 1].tahun).toBeNull();
  });
});

// ── PERINGKAT (≥ 3 item) ───────────────────────────────────────────────────
describe('niat "peringkat" — bentuk 5 besar terurut', () => {
  const tujuh = [
    baris(1, 'Cakupan imunisasi dasar lengkap', '88,2'),
    baris(2, 'Cakupan air minum layak', '91,4'),
    baris(3, 'Cakupan sanitasi layak', '84,7'),
    baris(4, 'Cakupan kunjungan ibu hamil K4', '96,1'),
    baris(5, 'Cakupan ASI eksklusif', '72,5'),
    baris(6, 'Cakupan balita ditimbang', '92,3'),
    baris(7, 'Cakupan rumah tangga bersih', '79,8'),
  ];

  it('1) "tertinggi" → urut MENURUN dan dipotong 5 baris', () => {
    const bentuk = bentukUntukNiat('peringkat', '5 besar cakupan tertinggi', tujuh);
    const hasil = susunBaris(tujuh, bentuk);
    expect(bentuk.urutan).toBe('menurun');
    expect(bentuk.batas).toBe(5);
    expect(hasil).toHaveLength(5);
    expect(hasil.map((b) => b.nilai)).toEqual(['96,1', '92,3', '91,4', '88,2', '84,7']);
  });

  it('2) "terendah" → urut MENAIK (arah mengikuti pertanyaan)', () => {
    const bentuk = bentukUntukNiat('peringkat', 'cakupan terendah', tujuh);
    const hasil = susunBaris(tujuh, bentuk);
    expect(bentuk.urutan).toBe('menaik');
    expect(bentuk.judul).toMatch(/terendah/i);
    expect(hasil[0].nilai).toBe('72,5');
  });

  it('3) satuan bercampur → CATATAN bahwa peringkat lintas satuan tidak sebanding', () => {
    const campur = [baris(1, 'Produksi kopi', '29019', '2025', 'Ton'), baris(2, 'Prevalensi stunting', '31,4', '2024', 'Persen')];
    const bentuk = bentukUntukNiat('peringkat', 'tertinggi', campur);
    expect(bentuk.catatan).toMatch(/satuan berbeda/i);
  });

  it('4) baris di luar batas TIDAK disembunyikan diam-diam — catatan menyebutkan jumlahnya', () => {
    // Uji ini lahir dari uji yang GAGAL lebih dulu: versi pertama membuang baris
    // ke-6 dan baris tanpa angka tanpa memberi tahu pengguna sama sekali.
    const denganKosong = [...tujuh, baris(8, 'Cakupan tanpa nilai', '—')];
    const bentuk = bentukUntukNiat('peringkat', '5 besar cakupan tertinggi', denganKosong);
    const hasil = susunBaris(denganKosong, bentuk);
    expect(hasil).toHaveLength(5);
    expect(hasil.map((b) => b.id)).not.toContain(8);
    expect(bentuk.catatan).toMatch(/tidak dipajang karena bentuk ini menampilkan maksimum 5 baris/);
    expect(bentuk.catatan).toMatch(/3 baris bukti lain/);
  });
});

// ── KOMPOSISI (≥ 3 item) ───────────────────────────────────────────────────
describe('niat "komposisi" — porsi hanya bila totalnya ADA', () => {
  const denganTotal = [baris(1, 'Total balita', '10000', '2024', 'Jiwa'), baris(2, 'Balita stunting', '3140', '2024', 'Jiwa'), baris(3, 'Balita imunisasi lengkap', '8820', '2024', 'Jiwa')];
  const tanpaTotal = [baris(2, 'Balita stunting', '3140', '2024', 'Jiwa'), baris(3, 'Balita imunisasi lengkap', '8820', '2024', 'Jiwa')];

  it('1) ada baris total → kolom porsi dihitung dari total itu', () => {
    const bentuk = bentukUntukNiat('komposisi', 'komposisi balita', denganTotal);
    expect(bentuk.kolomTurunan).toBe('porsi');
    expect(bentuk.catatan).toBeUndefined();
    const porsi = hitungPorsi(denganTotal)!;
    expect(porsi.get(2)).toBeCloseTo(31.4, 1);
    expect(porsi.get(3)).toBeCloseTo(88.2, 1);
  });

  it('2) tidak ada total → TIDAK menghitung, dan mengatakannya terus terang', () => {
    const bentuk = bentukUntukNiat('komposisi', 'komposisi balita', tanpaTotal);
    expect(bentuk.kolomTurunan).toBeNull();
    expect(hitungPorsi(tanpaTotal)).toBeNull();
    expect(bentuk.catatan).toMatch(/total keseluruhan tidak ada/i);
  });

  it('3) baris total tidak diberi porsi (tidak dibandingkan dengan dirinya sendiri)', () => {
    const porsi = hitungPorsi(denganTotal)!;
    expect(porsi.has(1)).toBe(false);
  });

  it('3b) semua baris tampak total → kolom porsi DIMATIKAN (bukan mengirim {}) + catatan', () => {
    // Kasus nyata pada korpus 1.210 record: seluruh baris terambil bernama
    // "Jumlah ..." — dahulu ini menghasilkan `porsi: {}` yang menyesatkan.
    const semuaTotal = [baris(1, 'Jumlah penduduk', '236866', '2024', 'Jiwa'), baris(2, 'Jumlah data penduduk', '236866', '2024', 'Jiwa')];
    const bentuk = bentukUntukNiat('komposisi', 'komposisi penduduk', semuaTotal);
    expect(bentuk.kolomTurunan).toBeNull();
    expect(bentuk.catatan).toMatch(/semua baris bukti tampak sebagai total/i);
    const { porsi } = terapkanBentuk('komposisi', 'komposisi penduduk', semuaTotal);
    expect(porsi).toBeNull();
  });

  it('4) total di bawah bagian (data aneh) → memakai total terbesar, bukan menjumlahkan sendiri', () => {
    const aneh = [baris(1, 'Total balita', '500', '2024', 'Jiwa'), baris(2, 'Total balita kabupaten', '10000', '2024', 'Jiwa'), baris(3, 'Balita stunting', '3000', '2024', 'Jiwa')];
    const porsi = hitungPorsi(aneh)!;
    expect(porsi.get(3)).toBeCloseTo(30, 1);
  });
});

// ── DISTRIBUSI, PERBANDINGAN, NILAI SAAT INI (≥ 3 item) ────────────────────
describe('niat "distribusi"', () => {
  const sebaran = [baris(1, 'Penduduk Kecamatan Bebesen', '21840', '2024', 'Jiwa'), baris(2, 'Penduduk Kecamatan Bies', '12460', '2024', 'Jiwa'), baris(3, 'Penduduk Kecamatan Pegasing', '9870', '2024', 'Jiwa')];

  it('1) visual batang, urut menurun', () => {
    const bentuk = bentukUntukNiat('distribusi', 'sebaran penduduk per kecamatan', sebaran);
    expect(bentuk.visual).toBe('batang');
    expect(bentuk.urutan).toBe('menurun');
  });
  it('2) maksimum sepuluh kelompok dipajang', () => {
    const banyak = Array.from({ length: 24 }, (_, k) => baris(k + 1, `Penduduk Kecamatan Uji ${k + 1}`, String(1000 + k * 10), '2024', 'Jiwa'));
    expect(susunBaris(banyak, bentukUntukNiat('distribusi', 'sebaran', banyak))).toHaveLength(10);
  });
  it('3) bukti hanya 1–2 kelompok → CATATAN sebaran belum mewakili', () => {
    expect(bentukUntukNiat('distribusi', 'sebaran', sebaran.slice(0, 2)).catatan).toMatch(/sedikit kelompok/i);
  });
});

describe('niat "perbandingan"', () => {
  const dua = [baris(1, 'Angka partisipasi sekolah jenjang SMA', '74,2'), baris(2, 'Angka partisipasi sekolah jenjang SMA', '68,9')];

  it('1) visual tabel berdampingan, urutan tetap (tidak mengarang siapa lebih baik)', () => {
    const bentuk = bentukUntukNiat('perbandingan', 'bandingkan angka partisipasi sekolah', dua);
    expect(bentuk.visual).toBe('tabel');
    expect(bentuk.urutan).toBe('tetap');
    expect(susunBaris(dua, bentuk).map((b) => b.id)).toEqual([1, 2]);
  });
  it('2) maksimum lima baris', () => {
    expect(bentukUntukNiat('perbandingan', 'bandingkan', dua).batas).toBe(5);
  });
  it('3) bukti kurang dari dua nilai → CATATAN perbandingan tidak dapat disusun', () => {
    expect(bentukUntukNiat('perbandingan', 'bandingkan', dua.slice(0, 1)).catatan).toMatch(/kurang dari dua/i);
  });
});

describe('niat "nilai_saat_ini"', () => {
  const satu = [baris(1, 'Indeks Pembangunan Manusia', '78,09', '2025', 'Poin')];

  it('1) visual metric, urutan tetap', () => {
    const bentuk = bentukUntukNiat('nilai_saat_ini', 'berapa IPM Aceh Tengah?', satu);
    expect(bentuk.visual).toBe('metric');
    expect(bentuk.urutan).toBe('tetap');
  });
  it('2) tanpa catatan (bentuk selalu dapat dipenuhi)', () => {
    expect(bentukUntukNiat('nilai_saat_ini', 'IPM', satu).catatan).toBeUndefined();
  });
  it('3) niat null diperlakukan sebagai nilai_saat_ini, bukan gagal', () => {
    expect(bentukUntukNiat(null, 'IPM', satu).visual).toBe('metric');
  });
});

// ── Meta, sebab, personal: bentuk khusus + catatan kejujuran ──────────────
describe('niat yang bukan bentuk data (meta_katalog, sebab, personal)', () => {
  it('sebab: selalu membawa catatan bahwa SAPA tidak menyimpan sebab', () => {
    const bentuk = bentukUntukNiat('sebab', 'kenapa stunting tinggi?', [baris(1, 'Prevalensi stunting', '31,4')]);
    // P10: catatan harus menyebut batas sebab-akibat, konteks terdekat, dan sitasi per klaim.
    expect(bentuk.catatan).toMatch(/tidak menyimpan.*sebab|bukan.*sebab/i);
    expect(bentuk.catatan).toMatch(/konteks terdekat|bukan bukti sebab/i);
    expect(bentuk.catatan).toMatch(/kajian OPD|kajian akademik/i);
    expect(bentuk.catatan).toMatch(/\[n\]|sitasi|FR-19/i);
  });
  it('personal: batas 0 (tidak ada bukti per orang yang dipajang)', () => {
    const bentuk = bentukUntukNiat('personal', 'data per orang', []);
    expect(bentuk.batas).toBe(0);
  });
  it('meta_katalog: bentuk teks tanpa pemotongan', () => {
    const bentuk = bentukUntukNiat('meta_katalog', 'ada berapa indikator?', []);
    expect(bentuk.visual).toBe('teks');
    expect(bentuk.batas).toBeNull();
  });
});

// ── Kontrol negatif: bentuk wajib bergantung pada niat ────────────────────
describe('kontrol negatif — SAPA_BENTUK_NIAT=off', () => {
  it('semua niat menjadi bentuk NETRAL (dipakai harness untuk membuktikan uji tidak vakum)', () => {
    process.env.SAPA_BENTUK_NIAT = 'off';
    const tujuh = Array.from({ length: 7 }, (_, k) => baris(k + 1, `Cakupan ${k + 1}`, String(70 + k)));
    const bentuk = bentukUntukNiat('peringkat', '5 besar cakupan tertinggi', tujuh);
    expect(bentuk.visual).toBe('teks');
    expect(bentuk.urutan).toBe('tetap');
    expect(bentuk.batas).toBeNull();
    expect(susunBaris(tujuh, bentuk)).toHaveLength(7);
    // dan terbalik: tanpa flag, bentuknya menurun & terpotong
    delete process.env.SAPA_BENTUK_NIAT;
    const normal = bentukUntukNiat('peringkat', '5 besar cakupan tertinggi', tujuh);
    expect(normal.urutan).toBe('menurun');
    expect(susunBaris(tujuh, normal)).toHaveLength(5);
  });
});
