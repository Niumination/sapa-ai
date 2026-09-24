import { describe, it, expect } from 'vitest';
import { buildVizFromEvidence, type EvidenceItem } from './grounding';
import { buildExecutivePresentation } from './executive-presentation';
import { headlineParts } from '@/lib/format-singkat';
import type { HybridResponse } from '@/types';

// Kasus user: chip PDRB — lead, headline (metrics), narasi wajib selaras "11,5 Triliun".
describe('lead/headline/narasi selaras (PDRB)', () => {
  const evidence: EvidenceItem[] = [
    { opd: 'Dinas X', indikator: 'PDRB Tahun Berjalan atas dasar Harga Konsisten', nilai: '11.503.360.000.000', satuan: 'Milyar', tahun: null, id: 1 },
    { opd: 'Dinas Y', indikator: 'Kontribusi Sektor Perdagangan terhadap PDRB', nilai: '13,45', satuan: 'Persentase', tahun: '2025', id: 2 },
  ];
  const response: HybridResponse = {
    narasi: 'Berdasarkan data SAPA untuk "PDRB", ditemukan 2 indikator terkait.',
    visualisasi: buildVizFromEvidence(evidence),
    rekomendasi: [],
    dataSource: 'SAPA SPLP',
    timestamp: new Date().toISOString(),
  };
  const p = buildExecutivePresentation(response);

  it('lead memakai angka singkat', () => {
    expect(p.lead).toContain('11,5 Triliun');
    expect(p.lead).not.toContain('11.503.360.000.000');
    expect(p.lead).not.toContain('(-)');
  });
  it('metrics (headline) selaras lead via headlineParts', () => {
    const h = headlineParts(p.metrics[0]?.value, p.metrics[0]?.unit);
    expect(h.text).toBe('11,5 Triliun');
    expect(h.unit).toBeNull();
  });
  it('narasi eksekutif disingkat', () => {
    expect(p.narrative).not.toContain('11.503.360.000.000 Milyar');
  });
});

// ─── FR-19: sitasi per klaim pada presentasi ──────────────────────────────────
describe('sitasi per klaim (FR-19)', () => {
  const evidence: EvidenceItem[] = [
    { opd: 'Badan Kepegawaian dan Pengembangan SDM', indikator: 'Jumlah ASN', nilai: '9610', satuan: 'Pegawai', tahun: '2026', id: 1 },
    { opd: 'Dinas Kesehatan', indikator: 'Prevalensi Stunting', nilai: '31,4', satuan: 'Persen', tahun: '2025', id: 2 },
  ];
  const response: HybridResponse = {
    narasi: 'Jumlah ASN tercatat 9.610 Pegawai. Prevalensi Stunting berada pada 31,4 Persen.',
    visualisasi: buildVizFromEvidence(evidence),
    rekomendasi: [],
    dataSource: 'SAPA SPLP',
    timestamp: new Date().toISOString(),
  };
  const p = buildExecutivePresentation(response);

  it('setiap kalimat klaim pada narasi mendapat penanda rujukan', () => {
    expect(p.narrative).toContain('[1]');
    expect(p.narrative).toContain('[2]');
  });

  it('ringkasan sitasi melaporkan nol klaim tanpa rujukan', () => {
    expect(p.citations).toBeDefined();
    expect(p.citations?.totalKlaim).toBe(2);
    expect(p.citations?.bersitasi).toBe(2);
    expect(p.citations?.tanpaSitasi).toEqual([]);
  });

  it('penanda benar-benar menunjuk baris bukti yang memuat angka itu (tidak mengarang)', () => {
    // Untuk setiap penanda [n]: nilai baris bukti ke-n harus muncul di kalimat itu,
    // entah dalam bentuk penuh ("9.610") atau bentuk singkatnya ("1,44 Triliun").
    const kalimat = p.narrative.split(/(?<=[.!?])\s+/);
    let diperiksa = 0;
    for (const k of kalimat) {
      const nomor = (k.match(/\[(\d+)\]/g) ?? []).map((x) => Number(x.replace(/[^\d]/g, '')));
      for (const n of nomor) {
        const baris = p.evidence[n - 1];
        expect(baris, `baris bukti ${n} harus ada`).toBeDefined();
        const bentuk = new Set<string>([
          baris!.nilai,
          baris!.nilai.replace(/\./g, ''),
          headlineParts(baris!.nilai).text,
        ]);
        const ada = [...bentuk].some((b) => k.includes(b));
        expect(ada, `penanda [${n}] menunjuk nilai "${baris!.nilai}" yang tidak ada pada kalimat "${k}"`).toBe(true);
        diperiksa += 1;
      }
    }
    expect(diperiksa).toBeGreaterThan(0);
  });

  it('lead (judul besar) TIDAK memuat penanda rujukan', () => {
    expect(p.lead).not.toContain('[');
  });

  it('narasi tanpa angka nilai tidak mendapat penanda palsu', () => {
    const p2 = buildExecutivePresentation({
      narasi: 'Data untuk indikator tersebut belum tersedia pada katalog SAPA.',
      visualisasi: { tipe: 'none', konfigurasi: {} },
      rekomendasi: [],
      dataSource: 'SAPA SPLP',
      timestamp: new Date().toISOString(),
    });
    expect(p2.citations?.totalKlaim).toBe(0);
    expect(p2.narrative).not.toContain('[');
  });
});

// ─── FR-18: bentuk jawaban per niat pada panel ────────────────────────────────
describe('bentuk jawaban per niat pada presentasi (FR-18)', () => {
  const cakupan: EvidenceItem[] = [
    { opd: 'Dinas Kesehatan', indikator: 'Cakupan imunisasi dasar lengkap', nilai: '88,2', satuan: 'Persen', tahun: '2024', id: 1 },
    { opd: 'Dinas Kesehatan', indikator: 'Cakupan air minum layak', nilai: '91,4', satuan: 'Persen', tahun: '2024', id: 2 },
    { opd: 'Dinas Kesehatan', indikator: 'Cakupan sanitasi layak', nilai: '84,7', satuan: 'Persen', tahun: '2024', id: 3 },
    { opd: 'Dinas Kesehatan', indikator: 'Cakupan kunjungan ibu hamil K4', nilai: '96,1', satuan: 'Persen', tahun: '2024', id: 4 },
    { opd: 'Dinas Kesehatan', indikator: 'Cakupan ASI eksklusif', nilai: '72,5', satuan: 'Persen', tahun: '2024', id: 5 },
    { opd: 'Dinas Kesehatan', indikator: 'Cakupan balita ditimbang', nilai: '92,3', satuan: 'Persen', tahun: '2024', id: 6 },
    { opd: 'Dinas Kesehatan', indikator: 'Cakupan rumah tangga bersih', nilai: '79,8', satuan: 'Persen', tahun: '2024', id: 7 },
  ];
  const panel = (niat: HybridResponse['niat'], query: string, evidence: EvidenceItem[] = cakupan) =>
    buildExecutivePresentation({
      narasi: 'Ringkasan jawaban atas pertanyaan.',
      visualisasi: buildVizFromEvidence(evidence),
      // Balasan rute nyata selalu membawa baris bukti; panel memakainya.
      evidence,
      rekomendasi: [],
      dataSource: 'SAPA SPLP',
      timestamp: new Date().toISOString(),
      niat,
      query,
    });

  it('peringkat: panel memajang 5 besar terurut menurun, jumlah bukti penopang tetap utuh', () => {
    const p = panel('peringkat', '5 besar cakupan tertinggi');
    expect(p.bentuk?.urutan).toBe('menurun');
    expect(p.evidence).toHaveLength(5);
    expect(p.evidence.map((e) => e.id)).toEqual([4, 6, 2, 1, 3]);
    expect(p.provenance.evidenceCount).toBe(7);
    expect(p.provenance.evidenceDisajikan).toBe(5);
  });

  it('peringkat: catatan menyebut baris yang tidak dipajang (bukan disembunyikan)', () => {
    const p = panel('peringkat', '5 besar cakupan tertinggi');
    expect(p.bentuk?.catatan).toMatch(/2 baris bukti lain tidak dipajang/);
    expect(p.bentuk?.catatan).not.toMatch(/terlihat di daftar bukti/);
  });

  it('peringkat terendah: urutan menaik mengikuti kata "terendah" pada pertanyaan', () => {
    const p = panel('peringkat', 'cakupan mana yang terendah');
    expect(p.bentuk?.urutan).toBe('menaik');
    expect(p.evidence[0].nilai).toBe('72,5');
  });

  it('komposisi: porsi dihitung dari baris total yang ADA dan dipasang ke id baris bagian', () => {
    const denganTotal: EvidenceItem[] = [
      { opd: 'Dinas Kesehatan', indikator: 'Total balita', nilai: '10000', satuan: 'Jiwa', tahun: '2024', id: 10 },
      { opd: 'Dinas Kesehatan', indikator: 'Balita stunting', nilai: '3140', satuan: 'Jiwa', tahun: '2024', id: 11 },
      { opd: 'Dinas Kesehatan', indikator: 'Balita imunisasi lengkap', nilai: '8820', satuan: 'Jiwa', tahun: '2024', id: 12 },
    ];
    const p = panel('komposisi', 'komposisi balita', denganTotal);
    expect(p.bentuk?.kolomTurunan).toBe('porsi');
    expect(p.porsi?.['11']).toBeCloseTo(31.4, 1);
    expect(p.porsi?.['12']).toBeCloseTo(88.2, 1);
    expect(p.porsi?.['10']).toBeUndefined();
  });

  it('komposisi tanpa total: porsi KOSONG + catatan jujur (tidak menjumlahkan sendiri)', () => {
    const p = panel('komposisi', 'komposisi balita', cakupan.slice(0, 3));
    expect(p.porsi).toBeUndefined();
    expect(p.bentuk?.catatan).toMatch(/total keseluruhan tidak ada/i);
  });

  it('tren: baris menjadi kronologis dan visual berubah menjadi garis', () => {
    const seri: EvidenceItem[] = [
      { opd: 'Dinas Kesehatan', indikator: 'Prevalensi stunting', nilai: '31,4', satuan: 'Persen', tahun: '2024', id: 21 },
      { opd: 'Dinas Kesehatan', indikator: 'Prevalensi stunting', nilai: '24,1', satuan: 'Persen', tahun: '2019', id: 22 },
      { opd: 'Dinas Kesehatan', indikator: 'Prevalensi stunting', nilai: '27,8', satuan: 'Persen', tahun: '2021', id: 23 },
    ];
    const p = panel('tren', 'tren prevalensi stunting', seri);
    expect(p.evidence.map((e) => e.tahun)).toEqual(['2019', '2021', '2024']);
    expect(p.visual.type).toBe('line');
    expect(p.visual.data.map((d) => d.name)).toEqual(['2019', '2021', '2024']);
  });

  it('niat null: berlaku sebagai nilai_saat_ini (tidak ada bentuk liar)', () => {
    const p = panel(undefined, 'berapa cakupan imunisasi dasar lengkap', cakupan.slice(0, 2));
    expect(p.bentuk?.visual).toBe('metric');
    expect(p.bentuk?.catatan).toBeUndefined();
  });

  it('respons lama (tanpa niat/query) tetap aman — bentuk dihitung dari niat null', () => {
    const p = buildExecutivePresentation({
      narasi: 'Ringkasan jawaban atas pertanyaan.',
      visualisasi: buildVizFromEvidence(cakupan),
      evidence: cakupan,
      rekomendasi: [],
      dataSource: 'SAPA SPLP',
      timestamp: new Date().toISOString(),
    });
    expect(p.bentuk?.label).toBe('Nilai saat ini');
    expect(p.evidence).toHaveLength(5);
  });
});
