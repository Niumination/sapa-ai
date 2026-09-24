import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DITINJAU_PADA,
  KLAIM_TERLARANG,
  TINJAUAN_BERIKUTNYA,
  VERSI_KETERBUKAAN,
  kalimatKeadaan,
  klaimTerlarang,
  pengungkapanAi,
  semuaTeks,
  statusTinjauan,
  type RingkasAiRuntime,
} from '@/lib/keterbukaan-ai';
import { teksNotis } from '@/lib/umpan-balik';

/**
 * CMP-02 — keterbukaan penggunaan AI.
 *
 * Uji ini menjaga tiga hal yang mudah rusak tanpa terlihat:
 *   1. KEJUJURAN KEADAAN: teks wajib mengikuti status nyata (aktif/bayangan/mati),
 *      termasuk saat penyedia gagal menjawab.
 *   2. TIDAK MENGARANG FAKTA: penyedia/model yang tidak diketahui ditulis apa adanya.
 *   3. KELENGKAPAN UNSUR: unsur yang dituntut SE Menkominfo 9/2023 ada semua —
 *      keterbukaan, akuntabilitas manusia, data yang keluar, keterbatasan, kanal koreksi.
 * Dan satu uji SABOTASE supaya pemeriksa klaim tidak vakum (kalau pemeriksaannya
 * dimatikan, uji ini gagal).
 */

const DASAR: RingkasAiRuntime = {
  keadaan: 'mati',
  penyedia: null,
  model: null,
  hosPenyedia: null,
  alasan: 'AI_ENABLED tidak diset',
  terjangkau: null,
  gagalBerturut: 0,
  sebabTerakhir: null,
  saklarAi: true,
};

const AKTIF: RingkasAiRuntime = {
  keadaan: 'aktif',
  penyedia: 'custom',
  model: 'model-uji',
  hosPenyedia: '127.0.0.1:8787',
  alasan: null,
  terjangkau: true,
  gagalBerturut: 0,
  sebabTerakhir: null,
  saklarAi: true,
};

describe('CMP-02 — struktur keterbukaan', () => {
  it('memuat seluruh bagian yang dituntut, id unik, dan isinya tidak kosong', () => {
    const k = pengungkapanAi(AKTIF);
    const id = k.bagian.map((b) => b.id);
    expect(new Set(id).size).toBe(id.length);
    for (const wajib of [
      'peran-ai',
      'keadaan-sekarang',
      'kendali-manusia',
      'data-dan-privasi',
      'keterbatasan',
      'hak-dan-koreksi',
      'riwayat-notis',
    ]) {
      expect(id).toContain(wajib);
    }
    for (const b of k.bagian) {
      expect(b.judul.length).toBeGreaterThan(3);
      expect(b.isi.length).toBeGreaterThan(0);
      for (const p of b.isi) expect(p.trim().length).toBeGreaterThan(10);
    }
    expect(k.versi).toBe(VERSI_KETERBUKAAN);
    expect(k.ditinjauPada).toBe(DITINJAU_PADA);
  });

  it('menyebut unsur inti SE Menkominfo 9/2023: gerbang bukti, penanggung jawab, kanal lapor, privasi', () => {
    const teks = semuaTeks(pengungkapanAi(AKTIF)).join(' ').toLowerCase();
    expect(teks).toContain('gerbang bukti');
    expect(teks).toContain('bertanggung jawab');
    expect(teks).toContain('lapor');
    expect(teks).toContain('nik');
    expect(teks).toContain('keterbatasan');
    expect(teks).toContain('/admin/ai-toggle');
  });
});

describe('CMP-02 — kejujuran keadaan (mengikuti status nyata, bukan teks tetap)', () => {
  it('keadaan mati ⇒ menyatakan TIDAK aktif dan tidak mengaku AI sedang menyusun jawaban', () => {
    const k = pengungkapanAi(DASAR);
    expect(k.kalimatKeadaan).toContain('TIDAK aktif');
    expect(k.kalimatKeadaan).not.toContain('layanan AI aktif:');
    expect(k.kalimatKeadaan).toContain('AI_ENABLED tidak diset');
    expect(k.ringkas.keadaan).toBe('mati');
  });

  it('keadaan aktif ⇒ menyatakan aktif; keadaan bayangan ⇒ menyatakan mode bayangan', () => {
    const aktif = kalimatKeadaan(AKTIF);
    expect(aktif).toContain('layanan AI aktif');
    expect(aktif).not.toContain('TIDAK aktif');

    const bayangan = kalimatKeadaan({ ...AKTIF, keadaan: 'bayangan', alasan: 'AI_SHADOW aktif' });
    expect(bayangan).toContain('mode bayangan');
    expect(bayangan).toContain('selalu narasi otomatis');
  });

  it('penyedia tidak menjawab ⇒ dinyatakan (bukan disembunyikan)', () => {
    const k = pengungkapanAi({ ...AKTIF, terjangkau: false, alasan: 'timeout penyedia' });
    expect(k.kalimatKeadaan).toContain('sedang tidak menjawab');
    expect(k.kalimatKeadaan).toContain('berasal dari data, bukan dari model');
  });

  it('satu kegagalan panggilan ⇒ dinyatakan apa adanya (bukan disembunyikan, bukan dilebih-lebihkan)', () => {
    const k = pengungkapanAi({ ...AKTIF, gagalBerturut: 1, sebabTerakhir: 'jaringan' });
    expect(k.kalimatKeadaan).toContain('Panggilan model terakhir gagal');
    expect(k.kalimatKeadaan).toContain('sebab: jaringan');
    expect(k.kalimatKeadaan).toContain('disusun dari data');
    // Sirkuit belum terbuka ⇒ TIDAK mengklaim penyedia mati.
    expect(k.kalimatKeadaan).not.toContain('sedang tidak menjawab');
  });

  it('sirkuit terbuka ⇒ dinyatakan penyedia tidak menjawab beserta sebabnya', () => {
    const k = pengungkapanAi({ ...AKTIF, terjangkau: false, gagalBerturut: 3, sebabTerakhir: 'auth' });
    expect(k.kalimatKeadaan).toContain('sedang tidak menjawab');
    expect(k.kalimatKeadaan).toContain('sebab: auth');
  });

  it('tanpa kegagalan ⇒ tidak ada kalimat kegagalan (kalimat ini bukan basa-basi)', () => {
    const k = pengungkapanAi(AKTIF);
    expect(k.kalimatKeadaan).not.toContain('Panggilan model terakhir gagal');
    expect(k.kalimatKeadaan).not.toContain('sedang tidak menjawab');
  });

  it('status tidak terbaca (null) ⇒ dinyatakan tidak terbaca, tidak diisi asumsi', () => {
    const k = pengungkapanAi(null);
    expect(k.ringkas.keadaan).toBe('mati');
    expect(k.kalimatKeadaan).toContain('tidak dapat dibaca');
  });

  it('saklar operator yang mematikan AI disebut sebagai fakta', () => {
    const k = pengungkapanAi({ ...AKTIF, saklarAi: false });
    expect(k.kalimatKeadaan).toContain('mematikan AI dari panel admin');
  });
});

describe('CMP-02 — tidak mengarang fakta yang tidak diketahui', () => {
  it('penyedia/model kosong ⇒ ditulis "tidak dicantumkan", bukan ditebak', () => {
    const teks = semuaTeks(pengungkapanAi(DASAR)).join(' ');
    expect(teks).toContain('tidak dicantumkan');
    expect(teks).not.toContain('model-uji');
  });

  it('penyedia & model nyata ⇒ dicantumkan lengkap dengan hosnya', () => {
    const teks = semuaTeks(pengungkapanAi(AKTIF)).join(' ');
    expect(teks).toContain('custom');
    expect(teks).toContain('model-uji');
    expect(teks).toContain('127.0.0.1:8787');
  });
});

describe('CMP-02 — larangan klaim mutlak (dan pembuktian pemeriksanya tidak vakum)', () => {
  it('tiga keadaan bersih dari klaim terlarang', () => {
    for (const r of [DASAR, AKTIF, { ...AKTIF, keadaan: 'bayangan' as const }]) {
      expect(klaimTerlarang(pengungkapanAi(r))).toEqual([]);
    }
  });

  it('SABOTASE: bila teks disisipi klaim terlarang, pemeriksa GAGAL — jadi pemeriksaan ini nyata', () => {
    const k = pengungkapanAi(AKTIF);
    const rusak = {
      ...k,
      kalimatKeadaan: 'Jawaban di portal ini dijamin benar dan 100% akurat.',
    };
    const temuan = klaimTerlarang(rusak);
    expect(temuan.length).toBeGreaterThan(0);
    expect(temuan).toContain('100% akurat');
    expect(temuan).toContain('dijamin benar');
    // Daftar larangan tidak boleh kosong (kalau kosong, uji sebelumnya lulus semu).
    expect(KLAIM_TERLARANG.length).toBeGreaterThanOrEqual(4);
  });
});

describe('CMP-02 — keterbukaan halaman & notis per jawaban tidak boleh berbeda', () => {
  it('pemetaan notis sama dengan keluaran teksNotis() milik FR-26', () => {
    const k = pengungkapanAi(AKTIF);
    expect(k.pemetaanNotis).toEqual({
      digunakan: teksNotis({ used: true }).mode,
      ditolakGerbang: teksNotis({ used: false, grounded: 'replaced' }).mode,
      tanpaAi: teksNotis({ used: false, grounded: 'skipped' }).mode,
      belumAda: teksNotis(null).mode,
    });
    expect(k.pemetaanNotis).toEqual({
      digunakan: 'ai',
      ditolakGerbang: 'template',
      tanpaAi: 'template',
      belumAda: 'umum',
    });
  });

  it('notis per jawaban: kalimat "AI menyusun" hanya untuk jawaban yang benar-benar disusun AI', () => {
    const n = pengungkapanAi(AKTIF).notisPerJawaban;
    expect(n.digunakan.mode).toBe('ai');
    expect(n.digunakan.paragraf[0]).toContain('disusun oleh model bahasa AI');
    expect(n.tanpaAi.mode).toBe('template');
    expect(n.tanpaAi.paragraf[0]).toContain('mode tanpa AI');
    expect(n.tanpaAi.paragraf[0]).not.toContain('disusun oleh model bahasa AI');
    expect(n.ditolakGerbang.paragraf[0]).toContain('ditolak gerbang bukti');
    expect(n.belumAda.mode).toBe('umum');
    expect(n.belumAda.paragraf[0]).toContain('Cara kerja jawaban');
  });

  it('tenggat peninjauan dihitung dari tanggal (lewat/belum), bukan hiasan', () => {
    expect(statusTinjauan(new Date('2026-09-24T00:00:00Z')).lewatTenggat).toBe(false);
    expect(statusTinjauan(new Date('2027-03-25T00:00:00Z')).lewatTenggat).toBe(true);
    const selisihHari =
      (new Date(TINJAUAN_BERIKUTNYA).getTime() - new Date(DITINJAU_PADA).getTime()) / 86_400_000;
    expect(selisihHari).toBeGreaterThan(150);
    expect(selisihHari).toBeLessThanOrEqual(366);
  });
});

describe('CMP-02 — halaman /keterbukaan (markup nyata)', () => {
  it('halaman merender keadaan sebenarnya + tanpa klaim terlarang', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    vi.stubEnv('AI_API_KEY', '');
    const { default: HalamanKeterbukaan } = await import('@/app/keterbukaan/page');
    const html = renderToStaticMarkup(await HalamanKeterbukaan());
    expect(html).toContain('Keterbukaan penggunaan AI');
    expect(html).toContain('Keadaan layanan saat halaman ini dibuka');
    expect(html).toContain('TIDAK aktif');
    const teks = html.replace(/<[^>]+>/g, ' ').toLowerCase();
    for (const f of KLAIM_TERLARANG) expect(teks).not.toContain(f.toLowerCase());
    expect(teks).toContain('lapor');
  });
});
