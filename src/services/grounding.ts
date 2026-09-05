// ─── Grounding SoT SAPA — Fase C ───
// Validasi angka/tahun/OPD LLM vs evidence (pure, no network).
// Jika halu → template deterministik (groundOutput).
//
// REVIU 2026-09-04 — pengaman diperkeras (temuan T-01):
//   1. Semua angka divalidasi, termasuk < 10 (sebelumnya angka kecil lolos begitu saja).
//   2. Angka desimal dibandingkan sebagai NILAI, bukan sebagai deretan digit.
//      Dulu "31,4" mengizinkan "3,14" dan "314" karena titik/koma dibuang dulu.
//   3. Varian pemisah ribuan ("9.610" == "9610") tetap diizinkan, tetapi HANYA untuk
//      nilai evidence yang utuh (bilangan bulat) — bukan untuk nilai desimal.
//   4. `followUps`/teks tambahan ikut diground lewat `isGroundedText`.

import { parseNilaiSapa } from '@/lib/format-singkat';
import type { HybridResponse } from '@/types';

export interface EvidenceItem {
  opd: string;
  indikator: string;
  nilai: string;
  satuan: string;
  tahun: string | null;
  /** Evidence ID = id indikator SAPA (SPLP). */
  id: number | string;
}

// Extract angka raw: urutan digit dengan . , sebagai pemisah
/**
 * Deretan angka dalam teks.
 *
 * Reviu 2026-09-04: pola lama `/[\d.,]+/g` menelan tanda baca di sekitarnya.
 * Saat visualisasi diserialisasi untuk diground, koma PEMISAH FIELD JSON ikut
 * terserap: nilai sah 31,4 muncul sebagai token "31.4," → parseNilaiSapa
 * membacanya 314 → nilai yang benar dituding halusinasi dan jawaban AI dibuang
 * padahal benar. Pola baru mengharuskan token berawal dan berakhir dengan digit.
 */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d[\d.,]*\d|\d/g) ?? []).filter((n) => /^\d/.test(n));
}

export function normalizeNumber(raw: string): string {
  return raw.replace(/[.,]/g, '');
}

function isFourDigitYear(s: string): boolean {
  return /^\d{4}$/.test(s);
}

export function buildAllowedNumbers(evidence: EvidenceItem[]): Set<string> {
  const set = new Set<string>();
  for (const e of evidence) {
    const raws = [e.nilai, String(e.nilai ?? ''), String((e as any).nilaiNumber ?? '')];
    for (const r of raws) {
      const m = r.match(/[\d.,]+/g) ?? [];
      for (const n of m) {
        const norm = normalizeNumber(n);
        if (/^\d+$/.test(norm) && norm.length > 0) set.add(norm);
      }
    }
    const nn = (e as any).nilaiNumber;
    if (typeof nn === 'number' && Number.isFinite(nn)) set.add(String(nn).replace(/[.,]/g, ''));
  }
  set.delete('');
  return set;
}

/**
 * Nilai NUMERIK evidence — dasar perbandingan utama (kebal terhadap pergeseran
 * desimal: 31,4 ≠ 3,14 ≠ 314).
 */
export function buildAllowedValues(evidence: EvidenceItem[]): number[] {
  const values: number[] = [];
  for (const e of evidence) {
    const kandidat: unknown[] = [e.nilai, (e as any).nilaiNumber];
    for (const k of kandidat) {
      if (k == null) continue;
      const n = typeof k === 'number' ? k : parseNilaiSapa(String(k));
      if (typeof n === 'number' && Number.isFinite(n)) values.push(n);
    }
  }
  return values;
}

/**
 * Deretan digit yang BOLEH diterima untuk token angka bulat — hanya dari nilai
 * evidence yang utuh (bilangan bulat). Dipakai agar "9.610" di evidence cocok
 * dengan "9610" di teks, tanpa membuka celah desimal.
 */
export function buildAllowedIntegerDigits(evidence: EvidenceItem[]): Set<string> {
  const set = new Set<string>();
  for (const v of buildAllowedValues(evidence)) {
    if (!Number.isInteger(v)) continue;
    set.add(normalizeNumber(String(v)));
  }
  for (const e of evidence) {
    const n = parseNilaiSapa(String(e.nilai ?? ''));
    if (n != null && Number.isInteger(n)) set.add(normalizeNumber(String(n)));
  }
  set.delete('');
  return set;
}

/** String tampilan persis yang boleh disalin apa adanya ke narasi. */
export function buildAllowedDisplay(evidence: EvidenceItem[]): Set<string> {
  const set = new Set<string>();
  for (const e of evidence) {
    const raw = String(e.nilai ?? '').trim();
    if (raw) set.add(raw);
  }
  return set;
}

export function buildAllowedYears(evidence: EvidenceItem[]): Set<string> {
  const set = new Set<string>();
  for (const e of evidence) {
    const t = e.tahun?.trim() ?? '';
    if (isFourDigitYear(t)) set.add(t);
  }
  return set;
}

export function buildAllowedOpds(evidence: EvidenceItem[]): Set<string> {
  const set = new Set<string>();
  for (const e of evidence) {
    const opd = e.opd?.trim();
    if (opd) set.add(opd.toLowerCase());
  }
  return set;
}

function collectTextForGrounding(parsed: HybridResponse): string {
  const parts: string[] = [];
  if (parsed.narasi) parts.push(parsed.narasi);
  if (Array.isArray(parsed.rekomendasi)) parts.push(parsed.rekomendasi.join(' '));
  try {
    parts.push(JSON.stringify(parsed.visualisasi?.konfigurasi ?? {}));
  } catch {}
  // Kontrak AI: field opsional yang belum masuk tipe inti ikut diground.
  const extra = (parsed as unknown as { followUps?: unknown }).followUps;
  if (Array.isArray(extra)) parts.push(extra.join(' '));
  return parts.join(' ');
}

export interface GroundingOptions {
  /**
   * Angka resmi yang BOLEH dikutip walau bukan nilai evidence
   * (mis. total record, jumlah OPD, evidenceCount, delta turunan) —
   * angka-angka ini diberikan sistem di prompt, jadi menghukumnya sebagai
   * "halu" itu inkonsisten (PR Lapis 1).
   */
  extraAllowedNumbers?: (string | number)[];
}

interface AllowedSets {
  values: number[];
  integerDigits: Set<string>;
  display: Set<string>;
  years: Set<string>;
  opds: Set<string>;
  extra: number[];
  /**
   * Angka yang muncul di dalam NAMA indikator/OPD (mis. "…stunting (JAB(5) P stunting)",
   * "Penduduk Usia 7-12 Tahun"). Angka ini sah dipakai ulang HANYA bila teks
   * benar-benar mengutip label tersebut — tanpa ini, narasi yang menyebut nama
   * indikator akan terus ditolak (positif palsu yang ditemukan saat uji live).
   */
  labelNumbers: Set<number>;
}

/** Kumpulkan angka dari label evidence yang benar-benar dikutip di dalam teks. */
export function buildQuotedLabelNumbers(evidence: EvidenceItem[], text: string): Set<number> {
  const set = new Set<number>();
  const lower = text.toLowerCase();
  for (const e of evidence) {
    for (const label of [e.indikator, e.opd]) {
      const l = String(label ?? '').trim();
      if (!l || !lower.includes(l.toLowerCase())) continue;
      for (const token of l.match(/\d+(?:[.,]\d+)?/g) ?? []) {
        const n = parseNilaiSapa(token);
        if (n != null && Number.isFinite(n)) set.add(n);
      }
    }
  }
  return set;
}

function buildAllowedSets(evidence: EvidenceItem[], options: GroundingOptions = {}): AllowedSets {
  const extra: number[] = [];
  for (const x of options.extraAllowedNumbers ?? []) {
    const n = typeof x === 'number' ? x : parseNilaiSapa(String(x));
    if (typeof n === 'number' && Number.isFinite(n)) extra.push(n);
  }
  return {
    values: buildAllowedValues(evidence),
    integerDigits: buildAllowedIntegerDigits(evidence),
    display: buildAllowedDisplay(evidence),
    years: buildAllowedYears(evidence),
    opds: buildAllowedOpds(evidence),
    extra,
    labelNumbers: new Set<number>(),
  };
}

function valueAllowed(n: number, sets: AllowedSets): boolean {
  for (const v of sets.values) {
    if (Math.abs(n - v) <= Math.max(1e-9, Math.abs(v) * 1e-9)) return true;
  }
  for (const v of sets.extra) {
    if (Math.abs(n - v) <= Math.max(1e-9, Math.abs(v) * 1e-9)) return true;
  }
  if (sets.labelNumbers.has(n)) return true;
  return false;
}

/** Apakah satu token angka boleh muncul di teks? */
function tokenAllowed(raw: string, sets: AllowedSets): boolean {
  const hasSeparator = /[.,]/.test(raw);
  const n = parseNilaiSapa(raw);
  if (n != null && valueAllowed(n, sets)) return true;
  // Salin persis string tampilan evidence ("31,4" apa adanya).
  if (sets.display.has(raw.trim())) return true;
  // Varian pemisah ribuan hanya untuk token bulat & nilai evidence bulat.
  if (!hasSeparator) {
    const digits = normalizeNumber(raw);
    if (/^\d+$/.test(digits) && sets.integerDigits.has(digits)) return true;
  }
  return false;
}

/**
 * Periksa satu teks bebas (narasi, rekomendasi, followUps) terhadap evidence.
 * Murni — dipakai isGrounded dan oleh composer AI untuk field tambahan.
 */
export function isGroundedText(
  text: string,
  evidence: EvidenceItem[],
  options: GroundingOptions = {},
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (evidence.length === 0) {
    // Tanpa evidence, teks seharusnya bilang tidak tersedia — angka apa pun mencurigakan.
    const nums = extractNumbers(text)
      .map(normalizeNumber)
      .filter((n) => /^\d+$/.test(n) && n.length >= 2);
    if (nums.length > 0) reasons.push(`angka tanpa evidence: ${nums.slice(0, 3).join(',')}`);
    const years = (text.match(/\b\d{4}\b/g) ?? []).filter(Boolean);
    if (years.length > 0) reasons.push(`tahun tanpa evidence: ${years.slice(0, 3).join(',')}`);
    return { ok: reasons.length === 0, reasons };
  }

  const sets = buildAllowedSets(evidence, options);
  sets.labelNumbers = buildQuotedLabelNumbers(evidence, text);

  // 1. Tahun plausibel (1900-2100) harus subset evidence.
  const yearsInText = (text.match(/\b\d{4}\b/g) ?? []).filter((y) => {
    const n = Number(y);
    if (!Number.isFinite(n) || n < 1900 || n > 2100) return false;
    // 4-digit yang juga merupakan nilai evidence jangan dianggap tahun.
    if (valueAllowed(n, sets)) return false;
    return true;
  });
  for (const y of yearsInText) {
    if (!sets.years.has(y)) {
      reasons.push(`tahun halu: ${y}`);
      break;
    }
  }

  // 2. Semua angka — TANPA kecuali angka kecil — harus ada di evidence/derived.
  for (const raw of extractNumbers(text)) {
    const normForYear = raw.replace(/[.,]/g, '');
    if (/^\d{4}$/.test(normForYear) && Number(normForYear) >= 1900 && Number(normForYear) <= 2100) continue;
    if (!tokenAllowed(raw, sets)) {
      reasons.push(`angka halu: ${raw}`);
      break;
    }
  }

  // 3. OPD di teks harus subset evidence.
  if (reasons.length === 0) {
    const lowerText = text.toLowerCase();
    const haluOpdPatterns = [
      'badan perencanaan pembangunan daerah',
      'bappeda',
      'badan kepegawaian',
      'inspektorat',
      'sekretariat daerah',
      'dinas perhubungan',
      'dinas sosial',
    ];
    for (const pat of haluOpdPatterns) {
      if (lowerText.includes(pat) && !sets.opds.has(pat)) {
        const hasMatchingOpd = [...sets.opds].some((o) => o.includes(pat) || pat.includes(o));
        if (!hasMatchingOpd) {
          reasons.push(`opd halu: ${pat}`);
          break;
        }
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function isGrounded(
  parsed: HybridResponse,
  evidence: EvidenceItem[],
  options: GroundingOptions = {},
): { ok: boolean; reasons: string[] } {
  return isGroundedText(collectTextForGrounding(parsed), evidence, options);
}

/**
 * Hotfix Aug 26 (laporan user): angka besar tanpa pemisah ribuan (mis. 19686)
 * sulit dibaca — tampilkan sebagai 19.686 (konvensi Indonesia). Aman thd grounding:
 * perbandingan nilai memakai parseNilaiSapa, jadi "19.686" tetap cocok evidence.
 *
 * Reviu 2026-09-04 (bug nyata): versi lama menyisipkan pemisah ribuan ke dalam
 * bagian DESIMAL — "0,003593496" tampil sebagai "0,3.593.496", yang terbaca
 * sebagai ~359 ribu persen. Kaidah baru: angka yang SUDAH memuat pemisah
 * ("," atau ".") tidak pernah disentuh, karena kita tidak bisa membedakan
 * "0.180" (desimal) dari "11.503" (ribuan) tanpa konteks satuan.
 */
export function formatRibuan(text: string): string {
  if (!text) return text;
  return text.replace(/\d[\d.,]*\d|\d/g, (span) => {
    // Sudah ada pemisah → biarkan apa adanya ("31,4" · "0,003593496" · "0.180" · "11.503.360.000.000").
    if (/[.,]/.test(span)) return span;
    // Tahun (1900–2100) jangan diberi pemisah ribuan.
    if (/^\d{4}$/.test(span)) {
      const n = Number(span);
      if (n >= 1900 && n <= 2100) return span;
    }
    // Bilangan bulat polos 4+ digit → pemisah ribuan Indonesia ("19686" → "19.686").
    if (/^\d{4,}$/.test(span)) return new Intl.NumberFormat('id-ID').format(Number(span));
    return span;
  });
}

/**
 * Format presentasi jawaban akhir: narasi + sel tabel + metric string.
 * Dipanggil SETELAH grounding selesai — hanya kosmetik, tak memengaruhi validasi.
 */
export function formatAngkaPresentasi(parsed: HybridResponse): HybridResponse {
  const narasi = parsed.narasi ? formatRibuan(parsed.narasi) : parsed.narasi;
  let visualisasi = parsed.visualisasi;
  if (visualisasi?.tipe === 'table' && visualisasi.konfigurasi && Array.isArray(visualisasi.konfigurasi.rows)) {
    const cfg = { ...visualisasi.konfigurasi } as { columns?: unknown[]; rows?: unknown[][] };
    cfg.rows = (cfg.rows ?? []).map((row) =>
      Array.isArray(row) ? row.map((cell) => (typeof cell === 'string' ? formatRibuan(cell) : cell)) : row,
    );
    visualisasi = { ...visualisasi, konfigurasi: cfg };
  }
  if (visualisasi?.tipe === 'metric' && visualisasi.konfigurasi && Array.isArray(visualisasi.konfigurasi.metrics)) {
    const cfg = { ...visualisasi.konfigurasi } as { metrics?: Record<string, unknown>[] };
    cfg.metrics = (cfg.metrics ?? []).map((m) => {
      const v = m.value;
      return typeof v === 'string' ? { ...m, value: formatRibuan(v) } : m;
    });
    visualisasi = { ...visualisasi, konfigurasi: cfg };
  }
  return { ...parsed, narasi, visualisasi };
}

export function buildDeterministicNarasi(evidence: EvidenceItem[], query: string): string {
  if (evidence.length === 0) return 'Data untuk pertanyaan ini tidak ditemukan di SAPA.';
  const top = evidence.slice(0, 3);
  const parts = top.map((e) => {
    const tahunStr = e.tahun && /^\d{4}$/.test(e.tahun.trim()) ? e.tahun.trim() : 'tahun tidak tercantum di SAPA';
    const satuanStr = e.satuan ? ` ${e.satuan}` : '';
    return `${e.indikator} ${formatRibuan(String(e.nilai))}${satuanStr} (${e.opd}, ${tahunStr})`;
  });
  const q = query.trim().slice(0, 120);
  return `Berdasarkan data SAPA untuk "${q}", ditemukan ${evidence.length} indikator terkait: ${parts.join('; ')}.`;
}

function distinctUnits(evidence: EvidenceItem[]): string[] {
  return [
    ...new Set(
      evidence.map((e) => (e.satuan ?? '').trim().toLowerCase()).filter(Boolean),
    ),
  ];
}

export function buildVizFromEvidence(evidence: EvidenceItem[]): HybridResponse['visualisasi'] {
  if (evidence.length === 0) return { tipe: 'none', konfigurasi: {} };

  if (evidence.length === 1) {
    const e = evidence[0];
    return {
      tipe: 'metric',
      konfigurasi: { metrics: [{ label: e.indikator, value: e.nilai, unit: e.satuan ?? '' }] },
    };
  }
  // Bar chart dengan satuan campur (orang + persen + indeks) menyesatkan — pakai tabel.
  const mixedUnits = distinctUnits(evidence).length > 1;
  if (evidence.length > 8 || mixedUnits) {
    return {
      tipe: 'table',
      konfigurasi: {
        columns: ['Indikator', 'Nilai', 'Satuan', 'OPD', 'Tahun'],
        rows: evidence.slice(0, 12).map((e) => [e.indikator, e.nilai, e.satuan ?? '', e.opd, e.tahun ?? '-']),
      },
    };
  }
  return {
    tipe: 'chart',
    konfigurasi: {
      type: 'bar',
      xKey: 'indikator',
      data: evidence.map((e) => ({
        indikator: e.indikator.length > 35 ? e.indikator.slice(0, 32) + '…' : e.indikator,
        nilai: parseNilaiSapa(String(e.nilai)) ?? 0,
        satuan: e.satuan,
      })),
      bars: ['nilai'],
    },
  };
}

export function groundOutput(
  parsed: HybridResponse,
  evidence: EvidenceItem[],
  query: string,
  options: GroundingOptions = {},
): { response: HybridResponse; grounding: 'pass' | 'replaced'; reason?: string } {
  const check = isGrounded(parsed, evidence, options);
  if (check.ok) return { response: parsed, grounding: 'pass' };

  const reason = check.reasons.join('; ');
  const narasi = buildDeterministicNarasi(evidence, query);
  const visualisasi = buildVizFromEvidence(evidence);
  // Pertahankan rekomendasi asli bila teksnya sendiri lolos grounding;
  // sisanya difilter. Jika kosong, isi fallback deterministik.
  const safeRekomendasi = parsed.rekomendasi.filter(
    (r) => isGroundedText(r, evidence, options).ok,
  );
  const rekomendasi =
    safeRekomendasi.length > 0
      ? safeRekomendasi.slice(0, 3)
      : evidence.length > 0
        ? [
            `Tindak lanjuti pertanyaan "${query}" dengan mengonsultasikan temuan di atas ke OPD pemilik indikator untuk verifikasi data terbaru dan dasar perencanaan program.`,
          ]
        : [];
  const replaced: HybridResponse = {
    narasi,
    visualisasi,
    rekomendasi,
    dataSource: parsed.dataSource || 'SAPA Aceh Tengah (api-splp.layanan.go.id)',
    timestamp: new Date().toISOString(),
  };
  return { response: replaced, grounding: 'replaced', reason };
}
