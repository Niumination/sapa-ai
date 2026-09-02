// ─── Grounding SoT SAPA — Fase C ───
// Validasi angka/tahun LLM vs evidence (pure, no network). Jika halu → template deterministik.

import { parseNumericIdOrFallback } from '@/lib/parse-numeric';
import type { HybridResponse } from '@/types';

export interface EvidenceItem {
  opd: string;
  indikator: string;
  nilai: string;
  satuan: string;
  tahun: string | null;
  /** Evidence ID (SAPA: kode_indikator number; DTSEN: 'dtsen:...' string). */
  id: number | string;
}

// Extract angka raw: urutan digit dengan . , sebagai pemisah
export function extractNumbers(text: string): string[] {
  return (text.match(/[\d.,]+/g) ?? []).filter((n) => /^\d/.test(n));
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
    // also add nilaiNumber if present as number directly
    const nn = (e as any).nilaiNumber;
    if (typeof nn === 'number' && Number.isFinite(nn)) set.add(String(nn).replace(/[.,]/g, ''));
  }
  // dedup empty
  set.delete('');
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
  return parts.join(' ');
}

export interface GroundingOptions {
  /**
   * Angka resmi yang BOLEH dikutip model walau bukan nilai evidence
   * (mis. total record, jumlah OPD, jumlah indikator, evidenceCount) —
   * angka-angka ini diberikan sistem di prompt, jadi menghukumnya sebagai
   * "halu" itu inkonsisten (PR Lapis 1).
   */
  extraAllowedNumbers?: (string | number)[];
}

export function isGrounded(
  parsed: HybridResponse,
  evidence: EvidenceItem[],
  options: GroundingOptions = {},
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (evidence.length === 0) {
    // Jika tidak ada evidence, model seharusnya bilang tidak tersedia. Anggap gagal jika narasi mengandung angka >=10.
    const text = collectTextForGrounding(parsed);
    const nums = extractNumbers(text)
      .map(normalizeNumber)
      .filter((n) => /^\d+$/.test(n) && n.length >= 2 && Number(n) >= 10);
    if (nums.length > 0) reasons.push(`angka tanpa evidence: ${nums.slice(0, 3).join(',')}`);
    // tahun juga
    const years = (text.match(/\b\d{4}\b/g) ?? []).filter(Boolean);
    if (years.length > 0) reasons.push(`tahun tanpa evidence: ${years.slice(0, 3).join(',')}`);
    return { ok: reasons.length === 0, reasons };
  }

  const allowedNumbers = buildAllowedNumbers(evidence);
  const allowedYears = buildAllowedYears(evidence);
  const allowedOpds = buildAllowedOpds(evidence);
  // PR Lapis 1: izinkan statistik resmi yang memang disuplai ke prompt
  for (const extra of options.extraAllowedNumbers ?? []) {
    const norm = normalizeNumber(String(extra));
    if (/^\d+$/.test(norm) && norm.length > 0) allowedNumbers.add(norm);
  }
  const text = collectTextForGrounding(parsed);

  // 1. Tahun plausibel (1900-2100) harus subset evidence; nilai 4-digit seperti 9610 bukan tahun
  const yearsInText = (text.match(/\b\d{4}\b/g) ?? []).filter((y) => {
    const n = Number(y);
    if (!Number.isFinite(n) || n < 1900 || n > 2100) return false;
    // jika 4-digit ini juga merupakan nilai yang diizinkan, jangan anggap tahun
    if (allowedNumbers.has(y)) return false;
    return true;
  });
  for (const y of yearsInText) {
    if (!allowedYears.has(y)) {
      reasons.push(`tahun halu: ${y}`);
      break;
    }
  }

  // 2. Angka >=10 (setelah normalize) harus ada di evidence
  const nums = extractNumbers(text);
  for (const raw of nums) {
    const normForYear = raw.replace(/[.,]/g, '');
    // skip hanya tahun plausibel yang sudah divalidasi di atas
    if (/^\d{4}$/.test(normForYear) && Number(normForYear) >= 1900 && Number(normForYear) <= 2100) continue;
    const norm = normalizeNumber(raw);
    if (!/^\d+$/.test(norm) || norm.length < 2) continue;
    const n = Number(norm);
    if (!Number.isFinite(n) || n < 10) continue;
    if (!allowedNumbers.has(norm)) {
      // izinkan prefix tahun? tidak — strict
      reasons.push(`angka halu: ${raw}→${norm}`);
      break;
    }
  }

  // 3. OPD di narasi harus subset evidence (cegah halusinasi "Badan Perencanaan Pembangunan Daerah")
  if (reasons.length === 0) {
    const lowerText = text.toLowerCase();
    // Daftar OPD yang sering dihalusinasikan model — jika muncul tapi tidak di evidence, tolak
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
      if (lowerText.includes(pat) && !allowedOpds.has(pat)) {
        // Cek apakah ada OPD di evidence yang mengandung pat ini; jika tidak ada, ini halu
        const hasMatchingOpd = [...allowedOpds].some((o) => o.includes(pat) || pat.includes(o));
        if (!hasMatchingOpd) {
          reasons.push(`opd halu: ${pat}`);
          break;
        }
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Hotfix Aug 26 (laporan user): angka besar tanpa pemisah ribuan (mis. 19686)
 * sulit dibaca — tampilkan sebagai 19.686 (konvensi Indonesia). Aman thd grounding:
 * normalizeNumber menghapus pemisah sebelum validasi, jadi nilai tetap cocok evidence.
 */
export function formatRibuan(text: string): string {
  return text
    .replace(/\b(\d{1,3}(?:\.\d{3})*),(\d{1,2})\b/g, '_$1k$2_')
    .replace(/\b(\d{4,})(?!\d)\b/g, (_full, digits: string) => {
      // Jangan sentuh tahun plausibel (1900-2100): "2025" bukan "2.025"
      if (/^\d{4}$/.test(digits) && Number(digits) >= 1900 && Number(digits) <= 2100) return digits;
      return new Intl.NumberFormat('id-ID').format(Number(digits));
    })
    .replace(/_(\d{1,3}(?:\.\d{3})*)k(\d{1,2})_/g, '$1,$2');
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

  // PR Lapis 2: deteksi Bapokting evidence (via opd label) → build chart agregat siklus
  const hasBapoktingEvidence = evidence.some((e) => (e.opd ?? '').toLowerCase().includes('bapokting'));
  if (hasBapoktingEvidence) {
    const bapoktingItems = evidence.filter((e) => (e.opd ?? '').toLowerCase().includes('bapokting'));
    // Format data untuk chart agregat (mingguan/bulanan/tahunan)
    const chartData = bapoktingItems.map((e) => ({
      nama: e.indikator.length > 25 ? e.indikator.slice(0, 22) + '…' : e.indikator,
      harga: parseNumericIdOrFallback(e.nilai, 0),
      satuan: e.satuan ?? 'Rp',
    }));
    return {
      tipe: 'chart',
      konfigurasi: {
        type: 'bar',
        xKey: 'nama',
        data: chartData,
        bars: ['harga'],
      },
    };
  }

  if (evidence.length === 1) {
    const e = evidence[0];
    return {
      tipe: 'metric',
      konfigurasi: { metrics: [{ label: e.indikator, value: e.nilai, unit: e.satuan ?? '' }] },
    };
  }
  // PR Lapis 1: bar chart dengan satuan campur (orang + persen + indeks)
  // menyesatkan secara visual — jika satuan tidak seragam, sajikan tabel.
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
        nilai: parseNumericIdOrFallback(e.nilai, 0),
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
  // Hotfix Aug 26 (laporan user: panel rekomendasi tak pernah tampil): sebelumnya
  // penggantian template meng-hardcode rekomendasi:[]. Kini rekomendasi asli LLM
  // dipertahankan jika teksnya sendiri lolos grounding (tanpa angka/tahun/OPD di
  // luar evidence); sisanya difilter. Jika hasil kosong, isi fallback deterministik.
  const safeRekomendasi = parsed.rekomendasi.filter(
    (r) => isGrounded({ ...parsed, narasi: r, visualisasi: { tipe: 'none', konfigurasi: {} }, rekomendasi: [] }, evidence, options).ok,
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
