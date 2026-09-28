// P10 — FR-05 kausal bersitasi
import { describe, it, expect } from 'vitest';
import { deteksiNiat } from '../intent-meta';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const raw = JSON.parse(fs.readFileSync(join(root, 'verifikasi/korpus-produksi.json'), 'utf8'));
const records = raw.data ?? raw;

// Lazy import karena modul TS murni
async function build(q: string) {
  const mod = await import('@/services/deterministic-answer');
  const fn = (mod as any).default?.buildDeterministicAnswer ?? (mod as any).buildDeterministicAnswer;
  return fn(q, records);
}
async function sitasi(narasi: string, evidence: any[]) {
  const mod = await import('@/services/sitasi-per-klaim');
  const fn = (mod as any).default?.beriSitasi ?? (mod as any).beriSitasi;
  return fn(narasi, evidence);
}

describe('P10 — intent sebab diperluas untuk korelasi', () => {
  const kasus: [string, string][] = [
    ['Apa hubungan antara kemiskinan dan stunting di Aceh Tengah?', 'hubungan'],
    ['Apakah ada kaitan antara jumlah UMKM dan panjang jalan per kecamatan?', 'kaitan'],
    ['Apakah kondisi jalan berhubungan dengan tingkat kemiskinan kecamatan?', 'berhubungan'],
    ['Apakah jumlah keluarga memengaruhi jumlah jiwa per desa?', 'memengaruhi'],
    ['Apakah jumlah keluarga mempengaruhi jumlah jiwa per desa?', 'mempengaruhi'],
    ['Apa dampak kemiskinan terhadap stunting?', 'dampak'],
    ['Bagaimana korelasi antara IPM dan kemiskinan?', 'korelasi'],
  ];
  for (const [q, pemicu] of kasus) {
    it(`"${q.slice(0,40)}..." → sebab (${pemicu})`, async () => {
      const h = deteksiNiat(q);
      expect(h.niat).toBe('sebab');
      expect(h.pemicu.join(' ').toLowerCase()).toContain(pemicu);
    });
  }
});

describe('P10 — jawaban kausal: bukti terdekat + batas kesimpulan + sitasi', () => {
  const queries = [
    'Apa penyebab tingginya angka stunting di Aceh Tengah?',
    'Apa hubungan antara kemiskinan dan stunting di Aceh Tengah?',
    'Apakah ada kaitan antara jumlah UMKM dan panjang jalan per kecamatan?',
    'Mengapa jumlah pengaduan masyarakat ke Inspektorat menurun?',
    'Kenapa produksi kopi arabika berubah dari tahun ke tahun?',
  ];

  for (const q of queries) {
    it(`kausal "${q.slice(0,50)}" → ≤3 bukti relevan, batas tertulis, 0 klaim tanpa rujukan`, async () => {
      const res = await build(q);
      // Bukti dibatasi 3 untuk sebab
      expect(res.evidence.length).toBeLessThanOrEqual(3);
      // Harus ada peringatan sebab sebagai batas awal
      const peringatanGabung = res.peringatan.join(' ').toLowerCase();
      expect(peringatanGabung).toMatch(/tidak tersedia|menyimpan angka capaian/);
      // Narasi harus memuat batas kesimpulan
      const nar = res.response.narasi;
      expect(nar).toMatch(/SAPA.*angka capaian.*bukan.*sebab|Data penyebab.*tidak tersedia/i);
      expect(nar).toMatch(/konteks topik.*bukan bukti sebab|bukan bukti sebab/i);
      expect(nar).toMatch(/tidak dapat disimpulkan|memerlukan kajian OPD/i);
      // Tidak boleh mengandung klaim sebab terlarang (N4)
      if (q.toLowerCase().includes('stunting')) {
        expect(nar.toLowerCase()).not.toContain('disebabkan oleh');
        expect(nar.toLowerCase()).not.toContain('dikarenakan oleh');
        expect(nar.toLowerCase()).not.toContain('penyebab utamanya adalah');
      }
      // Sitasi per klaim: 0 tanpa rujukan
      const s = await sitasi(nar, res.evidence);
      expect(s.ringkas.tanpaSitasi.length).toBe(0);
      // Jika ada klaim, harus bersitasi
      if (s.ringkas.totalKlaim > 0) {
        expect(s.ringkas.bersitasi).toBeGreaterThan(0);
      }
    });
  }

  it('N4: tidak mengandung kata terlarang, tetap relevan stunting', async () => {
    const q = 'Apa penyebab tingginya angka stunting di Aceh Tengah?';
    const res = await build(q);
    const nar = res.response.narasi.toLowerCase();
    expect(nar).not.toMatch(/disebabkan oleh/);
    expect(nar).not.toMatch(/dikarenakan oleh/);
    expect(nar).not.toMatch(/penyebab utamanya adalah/);
    // Bukti harus semuanya mengandung stunting (domain filtering P10)
    const semuaStunting = res.evidence.every((e: any) => /stunting/i.test(e.indikator));
    expect(semuaStunting).toBe(true);
  });

  it('K1-K4: bukti relevan, bukan 14 acak', async () => {
    const res = await build('Apa hubungan antara kemiskinan dan stunting di Aceh Tengah?');
    expect(res.evidence.length).toBe(3);
    // Harus mengandung kemiskinan atau stunting, tidak boleh "Pik R" atau "Perguruan Tinggi" yang dulu terikut
    const adaIrrelevan = res.evidence.some((e: any) => /Pik R|Perguruan Tinggi/i.test(e.indikator));
    expect(adaIrrelevan).toBe(false);
  });
});
