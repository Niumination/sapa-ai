// ─── Grounding: pengaman anti-halusinasi ───
// Diperkeras 2026-09-04 (temuan T-01). Sebelumnya angka <10 lolos dan pergeseran
// desimal ("31,4" → "3,14"/"314") lolos karena titik/koma dibuang sebelum dibandingkan.

import { describe, it, expect } from 'vitest';
import {
  isGrounded,
  isGroundedText,
  groundOutput,
  buildAllowedValues,
  buildAllowedIntegerDigits,
  type EvidenceItem,
  extractNumbers,
} from '../grounding';
import type { HybridResponse } from '@/types';

const evidence: EvidenceItem[] = [
  {
    opd: 'Badan Perencanaan Pembangunan Daerah.',
    indikator: 'Prevalensi Stunting',
    nilai: '31,4',
    satuan: 'Persen',
    tahun: '2025',
    id: 511,
  },
];

const evidenceBulat: EvidenceItem[] = [
  { opd: 'BKPSDM', indikator: 'Jumlah ASN', nilai: '9.610', satuan: 'pegawai', tahun: '2026', id: 21 },
];

function resp(narasi: string, ekstra: Partial<HybridResponse> = {}): HybridResponse {
  return {
    narasi,
    visualisasi: { tipe: 'none', konfigurasi: {} },
    rekomendasi: [],
    dataSource: 'SAPA Aceh Tengah (api-splp.layanan.go.id)',
    timestamp: '2026-09-04T00:00:00.000Z',
    ...ekstra,
  };
}

describe('grounding — angka', () => {
  it('angka < 10 yang tidak ada di evidence DITOLAK (celah lama)', () => {
    const r = isGrounded(resp('Kasus stunting naik pada 7 kecamatan dan 3 puskesmas.'), evidence);
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain('angka halu');
  });

  it('pergeseran desimal DITOLAK: 31,4 → 3,14', () => {
    const r = isGrounded(resp('Prevalensi stunting 3,14 persen.'), evidence);
    expect(r.ok).toBe(false);
  });

  it('pergeseran desimal DITOLAK: 31,4 → 314', () => {
    const r = isGrounded(resp('Prevalensi stunting 314 persen.'), evidence);
    expect(r.ok).toBe(false);
  });

  it('salin persis nilai evidence DITERIMA', () => {
    expect(isGrounded(resp('Prevalensi stunting 31,4 persen.'), evidence).ok).toBe(true);
  });

  it('angka bulat dengan pemisah ribuan tetap kompatibel: "9.610" == "9610"', () => {
    expect(isGrounded(resp('Jumlah ASN 9610 pegawai.'), evidenceBulat).ok).toBe(true);
    expect(isGrounded(resp('Jumlah ASN 9.610 pegawai.'), evidenceBulat).ok).toBe(true);
  });

  it('angka besar halu DITOLAK (kontrol)', () => {
    expect(isGrounded(resp('Prevalensi stunting 99,9 persen.'), evidence).ok).toBe(false);
  });

  it('statistik resmi yang disuplai sistem DITERIMA lewat extraAllowedNumbers', () => {
    const r = isGrounded(
      resp('Dari 2.055 record SAPA, topik ini mencakup 1 indikator dari 38 OPD.'),
      evidence,
      { extraAllowedNumbers: [2055, 38, 1] },
    );
    expect(r.ok).toBe(true);
  });

  it('angka yang tidak ada di evidence maupun extra TETAP ditolak walau kecil', () => {
    const r = isGrounded(resp('Dari 2.055 record, ada 5 indikator.'), evidence, {
      extraAllowedNumbers: [2055],
    });
    expect(r.ok).toBe(false);
  });
});

describe('grounding — tahun, OPD, evidence kosong', () => {
  it('tahun di evidence DITERIMA', () => {
    expect(isGrounded(resp('Data tahun 2025 menunjukkan 31,4 persen.'), evidence).ok).toBe(true);
  });

  it('tahun halu DITOLAK', () => {
    const r = isGrounded(resp('Data tahun 2019 menunjukkan 31,4 persen.'), evidence);
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain('tahun halu');
  });

  it('nama OPD di luar evidence DITOLAK', () => {
    const r = isGrounded(resp('Koordinasikan dengan Dinas Perhubungan terkait 31,4 persen.'), evidence);
    expect(r.ok).toBe(false);
  });

  it('evidence kosong + narasi tanpa angka DITERIMA (boleh bilang tidak tersedia)', () => {
    expect(isGrounded(resp('Data tidak ditemukan di SAPA.'), []).ok).toBe(true);
  });

  it('evidence kosong + narasi berangka DITOLAK', () => {
    expect(isGrounded(resp('Tercatat 1.200 kasus.'), []).ok).toBe(false);
  });
});

describe('grounding — cakupan field & helper', () => {
  it('followUps ikut diground (celah lama: hanya narasi/rekomendasi)', () => {
    const r = isGrounded(
      resp('Prevalensi stunting 31,4 persen.', {
        followUps: ['Bagaimana tren 12 kecamatan?'],
      } as unknown as Partial<HybridResponse>),
      evidence,
    );
    expect(r.ok).toBe(false);
  });

  it('isGroundedText bisa dipakai untuk field mandiri', () => {
    expect(isGroundedText('31,4 persen', evidence).ok).toBe(true);
    expect(isGroundedText('7 kecamatan', evidence).ok).toBe(false);
  });

  it('buildAllowedValues membaca "31,4" sebagai 31.4 (bukan 314)', () => {
    expect(buildAllowedValues(evidence)).toEqual([31.4]);
  });

  it('varian digit hanya dibuat untuk nilai bulat', () => {
    expect([...buildAllowedIntegerDigits(evidence)]).toEqual([]);
    expect([...buildAllowedIntegerDigits(evidenceBulat)]).toContain('9610');
  });
});

describe('groundOutput — penggantian template', () => {
  it('narasi halu diganti narasi deterministik, rekomendasi aman dipertahankan', () => {
    const parsed = resp('Prevalensi stunting 12,7 persen pada 2019.', {
      rekomendasi: ['Tindak lanjuti ke OPD terkait.', 'Anggarkan untuk 8 kecamatan.'],
    });
    const out = groundOutput(parsed, evidence, 'stunting');
    expect(out.grounding).toBe('replaced');
    expect(out.response.narasi).toContain('Prevalensi Stunting');
    expect(out.response.narasi).toContain('31,4');
    expect(out.response.rekomendasi).toEqual(['Tindak lanjuti ke OPD terkait.']);
  });

  it('narasi grounded tidak diubah', () => {
    const parsed = resp('Prevalensi stunting 31,4 persen.');
    const out = groundOutput(parsed, evidence, 'stunting');
    expect(out.grounding).toBe('pass');
    expect(out.response.narasi).toBe(parsed.narasi);
  });
});

describe('grounding — angka di dalam NAMA indikator (uji live 2026-09-04)', () => {
  const labelEvidence: EvidenceItem[] = [
    {
      opd: 'Dinas Kesehatan',
      indikator: 'Jumlah anak balita yang mengalami stunting (JAB(5) P stunting)',
      nilai: '730',
      satuan: 'Orang',
      tahun: '2025',
      id: 1945,
    },
  ];

  it('angka pada nama indikator yang dikutip TIDAK dihitung halusinasi', () => {
    const r = isGrounded(
      resp('Jumlah anak balita yang mengalami stunting (JAB(5) P stunting) tercatat 730 Orang.'),
      labelEvidence,
    );
    expect(r.ok).toBe(true);
  });

  it('angka yang sama tetap ditolak bila labelnya tidak dikutip', () => {
    const r = isGrounded(resp('Tercatat pada 5 kecamatan.'), labelEvidence);
    expect(r.ok).toBe(false);
  });
});

// ─── T-24: pemindai angka tidak boleh menelan tanda baca JSON ───
// Ditemukan lewat mode shadow: nilai SAH 31,4 dituding "angka halu: 31.4,"
// karena koma pemisah field JSON ikut terserap pemindai.
describe('extractNumbers', () => {
  it('tidak menyerap koma di belakang angka (artefak JSON visualisasi)', () => {
    expect(extractNumbers('{"nilai":31.4,"satuan":"Persen"}')).toContain('31.4');
    expect(extractNumbers('{"nilai":31.4,"satuan":"Persen"}')).not.toContain('31.4,');
  });

  it('tetap menangkap angka Indonesia', () => {
    expect(extractNumbers('31,4 Persen dan 2.055 record')).toEqual(['31,4', '2.055']);
    expect(extractNumbers('11.503.360.000.000')).toEqual(['11.503.360.000.000']);
    expect(extractNumbers('tahun 2025')).toEqual(['2025']);
  });

  it('nilai desimal evidence tidak lagi dituding halu', () => {
    const ev = [
      { id: 1, indikator: 'Prevalensi Stunting', nilai: '31,4', satuan: 'Persen', opd: 'Badan Perencanaan Pembangunan Daerah.', tahun: '2025' },
    ];
    const teks = 'Prevalensi Stunting 31,4 Persen (Badan Perencanaan Pembangunan Daerah., 2025).';
    expect(isGroundedText(teks, ev).ok).toBe(true);
    // Artefak JSON yang sama tidak boleh membuatnya gagal
    const dgnJson = `${teks} {"nilai":31.4,"satuan":"Persen"}`;
    expect(isGroundedText(dgnJson, ev).ok).toBe(true);
  });
});
