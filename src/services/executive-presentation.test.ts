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
