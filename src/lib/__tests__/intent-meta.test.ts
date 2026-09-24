// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah nomor identitas PALSU untuk menguji pagar data pribadi.
import { describe, it, expect } from 'vitest';
import { deteksiMetaIntent, tahunDalamQuery, deteksiNiat } from '../intent-meta';

describe('deteksiMetaIntent — pertanyaan skala katalog', () => {
  it('menangkap "Berapa OPD yang melaporkan data?" (kasus M1)', () => {
    expect(deteksiMetaIntent('Berapa OPD yang melaporkan data?')?.jenis).toBe('opd');
  });

  it('menangkap variasi singkatan pengguna: "brp jmlh OPD yg kirim data"', () => {
    expect(deteksiMetaIntent('brp jmlh OPD yg kirim data')?.jenis).toBe('opd');
  });

  it('menangkap pertanyaan ukuran katalog (record / indikator)', () => {
    expect(deteksiMetaIntent('Berapa total data indikator di portal SAPA?')?.jenis).toBe('katalog');
    expect(deteksiMetaIntent('jumlah record di SAPA berapa')?.jenis).toBe('katalog');
  });

  it('menangkap sebaran menurut tahun', () => {
    expect(deteksiMetaIntent('Bagaimana sebaran data menurut tahun?')?.jenis).toBe('tahun');
  });

  it('"menurut tahun" menang atas ukuran katalog (temuan EV-05)', () => {
    // Dulu "sebaran jumlah record … menurut tahun" dijawab dengan ringkasan
    // katalog (2.065 record / 38 OPD), padahal katalog menyimpan pecahan tahun.
    expect(deteksiMetaIntent('Bagaimana sebaran jumlah record SAPA menurut tahun?')?.jenis)
      .toBe('tahun');
    expect(deteksiMetaIntent('Berapa jumlah record SAPA menurut tahun?')?.jenis).toBe('tahun');
    // Tanpa kata tahun, ukuran katalog tetap seperti semula.
    expect(deteksiMetaIntent('Berapa jumlah record di portal SAPA?')?.jenis).toBe('katalog');
  });
});

describe('deteksiNiat — permintaan data per-orang (EV-05)', () => {
  it('mengenali permintaan identitas/alamat, bukan hanya "nama warga tertentu"', () => {
    for (const q of [
      'Siapa nama penerima bantuan sosial PKH di Desa Kemili?',
      'Tampilkan daftar nama warga yang menerima bantuan sembako di Kecamatan Ketol',
      'Sebutkan NIK dan alamat petani penerima bantuan di Kecamatan Bebesen',
      'Cari data NIK 1234567890123456',
    ]) {
      expect(deteksiNiat(q).niat, q).toBe('personal');
    }
  });

  it('tidak menyerobot pertanyaan agregat yang menyebut nama indikator', () => {
    expect(deteksiNiat('Berapa jumlah penerima bantuan sosial PKH di Aceh Tengah?').niat).not.toBe('personal');
    expect(deteksiNiat('Sebutkan nama indikator dengan nilai tertinggi').niat).not.toBe('personal');
  });
});

describe('deteksiMetaIntent — penolakan (lebih penting daripada tangkapan)', () => {
  it('menolak pertanyaan yang menyebut OPD tertentu', () => {
    const opd = ['Dinas Kesehatan', 'Dinas Pendidikan'];
    expect(deteksiMetaIntent('Berapa jumlah data Dinas Kesehatan?', opd)).toBeNull();
    expect(deteksiMetaIntent('berapa jumlah opd di Dinas Pendidikan', opd)).toBeNull();
  });

  it('menolak pertanyaan tentang isi data, bukan ukuran katalog', () => {
    expect(deteksiMetaIntent('Berapa jumlah pegawai Dinas Kesehatan?')).toBeNull();
    expect(deteksiMetaIntent('Berapa jumlah penduduk Aceh Tengah 2025?')).toBeNull();
    expect(deteksiMetaIntent('Berapa jumlah balita stunting?')).toBeNull();
    expect(deteksiMetaIntent('Berapa jumlah kopi arabika yang diproduksi?')).toBeNull();
  });

  it('menolak pertanyaan yang butuh perhitungan (persen)', () => {
    expect(deteksiMetaIntent('Berapa persen record yang tidak mencantumkan tahun?')).toBeNull();
  });

  it('menolak pertanyaan penjelasan tanpa kata ukuran', () => {
    expect(deteksiMetaIntent('Indikator apa saja yang punya deret multi-tahun?')).toBeNull();
    expect(deteksiMetaIntent('Sumber data apa saja yang dipakai sistem ini?')).toBeNull();
    expect(deteksiMetaIntent('Bagaimana sebaran penerima PPKS per kriteria?')).toBeNull();
  });

  it('menolak pertanyaan panjang (bukan pertanyaan meta)', () => {
    expect(
      deteksiMetaIntent(
        'Saya ingin tahu berapa total data yang ada di portal SAPA beserta rincian per OPD dan per tahun serta perbandingannya',
      ),
    ).toBeNull();
  });
});

describe('tahunDalamQuery', () => {
  it('mengambil tahun yang diketik pengguna', () => {
    expect(tahunDalamQuery('data stunting 2024 dan 2025')).toEqual(['2024', '2025']);
  });
});

describe('deteksiNiat — router bentuk jawaban', () => {
  it('mengenali tren, termasuk penanda bilangan tahun', () => {
    expect(deteksiNiat('Bagaimana tren stunting 2023-2025?').niat).toBe('tren');
    expect(deteksiNiat('perkembangan kemiskinan dari tahun ke tahun').niat).toBe('tren');
  });

  it('mengenali perbandingan', () => {
    expect(deteksiNiat('Bandingkan IPM dengan target nasional').niat).toBe('perbandingan');
    expect(deteksiNiat('pendapatan vs pengeluaran rumah tangga').niat).toBe('perbandingan');
  });

  it('mengenali peringkat, komposisi, dan sebaran', () => {
    expect(deteksiNiat('kecamatan dengan koperasi terbanyak').niat).toBe('peringkat');
    expect(deteksiNiat('komposisi anggaran menurut jenis belanja').niat).toBe('komposisi');
    expect(deteksiNiat('sebaran penerima bantuan per kecamatan').niat).toBe('distribusi');
  });

  it('mengenali sebab-akibat dan permintaan data per orang', () => {
    expect(deteksiNiat('Apa penyebab utama stunting di Aceh Tengah?').niat).toBe('sebab');
    expect(deteksiNiat('data per orang penerima bantuan').niat).toBe('personal');
  });

  it('jatuh ke nilai_saat_ini bila tidak ada penanda bentuk', () => {
    expect(deteksiNiat('Berapa jumlah ASN Aceh Tengah?').niat).toBe('nilai_saat_ini');
    expect(deteksiNiat('jumlah produksi kopi arabika').niat).toBe('nilai_saat_ini');
  });

  it('pendeteksiCausePemicu: sebab lebih spesifik daripada tren', () => {
    const h = deteksiNiat('mengapa angka kemiskinan menurun?');
    expect(h.niat).toBe('sebab');
    expect(h.pemicu.join(' ')).toContain('sebab-akibat');
  });
});
