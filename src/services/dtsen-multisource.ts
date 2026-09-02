// ─── DTSEN Multi-Source Parser (PR-4c / Lapis 4 — multi-sumber) ───
// Mendukung import data dari berbagai format:
//   1. Format DTSEN standar (CSV: nik, nama, no_kk, kecamatan, desa, desil, pkh, bpnt, pbi_jk)
//   2. Format stunting (Excel: NIK, Nama, JK, Kec, Desa/Kel, Posyandu, dll)
//   3. Format kominfo (Excel: NIK, NAMA, KETERANGAN DESIL, NIK, KK, DESA, KECAMATAN, KRITERIA PPKS, dll)
//
// Semua format diproses menjadi ValidDtsenRow yang sama (HMAC NIK, nama masked, desil, bansos).
// Stunting dan kominfo tidak memiliki kolom bansos secara langsung — status bansos di-set false.
// Desil: diambil langsung dari kolom "desil" (format standar) atau "KETERANGAN DESIL" (kominfo).

import { maskNama, hmac, K_MIN } from '@/services/dtsen-import';
import type { ValidDtsenRow, RejectedRow, ValidateOptions } from '@/services/dtsen-import';
import { normalizeKecamatan, KECAMATAN_ACEH_TENGAH } from '@/lib/normalize-kecamatan';

// ─── Tipe ekstra untuk multi-source ───

export type DtsenSourceFormat = 'DTSEN_CSV' | 'STUNTING_XLSX' | 'KOMINFO_XLSX';

export interface ParseWarnings {
  warnings: string[];
}

export interface MultisourceImportResult {
  valid: ValidDtsenRow[];
  rejected: RejectedRow[];
  totalDataLines: number;
  warnings: string[];
}

// ─── Helper: normalisasi teks (case-insensitive, spacing-normalized) ───
// ─── Helper: normalisasi NIK — selalu string, trimming whitespace ───
// Excel dapat mengembalikan NIK sebagai number (mis. 997654466) atau string.
// NIK yang sudah masked (mengandung *) tetap diproses sebagai string.
function normalizeNik(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  // Jika number, konversi ke string tanpa notasi ilmiah
  if (typeof raw === 'number') {
    return String(raw).trim();
  }
  return String(raw).replace(/\s+/g, ' ').trim();
}

// ─── Parser stunting (format Excel) ───
// Kolom: No, NIK, Nama, JK, Tgl Lahir, BB Lahir, TB Lahir, Nama Ortu, Prov, Kab/Kota,
//        Kec, Pukesmas, Desa/Kel, Posyandu, RT, RW, Alamat, Usia Saat Ukur,
//        Tanggal Pengukuran, Berat, Tinggi, Cara Ukur, LiLA, BB/U, ZS BB/U,
//        TB/U, ZS TB/U, BB/TB, ZS BB/TB, Naik Berat Badan, Jml Vit A, KPSP, KIA,
//        Kelas Ibu Balita, MBG, Detail

/**
 * Parse stunting Excel data ke format DTSEN.
 * Data stunting fokus pada anak balita — tidak memiliki info bansos.
 * Desil diambil dari data DTSEN external (bukan dari file ini).
 */
export function parseStuntingXlsx(
  rows: Record<string, unknown>[],
  secret: string,
  opts: ValidateOptions = {},
): MultisourceImportResult {
  const valid: ValidDtsenRow[] = [];
  const rejected: RejectedRow[] = [];
  const warnings: string[] = [
    'Data stunting tidak mengandung info bansos (PKH/BPNT/PBI) — semua di-set false.',
    'Data stunting tidak memiliki kolom desil — di-set ke 1 (tertinggi prioritas) secara default.',
  ];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const line = i + 2; // +1 untuk 0-based, +1 lagi untuk header
    const nik = normalizeNik(row['NIK'] ?? row['nik']);
    const nikAwal = /^\d{4}/.test(nik) ? nik.slice(0, 4) : undefined;

    const fail = (reason: string) => {
      rejected.push({ line, reason, nikAwal });
      return undefined;
    };

    if (!/^\d{16}$/.test(nik)) {
      fail(`NIK harus 16 digit angka tanpa * (diterima: "${nik ? nik.slice(0, 4) + '…' : 'kosong'}")`);
      continue;
    }

    const nama = String(row['Nama'] ?? row['nama'] ?? '').trim();
    if (nama.length < 2) {
      fail('Nama kosong/terlalu pendek (< 2 karakter)');
      continue;
    }

    const kecRaw = String(row['Kec'] ?? row['kecamatan'] ?? row['KECAMATAN'] ?? '').trim();
    const kecamatan = normalizeKecamatan(kecRaw) ?? null;
    if (!kecamatan) {
      fail(`Kecamatan "${kecRaw || 'kosong'}" tidak dikenal`);
      continue;
    }

    const desa = String(row['Desa/Kel'] ?? row['DESA'] ?? row['desa'] ?? '').replace(/\s+/g, ' ').trim();
    if (desa.length < 3) {
      fail('Desa kosong');
      continue;
    }

    // Stunting tidak punya kolom desil — set default 1 (tertinggi prioritas)
    // Di produksi, desil akan di-join dengan data DTSEN eksternal
    const desil = 1;

    valid.push({
      nikHash: hmac(nik, secret),
      namaMasked: maskNama(nama),
      keluargaId: null, // tidak ada no_kk di stunting — jumlah keluarga tidak tersedia
      kecamatan,
      desa,
      desil,
      statusBansos: { pkh: false, bpnt: false, pbi: false }, // tidak ada info bansos di stunting
    });
  }

  return { valid, rejected, totalDataLines: rows.length, warnings };
}

// ─── Helper: normalisasi desil dari berbagai format ───
// Handles: integer (3), range ("6-10"), text ("Belum Ada Desl"), "6-10 Dalam Proses penurunan"
// For ranges, takes the lower bound. For "Belum Ada Desl" or empty, defaults to 1 (highest priority).
function normalizeDesil(raw: unknown): { desil: number; warning?: string } | null {
  if (raw === null || raw === undefined) return { desil: 1, warning: 'Desil kosong — di-set ke 1 (prioritas tertinggi).' };

  // Jika sudah number
  const n = Number(raw);
  if (Number.isInteger(n)) {
    if (n >= 1 && n <= 10) return { desil: n };
    return null; // out of range
  }

  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (s === '' || s.toLowerCase().includes('belum ada')) {
    return { desil: 1, warning: `Desil "${s}" — di-set ke 1 (prioritas tertinggi).` };
  }

  // Cek format range: "6-10"
  const rangeMatch = s.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1]!, 10);
    if (low >= 1 && low <= 10) return { desil: low };
    return null;
  }

  // Coba parse sebagai integer tunggal
  const intMatch = s.match(/^(\d+)$/);
  if (intMatch) {
    const val = parseInt(intMatch[1]!, 10);
    if (val >= 1 && val <= 10) return { desil: val };
    return null;
  }

  return null;
}

// ─── Parser kominfo (format Excel) ───
// Kolom: NO, NAMA, KETERANGAN DESIL, NIK, KK, TEMPAT TGL LAHIR, PEKERJAAN,
//        JENIS KELAMIN, DESA, KECAMATAN, KRITERIA PPKS, NAMA ALAT BANTU,
//        MERK, SATUAN, ASESMEN, TANGGAL DISERAHKAN

/**
 * Parse data kominfo ke format DTSEN.
 * Data kominfo mengandung kolom "KETERANGAN DESIL" yang bisa langsung dipakai.
 * Kolom "KRITERIA PPKS" menunjukkan kategori — tidak langsung bansos, tapi
 * dapat diekstrak ke status bansos (mis. disabilitas, lanjut usia).
 */
export function parseKominfoXlsx(
  rows: Record<string, unknown>[],
  secret: string,
  opts: ValidateOptions = {},
): MultisourceImportResult {
  const valid: ValidDtsenRow[] = [];
  const rejected: RejectedRow[] = [];
  const warnings: string[] = [
    'Data kominfo tidak memiliki kolom bansos (PKH/BPNT/PBI) — semua di-set false.',
    'Kolom "KRITERIA PPKS" tidak langsung mapped ke bansos (perlu aturan bisnis tambahan).',
  ];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const line = i + 2;
    const nik = normalizeNik(row['NIK'] ?? row['nik']);
    const nikAwal = /^\d{4}/.test(nik) ? nik.slice(0, 4) : undefined;

    const fail = (reason: string) => {
      rejected.push({ line, reason, nikAwal });
      return undefined;
    };

    if (!/^\d{16}$/.test(nik)) {
      fail(`NIK harus 16 digit angka tanpa * (diterima: "${nik ? nik.slice(0, 4) + '…' : 'kosong'}")`);
      continue;
    }

    const nama = String(row['NAMA'] ?? row['nama'] ?? '').trim();
    if (nama.length < 2) {
      fail('Nama kosong/terlalu pendek (< 2 karakter)');
      continue;
    }

    const kecRaw = String(row['KECAMATAN'] ?? row['kecamatan'] ?? '').trim();
    const kecamatan = normalizeKecamatan(kecRaw) ?? null;
    if (!kecamatan) {
      fail(`Kecamatan "${kecRaw || 'kosong'}" tidak dikenal`);
      continue;
    }

    const desa = String(row['DESA'] ?? row['desa'] ?? '').replace(/\s+/g, ' ').trim();
    if (desa.length < 3) {
      fail('Desa kosong');
      continue;
    }

    // KETERANGAN DESIL — bisa berupa angka, range ("6-10"), atau teks ("Belum Ada Desl")
    const desilRaw = row['KETERANGAN DESIL'] ?? row['desil'] ?? row['Desil'];
    const desilResult = normalizeDesil(desilRaw);
    if (desilResult === null) {
      const desilStr = String(desilRaw ?? '').replace(/\s+/g, ' ').trim();
      fail(`Desil tidak valid (diterima: "${desilStr || 'kosong'}")`);
      continue;
    }
    const desil = desilResult.desil;
    if (desilResult.warning) warnings.push(desilResult.warning);

    const noKk = normalizeNik(row['KK'] ?? row['no_kk']);
    const hasKk = /^\d{16}$/.test(noKk);

    valid.push({
      nikHash: hmac(nik, secret),
      namaMasked: maskNama(nama),
      keluargaId: hasKk ? `kk:${hmac(noKk, secret)}` : null, // tanpa no_kk → jumlah keluarga tidak tersedia
      kecamatan,
      desa,
      desil,
      statusBansos: { pkh: false, bpnt: false, pbi: false }, // kominfo tidak punya kolom bansos
    });

    if (!hasKk) {
      warnings.push(`Baris ${line}: KK tidak valid — jumlah keluarga tidak tersedia untuk individu ini`);
    }
  }

  return { valid, rejected, totalDataLines: rows.length, warnings };
}

// ─── Re-export untuk konsumsi eksternal ───
export { K_MIN };