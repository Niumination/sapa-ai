// ─── Generator Laporan Eksekutif (PR-3) — inti MURNI, tanpa IO/DB ───
// Menutup temuan audit: '/dashboard/laporan' selama ini hanya penampil LOG
// percakapan; fitur inti "laporan naratif otomatis" (visi NotebookLM) belum
// pernah dibangun. Prinsip SoT tetap berlaku: SEMUA naratif laporan dirakit
// dari template deterministik atas angka nyata — 100% grounded, 0 halusinasi,
// instan (<1 s), dan gratis (tanpa panggilan LLM).
//
// Laporan punya 6 seksi tetap: judul, ringkasan eksekutif, KPI prioritas,
// EWS, perubahan warehouse, kualitas data. Seksi yang datanya belum tersedia
// (warehouse belum disiapkan) menjelaskan keterbatasannya secara jujur alih-
// alih menghilang atau mengarang.

import { dataSourceLabel, normalizeText, type SapaDataOrigin, type SapaRecord } from '@/lib/sapa-client';
import type { KpiResult } from './kpi';

// ─── Tipe IO (route yang mengumpulkannya; inti tetap murni) ───

export interface ReportAlert {
  indikator: string;
  satuan: string;
  pesan: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  createdAt: string;
}

export interface WarehouseDiffCounts {
  changed: number;
  baru: number;
  hilang: number;
}

export interface WarehouseMeta {
  snapshotCount: number;
  /** ISO tanggal snapshot terakhir */
  lastSync: string;
  /** perbandingan dua snapshot terakhir; null bila baru ada 1 snapshot */
  diffVsPrev: WarehouseDiffCounts | null;
}

export interface ReportInput {
  records: SapaRecord[];
  origin: SapaDataOrigin;
  kpis: KpiResult[];
  /** null = tabel EWS/warehouse belum ada (setup belum dijalankan) */
  alerts: ReportAlert[] | null;
  /** null = tabel warehouse belum ada */
  warehouse: WarehouseMeta | null;
}

// ─── Tipe output ───

export interface AngkaKunci {
  label: string;
  nilai: string;
}

export interface ExecutiveReport {
  judul: string;
  generatedAt: string;
  sumberLabel: string;
  ringkasan: { narasi: string; angkaKunci: AngkaKunci[] };
  kpi: KpiResult[];
  ews: {
    status: 'aktif' | 'belum_aktif';
    narasi: string;
    alerts: ReportAlert[];
  };
  perubahan: { tersedia: boolean; narasi: string };
  kualitasData: {
    cakupanTahunPct: number;
    narasi: string;
    temuan: string[];
  };
}

// ─── Statistik portal (murni) ───

export interface PortalStats {
  totalRecords: number;
  totalOpd: number;
  totalIndikator: number;
  tahunValid: number;
  tahunKosong: number;
  cakupanTahunPct: number;
  indikatorMultiTahun: number;
  /** OPD tanpa satu pun record bertahun valid */
  opdTanpaTahun: { nama: string; jumlah: number }[];
  indikatorNilaiNol: number;
}

const Y4 = /^\d{4}$/;

export function computePortalStats(records: SapaRecord[]): PortalStats {
  const opds = new Map<string, { nama: string; total: number; tahunValid: number }>();
  const indikator = new Set<string>();
  const indTahun = new Map<number, Set<string>>();
  let tahunValid = 0;
  let indikatorNilaiNol = 0;

  for (const r of records) {
    const nama = r.opds_nama_opd.trim() || '(tanpa OPD)';
    const key = normalizeText(nama) || 'unknown';
    const o = opds.get(key) ?? { nama, total: 0, tahunValid: 0 };
    o.total++;
    const t = (r.tahun ?? '').trim();
    if (Y4.test(t)) {
      o.tahunValid++;
      tahunValid++;
      const s = indTahun.get(r.id_kode_indikator) ?? new Set<string>();
      s.add(t);
      indTahun.set(r.id_kode_indikator, s);
    }
    opds.set(key, o);

    const indNama = (r.kode_indikator_nama_indikator ?? '').trim();
    if (indNama) indikator.add(`${indNama}|||${(r.satuan ?? '').trim()}`);

    const n = Number(String(r.variabel).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (n === 0) indikatorNilaiNol++;
  }

  const opdTanpaTahun = [...opds.values()]
    .filter((o) => o.tahunValid === 0)
    .sort((a, b) => b.total - a.total)
    .map((o) => ({ nama: o.nama, jumlah: o.total }));

  const totalRecords = records.length;
  const tahunKosong = totalRecords - tahunValid;
  return {
    totalRecords,
    totalOpd: opds.size,
    totalIndikator: indikator.size,
    tahunValid,
    tahunKosong,
    cakupanTahunPct: totalRecords > 0 ? (tahunValid / totalRecords) * 100 : 0,
    indikatorMultiTahun: [...indTahun.values()].filter((s) => s.size >= 2).length,
    opdTanpaTahun,
    indikatorNilaiNol,
  };
}

// ─── Seksi-seksi (murni) ───

const ALLOWED_SEV = new Set(['INFO', 'WARNING', 'CRITICAL']);
const sevRank = (s: string) => (s === 'CRITICAL' ? 0 : s === 'WARNING' ? 1 : 2);

function fmtTanggalId(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildExecutiveSummary(input: ReportInput, stats: PortalStats): { narasi: string; angkaKunci: AngkaKunci[] } {
  const kpiTerisi = input.kpis.length;
  const narasi =
    `Portal SAPA Kabupaten Aceh Tengah saat ini memuat ${stats.totalRecords.toLocaleString('id-ID')} record ` +
    `dari ${stats.totalOpd} OPD dengan ${stats.totalIndikator.toLocaleString('id-ID')} indikator unik. ` +
    `Cakupan data bertahun valid ${stats.cakupanTahunPct.toFixed(1)}% dari total record; ` +
    `${stats.tahunKosong.toLocaleString('id-ID')} record (${(100 - stats.cakupanTahunPct).toFixed(1)}%) belum mencantumkan tahun. ` +
    `${stats.indikatorMultiTahun} indikator memiliki deret multi-tahun yang bisa menghasilkan tren historis. ` +
    `Dari 8 KPI prioritas pimpinan, ${kpiTerisi} berhasil dihitung langsung dari data sumber. ` +
    `Laporan ini dihimpun deterministik dari ${dataSourceLabel(input.origin)} — tanpa penafsiran AI atas angka.`;
  const angkaKunci: AngkaKunci[] = [
    { label: 'Total Record', nilai: stats.totalRecords.toLocaleString('id-ID') },
    { label: 'OPD Pelapor', nilai: String(stats.totalOpd) },
    { label: 'Indikator Unik', nilai: stats.totalIndikator.toLocaleString('id-ID') },
    { label: 'Cakupan Tahun Valid', nilai: `${stats.cakupanTahunPct.toFixed(1)}%` },
    { label: 'Indikator Multi-Tahun', nilai: String(stats.indikatorMultiTahun) },
    { label: 'KPI Terhitung', nilai: `${kpiTerisi}/8` },
  ];
  return { narasi, angkaKunci };
}

export function buildEwsSection(alerts: ReportAlert[] | null): ExecutiveReport['ews'] {
  if (alerts === null) {
    return {
      status: 'belum_aktif',
      narasi:
        'Tabel warehouse/EWS belum tersedia di basis data, sehingga pemantauan perubahan belum berjalan. ' +
        'Aktifkan dengan satu langkah setup (POST /api/setup dengan x-setup-token, lalu picu /api/cron/sync-sapa); ' +
        'setelah itu sinkronisasi harian otomatis membandingkan snapshot dan menulis alert di sini.',
      alerts: [],
    };
  }
  const valid = alerts
    .filter((a) => a && typeof a.pesan === 'string' && ALLOWED_SEV.has(a.severity))
    .sort((a, b) => sevRank(a.severity) - sevRank(b.severity));
  const nC = valid.filter((a) => a.severity === 'CRITICAL').length;
  const nW = valid.filter((a) => a.severity === 'WARNING').length;
  const nI = valid.filter((a) => a.severity === 'INFO').length;
  const narasi =
    valid.length === 0
      ? 'Sistem peringatan dini aktif dan tidak mencatat alert terbuka: belum ada indikator yang berubah melewati ' +
        'ambang (±10/20/50%) pada sinkronisasi snapshot terakhir. Status ini dibaca dari basis data, bukan asumsi.'
      : `Sistem peringatan dini mencatat ${valid.length} alert terbuka — ` +
        `${nC} kritis, ${nW} peringatan, ${nI} info — dari perbandingan snapshot warehouse. ` +
        `Alert kritis perlu perhatian segera; daftar lengkap tercantum di bawah.`;
  return { status: 'aktif', narasi, alerts: valid.slice(0, 20) };
}

export function buildChangeSection(warehouse: WarehouseMeta | null): ExecutiveReport['perubahan'] {
  if (warehouse === null) {
    return {
      tersedia: false,
      narasi:
        'Perbandingan perubahan data antar-periode belum tersedia karena warehouse snapshot belum dibuat. ' +
        'Setelah setup (lihat seksi EWS), snapshot harian membangun histori dan seksi ini menampilkan jumlah ' +
        'indikator yang berubah, baru, dan hilang pada setiap publikasi SAPA.',
    };
  }
  if (warehouse.snapshotCount === 0) {
    return {
      tersedia: false,
      narasi:
        'Tabel warehouse sudah ada tetapi belum ada snapshot tersimpan. Jalankan sinkronisasi pertama ' +
        '(/api/cron/sync-sapa) untuk mulai membangun histori.',
    };
  }
  if (warehouse.snapshotCount === 1 || !warehouse.diffVsPrev) {
    return {
      tersedia: false,
      narasi:
        `Warehouse memiliki 1 snapshot dasar (tersimpan ${fmtTanggalId(warehouse.lastSync)}). ` +
        'Perbandingan perubahan mulai dihitung pada snapshot berikutnya — sistem hanya membuat snapshot baru ' +
        'bila payload SAPA benar-benar berubah (checksum), sehingga setiap baris histori adalah perubahan nyata.',
    };
  }
  const d = warehouse.diffVsPrev;
  const narasi =
    `Warehouse memiliki ${warehouse.snapshotCount} snapshot; publikasi terakhir ${fmtTanggalId(warehouse.lastSync)}. ` +
    `Dibandingkan snapshot sebelumnya: ${d.changed} indikator berubah nilai, ${d.baru} indikator baru tercatat, ` +
    `${d.hilang} indikator tidak lagi hadir di payload. ` +
    (d.changed + d.baru + d.hilang === 0
      ? 'Tidak ada perubahan pada publikasi terakhir — kondisi stabil.'
      : 'Rincian yang melewati ambang kewaspadaan otomatis tercatat sebagai alert EWS pada seksi sebelumnya.');
  return { tersedia: true, narasi };
}

export function buildDataQualitySection(stats: PortalStats): ExecutiveReport['kualitasData'] {
  const temuan: string[] = [];
  if (stats.tahunKosong > 0) {
    temuan.push(
      `${stats.tahunKosong.toLocaleString('id-ID')} record (${(100 - stats.cakupanTahunPct).toFixed(1)}%) tidak mencantumkan tahun — ` +
        'batasi analisis deret waktu; perlu penertiban pengisian atribut tahun oleh OPD pengampu.',
    );
  }
  if (stats.opdTanpaTahun.length > 0) {
    const names = stats.opdTanpaTahun.slice(0, 3).map((o) => `${o.nama} (${o.jumlah} record)`);
    temuan.push(
      `${stats.opdTanpaTahun.length} OPD belum memiliki satu pun record bertahun valid, terbanyak: ${names.join('; ')}.`,
    );
  }
  if (stats.indikatorNilaiNol > 0) {
    temuan.push(
      `${stats.indikatorNilaiNol.toLocaleString('id-ID')} record bernilai tepat 0 — perlu verifikasi: nol riil atau belum diisi.`,
    );
  }
  if (stats.indikatorMultiTahun < 50) {
    temuan.push(
      `Hanya ${stats.indikatorMultiTahun} indikator multi-tahun di payload saat ini; snapshot warehouse harian ` +
        'mulai membangun deret histori riil ke depan untuk menutup celah ini.',
    );
  }
  const narasi =
    temuan.length === 0
      ? 'Tidak ada temuan kualitas data yang menonjol pada payload saat ini.'
      : 'Temuan berikut dihitung langsung dari payload sumber (bukan penilaian AI) dan dimaksudkan sebagai ' +
        'bahan pembinaan tata kelola data antar-OPD:';
  return { cakupanTahunPct: stats.cakupanTahunPct, narasi, temuan };
}

// ─── Perakitan (murni) ───

export function buildReport(input: ReportInput): ExecutiveReport {
  const stats = computePortalStats(input.records);
  return {
    judul: 'Laporan Eksekutif Data Daerah — Kabupaten Aceh Tengah',
    generatedAt: new Date().toISOString(),
    sumberLabel: dataSourceLabel(input.origin),
    ringkasan: buildExecutiveSummary(input, stats),
    kpi: input.kpis,
    ews: buildEwsSection(input.alerts),
    perubahan: buildChangeSection(input.warehouse),
    kualitasData: buildDataQualitySection(stats),
  };
}
