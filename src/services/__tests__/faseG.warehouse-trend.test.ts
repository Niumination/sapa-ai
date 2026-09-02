// ─── PR Lapis 2: kontrak warehouse, EWS, tren/perbandingan & KPI ───
// Modul yang diuji MURNI (tanpa IO/DB) sehingga deterministik:
//   warehouse-sync : snapshotChecksum — deteksi perubahan payload SAPA
//   ews-engine     : evaluateEws — ambang & prioritas alert
//   trend-analysis : deret waktu, kandidat tren, deteksi OPD di query
//   kpi            : pemilihan indikator terbaik per definisi KPI
// Nama OPD pada tes perbandingan memakai nama NYATA dari katalog SAPA
// (38 OPD, mirror 23 Agu 2026).

import { describe, it, expect } from 'vitest';
import { snapshotChecksum } from '@/services/warehouse-sync';
import {
  evaluateEws,
  relativeChange,
  DEFAULT_EWS_THRESHOLDS,
  type IndicatorPoint,
} from '@/services/ews-engine';
import {
  buildIndicatorSeries,
  findTrendCandidate,
  isTrendQuery,
  isComparisonQuery,
  buildTrendUnavailableResponse,
  detectOpdsInQuery,
  buildOpdComparisonRows,
  buildComparisonResponse,
} from '@/services/trend-analysis';
import { computeKpis, KPI_DEFS } from '@/services/kpi';
import type { SapaRecord } from '@/lib/sapa-client';

function rec(
  id: number,
  kodeId: number,
  indikator: string,
  opd: string,
  nilai = '10',
  satuan = 'orang',
  tahun: string | null = '2025',
): SapaRecord {
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

// ─── snapshotChecksum ───

describe('snapshotChecksum — deteksi perubahan payload', () => {
  const A: SapaRecord[] = [
    rec(1, 101, 'Jumlah ASN', 'BKPSDM', '9610', 'orang', '2024'),
    rec(2, 102, 'Prevalensi Stunting', 'Dinas Kesehatan', '31,4', 'Persen', '2025'),
  ];

  it('stabil untuk input identik & tidak peduli urutan baris', () => {
    const c1 = snapshotChecksum(A);
    const c2 = snapshotChecksum([...A].reverse());
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('berubah bila nilai berubah', () => {
    const B = [A[0], { ...A[1], variabel: '31,5' }];
    expect(snapshotChecksum(B)).not.toBe(snapshotChecksum(A));
  });

  it('berubah bila baris bertambah / tahun berubah / nama indikator berubah', () => {
    expect(snapshotChecksum([...A, rec(3, 103, 'X', 'Y')])).not.toBe(snapshotChecksum(A));
    expect(snapshotChecksum([A[0], { ...A[1], tahun: '2024' }])).not.toBe(snapshotChecksum(A));
    expect(snapshotChecksum([A[0], { ...A[1], kode_indikator_nama_indikator: 'Prevalensi Stunting Balita' }])).not.toBe(
      snapshotChecksum(A),
    );
  });
});

// ─── evaluateEws ───

function pt(id: number, nilai: number, indikator = `Indikator ${id}`, opd = 'OPD A'): IndicatorPoint {
  return { idKodeIndikator: id, indikator, satuan: 'orang', opd, nilaiNumber: nilai, tahun: '2025' };
}

describe('relativeChange', () => {
  it('menghitung fraksi perubahan relatif', () => {
    expect(relativeChange(100, 150)).toBeCloseTo(0.5);
    expect(relativeChange(100, 80)).toBeCloseTo(-0.2);
  });
  it('prev=0 atau non-finite → null (lewat, terdokumentasi)', () => {
    expect(relativeChange(0, 50)).toBeNull();
    expect(relativeChange(Number.NaN, 10)).toBeNull();
  });
});

describe('evaluateEws — ambang & jenis alert', () => {
  it('|Δ| ≥ 50% → CRITICAL, ≥20% → WARNING, ≥10% → INFO, <10% → diam', () => {
    const prev = [pt(1, 100), pt(2, 100), pt(3, 100), pt(4, 100)];
    const curr = [pt(1, 160), pt(2, 120), pt(3, 110), pt(4, 105)];
    const out = evaluateEws(prev, curr);
    const byId = new Map(out.map((d) => [d.idKodeIndikator, d]));
    expect(byId.get(1)?.severity).toBe('CRITICAL');
    expect(byId.get(2)?.severity).toBe('WARNING');
    expect(byId.get(3)?.severity).toBe('INFO');
    expect(byId.has(4)).toBe(false);
  });

  it('indikator baru → kind=new INFO; hilang → kind=missing INFO', () => {
    const out = evaluateEws([pt(1, 100), pt(2, 50)], [pt(1, 100), pt(3, 70)]);
    const kinds = new Map(out.map((d) => [d.idKodeIndikator, d.kind]));
    expect(kinds.get(3)).toBe('new');
    expect(kinds.get(2)).toBe('missing');
    expect(out.find((d) => d.idKodeIndikator === 3)?.severity).toBe('INFO');
  });

  it('prev=0 dilewati (tidak ada alert div-0)', () => {
    const out = evaluateEws([pt(1, 0)], [pt(1, 80)]);
    expect(out).toHaveLength(0);
  });

  it('hormat batas maxAlerts, prioritas CRITICAL dulu', () => {
    const prev = Array.from({ length: 30 }, (_, i) => pt(i + 1, 100));
    const curr = [
      ...Array.from({ length: 5 }, (_, i) => pt(i + 1, 200)), // CRITICAL
      ...Array.from({ length: 25 }, (_, i) => pt(i + 6, 125)), // WARNING
    ];
    const out = evaluateEws(prev, curr, { ...DEFAULT_EWS_THRESHOLDS, maxAlerts: 8 });
    expect(out).toHaveLength(8);
    expect(out.slice(0, 5).every((d) => d.severity === 'CRITICAL')).toBe(true);
  });

  it('pesan alert memuat nama indikator & OPD', () => {
    const out = evaluateEws([pt(1, 100, 'Prevalensi Stunting', 'Dinas Kesehatan')], [pt(1, 160, 'Prevalensi Stunting', 'Dinas Kesehatan')]);
    expect(out[0].pesan).toContain('Prevalensi Stunting');
    expect(out[0].pesan).toContain('Dinas Kesehatan');
    expect(out[0].pesan).toContain('+60.0%');
  });
});

// ─── tren ───

describe('deret waktu & kandidat tren', () => {
  const MULTI: SapaRecord[] = [
    rec(1, 101, 'Indeks Pembangunan Manusia', 'Bappeda', '70,1', 'indeks', '2022'),
    rec(2, 101, 'Indeks Pembangunan Manusia', 'Bappeda', '71,5', 'indeks', '2023'),
    rec(3, 101, 'Indeks Pembangunan Manusia', 'Bappeda', '72,6', 'indeks', '2024'),
    rec(4, 102, 'Jumlah Koperasi', 'Dinas Koperasi', '6', 'Unit', '2025'),
  ];

  it('buildIndicatorSeries: hanya tahun 4-digit valid, urut naik, nilai diparse koma', () => {
    const s = buildIndicatorSeries(MULTI, 101);
    expect(s).toHaveLength(3);
    expect(s.map((p) => p.tahun)).toEqual(['2022', '2023', '2024']);
    expect(s[0].nilaiNumber).toBeCloseTo(70.1);
  });

  it('buildIndicatorSeries: mengabaikan tahun null/kotor', () => {
    const recs = [
      rec(1, 201, 'X', 'Y', '5', 'Unit', null),
      rec(2, 201, 'X', 'Y', '6', 'Unit', 'tahunan'),
      rec(3, 201, 'X', 'Y', '7', 'Unit', '2024'),
    ];
    expect(buildIndicatorSeries(recs, 201).map((p) => p.tahun)).toEqual(['2024']);
  });

  it('buildIndicatorSeries: mendupe tahun sama (kasus nyata "2025: 13,45" vs "2025: 13,62")', () => {
    const recs = [
      rec(1, 305, 'Kontribusi Sektor Perdagangan terhadap PDRB', 'Dinas Perdagangan', '13,45', 'Persentase', '2025'),
      rec(2, 305, 'Kontribusi Sektor Perdagangan terhadap PDRB', 'Dinas Perdagangan', '13,62', 'Persentase', '2025'),
    ];
    const s = buildIndicatorSeries(recs, 305);
    expect(s).toHaveLength(1);
    expect(s[0].tahun).toBe('2025');
  });

  it('findTrendCandidate: duplikat satu-tahun BUKAN kandidat (anti tren-semu "2025 ke 2025")', () => {
    const recs = [
      rec(1, 305, 'Kontribusi Sektor Perdagangan terhadap PDRB', 'Dinas Perdagangan', '13,45', 'Persentase', '2025'),
      rec(2, 305, 'Kontribusi Sektor Perdagangan terhadap PDRB', 'Dinas Perdagangan', '13,62', 'Persentase', '2025'),
    ];
    expect(findTrendCandidate(recs)).toBeNull();
  });

  it('buildTrendUnavailableResponse: jujur menyatakan keterbatasan + nilai terakhir', () => {
    const recs = [
      rec(1, 2404, 'Indeks Pembangunan Manusia', 'Badan Perencanaan Pembangunan Daerah.', '78,09', 'Indeks', '2025'),
    ];
    const res = buildTrendUnavailableResponse(recs, 'direct');
    expect(res).not.toBeNull();
    expect(res!.narasi).toContain('belum bisa dihitung');
    expect(res!.narasi).toContain('2025');
    expect(res!.narasi).toContain('78,09');
    expect(res!.visualisasi.tipe).toBe('none');
    expect(buildTrendUnavailableResponse([], 'direct')).toBeNull();
  });

  it('findTrendCandidate: ambil indikator pertama ≥2 titik; null bila semua tunggal', () => {
    const cand = findTrendCandidate(MULTI);
    expect(cand?.idKodeIndikator).toBe(101);
    expect(cand?.series).toHaveLength(3);
    expect(findTrendCandidate([rec(9, 999, 'A', 'B', '1', 'u', '2025')])).toBeNull();
  });

  it('isTrendQuery mengenali nada tren & menolak query biasa', () => {
    expect(isTrendQuery('bagaimana tren IPM Aceh Tengah')).toBe(true);
    expect(isTrendQuery('perkembangan stunting dari tahun ke tahun')).toBe(true);
    expect(isTrendQuery('berapa jumlah ASN')).toBe(false);
  });
});

// ─── perbandingan antar-OPD ───

// Nama NYATA dari katalog SAPA (23 Agu 2026)
const REAL_OPDS = [
  'Dinas Kesehatan',
  'Dinas Pendidikan dan Kebudayaan',
  'Dinas Pendidikan Dayah',
  'Dinas Sosial',
  'Dinas Pekerjaan Umum dan Penataan Ruang',
  'Badan Perencanaan Pembangunan Daerah.',
  'Badan Kepegawaian dan Pengembangan SDM',
  'Dinas Pariwisata',
  'Rumah Sakit Umum Datu Beru',
  'Dinas Perhubungan',
];

describe('detectOpdsInQuery — deteksi nama OPD nyata', () => {
  it('"bandingkan dinas kesehatan dan dinas pendidikan" → Dinkes + Disdikbud', () => {
    const out = detectOpdsInQuery(
      'bandingkan dinas kesehatan dan dinas pendidikan',
      REAL_OPDS,
    );
    expect(out).toContain('Dinas Kesehatan');
    expect(out).toContain('Dinas Pendidikan dan Kebudayaan');
    // penyebutan parsial "pendidikan" boleh juga menyentuh Dayah, tapi wajib ≤4
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it('alias dikenali: "dinkes vs disdikbud" → kedua OPD', () => {
    const out = detectOpdsInQuery('dinkes vs disdikbud mana yang datanya lebih banyak', REAL_OPDS);
    expect(out).toContain('Dinas Kesehatan');
    expect(out).toContain('Dinas Pendidikan dan Kebudayaan');
  });

  it('query topik tunggal tanpa nama OPD → ≤1 hasil (biasanya 0)', () => {
    const out = detectOpdsInQuery('berapa jumlah ASN di Aceh Tengah', REAL_OPDS);
    expect(out.length).toBeLessThanOrEqual(1);
  });

  it('tidak ada kecocokan semu dari kata generik saja ("dinas", "badan")', () => {
    const out = detectOpdsInQuery('berapa banyak dinas yang mengisi data', REAL_OPDS);
    expect(out).toHaveLength(0);
  });
});

describe('respons perbandingan deterministik', () => {
  const RECORDS: SapaRecord[] = [
    rec(1, 101, 'Jumlah Bayi Imunisasi', 'Dinas Kesehatan', '900', 'Bayi', '2025'),
    rec(2, 102, 'Jumlah Bayi 0-28 Hari', 'Dinas Kesehatan', '105', 'Bayi', '2025'),
    rec(3, 103, 'Jumlah Sekolah Dasar', 'Dinas Pendidikan dan Kebudayaan', '220', 'Unit', '2024'),
  ];

  it('buildOpdComparisonRows menghitung jumlah data & indikator unik per OPD', () => {
    const rows = buildOpdComparisonRows(['Dinas Kesehatan', 'Dinas Pendidikan dan Kebudayaan'], RECORDS);
    expect(rows).toHaveLength(2);
    expect(rows[0].jumlahData).toBe(2);
    expect(rows[0].indikatorUnik).toBe(2);
    expect(rows[1].jumlahData).toBe(1);
    expect(rows[0].nilaiTeratas?.indikator).toBe('Jumlah Bayi Imunisasi');
  });

  it('buildComparisonResponse: tabel + narasi tanpa LLM, sumber diberi label', () => {
    const rows = buildOpdComparisonRows(['Dinas Kesehatan', 'Dinas Pendidikan dan Kebudayaan'], RECORDS);
    const res = buildComparisonResponse(['Dinas Kesehatan', 'Dinas Pendidikan dan Kebudayaan'], rows, 'direct');
    expect(res.visualisasi.tipe).toBe('table');
    expect(res.narasi).toContain('Dinas Kesehatan');
    expect(res.narasi).toContain('deterministik');
    expect(res.dataSource).toContain('SAPA');
  });

  it('isComparisonQuery mengenali nada banding', () => {
    expect(isComparisonQuery('bandingkan dinas kesehatan dan dinas pendidikan')).toBe(true);
    expect(isComparisonQuery('OPD mana yang datanya paling banyak')).toBe(true);
    expect(isComparisonQuery('berapa jumlah ASN')).toBe(false);
  });
});

// ─── KPI pimpinan ───

describe('computeKpis — pemilihan indikator terbaik', () => {
  const SAPA_MINI: SapaRecord[] = [
    // Varian stunting seperti data nyata: Prevalensi (Bappeda) harus menang
    rec(1, 301, 'Prevalensi Stunting', 'Badan Perencanaan Pembangunan Daerah.', '31,4', 'Persen', '2025'),
    rec(2, 302, 'Jumlah Balita Stunting', 'Dinas Kesehatan', '730', 'Orang', null),
    rec(3, 303, 'Persentase Rumah Tangga Miskin', 'Dinas Sosial', '12,5', 'Persen', '2024'),
    rec(4, 304, 'Indeks Pembangunan Manusia', 'Badan Perencanaan Pembangunan Daerah.', '72,6', 'Indeks', '2024'),
    rec(5, 305, 'Jumlah ASN', 'Badan Kepegawaian dan Pengembangan SDM', '9610', 'Orang', '2026'),
    rec(6, 306, 'Produksi Kopi Arabika', 'Dinas Pertanian', '4200', 'Ton', '2024'),
    rec(7, 307, 'Panjang Jalan Kabupaten', 'Dinas Pekerjaan Umum dan Penataan Ruang', '512,8', 'Km', '2024'),
  ];

  it('stunting → varian "Prevalensi" (bukan "Jumlah Balita Stunting")', () => {
    const kpis = computeKpis(SAPA_MINI);
    const stunting = kpis.find((k) => k.id === 'stunting');
    expect(stunting).toBeDefined();
    expect(stunting!.indikator).toBe('Prevalensi Stunting');
    expect(stunting!.nilai).toBe('31,4');
    expect(stunting!.satuan).toBe('Persen');
  });

  it('KPI yang datanya tidak ada di payload → dilewati, bukan dihalusinasi', () => {
    const kpis = computeKpis(SAPA_MINI, KPI_DEFS);
    const ids = kpis.map((k) => k.id);
    expect(ids).toContain('stunting');
    expect(ids).toContain('ipm');
    expect(ids).toContain('asn');
    expect(ids).toContain('kopi');
    expect(ids).toContain('jalan');
    // PDRB tidak ada di fixture mini → tidak boleh ada kartu PDRB
    expect(ids).not.toContain('pdrb');
  });

  it('delta antar-tahun dihitung bila indikator multi-tahun', () => {
    const recsMulti = [
      rec(1, 401, 'Indeks Pembangunan Manusia', 'Bappeda', '70', 'Indeks', '2023'),
      rec(2, 401, 'Indeks Pembangunan Manusia', 'Bappeda', '77', 'Indeks', '2024'),
    ];
    const kpis = computeKpis(recsMulti, [KPI_DEFS.find((d) => d.id === 'ipm')!]);
    expect(kpis[0].deltaPct).toBeCloseTo(10, 0);
    expect(kpis[0].deltaDir).toBe('up');
  });

  it('delta TIDAK dihitung dari duplikat satu-tahun (kasus nyata ASN 2026 vs 2026)', () => {
    const recsDup = [
      rec(1, 1074, 'Jumlah ASN', 'Badan Kepegawaian dan Pengembangan SDM', '9610', 'Orang', '2026'),
      rec(2, 1074, 'Jumlah ASN', 'Badan Kepegawaian dan Pengembangan SDM', '9694', 'Orang', '2026'),
    ];
    const kpis = computeKpis(recsDup, [KPI_DEFS.find((d) => d.id === 'asn')!]);
    expect(kpis[0].deltaPct).toBeNull();
    expect(kpis[0].deltaDir).toBeNull();
  });

  it('jalan: avoidIncludes menghindar varian "lingkungan bertrotoar" walau muncul duluan', () => {
    const recsJalan = [
      rec(1, 848, 'Jumlah Panjang Jalan Lingkungan Bertrotoar', 'Dinas Perumahan dan Permukiman', '0', 'Meter', null),
      rec(2, 850, 'Jumlah Panjang Jalan Lingkungan Berdrainase', 'Dinas Perumahan dan Permukiman', '0', 'Meter', null),
      rec(3, 849, 'Jumlah Panjang Jalan', 'Dinas PUPR', '2.156,28', 'Km', '2025'),
    ];
    const kpis = computeKpis(recsJalan, [KPI_DEFS.find((d) => d.id === 'jalan')!]);
    expect(kpis[0].indikator).toBe('Jumlah Panjang Jalan');
    expect(kpis[0].nilai).toBe('2.156,28');
  });

  it('pdrb: nilai berpemisah ribuan TIDAK menghilangkan kartu (kasus nyata baterai)', () => {
    const recsPdrb = [
      rec(1, 140, 'Total PDRB Penyediaan Akomodasi Makan dan Minum', 'Dinas Pariwisata', '247', 'Total PDRB', '2025'),
      rec(2, 1831, 'PDRB Tahun Berjalan atas dasar Harga Konsisten', 'Bappeda', '11.503.360.000.000', 'Rupiah', null),
    ];
    const kpis = computeKpis(recsPdrb, KPI_DEFS);
    const pdrb = kpis.find((k) => k.id === 'pdrb');
    expect(pdrb).toBeDefined();
    expect(pdrb!.indikator).toBe('PDRB Tahun Berjalan atas dasar Harga Konsisten');
    expect(pdrb!.nilai).toBe('11.503.360.000.000');
  });

  it('asn: prefer frasa "jumlah asn" menang atas sinonim jarak jauh (kasus nyata baterai)', () => {
    const recsAsn = [
      rec(1, 990, 'Jumlah usulan permohonan nota pertimbangan kenaikan pangkat PNS', 'BKPSDM', '486', 'pegawai', '2025'),
      rec(2, 1074, 'Jumlah ASN', 'Badan Kepegawaian dan Pengembangan SDM', '9610', 'Orang', '2026'),
    ];
    const kpis = computeKpis(recsAsn, [KPI_DEFS.find((d) => d.id === 'asn')!]);
    expect(kpis[0].indikator).toBe('Jumlah ASN');
  });
});
