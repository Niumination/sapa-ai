import { describe, it, expect } from 'vitest';
import { deteksiMetaIntent, tahunDalamQuery } from '../intent-meta';

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
