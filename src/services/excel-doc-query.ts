// ─── Excel Document Query — deterministik, tanpa LLM (PR Lapis 1 paralel) ───
// Pertanyaan tentang Dokumen A/B/C (agregat Excel bebas-PII) dijawab langsung
// dari data ter-commit, tanpa LLM, sehingga bebas halusinasi dan menjaga SoT.
// Output berupa HybridResponse dengan visualisasi tipe 'table' yang akan
// dirender oleh AIDataWidget (format general mengikuti sumber asli).

import { HybridResponse } from '@/types';
import type { EvidenceItem } from './grounding';
import {
  matchExcelDoc,
  docSourceLabel,
  docPrimaryTable,
  type ExcelDoc,
} from '@/data/excelSources';

/** Deteksi apakah query dimaksudkan ke sumber Dokumen A/B/C. */
export function detectExcelDocQuery(query: string): ExcelDoc | null {
  return matchExcelDoc(query);
}

function fmtRp(n: number): string {
  return 'Rp ' + n.toLocaleString('id-ID');
}

function buildSummaryLine(doc: ExcelDoc): string {
  const parts: string[] = [];
  const r = doc.ringkasan ?? {};
  for (const [k, v] of Object.entries(r)) {
    const label = k.replace(/_/g, ' ');
    if (typeof v !== 'number') continue;
    const val = k.includes('rp') ? fmtRp(v) : v.toLocaleString('id-ID');
    parts.push(`${label} ${val}`);
  }
  return parts.join(', ');
}

/**
 * Bangun jawaban deterministik untuk satu dokumen.
 * Tidak pernah memanggil LLM; seluruh angka berasal dari evidence ter-commit.
 */
export function buildExcelDocResponse(query: string, doc: ExcelDoc): HybridResponse {
  const { headers, rows } = docPrimaryTable(doc);
  const summary = buildSummaryLine(doc);
  const catatan = doc.catatan;

  const narasi =
    `Berdasarkan ${docSourceLabel(doc)} (${doc.sumber_file}):\n` +
    (summary ? `${summary}.\n` : '') +
    `Tabel di bawah menampilkan agregat ${doc.dokumen === 'A' ? 'pemberdayaan' : doc.dokumen === 'B' ? 'kesehatan' : 'bantuan sosial'} ` +
    `menurut format sumber. ${catatan}`;

  return {
    narasi,
    visualisasi: {
      tipe: 'table',
      konfigurasi: {
        columns: headers,
        rows,
      },
    },
    rekomendasi: [
      `Verifikasi angka di atas dengan ${doc.opd} selaku produsen data untuk perencanaan lebih lanjut.`,
    ],
    dataSource: docSourceLabel(doc),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Coba jawab dari Dokumen A/B/C. Balik null bila query tidak relevan.
 * Dipanggil SETELAH meta-query & DTSEN deflection, SEBELUM retrieval SAPA,
 * agar sumber dokumen memiliki prioritas deterministik sendiri.
 */
export function tryExcelDocQuery(query: string): HybridResponse | null {
  const doc = detectExcelDocQuery(query);
  if (!doc) return null;
  return buildExcelDocResponse(query, doc);
}

/**
 * Apakah evidence SAPA/DTSEN benar-benar se-topik dengan dokumen? Fusi multi-sumber
 * hanya boleh terjadi bila indikator SAPA menyebut topik spesifik dokumen (mis.
 * "stunting", "ppks"), bukan sekadar kecocokan OPD umum (mis. "pendidikan" untuk
 * santri). Mencegah over-fusion: santri/mahasiswa tetap jawaban dokumen-sendiri.
 */
function topicTokensForDoc(doc: ExcelDoc): string[] {
  switch (doc.dokumen) {
    case 'A':
      return ['santri', 'mahasiswa', 'bsm', 'siswa miskin'];
    case 'B':
      return ['stunting', 'gizi', 'balita'];
    case 'C':
      return ['ppks', 'disabilitas', 'lanjut usia', 'bansos', 'penerima bantuan'];
    default:
      return [];
  }
}

function isTopicAligned(doc: ExcelDoc, evidence: EvidenceItem[]): boolean {
  const tokens = topicTokensForDoc(doc);
  if (tokens.length === 0) return false;
  return evidence.some((e) => {
    const text = `${e.indikator ?? ''} ${e.opd ?? ''}`.toLowerCase();
    return tokens.some((t) => text.includes(t));
  });
}

/**
 * Gabungkan sumber Dokumen (Excel deterministik) dengan evidence SAPA + DTSEN
 * bila topik yang sama muncul di banyak sumber. Menghasilkan SATU jawaban
 * utuh: narasi menyatukan sumber, tabel otoritatif dari Dokumen (format sumber),
 * serta daftar sumber eksplisit. Tanpa LLM — angka 100% dari evidence ter-commit.
 *
 * Syarat penggabungan: doc (Dokumen) ditemukan DAN ctx.evidence (SAPA/DTSEN)
 * tidak kosong DAN evidence tersebut benar-benar se-topik (isTopicAligned).
 * `sapaSummary` = ringkasan singkat indikator SAPA teratas (sudah diformat di
 * orchestrator) agar 1 output benar-benar menggabungkan kedua sumber.
 */
export function buildFusedMultiSourceResponse(
  query: string,
  doc: ExcelDoc,
  ctx: { evidence: EvidenceItem[]; dataSource: string; sapaSummary?: string },
): HybridResponse | null {
  // Hanya gabung bila ada evidence SAPA/DTSEN yang relevan & se-topik, agar tidak dobel.
  if (!ctx.evidence || ctx.evidence.length === 0) return null;
  if (!isTopicAligned(doc, ctx.evidence)) return null;

  const { headers, rows } = docPrimaryTable(doc);
  const summary = buildSummaryLine(doc);
  const sapaProvenance = ctx.dataSource;
  const docSource = docSourceLabel(doc);

  // ── Tabel GABUNGAN multi-sumber (hotfix 28 Agu 2026) ──
  // Sebelumnya tabel hanya berisi baris Dokumen (format sumber); SAPA/DTSEN hanya
  // disebut di narasi. User melaporkan output "klaim gabungan tapi tabel isi dokumen
  // saja". Sekarang tabel memuat BUKTI dari SEMUA sumber: baris Dokumen (otoritatif,
  // format sumber) + baris evidence SAPA/DTSEN — kolom seragam + kolom "Sumber".
  const fusedColumns = ['Indikator / Area', 'Nilai', 'Satuan', 'Sumber'];
  const docRows: (string | number)[][] = rows.slice(0, 14).map((r) => {
    const area = r[0] ?? '';
    const nilai = r[1] ?? r[r.length - 1] ?? '';
    return [String(area), String(nilai), '', docSource];
  });
  const evRows: (string | number)[][] = ctx.evidence.slice(0, 8).map((e) => [
    e.indikator ?? '',
    e.nilai ?? '',
    e.satuan ?? '',
    sapaProvenance,
  ]);
  const fusedRows = [...docRows, ...evRows];

  const narasi =
    `Berdasarkan penggabungan beberapa sumber resmi untuk topik ini:\n` +
    `1) ${docSource} (${doc.sumber_file}): ` +
    (summary ? `${summary}. ` : '') +
    `Tabel di bawah menampilkan agregat ${doc.dokumen === 'A' ? 'pemberdayaan' : doc.dokumen === 'B' ? 'kesehatan' : 'bantuan sosial'} menurut format sumber, dilengkapi baris indikator dari sumber lain.\n` +
    (ctx.sapaSummary
      ? `2) Sumber lain (${sapaProvenance}): ${ctx.sapaSummary}\n`
      : `2) Sumber lain (${sapaProvenance}) turut menyajikan indikator terkait.\n`) +
    `Semua angka berasal dari agregat resmi; tidak ada data per-orang (UU PDP).`;

  const multiSource = [docSource, sapaProvenance].filter(Boolean).join(' + ');

  return {
    narasi,
    visualisasi: {
      tipe: 'table',
      // Tabel gabungan: baris Dokumen + baris SAPA/DTSEN, kolom Sumber eksplisit.
      konfigurasi: { columns: fusedColumns, rows: fusedRows, _multiSource: true, _sources: [docSource, sapaProvenance] },
    },
    rekomendasi: [
      `Verifikasi angka di atas dengan ${doc.opd} selaku produsen data untuk perencanaan lebih lanjut.`,
      `Data ${sapaProvenance} melengkapi gambaran makro; gunakan keduanya bersama untuk analisis lintas sumber.`,
    ],
    dataSource: multiSource,
    timestamp: new Date().toISOString(),
  };
}

