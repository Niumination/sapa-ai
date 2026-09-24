import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ExecutiveAnswerRenderer from '@/components/ExecutiveAnswerRenderer';
import NotisTransparansi from '@/components/NotisTransparansi';
import { rasioKontras, periksaHtml, periksaPotonganHtml, periksaSasaranTautan } from '../../../verifikasi/aksesibilitas.mjs';
import type { HybridResponse } from '@/types';

/**
 * NFR-09 — uji aksesibilitas.
 *
 * Dua lapis:
 *   1. Pemeriksa (fungsi murni) diuji dengan potongan HTML yang sengaja cacat —
 *      kalau pemeriksa berhenti menangkap cacat itu, uji ini GAGAL. Tanpa itu,
 *      "hijau" pada harness hanya berarti "tidak ada yang diperiksa".
 *   2. Markup yang BENAR-BENAR dirender komponen jawaban (panel executive dengan
 *      tabel bukti) diperiksa — bagian ini tidak pernah muncul pada pemuatan
 *      halaman pertama, jadi tidak terjangkau harness halaman.
 */

// ── 1. Pemeriksa: kontras ──────────────────────────────────────────────────
describe('pemeriksa aksesibilitas — kontras', () => {
  it('menghitung rasio kontras sesuai rumus WCAG', () => {
    // Angka acuan yang diketahui: hitam/putih = 21:1; putih/putih = 1:1.
    expect(rasioKontras('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(rasioKontras('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    // Nilai rujukan luar: #767D6F di atas putih = 4,26:1 — MASIH di bawah ambang
    // teks normal 4,5:1 (inilah sebabnya warna itu diganti di halaman utama).
    // Di atas kepala gelap #0F2A1E hanya 3,60:1 — jauh di bawah ambang.
    expect(rasioKontras('#767D6F', '#FFFFFF')).toBeGreaterThan(4.2);
    expect(rasioKontras('#767D6F', '#FFFFFF')).toBeLessThan(4.5);
    expect(rasioKontras('#767D6F', '#0F2A1E')).toBeCloseTo(3.6, 1);
    // Simetri: urutan argumen tidak mengubah hasil.
    expect(rasioKontras('#1B4332', '#FFFFFF')).toBeCloseTo(rasioKontras('#FFFFFF', '#1B4332'), 10);
  });

  it('menolak warna yang tidak dikenal alih-alih menebak', () => {
    expect(() => rasioKontras('biru', '#FFFFFF')).toThrow();
  });
});

// ── 2. Pemeriksa: potongan markup ─────────────────────────────────────────
describe('pemeriksa aksesibilitas — potongan markup', () => {
  it('menangkap cacat yang ditanam (nama kontrol, label, scope tabel, alt)', () => {
    const cacat = `
      <img src="peta.png">
      <button></button>
      <input type="text" placeholder="Ketik di sini">
      <div tabindex="4">fokus melompat</div>
      <table><tr><th>Nilai</th></tr></table>
      <span aria-hidden="true"><a href="/x">rahasia tapi bisa difokus</a></span>`;
    const { pelanggaran } = periksaPotonganHtml(cacat, { nama: 'cacat' });
    const teks = pelanggaran.join('\n');
    expect(teks).toMatch(/tanpa atribut alt/);
    expect(teks).toMatch(/tanpa nama aksesibel/);
    expect(teks).toMatch(/tanpa label/);
    expect(teks).toMatch(/tabindex="4" positif/);
    expect(teks).toMatch(/tanpa scope/);
    expect(teks).toMatch(/di dalam wilayah aria-hidden="true"/);
  });

  it('tidak menuduh markup yang sudah benar (tanpa positif palsu)', () => {
    const bersih = `
      <img src="peta.png" alt="Peta sebaran OPD">
      <button type="button" aria-label="Tutup panel"></button>
      <label for="q">Pertanyaan</label><input id="q" type="text">
      <table><caption>Bukti</caption><tr><th scope="col">Nilai</th></tr></table>
      <button type="button" class="target-min">Ringkas</button>`;
    const { pelanggaran } = periksaPotonganHtml(bersih, { nama: 'bersih' });
    expect(pelanggaran).toEqual([]);
  });

  it('wilayah live diperiksa pada tingkat dokumen, bukan potongan', () => {
    // Potongan ini punya tombol bernama dan tidak punya tabel cacat → potongan bersih,
    // tetapi sebagai DOKUMEN ia tetap gagal karena tanpa wilayah live & tanpa h1.
    // 24 Sep 2026: aturan wilayah live dipersempit — hanya dituntut pada halaman
    // yang memang punya PERMUKAAN TANYA (form/isian), karena halaman statis tidak
    // mengumumkan apa pun. Karena itu dokumen uji ini memuat isian, persis seperti
    // halaman utama yang menampilkan jawaban tanpa pindah halaman.
    const potongan = '<button type="button">Klik</button><input type="text" aria-label="Pertanyaan" />';
    expect(periksaPotonganHtml(potongan, { nama: 'p' }).pelanggaran).toEqual([]);
    const dokumen = periksaHtml(potongan, { nama: 'd' });
    expect(dokumen.pelanggaran.join('\n')).toMatch(/tidak ada <main>/);
    expect(dokumen.pelanggaran.join('\n')).toMatch(/tidak ada wilayah live/);
    expect(dokumen.pelanggaran.join('\n')).toMatch(/tidak ada <h1>/);
  });

  it('halaman statis tanpa permukaan tanya TIDAK dituntut wilayah live', () => {
    // Perbaikan positif-palsu: /keterbukaan dan /tata-kelola-risiko tidak punya
    // isian, jadi tidak ada jawaban yang perlu diumumkan pembaca layar.
    // Cermin halaman sebenarnya: punya navigasi → wajib tautan lompati; tidak punya
    // isian → tidak dituntut wilayah live.
    const statis =
      '<html lang="id"><title>Keterbukaan</title><a href="#konten">Lompati ke konten</a>' +
      '<nav aria-label="Navigasi"><a href="/">SAPA</a></nav>' +
      '<main id="konten"><h1>Keterbukaan penggunaan AI</h1><p>Teks.</p></main></html>';
    const hasil = periksaHtml(statis, { nama: 'statis' });
    expect(hasil.pelanggaran.join('\n')).not.toMatch(/tidak ada wilayah live/);
    expect(hasil.pelanggaran, hasil.pelanggaran.join('; ')).toEqual([]);
  });

  it('tautan lompati hanya dituntut bila ADA tautan sebelum <main> (SC 2.4.1)', () => {
    const tanpaNav =
      '<html lang="id"><title>Keterbukaan</title><main><h1>Judul</h1><p>Teks.</p></main></html>';
    expect(periksaHtml(tanpaNav, { nama: 'tanpa-nav' }).pelanggaran.join('\n')).not.toMatch(/Lompati ke konten/);

    const adaNav = tanpaNav.replace('<main>', '<nav aria-label="Navigasi"><a href="/">SAPA</a></nav><main>');
    expect(periksaHtml(adaNav, { nama: 'ada-nav' }).pelanggaran.join('\n')).toMatch(/Lompati ke konten/);
  });
});

// ── 3. Markup komponen jawaban yang sesungguhnya ──────────────────────────
const respons: HybridResponse = {
  narasi: 'Prevalensi stunting tercatat 31,4 Persen (2025) di Aceh Tengah.',
  visualisasi: {
    tipe: 'table',
    konfigurasi: {
      title: 'Prevalensi stunting',
      columns: ['Indikator', 'Nilai', 'Satuan', 'OPD', 'Tahun'],
      rows: [
        ['Prevalensi stunting', '31,4', 'Persen', 'Dinas Kesehatan', '2025'],
        ['Bayi di bawah dua tahun ditimbang', '92,1', 'Persen', 'Dinas Kesehatan', '2025'],
      ],
    },
  },
  rekomendasi: ['Koordinasikan dengan Dinas Kesehatan untuk validasi angka 2025.'],
  dataSource: 'SPLP · 2.065 record',
  timestamp: '2026-09-24T00:00:00.000Z',
  dataFetchedAt: '2026-09-24T00:00:00.000Z',
  dataFingerprint: 'abcd1234',
  dataYears: ['2025'],
  ai: { used: false, shadow: false, grounded: 'pass' } as HybridResponse['ai'],
};

describe('aksesibilitas — panel jawaban executive (NFR-09)', () => {
  const markup = renderToStaticMarkup(<ExecutiveAnswerRenderer response={respons} />);

  it('merender tabel bukti dengan kepala kolom ber-scope', () => {
    expect(markup).toContain('<table');
    expect(markup).toContain('scope="col"');
    expect(periksaPotonganHtml(markup, { nama: 'jawaban' }).pelanggaran).toEqual([]);
  });

  it('setiap tombol pada panel punya nama aksesibel', () => {
    const tombol = [...markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)];
    expect(tombol.length).toBeGreaterThan(0);
    for (const t of tombol) {
      const punyaLabel = /aria-label="/.test(t[0]);
      const teks = t[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      expect(punyaLabel || teks.length > 0).toBe(true);
    }
  });

  it('pemeriksa TETAP menangkap sabotase pada markup jawaban ini', () => {
    // Sabotase: scope kepala kolom dilepas — kalau pemeriksa berhenti melihat
    // tabel ini (mis. karena markup berubah), uji akan gagal di sini.
    const rusak = markup.replace('scope="col"', '');
    expect(rusak).not.toBe(markup);
    const { pelanggaran } = periksaPotonganHtml(rusak, { nama: 'sabotase-jawaban' });
    expect(pelanggaran.join('\n')).toMatch(/tanpa scope/);
  });
});

describe('aksesibilitas — notis transparansi (NFR-09)', () => {
  it('pesan galat/berhasil memakai wilayah live dan kontrol bernama', () => {
    const markup = renderToStaticMarkup(<NotisTransparansi ai={null} pertanyaan="stunting" />);
    expect(periksaPotonganHtml(markup, { nama: 'notis' }).pelanggaran).toEqual([]);
  });

  it('tautan notis yang bergaya tombol membawa jaminan sasaran 24 px (temuan 24 Sep 2026)', () => {
    // Cacat nyata: tautan "Keterbukaan penggunaan AI" ber-`py-1.5` tanpa
    // `target-min` → tinggi < 24 px (SC 2.5.8). Ditemukan oleh harness halaman
    // pada /dashboard, dan uji ini menjaga agar tidak kembali.
    const markup = renderToStaticMarkup(<NotisTransparansi ai={null} pertanyaan="stunting" />);
    const hasil = periksaSasaranTautan(markup, 'notis');
    expect(hasil.kontrolRingkas, 'notis harus memuat tautan bergaya tombol').toBeGreaterThan(0);
    expect(hasil.pelanggaran).toEqual([]);
  });

  it('pemeriksa sasaran tautan TETAP menangkap sabotase (kelas target-min dilepas)', () => {
    const markup = renderToStaticMarkup(<NotisTransparansi ai={null} pertanyaan="stunting" />);
    const dirusak = markup.replace(/target-min /g, '');
    const hasil = periksaSasaranTautan(dirusak, 'notis-sabotase');
    expect(hasil.pelanggaran.length, 'sabotase harus tertangkap').toBeGreaterThan(0);
    expect(hasil.pelanggaran[0]).toContain('SC 2.5.8');
  });
});
