import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DITINJAU_PADA,
  KAMUS_DAERAH,
  SUDAH_ADA_DI_KATALOG,
  TINJAUAN_BERIKUTNYA,
  kamusDimatikan,
  normalkanDaerah,
  statusTinjauan,
  terapkanFrasaDaerah,
} from '@/lib/kamus-daerah';
import { tokenizeQuery } from '@/lib/sapa-client';

/**
 * DS-05 — kamus sinonim daerah.
 *
 * Kriteria terima dokumen 10: **≥ 50 entri** dan **tiap 3 bulan ditinjau**.
 * Uji ini menjaga tiga hal yang mudah rusak tanpa disadari:
 *   1. angka & kelengkapan entri (termasuk tenggat tinjauan yang benar-benar berlaku);
 *   2. KEAMANAN: tidak ada kata kamus yang sudah ada di katalog — memetakannya
 *      justru menyesatkan penelusuran;
 *   3. MANFAAT: setiap kata benar-benar menghasilkan token katalog setelah
 *      `tokenizeQuery` (bukan entri mati yang tidak pernah menolong siapa pun).
 */

type BarisKorpus = { kode_indikator_nama_indikator?: string };
const korpus = JSON.parse(
  readFileSync(join(process.cwd(), 'verifikasi', 'korpus-uji-besar.json'), 'utf8'),
) as { data: BarisKorpus[] };
const namaIndikator = [...new Set(korpus.data.map((r) => String(r.kode_indikator_nama_indikator ?? '').trim()))];

const memuat = (teks: string, kata: string) =>
  new RegExp(`(?<![a-z0-9])${kata.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(teks);

afterEach(() => {
  delete process.env.SAPA_KAMUS_DAERAH;
});

describe('kamus daerah — jumlah & kelengkapan entri', () => {
  it('memenuhi kriteria dokumen 10: ≥ 50 entri', () => {
    expect(KAMUS_DAERAH.length).toBeGreaterThanOrEqual(50);
  });

  it('kata kunci unik dan setiap entri lengkap (arti + sumber + padanan)', () => {
    const kata = KAMUS_DAERAH.map((e) => e.kata);
    expect(new Set(kata).size).toBe(kata.length);
    for (const e of KAMUS_DAERAH) {
      expect(e.kata.length).toBeGreaterThan(1);
      expect(e.arti.length).toBeGreaterThanOrEqual(3);
      expect(e.sumber.length).toBeGreaterThan(5);
      expect(e.padanan.length).toBeGreaterThan(0);
      // Padanan tidak boleh menunjuk dirinya sendiri (entri mati).
      expect(e.padanan).not.toContain(e.kata);
    }
  });

  it('setiap entri punya padanan yang benar-benar ada di katalog (dfProduksi > 0)', () => {
    for (const e of KAMUS_DAERAH) {
      const df = Object.values(e.dfProduksi);
      expect(df.length, `dfProduksi kosong: ${e.kata}`).toBe(e.padanan.length);
      expect(Math.max(...df), `semua padanan df=0: ${e.kata}`).toBeGreaterThan(0);
    }
  });
});

describe('kamus daerah — keamanan (aturan yang menjaga penelusuran)', () => {
  it('tidak ada kata kamus yang muncul di nama indikator katalog', () => {
    const bentrok = KAMUS_DAERAH.filter((e) => namaIndikator.some((n) => memuat(n, e.kata)));
    expect(bentrok.map((e) => e.kata)).toEqual([]);
  });

  it('istilah yang sudah ada di katalog dicatat, bukan dipetakan', () => {
    // Doc 10 menyebut meugang, mustahik, PPKBD sebagai contoh — semuanya sudah ada
    // di katalog, jadi pemetaannya justru berbahaya. Pastikan catatannya hidup.
    const tercatat = SUDAH_ADA_DI_KATALOG.map((s) => s.kata);
    for (const contoh of ['meugang', 'mustahik', 'ppkbd']) {
      expect(tercatat).toContain(contoh);
      expect(KAMUS_DAERAH.map((e) => e.kata)).not.toContain(contoh);
    }
    // Catatan itu harus benar: istilah tersebut memang ada di katalog korpus uji
    // ATAU terukur ada di produksi (dfProduksi > 0 dicatat saat kurasi).
    for (const s of SUDAH_ADA_DI_KATALOG) {
      const adaDiKorpusUji = namaIndikator.some((n) => memuat(n, s.kata));
      expect(adaDiKorpusUji || s.dfProduksi > 0, `klaim df tidak berdasar: ${s.kata}`).toBe(true);
      expect(s.catatan.length).toBeGreaterThan(10);
    }
  });

  it('klaim "terbuktiKorpusUji" tidak boleh berbohong (diuji ke korpus nyata)', () => {
    for (const e of KAMUS_DAERAH) {
      const terbuktiNyata = e.padanan.some((p) => namaIndikator.some((n) => memuat(n, p)));
      expect(e.terbuktiKorpusUji, `klaim terbuktiKorpusUji salah: ${e.kata}`).toBe(terbuktiNyata);
    }
    // dan minimal sepertiga entri memang terbukti di korpus uji (bisa diuji end-to-end)
    expect(KAMUS_DAERAH.filter((e) => e.terbuktiKorpusUji).length).toBeGreaterThanOrEqual(30);
  });
});

describe('kamus daerah — manfaat (bukan entri mati)', () => {
  it('setiap kata menghasilkan token katalog setelah tokenizeQuery', () => {
    const mati: string[] = [];
    for (const e of KAMUS_DAERAH) {
      const token = tokenizeQuery(e.kata);
      if (!e.padanan.some((p) => token.includes(p))) mati.push(`${e.kata} → ${JSON.stringify(token)}`);
    }
    expect(mati).toEqual([]);
  });

  it('frasa daerah dipetakan sebelum pemotongan token', () => {
    expect(tokenizeQuery('berapa jumlah gampong di kecamatan')).toEqual(['desa', 'kecamatan']);
    expect(terapkanFrasaDaerah('berapa tuha peut di gampong')).toContain('lembaga desa');
    expect(tokenizeQuery('jumlah tuha peut')).toEqual(['lembaga', 'desa']);
  });

  it('kata daerah khas Aceh menemukan kata katalognya', () => {
    expect(tokenizeQuery('peukan')).toEqual(['pasar']);
    expect(tokenizeQuery('pade')).toEqual(['padi']);
    expect(tokenizeQuery('krueng')).toEqual(['sungai', 'air']);
    expect(tokenizeQuery('bansos')).toEqual(['bantuan', 'sosial']);
  });
});

describe('kamus daerah — kontrol negatif & tenggat tinjauan', () => {
  it('SAPA_KAMUS_DAERAH=off mematikan pemetaan (hasil kembali seperti sebelum DS-05)', () => {
    expect(kamusDimatikan()).toBe(false);
    process.env.SAPA_KAMUS_DAERAH = 'off';
    expect(kamusDimatikan()).toBe(true);
    expect(normalkanDaerah('gampong')).toEqual(['gampong']);
    expect(terapkanFrasaDaerah('jumlah tuha peut')).toBe('jumlah tuha peut');
    expect(tokenizeQuery('jumlah gampong')).toEqual(['gampong']);
  });

  it('tenggat tinjauan 3 bulan benar-benar berlaku (bukan hiasan)', () => {
    const sebelum = statusTinjauan(new Date(`${TINJAUAN_BERIKUTNYA}T00:00:00Z`));
    expect(sebelum.lewatTenggat).toBe(false);
    expect(sebelum.hariTersisa).toBe(0);
    const sehariSetelah = statusTinjauan(new Date(Date.parse(`${TINJAUAN_BERIKUTNYA}T00:00:00Z`) + 86_400_000));
    expect(sehariSetelah.lewatTenggat).toBe(true);
    expect(sehariSetelah.hariTersisa).toBe(-1);
    expect(Date.parse(`${TINJAUAN_BERIKUTNYA}T00:00:00Z`)).toBeGreaterThan(Date.parse(`${DITINJAU_PADA}T00:00:00Z`));
  });
});

describe('kamus daerah — tidak mengubah kueri yang tidak memakai istilah daerah', () => {
  it('90 item set evaluasi: token dengan & tanpa kamus IDENTIK (bukti nol dampak samping)', () => {
    const evalSet = JSON.parse(readFileSync(join(process.cwd(), 'data', 'eval-set.json'), 'utf8')) as {
      item: Array<{ id: string; pertanyaan: string }>;
    };
    const menyentuhKamus: string[] = [];
    const berbeda: string[] = [];
    for (const item of evalSet.item) {
      const kata = item.pertanyaan.toLowerCase().split(/[^a-z0-9\u00c0-\u024f]+/);
      const kena = kata.some((w) => KAMUS_DAERAH.some((e) => e.kata === w));
      if (kena) menyentuhKamus.push(item.id);
      process.env.SAPA_KAMUS_DAERAH = 'off';
      const tanpaKamus = tokenizeQuery(item.pertanyaan);
      delete process.env.SAPA_KAMUS_DAERAH;
      const denganKamus = tokenizeQuery(item.pertanyaan);
      if (JSON.stringify(tanpaKamus) !== JSON.stringify(denganKamus)) berbeda.push(item.id);
    }
    // Kueri yang tidak memakai istilah daerah WAJIB menghasilkan token sama persis.
    // Yang memakai istilah daerah boleh berbeda — itu memang gunanya kamus.
    const bedaTidakSah = berbeda.filter((id) => !menyentuhKamus.includes(id));
    expect(bedaTidakSah).toEqual([]);
    // Dan buktinya kamus memang menyentuh sebagian kecil set evaluasi (bukan semuanya).
    expect(menyentuhKamus.length).toBeLessThanOrEqual(3);
  });
});
