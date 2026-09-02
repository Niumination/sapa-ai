// ─── PR Lapis 1: kontrak retrieval v2 + guard output ───
// Regresi untuk kasus empiris temuan audit (live site, 23 Agu 2026):
//   "angka kemiskinan" → dijawab data atlet Angkat Berat
//   "tren data sapa"   → dijawab data Koppontren & Pesantren
//   "harga saham"      → dijawab data bayi 0-28 Hari
//   chip "Semua OPD"   → selalu "tidak ditemukan"
//   narasi literal "..." dari model → lolos ke UI

import { describe, it, expect } from 'vitest';
import {
  tokenizeQuery,
  stemId,
  retrieveRelevant,
  scoreRecord,
  buildMatchGroups,
  extractYears,
  type SapaRecord,
} from '@/lib/sapa-client';
import { detectMetaQuery } from '@/services/meta-query';
import { isPlaceholderText } from '@/services/ai-orchestrator';
import { isGrounded, buildVizFromEvidence, type EvidenceItem } from '@/services/grounding';
import type { HybridResponse } from '@/types';

function rec(id: number, kodeId: number, indikator: string, opd: string, nilai = '10', satuan = 'orang', tahun: string | null = '2025'): SapaRecord {
  return {
    id,
    id_kode_indikator: kodeId,
    kode_indikator_kode_indikator: `K${kodeId}`,
    kode_indikator_nama_indikator: indikator,
    id_opds: 1,
    opds_nama_opd: opd,
    jadwal_pemutakhiran: 'Tahunan',
    satuan,
    tahun,
    variabel: nilai,
  };
}

const CATALOG: SapaRecord[] = [
  rec(1, 101, 'Jumlah Penduduk Miskin', 'Dinas Sosial', '12000'),
  rec(2, 102, 'Jumlah Atlet Cabang Olahraga Angkat Berat', 'Dinas Pemuda dan Olahraga', '4'),
  rec(3, 103, 'Jumlah Koperasi Koppontren', 'Dinas Koperasi dan UKM', '6', 'Unit', null),
  rec(4, 104, 'Indeks Kemandirian Pesantren', 'Dinas Pendidikan Dayah', '6', 'Dayah/Pesantren', null),
  rec(5, 105, 'Indeks Pembangunan Manusia', 'Bappeda', '72.5', 'indeks'),
  rec(6, 106, 'Indeks Pembangunan Masyarakat (IPMas) atau Indeks Literasi', 'Dinas Perpustakaan dan Kearsipan', '50.1', 'indeks'),
  rec(7, 107, 'Jumlah Bayi Usia 0 - 28 Hari', 'Dinas Kesehatan', '105', 'Bayi'),
  rec(8, 108, 'Jumlah Balita Stunting', 'Dinas Kesehatan', '730', 'Orang'),
  rec(9, 109, 'CASN yang meningkatkan kapasitasnya melalui program pelatihan dasar', 'Badan Kepegawaian dan Pengembangan SDM', '2154', 'Orang', null),
  rec(10, 110, 'Jumlah ASN', 'Badan Kepegawaian dan Pengembangan SDM', '9610', 'pegawai', '2026'),
];

describe('tokenizeQuery — domain stopword', () => {
  it('membuang kata domain pemicu salah-topic', () => {
    expect(tokenizeQuery('berapa angka kemiskinan')).toEqual(['kemiskinan']);
    expect(tokenizeQuery('bagaimana tren data sapa')).toEqual([]);
    expect(tokenizeQuery('berapa harga saham telkom hari ini')).toEqual(['harga', 'saham', 'telkom']);
    expect(tokenizeQuery('berapa persentase stunting')).toEqual(['stunting']);
  });
  it('tetap mempertahankan kontrak lama', () => {
    expect(tokenizeQuery('berapa data')).toEqual([]);
    expect(tokenizeQuery('berapa jumlah ASN')).toContain('asn');
  });
});

describe('stemId — stemming ringan konsisten dua sisi', () => {
  it('kemiskinan ↔ miskin', () => {
    expect(stemId('kemiskinan')).toBe('miskin');
    expect(stemId('miskin')).toBe('miskin');
  });
  it('kesehatan ↔ sehat, tapi "sehat" sendiri tidak terpotong', () => {
    expect(stemId('kesehatan')).toBe('sehat');
    expect(stemId('sehat')).toBe('sehat');
  });
  it('tidak merusak kata kunci', () => {
    expect(stemId('stunting')).toBe('stunting');
    expect(stemId('angka')).toBe('angka');
    expect(stemId('angkat')).toBe('angkat');
  });
});

describe('retrieveRelevant — gerbang kepercayaan retrieval', () => {
  it('REGRESI: "angka kemiskinan" → data kemiskinan, BUKAN atlet Angkat Berat', () => {
    const out = retrieveRelevant(CATALOG, 'berapa angka kemiskinan di aceh tengah');
    const names = out.map((s) => s.record.kode_indikator_nama_indikator ?? '');
    expect(names).toContain('Jumlah Penduduk Miskin');
    expect(names.some((n) => /Angkat/.test(n))).toBe(false);
  });

  it('REGRESI: "tren data sapa" → token kosong → retrieveRelevant kosong (bukan Koppontren)', () => {
    expect(retrieveRelevant(CATALOG, 'bagaimana tren data sapa di aceh tengah')).toEqual([]);
  });

  it('REGRESI: "harga saham telkom" → kosong (bukan data bayi)', () => {
    expect(retrieveRelevant(CATALOG, 'berapa harga saham telkom hari ini')).toEqual([]);
  });

  it('sinonim IPM: menemukan Indeks Pembangunan Manusia, BUKAN IPMas/literasi', () => {
    const out = retrieveRelevant(CATALOG, 'ipm aceh tengah');
    const names = out.map((s) => s.record.kode_indikator_nama_indikator ?? '');
    expect(names).toContain('Indeks Pembangunan Manusia');
    expect(names.some((n) => /IPMas|Literasi/.test(n))).toBe(false);
  });

  it('asn: juga menangkap record CASN via grup sinonim', () => {
    const out = retrieveRelevant(CATALOG, 'berapa jumlah asn');
    const names = out.map((s) => s.record.kode_indikator_nama_indikator ?? '');
    expect(names).toContain('Jumlah ASN');
    expect(names).toContain('CASN yang meningkatkan kapasitasnya melalui program pelatihan dasar');
  });

  it('skor: kecocokan indikator penuh mengalahkan kecocokan parsial', () => {
    const groups = buildMatchGroups(tokenizeQuery('jumlah balita stunting'));
    const stunting = scoreRecord(CATALOG.find((r) => r.id === 8)!, groups);
    const bayi = scoreRecord(CATALOG.find((r) => r.id === 7)!, groups);
    expect(stunting.indHits).toBeGreaterThan(0);
    expect(bayi.indHits).toBe(0); // "balita" tidak cocok di "Bayi Usia 0-28 Hari"
    expect(stunting.score).toBeGreaterThan(bayi.score);
  });
});

describe('extractYears', () => {
  it('menangkap tahun eksplisit', () => {
    expect(extractYears('produksi kopi arabika tahun 2024')).toEqual(['2024']);
    expect(extractYears('data 2023 dan 2025')).toEqual(['2023', '2025']);
    expect(extractYears('tanpa tahun')).toEqual([]);
  });
});

describe('detectMetaQuery', () => {
  it('REGRESI: chip "Semua OPD" sekarang terjawab deterministik', () => {
    expect(detectMetaQuery('apa saja OPD yang ada di aceh tengah')).toBe('daftar_opd');
  });
  it('sebaran tahun & statistik portal', () => {
    expect(detectMetaQuery('bagaimana sebaran data sapa per tahun')).toBe('sebaran_tahun');
    expect(detectMetaQuery('berapa total data indikator sapa')).toBe('statistik_portal');
  });
  it('pertanyaan substantif TIDAK meta', () => {
    expect(detectMetaQuery('berapa jumlah ASN di aceh tengah')).toBeNull();
    expect(detectMetaQuery('berapa jumlah balita stunting')).toBeNull();
    expect(detectMetaQuery('berapa jumlah tenaga kerja di aceh tengah')).toBeNull();
  });
});

describe('isPlaceholderText — guard narasi "..."', () => {
  it('REGRESI: placeholder lolos ke UI di produksi', () => {
    expect(isPlaceholderText('...')).toBe(true);
    expect(isPlaceholderText('…')).toBe(true);
    expect(isPlaceholderText('')).toBe(true);
    expect(isPlaceholderText('"..."')).toBe(true);
  });
  it('narasi asli tidak ditolak', () => {
    expect(isPlaceholderText('Jumlah ASN tercatat 9.610 pegawai.')).toBe(false);
  });
});

describe('grounding extras — statistik resmi bukan halu', () => {
  const ev: EvidenceItem[] = [
    { opd: 'BKPSDM', indikator: 'Jumlah ASN', nilai: '9610', satuan: 'pegawai', tahun: '2026', id: 110 },
  ];
  const mk = (narasi: string): HybridResponse => ({
    narasi,
    visualisasi: { tipe: 'none', konfigurasi: {} },
    rekomendasi: [],
    dataSource: 'test',
    timestamp: '',
  });

  it('tanpa extras: total data dihukum sebagai halu (perilaku lama)', () => {
    const check = isGrounded(mk('Dari total 2032 data, ASN 9610 pegawai pada 2026.'), ev);
    expect(check.ok).toBe(false);
  });

  it('dengan extras: statistik resmi lolos, angka karangan tetap ditolak', () => {
    const ok = isGrounded(mk('Dari total 2032 data, ASN 9610 pegawai pada 2026.'), ev, {
      extraAllowedNumbers: [2032],
    });
    expect(ok.ok).toBe(true);
    const halu = isGrounded(mk('Dari total 2032 data, ASN 9610, pegawai kontrak 500.'), ev, {
      extraAllowedNumbers: [2032],
    });
    expect(halu.ok).toBe(false);
  });
});

describe('buildVizFromEvidence — satuan campur → tabel', () => {
  it('REGRESI: chart mencampur orang + indeks', () => {
    const ev: EvidenceItem[] = [
      { opd: 'BKPSDM', indikator: 'Jumlah ASN', nilai: '9610', satuan: 'pegawai', tahun: '2026', id: 1 },
      { opd: 'BKPSDM', indikator: 'Indeks Profesionalitas', nilai: '27,89', satuan: 'indeks', tahun: null, id: 2 },
    ];
    expect(buildVizFromEvidence(ev).tipe).toBe('table');
  });
  it('satuan seragam tetap chart', () => {
    const ev: EvidenceItem[] = [
      { opd: 'A', indikator: 'Ind1', nilai: '10', satuan: 'orang', tahun: '2025', id: 1 },
      { opd: 'A', indikator: 'Ind2', nilai: '20', satuan: 'Orang', tahun: '2025', id: 2 },
    ];
    expect(buildVizFromEvidence(ev).tipe).toBe('chart');
  });
});
