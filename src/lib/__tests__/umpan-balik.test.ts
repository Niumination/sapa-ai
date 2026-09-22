// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
// ─── Uji FR-26: penyimpanan umpan balik + notis transparansi ──────────────────
// Uji ini adalah pagar privasi SELURUH kanal koreksi: bila seseorang melonggarkan
// `bersihkanPertanyaan`, laporan warga bisa membawa NIK/nomor telepon ke dasbor.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ambilUmpan,
  catatUmpan,
  jenisSah,
  LABEL_JENIS,
  JENIS_UMPAN,
  MAKS_HARIAN,
  teksNotis,
} from '../umpan-balik';
import { __clearLocalStore } from '../store';

beforeEach(() => {
  __clearLocalStore();
  vi.unstubAllEnvs();
});

describe('catatUmpan', () => {
  it('menyimpan laporan biasa dan menambah hitungan bila laporan sama diulang', async () => {
    const a = await catatUmpan({ jenis: 'angka-salah', catatan: 'angka pada indikator kopi keliru', pertanyaan: 'berapa produksi kopi' });
    expect(a.tersimpan).toBe(true);
    const b = await catatUmpan({ jenis: 'angka-salah', catatan: 'angka pada indikator kopi keliru', pertanyaan: 'berapa produksi kopi' });
    expect(b.tersimpan).toBe(true);
    const ringkas = await ambilUmpan();
    expect(ringkas.item).toHaveLength(1);
    expect(ringkas.item[0].jumlah).toBe(2);
    expect(ringkas.total).toBe(2);
  });

  it('laporan dengan jenis berbeda disimpan terpisah walau teksnya sama', async () => {
    await catatUmpan({ jenis: 'angka-salah', catatan: 'indikator kopi' });
    await catatUmpan({ jenis: 'satuan-salah', catatan: 'indikator kopi' });
    expect((await ambilUmpan()).item).toHaveLength(2);
  });

  it('MEMBUANG seluruh angka dari catatan maupun pertanyaan — NIK & telepon tidak tersimpan', async () => {
    await catatUmpan({
      jenis: 'angka-salah',
      catatan: 'NIK 1171012304950003 hub 081234567890 angka salah',
      pertanyaan: 'berapa jumlah penduduk tahun 2026',
    });
    const item = (await ambilUmpan()).item[0];
    expect(item.catatan).not.toMatch(/\d/);
    expect(item.pertanyaan).not.toMatch(/\d/);
    expect(item.catatan).toBe('nik hub angka salah');
    expect(item.pertanyaan).toBe('berapa jumlah penduduk tahun');
    const mentah = JSON.stringify(await ambilUmpan());
    expect(mentah).not.toContain('1171012304950003');
    expect(mentah).not.toContain('081234567890');
  });

  it('laporan tanpa isi apa pun ditolak sebagai kosong (bukan disimpan sebagai sampah)', async () => {
    const hasil = await catatUmpan({ jenis: 'lainnya', catatan: '   ', pertanyaan: '12345' });
    expect(hasil.tersimpan).toBe(false);
    expect(hasil.alasan).toBe('kosong');
    expect((await ambilUmpan()).item).toHaveLength(0);
  });

  it('kuota harian global membatasi penyalahgunaan kanal publik', async () => {
    // Isi kuota sampai tepat di batas, lalu satu laporan berikutnya harus ditolak.
    for (let i = 0; i < MAKS_HARIAN; i++) {
      await catatUmpan({ jenis: 'lainnya', catatan: `laporan ke ${i}` });
    }
    const lanjut = await catatUmpan({ jenis: 'lainnya', catatan: 'laporan sesudah kuota' });
    expect(lanjut.tersimpan).toBe(false);
    expect(lanjut.alasan).toBe('kuota');
  });

  it('isi laporan dibatasi panjangnya (140 aksara)', async () => {
    await catatUmpan({ jenis: 'lainnya', catatan: 'x'.repeat(400) });
    expect((await ambilUmpan()).item[0].catatan.length).toBeLessThanOrEqual(140);
  });

  it('ringkasan menyertakan minggu berjalan dan backend penyimpanan', async () => {
    await catatUmpan({ jenis: 'lainnya', catatan: 'saran indikator baru' });
    const ringkas = await ambilUmpan();
    expect(ringkas.minggu).toMatch(/^\d{4}-W\d{2}$/);
    expect(ringkas.backend).toBe('memory');
  });
});

describe('jenisSah & label', () => {
  it('menerima hanya jenis yang terdaftar', () => {
    expect(jenisSah('angka-salah')).toBe(true);
    expect(jenisSah('lainnya')).toBe(true);
    expect(jenisSah('apa-saja')).toBe(false);
    expect(jenisSah(null)).toBe(false);
    expect(jenisSah(123)).toBe(false);
  });

  it('setiap jenis punya label manusiawi (borang & dasbor memakai sumber yang sama)', () => {
    for (const j of JENIS_UMPAN) {
      expect(typeof LABEL_JENIS[j]).toBe('string');
      expect(LABEL_JENIS[j].length).toBeGreaterThan(3);
    }
  });
});

describe('teksNotis — kejujuran mode', () => {
  it('mode AI menyebut narasi disusun model, dengan gerbang bukti', () => {
    const notis = teksNotis({ used: true, grounded: 'pass' });
    expect(notis.mode).toBe('ai');
    expect(notis.paragraf[0]).toContain('AI');
    expect(notis.paragraf[0]).toContain('gerbang bukti');
  });

  it('tanpa AI TIDAK mengaku disusun AI (langganan habis / AI mati)', () => {
    const notis = teksNotis({ used: false, grounded: 'skipped' });
    expect(notis.mode).toBe('template');
    expect(notis.paragraf[0]).toContain('tanpa AI');
    expect(notis.paragraf[0]).not.toContain('model bahasa');
  });

  it('saat usulan AI ditolak gerbang, notis menjelaskannya dan menegaskan sumber data resmi', () => {
    const notis = teksNotis({ used: false, grounded: 'replaced' });
    expect(notis.mode).toBe('template');
    expect(notis.paragraf[0]).toContain('ditolak gerbang bukti');
  });

  it('sebelum ada jawaban, notis menjelaskan cara kerja umum — TIDAK mengklaim jawaban tanpa AI', () => {
    const notis = teksNotis(null);
    expect(notis.mode).toBe('umum');
    expect(notis.paragraf[0]).toContain('Cara kerja jawaban');
    expect(notis.paragraf[0]).not.toContain('Narasi jawaban ini');
  });

  it('selalu menyebut sumber angka dan kanal koreksi', () => {
    for (const ai of [null, { used: true }, { used: false, grounded: 'replaced' }]) {
      const notis = teksNotis(ai as never);
      const gabung = notis.paragraf.join(' ');
      expect(gabung).toContain('SPLP');
      expect(gabung).toContain('laporkan');
    }
  });
});
