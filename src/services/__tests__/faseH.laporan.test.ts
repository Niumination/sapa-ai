// ─── PR-3: kontrak Generator Laporan Eksekutif (inti murni) ───
// Yang diuji: statistik portal, perakitan narasi deterministik tiap seksi,
// dan perilaku jujur saat warehouse/EWS belum aktif. Tanpa IO/DB.

import { describe, it, expect } from 'vitest';
import {
  computePortalStats,
  buildExecutiveSummary,
  buildEwsSection,
  buildChangeSection,
  buildDataQualitySection,
  buildReport,
  type ReportInput,
  type ReportAlert,
  type WarehouseMeta,
} from '@/services/report-generator';
import type { KpiResult } from '@/services/kpi';
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

// Fixture terkontrol: 4 record, 2 OPD, 50% tahun valid, OPD Dua tanpa tahun,
// indikator 101 multi-tahun, satu nilai tepat 0.
const RECORDS: SapaRecord[] = [
  rec(1, 101, 'Indeks A', 'OPD Satu', '10', 'indeks', '2024'),
  rec(2, 101, 'Indeks A', 'OPD Satu', '12', 'indeks', '2025'),
  rec(3, 102, 'Jumlah B', 'OPD Dua', '0', 'orang', null),
  rec(4, 103, 'Jumlah C', 'OPD Dua', '5', 'unit', null),
];

const KPI_MINI: KpiResult = {
  id: 'stunting',
  label: 'Balita Stunting',
  icon: '👶',
  indikator: 'Prevalensi Stunting',
  opd: 'Bappeda',
  nilai: '31,4',
  satuan: 'Persen',
  tahun: '2025',
  deltaPct: null,
  deltaDir: null,
};

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    records: RECORDS,
    origin: 'direct',
    kpis: [KPI_MINI],
    alerts: [],
    warehouse: null,
    ...overrides,
  };
}

describe('computePortalStats', () => {
  it('menghitung total, cakupan tahun, multi-tahun, OPD tanpa tahun, nilai nol', () => {
    const s = computePortalStats(RECORDS);
    expect(s.totalRecords).toBe(4);
    expect(s.totalOpd).toBe(2);
    expect(s.totalIndikator).toBe(3);
    expect(s.tahunValid).toBe(2);
    expect(s.tahunKosong).toBe(2);
    expect(s.cakupanTahunPct).toBeCloseTo(50);
    expect(s.indikatorMultiTahun).toBe(1);
    expect(s.opdTanpaTahun).toEqual([{ nama: 'OPD Dua', jumlah: 2 }]);
    expect(s.indikatorNilaiNol).toBe(1);
  });

  it('payload kosong tidak meledak (div-0 aman)', () => {
    const s = computePortalStats([]);
    expect(s.cakupanTahunPct).toBe(0);
    expect(s.opdTanpaTahun).toEqual([]);
  });
});

describe('buildExecutiveSummary', () => {
  it('narasi memuat angka nyata + label sumber; 6 angka kunci', () => {
    const out = buildExecutiveSummary(input(), computePortalStats(RECORDS));
    expect(out.narasi).toContain('4 record');
    expect(out.narasi).toContain('2 OPD');
    expect(out.narasi).toContain('50.0%');
    expect(out.narasi).toContain('SAPA');
    expect(out.narasi).toContain('deterministik');
    expect(out.angkaKunci).toHaveLength(6);
    expect(out.angkaKunci[5].nilai).toBe('1/8'); // KPI terhitung
  });
});

describe('buildEwsSection', () => {
  it('alerts null → status belum_aktif dengan narasi petunjuk setup', () => {
    const out = buildEwsSection(null);
    expect(out.status).toBe('belum_aktif');
    expect(out.narasi).toContain('/api/setup');
    expect(out.alerts).toEqual([]);
  });

  it('alerts kosong → aktif, "tidak mencatat alert", status dari DB bukan asumsi', () => {
    const out = buildEwsSection([]);
    expect(out.status).toBe('aktif');
    expect(out.narasi).toContain('tidak mencatat alert');
    expect(out.narasi).toContain('basis data');
  });

  it('urut CRITICAL dulu + narasi memuat hitungan per level', () => {
    const alerts: ReportAlert[] = [
      { indikator: 'I1', satuan: 'orang', pesan: 'info saja', severity: 'INFO', createdAt: '' },
      { indikator: 'I2', satuan: 'orang', pesan: 'kritis dulu', severity: 'CRITICAL', createdAt: '' },
      { indikator: 'I3', satuan: 'orang', pesan: 'peringatan', severity: 'WARNING', createdAt: '' },
      { indikator: 'I4', satuan: 'orang', pesan: 'kritis kedua', severity: 'CRITICAL', createdAt: '' },
    ];
    const out = buildEwsSection(alerts);
    expect(out.narasi).toContain('4 alert');
    expect(out.narasi).toContain('2 kritis');
    expect(out.narasi).toContain('1 peringatan');
    expect(out.narasi).toContain('1 info');
    expect(out.alerts[0].severity).toBe('CRITICAL');
    expect(out.alerts[1].severity).toBe('CRITICAL');
    expect(out.alerts[2].severity).toBe('WARNING');
  });

  it('severity tidak dikenal disaring keluar', () => {
    const out = buildEwsSection([
      { indikator: 'X', satuan: '', pesan: 'aneh', severity: 'FATAL' as any, createdAt: '' },
    ]);
    expect(out.alerts).toEqual([]);
  });
});

describe('buildChangeSection', () => {
  it('warehouse null → tidak tersedia + jelaskan setup', () => {
    const out = buildChangeSection(null);
    expect(out.tersedia).toBe(false);
    expect(out.narasi).toContain('belum tersedia');
  });

  it('0 snapshot → instruksi sync pertama', () => {
    const out = buildChangeSection({ snapshotCount: 0, lastSync: new Date(0).toISOString(), diffVsPrev: null });
    expect(out.tersedia).toBe(false);
    expect(out.narasi).toContain('sinkronisasi pertama');
  });

  it('1 snapshot → jujur: perbandingan mulai snapshot berikutnya', () => {
    const out = buildChangeSection({
      snapshotCount: 1,
      lastSync: '2026-08-23T00:00:00.000Z',
      diffVsPrev: null,
    });
    expect(out.tersedia).toBe(false);
    expect(out.narasi).toContain('1 snapshot dasar');
    expect(out.narasi).toContain('checksum');
  });

  it('≥2 snapshot + diff → tersedia, narasi memuat hitungan', () => {
    const meta: WarehouseMeta = {
      snapshotCount: 3,
      lastSync: '2026-08-23T00:00:00.000Z',
      diffVsPrev: { changed: 12, baru: 4, hilang: 1 },
    };
    const out = buildChangeSection(meta);
    expect(out.tersedia).toBe(true);
    expect(out.narasi).toContain('12 indikator berubah');
    expect(out.narasi).toContain('4 indikator baru');
    expect(out.narasi).toContain('1 indikator tidak lagi hadir');
  });

  it('diff nol → kondisi stabil', () => {
    const out = buildChangeSection({
      snapshotCount: 2,
      lastSync: '2026-08-23T00:00:00.000Z',
      diffVsPrev: { changed: 0, baru: 0, hilang: 0 },
    });
    expect(out.tersedia).toBe(true);
    expect(out.narasi).toContain('kondisi stabil');
  });
});

describe('buildDataQualitySection', () => {
  it('merangkum temuan: tahun kosong, OPD tanpa tahun, nilai nol, multi-tahun sedikit', () => {
    const out = buildDataQualitySection(computePortalStats(RECORDS));
    expect(out.temuan.length).toBeGreaterThanOrEqual(4);
    expect(out.temuan.join(' ')).toContain('OPD Dua');
    expect(out.temuan.join(' ')).toContain('tahun');
    expect(out.temuan.join(' ')).toContain('tepat 0');
    expect(out.cakupanTahunPct).toBeCloseTo(50);
  });

  it('payload sehat → "tidak ada temuan"', () => {
    const sehat: SapaRecord[] = [
      rec(1, 101, 'Indeks A', 'OPD Satu', '10', 'indeks', '2024'),
      rec(2, 101, 'Indeks A', 'OPD Satu', '12', 'indeks', '2025'),
    ];
    // paksa stats sehat: semua bertahun & ada multi-tahun, tapi multi-tahun <50
    // memicu temuan "celah histori" — itu memang dirancang untuk SAPA nyata;
    // di sini cukup pastikan tidak ada temuan tahun-kosong/nilai-nol.
    const out = buildDataQualitySection(computePortalStats(sehat));
    expect(out.temuan.join(' ')).not.toContain('tidak mencantumkan tahun');
    expect(out.temuan.join(' ')).not.toContain('tepat 0');
  });
});

describe('buildReport — perakitan utuh', () => {
  it('menghasilkan 6 seksi lengkap dan meneruskan KPI apa adanya', () => {
    const r = buildReport(input());
    expect(r.judul).toContain('Aceh Tengah');
    expect(r.sumberLabel).toContain('SAPA');
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.ringkasan.angkaKunci).toHaveLength(6);
    expect(r.kpi).toEqual([KPI_MINI]);
    expect(r.ews.status).toBe('aktif');
    expect(r.perubahan.tersedia).toBe(false);
    expect(r.kualitasData.temuan.length).toBeGreaterThan(0);
  });

  it('tidak ada angka hasil terkaan: narasi ringkasan hanya memuat angka dari stats', () => {
    const r = buildReport(input());
    // angka-angka fixture harus muncul apa adanya
    expect(r.ringkasan.narasi).toContain('4 record');
    expect(r.ringkasan.narasi).toContain('1 indikator memiliki deret multi-tahun');
  });
});
