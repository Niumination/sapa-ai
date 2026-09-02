// ─── Impor Manual DTSEN (PR-4b) — inti MURNI, tanpa IO/DB/env ───
// Rahasia HMAC diteruskan sebagai parameter (route yang membaca env), sehingga
// seluruh logika validasi/masking/agregasi teruji deterministik tanpa database.
//
// Aturan privasi yang diremehkan di sini adalah aturan yang bocor di produksi:
//   1. NIK TIDAK PERNAH keluar dari modul ini dalam bentuk mentah — hanya HMAC.
//   2. Nama TIDAK PERNAH keluar utuh — hanya bentuk masked ("S*****a").
//   3. Kelompok k<5 TIDAK PERNAH menjadi baris agregat (k-anonymity).
//   4. CSV mentah tidak pernah disimpan — hanya baris valid hasil transformasi.

import { createHmac, createHash } from 'node:crypto';
import { KECAMATAN_ACEH_TENGAH, normalizeKecamatan } from '@/lib/normalize-kecamatan';

// re-export untuk kompatibilitas test lama
export { KECAMATAN_ACEH_TENGAH } from '@/lib/normalize-kecamatan';

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Ambang k-anonymity (desain §6.2, §14 — keputusan user: 5 jiwa). */
export const K_MIN = 5;

// ─── Tipe ───

export interface ValidDtsenRow {
  nikHash: string; // HMAC-SHA256(nik, secret) — nik mentah sudah dibuang
  namaMasked: string;
  keluargaId: string | null; // HMAC no_kk bila ada; fallback deterministik
  kecamatan: string; // bentuk kanonik (bukan ketikan operator)
  desa: string;
  desil: number;
  statusBansos: { pkh: boolean; bpnt: boolean; pbi: boolean };
}

export interface RejectedRow {
  line: number; // nomor baris file (1-based, setelah header)
  reason: string;
  /** jejak minimal untuk pelacakan: 4 digit awal NIK — sisanya disensor */
  nikAwal?: string;
}

export interface ImportParseResult {
  valid: ValidDtsenRow[];
  rejected: RejectedRow[];
  totalDataLines: number;
}

// ─── Masking & hashing ───

/** "SITI AMINAH" → "S*****H" — hanya huruf pertama & terakhir yang tersisa. */
export function maskNama(nama: string): string {
  const clean = nama.replace(/\s+/g, ' ').trim();
  if (clean.length === 0) return '(tanpa nama)';
  if (clean.length === 1) return `${clean[0]}*****`;
  const first = clean[0]!;
  const lastChar = clean[clean.length - 1]!;
  return `${first.toUpperCase()}*****${lastChar.toUpperCase()}`;
}

export function hmac(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Checksum kanonik satu batch baris valid (deteksi impor ulang identik). */
export function importChecksum(rows: ValidDtsenRow[]): string {
  const canonical = rows
    .map((r) => `${r.nikHash}|${r.kecamatan}|${r.desa}|${r.desil}|${r.statusBansos.pkh}:${r.statusBansos.bpnt}:${r.statusBansos.pbi}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

// ─── Parser CSV (RFC-4180 ringan: koma, kutip ganda, "" escape, CRLF) ───

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.trim() !== '' || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== '')) rows.push(row);
  }
  return rows;
}

// ─── Validator ───

const NIK_RE = /^\d{16}$/;

function parseBool(v: string): boolean | null {
  const n = normalize(v);
  if (['1', 'true', 'ya', 'y', 'iya'].includes(n)) return true;
  if (['0', 'false', 'tidak', 't', '-', ''].includes(n)) return false;
  return null;
}

export interface ValidateOptions {
  /** kamus desa per kecamatan (normalized → kanonik). Bila absen/kecamatan tak ada di kamus → desa bebas non-kosong */
  knownDesa?: Record<string, string[]>;
}

export const TEMPLATE_HEADER = ['nik', 'nama', 'no_kk', 'kecamatan', 'desa', 'desil', 'pkh', 'bpnt', 'pbi_jk'];

/**
 * Validasi penuh satu berkas CSV. Baris kotor DITOLAK + alasan per baris —
// tidak ada "simpan dulu, rapikan nanti".
 */
export function parseAndValidateDtsenCsv(text: string, secret: string, opts: ValidateOptions = {}): ImportParseResult {
  const rows = parseCsv(text);
  const rejected: RejectedRow[] = [];
  const valid: ValidDtsenRow[] = [];

  if (rows.length === 0) {
    return { valid, rejected: [{ line: 0, reason: 'Berkas kosong.' }], totalDataLines: 0 };
  }

  const header = rows[0]!.map((h) => normalize(h));
  const missingCols = TEMPLATE_HEADER.filter((h) => !header.includes(h));
  if (missingCols.length > 0) {
    return {
      valid: [],
      rejected: [{ line: 0, reason: `Header tidak sesuai template. Kolom wajib hilang: ${missingCols.join(', ')} (wajib: ${TEMPLATE_HEADER.join(', ')})` }],
      totalDataLines: rows.length - 1,
    };
  }
  const idx = Object.fromEntries(TEMPLATE_HEADER.map((h) => [h, header.indexOf(h)]));

  const dataRows = rows.slice(1);
  dataRows.forEach((cols, i) => {
    const line = i + 1;
    const get = (k: string) => (idx[k]! >= 0 ? (cols[idx[k]!] ?? '').trim() : '');
    const nik = get('nik');
    const nikAwal = /^\d{4}/.test(nik) ? nik.slice(0, 4) : undefined;
    const fail = (reason: string) => rejected.push({ line, reason, nikAwal });

    if (!NIK_RE.test(nik)) return fail(`NIK harus 16 digit angka (diterima: "${nik ? nik.slice(0, 4) + '…' : 'kosong'}")`);
    const nama = get('nama');
    if (nama.length < 3) return fail('Nama kosong/terlalu pendek (< 3 karakter)');
    const kecRaw = get('kecamatan');
    const kec = normalizeKecamatan(kecRaw);
    if (!kec) {
      return fail(
        `Kecamatan "${kecRaw || 'kosong'}" tidak dikenal — 14 kecamatan resmi Kab. Aceh Tengah`,
      );
    }
    const desaRaw = get('desa').replace(/\s+/g, ' ').trim();
    if (desaRaw.length < 3) return fail('Desa kosong/terlalu pendek (< 3 karakter)');
    const knownDesaKec = opts.knownDesa?.[kec];
    if (knownDesaKec && !knownDesaKec.some((d) => normalize(d) === normalize(desaRaw))) {
      return fail(`Desa "${desaRaw}" tidak terdaftar di Kecamatan ${kec}`);
    }
    const desilRaw = get('desil');
    const desil = Number(desilRaw);
    if (!Number.isInteger(desil) || desil < 1 || desil > 10) {
      return fail(`Desil harus bilangan bulat 1–10 (diterima: "${desilRaw || 'kosong'}")`);
    }
    const pkh = parseBool(get('pkh'));
    const bpnt = parseBool(get('bpnt'));
    const pbi = parseBool(get('pbi_jk'));
    if (pkh === null || bpnt === null || pbi === null) {
      return fail('Kolom pkh/bpnt/pbi_jk wajib diisi 1/0 (atau ya/tidak)');
    }
    const nikHash = hmac(nik, secret);
    const noKk = get('no_kk');
    if (!/^\d{16}$/.test(noKk)) {
      return fail(`no_kk harus 16 digit angka (diterima: "${noKk ? noKk.slice(0, 4) + '…' : 'kosong'}") — data ditolak agar jumlah keluarga tidak tersedia`);
    }
    valid.push({
      nikHash,
      namaMasked: maskNama(nama),
      keluargaId: `kk:${hmac(noKk, secret)}`,
      kecamatan: kec,
      desa: desaRaw,
      desil,
      statusBansos: { pkh, bpnt, pbi },
    });
    return undefined;
  });

  return { valid, rejected, totalDataLines: dataRows.length };
}

// ─── Agregasi wilayah dengan sensor k-anonymity ───

export interface AgregatRow {
  kecamatan: string;
  desa: string;
  desil: number;
  jumlahJiwa: number;
  jumlahKeluarga: number;
}

export interface AgregatResult {
  rows: AgregatRow[];
  /** jiwa yang DITOLAK dari agregat karena kelompoknya < K_MIN (k-anonymity) */
  jiwaTerSensor: number;
  kelompokTerSensor: number;
  /** peringatan jika ada proxy keluarga terdeteksi (legacy data tanpa no_kk) */
  peringatan?: string;
  /** jumlah keluarga yang masih memakai proxy individu:<hash> */
  keluargaProksi?: number;
}

export function buildAgregatWilayah(rows: ValidDtsenRow[], kMin: number = K_MIN): AgregatResult {
  const groups = new Map<string, { kec: string; desa: string; desil: number; jiwa: number; keluarga: Set<string> }>();
  let keluargaProksi = 0;
  for (const r of rows) {
    if (r.keluargaId?.startsWith('individu:')) keluargaProksi++;
    const key = `${r.kecamatan}|||${r.desa}|||${r.desil}`;
    const g = groups.get(key) ?? { kec: r.kecamatan, desa: r.desa, desil: r.desil, jiwa: 0, keluarga: new Set<string>() };
    g.jiwa++;
    if (r.keluargaId) g.keluarga.add(r.keluargaId);
    groups.set(key, g);
  }
  const out: AgregatRow[] = [];
  let jiwaTerSensor = 0;
  let kelompokTerSensor = 0;
  for (const g of groups.values()) {
    if (g.jiwa < kMin) {
      kelompokTerSensor++;
      jiwaTerSensor += g.jiwa;
      continue; // kelompok kecil tidak pernah menjadi baris agregat
    }
    out.push({ kecamatan: g.kec, desa: g.desa, desil: g.desil, jumlahJiwa: g.jiwa, jumlahKeluarga: g.keluarga.size });
  }
  out.sort((a, b) =>
    a.kecamatan.localeCompare(b.kecamatan) || a.desa.localeCompare(b.desa) || a.desil - b.desil,
  );
  const peringatan = keluargaProksi > 0 ? `Terdeteksi ${keluargaProksi} jiwa dengan keluargaId proxy (tanpa no_kk) — jumlahKeluarga tidak dapat dipercaya, impor ulang dengan no_kk 16-digit` : undefined;
  return { rows: out, jiwaTerSensor, kelompokTerSensor, ...(peringatan ? { peringatan, keluargaProksi } : {}) };
}
