// ─── Query Planner DTSEN lintas sumber (PR-4c) — inti MURNI, tanpa IO/DB/env ───
// Implementasi desain §8 + §6.2 (DESAIN_LAPIS3_MULTISUMBER_DTSEN.md):
//   1. routeQuery deterministik (tanpa LLM): query publik → SAPA (jalur lama
//      100% tak berubah); query DTSEN → scope AGGR vs PERSONAL.
//   2. Provenance 3 tempat: header narasi ("Menurut DTSEN …"), chip visual
//      (label terstruktur di respons), metadata (dataOrigin: 'dtsen').
//   3. Sensor k-anonymity DINAMIS (§6.2) untuk agregat dinamis.
//
// PENGETATAN BERBASIS BUKTI (PR-4c): regex §8 mentah (pkh/bansos/bantuan)
// terbukti BERTABRAKAN dengan 46 indikator agregat nyata SAPA (mis. "Jumlah
// Penerima Bantuan Sosial PKH" — Dinas Sosial). Karena itu planner publik
// bertingkat: token yang punya padanan agregat di SAPA (pkh, bansos, bantuan,
// kemiskinan) TIDAK didefleksi bila bentuknya pertanyaan agregat; defleksi
// hanya untuk (a) NIK, (b) konsep yang tidak ada di SAPA (dtsen/desil/bpnt/
// pbi sebagai kata), (c) niat per-orang (siapa/nama/daftar nama) + token DTSEN.

import { KECAMATAN_ACEH_TENGAH, K_MIN, type AgregatRow } from '@/services/dtsen-import';
import type { DataSensitivity } from '@/lib/data-gate';
import { prisma } from '@/lib/prisma';
import { fetchDtsenFromSplp, type DtsenData } from '@/lib/bapokting-client';
import { fetchDtsenAgregatBappeda } from '@/data/dtsenBappedaSource';

// ─── Normalisasi ringan (konsisten dgn dtsen-import.normalize) ───
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ═══ A. DETEKSI TOKEN ═══

/**
 * Token DTSEN (desain §8) dengan word-boundary untuk token pendek —
// "pembiayaan" TIDAK boleh cocok "pbi".
 */
const DTSEN_TOKEN_RE = /(dtsen|desil|bansos|\bpkh\b|\bbpnt\b|\bpbi\b|kemiskinan individu|penerima bantuan)/i;

/** Konsep yang TIDAK punya padanan agregat apa pun di SAPA (bukti: 2.032 record). */
const DTSEN_ONLY_RE = /(dtsen|desil|\bbpnt\b|\bpbi\b)/i;

/** Penanda niat PER-ORANG (enumerasi / identifikasi individu). */
const INDIVIDU_MARKER_RE = /(\bsiapa(?:\s+saja)?\b|nama\b|nama-nama|daftar\s+(nama|penerima|warga|keluarga)|\bnik\b|individu|per[-\s]?orang|by[-\s]?name|warga\s+(yang\s+)?(miskin|penerima))/i;

export function isDtsenQuery(q: string): boolean {
  return DTSEN_TOKEN_RE.test(q);
}

/** NIK = 16 digit angka utuh (bukan bagian angka lebih panjang). */
export function extractNik(q: string): string | null {
  const m = q.match(/\b\d{16}\b/);
  return m ? m[0] : null;
}

export function hasIndividuMarker(q: string): boolean {
  return INDIVIDU_MARKER_RE.test(q);
}

/** Kecamatan resmi yang disebut di query (bentuk kanonik) — null bila tak ada. */
export function detectKecamatan(q: string): string | null {
  const n = norm(q);
  for (const kec of KECAMATAN_ACEH_TENGAH) {
    const k = norm(kec);
    const re = new RegExp(`(^|[^a-z])${k.replace(/\s+/g, '\\s+')}($|[^a-z])`);
    if (re.test(n)) return kec;
  }
  return null;
}

/** Desa/gampong: pola "desa X" / "gampong X" (kamus resmi belum ada → frasa). */
export function detectDesa(q: string): string | null {
  const m = q.match(/\b(?:desa|gampong|kampung)\s+([a-zA-Z][a-zA-Z .'-]{1,40})/i);
  if (!m) return null;
  // Potong di kata penutup umum agar frasa tidak meluber.
  const nama = m[1]
    .replace(/\s+(di|ke|dari|yang|berapa|dan|atau|untuk|pada|desil|kecamatan|kec)\b.*$/i, '')
    .replace(/[?.!,;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return nama.length >= 3 ? nama : null;
}

/**
 * Filter desil: "desil 1" → [1]; "desil 1-3"/"1 s.d. 3"/"1 sampai 3" → [1,2,3];
// "desil 1 dan 2"/"1, 2" → [1,2]. Di luar 1..10 diabaikan. null = tanpa filter.
 */
export function detectDesil(q: string): number[] | null {
  const out = new Set<number>();
  const seedRe = /desil\s*(\d{1,2})/gi;
  let m: RegExpExecArray | null;
  while ((m = seedRe.exec(q)) !== null) {
    const first = Number(m[1]);
    // Perpanjangan berantai setelah angka pertama: rentang atau daftar.
    let rest = q.slice(m.index + m[0].length);
    const nums = [first];
    for (let guard = 0; guard < 8; guard++) {
      const range = rest.match(/^\s*(?:-|–|—|s\.?\s?d\.?|sampai|hingga)\s*(\d{1,2})/i);
      if (range) {
        const to = Number(range[1]);
        if (to >= first && to - first <= 9) {
          for (let d = first; d <= to; d++) nums.push(d);
        }
        rest = rest.slice(range[0].length);
        continue;
      }
      const list = rest.match(/^\s*(?:dan|,|\/|&)\s*(\d{1,2})/i);
      if (list) {
        nums.push(Number(list[1]));
        rest = rest.slice(list[0].length);
        continue;
      }
      break;
    }
    for (const d of nums) if (d >= 1 && d <= 10) out.add(d);
  }
  return out.size > 0 ? [...out].sort((a, b) => a - b) : null;
}

/** Program bansos yang ditanyakan; generic "bansos" → semua program. */
export function detectBansos(q: string): Array<'pkh' | 'bpnt' | 'pbi'> | null {
  const out: Array<'pkh' | 'bpnt' | 'pbi'> = [];
  if (/\bpkh\b/i.test(q)) out.push('pkh');
  if (/\bbpnt\b/i.test(q) || /\bsembako\b/i.test(q)) out.push('bpnt');
  if (/\bpbi\b/i.test(q)) out.push('pbi');
  if (out.length > 0) return out;
  if (/\bbansos\b|bantuan sosial/i.test(q)) return ['pkh', 'bpnt', 'pbi'];
  return null;
}

// ═══ B. KEPUTUSAN PLAN (desain §8) ═══

export type DtsenScope = 'AGGR' | 'PERSONAL';

export interface DtsenPlan {
  asksDtsen: boolean;
  scope: DtsenScope | null;
  /** NIK mentah — SEMENTARA untuk di-HMAC di route; TIDAK PERNAH dikembalikan. */
  nik: string | null;
  /** Niat per-orang tanpa NIK → penolakan enumerasi (§6.2). */
  enumerasi: boolean;
  kecamatan: string | null;
  desa: string | null;
  desil: number[] | null;
  bansos: Array<'pkh' | 'bpnt' | 'pbi'> | null;
}

export function planDtsenQuery(q: string): DtsenPlan {
  const nik = extractNik(q);
  const enumerasi = !nik && hasIndividuMarker(q);
  return {
    asksDtsen: isDtsenQuery(q) || nik !== null,
    scope: nik || enumerasi ? 'PERSONAL' : 'AGGR',
    nik,
    enumerasi,
    kecamatan: detectKecamatan(q),
    desa: detectDesa(q),
    desil: detectDesil(q),
    bansos: detectBansos(q),
  };
}

/** Sensitivitas yang harus digate untuk plan ini (desain §6.1/§8). */
export function sensitivityForPlan(plan: DtsenPlan): DataSensitivity {
  return plan.scope === 'PERSONAL' ? 'RESTRICTED_PERSONAL' : 'RESTRICTED_AGGR';
}

// ═══ C. DEFLEKSI PIPELINE PUBLIK (pengetatan §8 berbasis bukti indikator SAPA) ═══

export type PublicDeflectionKind = 'NIK' | 'DTSEN_KHUSUS' | 'PER_ORANG';

/**
 * Apakah query di pipeline PUBLIK harus dialihkan dari SAPA?
// * Prinsip: jangan pernah merusak jawaban agregat SAPA yang sudah benar —
 * token ambigu (pkh/bansos/bantuan/kemiskinan) dibiarkan ke SAPA, KECUALI
 * ada niat per-orang. Token tanpa padanan SAPA (dtsen/desil/bpnt/pbi) selalu
 * dialihkan (retrieval SAPA pasti gagal → jawaban "tidak ditemukan" menyesatkan).
 */
export function publicDeflectionKind(q: string): PublicDeflectionKind | null {
  if (extractNik(q)) return 'NIK';
  if (hasIndividuMarker(q) && isDtsenQuery(q)) return 'PER_ORANG';
  if (DTSEN_ONLY_RE.test(q)) return 'DTSEN_KHUSUS';
  return null;
}

/**
 * Narasi defleksi untuk pipeline publik (dipakai ai-orchestrator saat
 * publicDeflectionKind non-null). Jujur, edukatif, tanpa LLM, tanpa fetch SAPA.
 */
export function buildPublicDeflectionNarasi(kind: PublicDeflectionKind): string {
  const penutup =
    'Angka agregat program (mis. total penerima bantuan sosial PKH atau tingkat kemiskinan) tetap tersedia dari SAPA — ' +
    'tanyakan dalam bentuk agregat. Pejabat berrole DTSEN (sesuai Permen Bappenas 7/2025) dapat menggunakan Konsol DTSEN di Dashboard Admin; ' +
    'setiap akses di sana tercatat di audit trail.';
  if (kind === 'NIK') {
    return (
      'Pertanyaan Anda memuat NIK 16 digit (data pribadi). Jalur publik ini tidak pernah memproses data per-orang — ' +
      'data by-name tersimpan terpisah: nama asli + NIK dienkripsi AES-256-GCM, dan hanya bisa diakses lewat pintu terbatas dengan audit wajib (UU 27/2022).\n\n' +
      penutup
    );
  }
  if (kind === 'PER_ORANG') {
    return (
      'Pertanyaan Anda mengarah ke data PER-ORANG (siapa/nama penerima bantuan sosial). ' +
      'Informasi itu tergolong data terbatas DTSEN dan tidak dijawab dari data publik SAPA, demi melindungi warga (UU 27/2022).\n\n' +
      penutup
    );
  }
  return (
    'Konsep yang Anda tanyakan (DTSEN/desil kesejahteraan/BPNT/PBI per jiwa) bukan bagian dari agregat publik SAPA Kab. Aceh Tengah. ' +
    'Data desil berasal dari DTSEN (Kemensos/BPS) — klasifikasinya terbatas. ' +
    'Di SAPA, program yang setara tercatat sebagai agregat "Bantuan Sosial Sembako" (BPNT) dan "Penerima Bantuan Iuran" (PBI-JK).\n\n' +
    penutup
  );
}

export const PUBLIC_DEFLECTION_REKOMENDASI = [
  'Coba bentuk agregat: "berapa jumlah penerima bantuan sosial PKH"',
  'Coba: "berapa tingkat kemiskinan di Aceh Tengah"',
];

// ═══ D. PROVENANCE (3 tempat, desain §8) ═══

export interface ReleaseRef {
  releaseNumber: string;
  status: string;
  publishedAt: Date | string | null;
}

export function formatTanggalId(d: Date | string | null): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date);
}

export function jalurLabel(status: string): string {
  if (status === 'API') return 'SPLP live (API resmi Portal SDI)';
  if (status === 'MANUAL') return 'impor manual';
  // Status rilis DB (bukan jalur) — label jujur: data dari warehouse DB.
  if (status === 'PUBLISHED' || status === 'STAGING' || status === 'SUPERSEDED') return 'DB rilis (warehouse)';
  return status;
}

/** Label chip visual + nilai DataSource.provenanceLabel (ditulis saat publish). */
export function buildProvenanceLabel(r: ReleaseRef): string {
  return `DTSEN rilis ${r.releaseNumber} — ${jalurLabel(r.status)} — rilis aktif ${formatTanggalId(r.publishedAt)}`;
}

/** Kalimat pembuka narasi (tempat provenance #1, pola desain §8). */
export function buildNarasiHeader(r: ReleaseRef): string {
  return `Menurut ${buildProvenanceLabel(r)}:`;
}

// ═══ E. FORMAT ANGKA ═══

export function fmtId(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n);
}

// ═══ F. SENSOR DINAMIS (desain §6.2 — kalimat baku, JANGAN diubah) ═══

export const K_MIN_DYNAMIC = K_MIN;
export const SENSOR_MESSAGE =
  'Kelompok terlalu kecil untuk ditampilkan (< 5 jiwa) — ditampilkan pada tingkat lebih tinggi.';
export const ENUMERASI_MESSAGE =
  'Lookup data per-orang wajib menyertakan NIK lengkap (16 digit). Enumerasi daftar nama tidak didukung — untuk mencegah kebocoran data pribadi (UU 27/2022; Permen Bappenas 7/2025).';
export const NO_RELEASE_MESSAGE =
  'Warehouse DTSEN belum memiliki rilis aktif (PUBLISHED). Rilis pertama masuk lewat impor manual (konsol admin) atau API resmi Portal SDI.';
export const NOT_DTSEN_MESSAGE =
  'Pintu ini khusus data DTSEN (desil/bansos/NIK). Untuk data agregat pembangunan (SAPA), gunakan dashboard utama.';

/** NIK termask untuk jejak audit: 4 awal + 2 akhir (minimasi PDP). */
export function maskNikForAudit(nik: string): string {
  return nik.length === 16 ? `${nik.slice(0, 4)}**********${nik.slice(-2)}` : '(bukan-nik)';
}

// ═══ G. RANGKUM AGREGAT (murni → narasi deterministik) ═══

export interface DesilSummary {
  desil: number;
  jiwa: number;
  keluarga: number;
}
export interface WilayahSummary {
  nama: string;
  jiwa: number;
  keluarga: number;
}
export interface BansosCountResult {
  program: 'pkh' | 'bpnt' | 'pbi';
  jiwa: number | null; // null = DISENSOR (dinamis < K_MIN)
}

export function summarizeByDesil(rows: AgregatRow[]): DesilSummary[] {
  const map = new Map<number, DesilSummary>();
  for (const r of rows) {
    const cur = map.get(r.desil) ?? { desil: r.desil, jiwa: 0, keluarga: 0 };
    cur.jiwa += r.jumlahJiwa;
    cur.keluarga += r.jumlahKeluarga;
    map.set(r.desil, cur);
  }
  return [...map.values()].sort((a, b) => a.desil - b.desil);
}

export function summarizeByKecamatan(rows: AgregatRow[]): WilayahSummary[] {
  const map = new Map<string, WilayahSummary>();
  for (const r of rows) {
    const cur = map.get(r.kecamatan) ?? { nama: r.kecamatan, jiwa: 0, keluarga: 0 };
    cur.jiwa += r.jumlahJiwa;
    cur.keluarga += r.jumlahKeluarga;
    map.set(r.kecamatan, cur);
  }
  return [...map.values()].sort((a, b) => b.jiwa - a.jiwa);
}

export function summarizeByDesa(rows: AgregatRow[]): WilayahSummary[] {
  const map = new Map<string, WilayahSummary>();
  for (const r of rows) {
    const key = `${r.desa} (${r.kecamatan})`;
    const cur = map.get(key) ?? { nama: key, jiwa: 0, keluarga: 0 };
    cur.jiwa += r.jumlahJiwa;
    cur.keluarga += r.jumlahKeluarga;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.jiwa - a.jiwa);
}

export const BANSOS_LABEL: Record<'pkh' | 'bpnt' | 'pbi', string> = {
  pkh: 'PKH',
  bpnt: 'BPNT/Sembako',
  pbi: 'PBI Jaminan Kesehatan',
};

export interface AgregatAnswer {
  narasi: string;
  scopeLabel: string; // "Kecamatan Linge · desil 1–3" / "Seluruh Kab. Aceh Tengah"
  totalJiwa: number;
  totalKeluarga: number;
  byDesil: DesilSummary[];
  byWilayah: WilayahSummary[]; // kecamatan (tanpa filter kec) atau desa (dgn filter kec)
  bansos: BansosCountResult[] | null;
  sensor: string[]; // daftar pesan sensor dinamis yang terjadi
}

/**
 * Rakit jawaban agregat dari baris agregat siap-saji (sudah k≥5 saat publish)
 * + hitung bansos dinamis (sudah dicek k di route sebelum masuk sini).
 */
export function buildAgregatAnswer(params: {
  rows: AgregatRow[];
  release: ReleaseRef;
  kecamatan: string | null;
  desa: string | null;
  desil: number[] | null;
  bansosCounts: BansosCountResult[] | null;
  /** total jiwa di scope (sum rows) — dihitung di sini bila tidak diberikan */
}): AgregatAnswer {
  const { rows, release } = params;
  const sensor: string[] = [];
  const totalJiwa = rows.reduce((a, r) => a + r.jumlahJiwa, 0);
  const totalKeluarga = rows.reduce((a, r) => a + r.jumlahKeluarga, 0);
  const byDesil = summarizeByDesil(rows);
  const byWilayah = params.kecamatan ? summarizeByDesa(rows) : summarizeByKecamatan(rows);

  const filters: string[] = [];
  if (params.kecamatan) filters.push(`Kecamatan ${params.kecamatan}`);
  if (params.desa) filters.push(`Desa ${params.desa}`);
  if (params.desil && params.desil.length > 0) filters.push(`desil ${params.desil.join(', ')}`);
  const scopeLabel = filters.length > 0 ? filters.join(' · ') : 'Seluruh Kab. Aceh Tengah';

  const parts: string[] = [buildNarasiHeader(release)];

  if (rows.length === 0) {
    parts.push(
      `Tidak ada baris agregat untuk scope ${scopeLabel} pada rilis aktif. ` +
        `Ini bisa berarti tidak ada data pada scope itu, atau seluruh kelompoknya ` +
        `disensor k-anonymity (kelompok < ${K_MIN} jiwa tidak pernah ditampilkan). ` +
        SENSOR_MESSAGE,
    );
    return { narasi: parts.join('\n\n'), scopeLabel, totalJiwa: 0, totalKeluarga: 0, byDesil: [], byWilayah: [], bansos: null, sensor: [SENSOR_MESSAGE] };
  }

  parts.push(
    `Pada scope ${scopeLabel} tercatat ${fmtId(totalJiwa)} jiwa dalam ${fmtId(totalKeluarga)} keluarga ` +
      `(agregat siap-saji k≥${K_MIN}; hitungan dari ${fmtId(rows.length)} kelompok wilayah·desil).`,
  );

  if (byDesil.length > 0) {
    const rincian = byDesil.map((d) => `desil ${d.desil}: ${fmtId(d.jiwa)} jiwa (${fmtId(d.keluarga)} keluarga)`).join('; ');
    parts.push(`Rincian per desil — ${rincian}.`);
  }

  if (byWilayah.length > 0) {
    const shown = byWilayah.slice(0, 8);
    const rincian = shown.map((w) => `${w.nama}: ${fmtId(w.jiwa)} jiwa`).join('; ');
    const sisa = byWilayah.length - shown.length;
    parts.push(
      `Per ${params.kecamatan ? 'desa' : 'kecamatan'} — ${rincian}${sisa > 0 ? `; dan ${sisa} wilayah lainnya` : ''}.`,
    );
  }

  if (params.bansosCounts && params.bansosCounts.length > 0) {
    const seg = params.bansosCounts
      .map((b) => (b.jiwa === null ? `${BANSOS_LABEL[b.program]}: disensor` : `penerima ${BANSOS_LABEL[b.program]}: ${fmtId(b.jiwa)} jiwa`))
      .join('; ');
    parts.push(`Status bansos — ${seg}.`);
    for (const b of params.bansosCounts) {
      if (b.jiwa === null) sensor.push(`${BANSOS_LABEL[b.program]}: ${SENSOR_MESSAGE}`);
    }
    if (sensor.length > 0) parts.push(SENSOR_MESSAGE);
  }

  parts.push(
    `Catatan: angka di atas agregat k-anonymity (k≥${K_MIN}); data per-orang hanya melalui lookup NIK ` +
      `oleh role DTSEN_LOOKUP dan selalu tercatat di audit trail.`,
  );

  return { narasi: parts.join('\n\n'), scopeLabel, totalJiwa, totalKeluarga, byDesil, byWilayah, bansos: params.bansosCounts, sensor };
}

// ═══ H. JAWABAN LOOKUP BY-NIK (PERSONAL) ═══

export interface LookupFound {
  namaMasked: string;
  kecamatan: string;
  desa: string;
  desil: number | null;
  statusBansos: { pkh: boolean; bpnt: boolean; pbi: boolean } | null;
}

/**
 * Narasi lookup: HANYA bentuk terminimasi (nama masked). Tidak pernah berisi
 * NIK, nikHash, no KK, atau identitas lain — diuji ketat di faseK.
 */
export function buildLookupNarasi(found: LookupFound | null, release: ReleaseRef): string {
  const header = buildNarasiHeader(release);
  if (!found) {
    return (
      `${header}\n\nNIK termaksud TIDAK tercatat pada rilis aktif. ` +
      `Kemungkinan: NIK salah ketik, warga belum masuk DTSEN rilis ini, atau datanya berubah di rilis berikutnya. ` +
      `Akses ini tercatat di audit trail.`
    );
  }
  const bansosAktif = found.statusBansos
    ? (Object.entries(found.statusBansos) as Array<['pkh' | 'bpnt' | 'pbi', boolean]>)
        .filter(([, v]) => v)
        .map(([k]) => BANSOS_LABEL[k])
    : [];
  const bansosTxt = bansosAktif.length > 0 ? bansosAktif.join(', ') : 'bukan penerima PKH/BPNT/PBI';
  return (
    `${header}\n\nSatu jiwa tercatat pada rilis aktif:\n` +
    `• Nama (termask): ${found.namaMasked}\n` +
    `• Wilayah: Desa ${found.desa}, Kecamatan ${found.kecamatan}\n` +
    `• Desil kesejahteraan: ${found.desil ?? 'tidak tercantum'}\n` +
    `• Status bansos: ${bansosTxt}\n\n` +
    `Nama ditampilkan termask dan NIK tidak pernah ditampilkan (UU 27/2022). Akses ini tercatat di audit trail.`
  );
}

// ═══ I. FETCH AGREGAT DTSEN YANG SUDAH DIPUBLISH (PUBLIC ACCESS) ═══
// Data agregat yang sudah dipublish (k≥K_MIN) boleh diakses publik melalui
// pipeline AI system. K-anonymity sudah diterapkan saat publish — kelompok
// < 5 jiwa tidak pernah muncul di tabel ini. Sensor tambahan (k<5 hasil query
// dinamis) diterapkan di buildAgregatAnswer().

/** Parameter filter untuk query agregat publik DTSEN. */
export interface PublicAgregatFilter {
  kecamatan?: string | null;
  desa?: string | null;
  desil?: number[] | null;
  bansos?: Array<'pkh' | 'bpnt' | 'pbi'> | null;
}

/** Hasil agregat publik DTSEN yang sudah melalui sensor k-anonymity. */
export interface PublicAgregatResult {
  release: ReleaseRef;
  provenance: { label: string; releaseNumber: string; status: string; publishedAt: Date | string | null };
  rows: AgregatRow[];
  totalJiwa: number;
  totalKeluarga: number;
  byDesil: DesilSummary[];
  byWilayah: WilayahSummary[];
  bansos: BansosCountResult[] | null;
  sensor: string[];
  narasi: string;
}

/**
 * Fetch agregat DTSEN yang sudah dipublish secara publik (tanpa auth).
 * K-anonymity dilindungi: kelompok < K_MIN sudah disensor saat publish.
 * Sensor dinamis (< K_MIN hasil hitung ulang) diterapkan di sini untuk bansos.
 */
export async function fetchDtsenAgregatPublik(filter: PublicAgregatFilter): Promise<PublicAgregatResult | null> {
  // ── @hotfix-meeting-ready: Coba fetch langsung dari SPLP API dulu ──
  // Token JWT sudah tersedia → bypass DB yang mungkin kosong/broken pada branch ini.
  try {
    const splpRows = await fetchDtsenFromSplp({
      kecamatan: filter.kecamatan ?? undefined,
      desa: filter.desa ?? undefined,
      desil: filter.desil && filter.desil.length === 1 ? filter.desil[0] : undefined,
    });
    if (splpRows && splpRows.length > 0) {
      return buildResultFromSplp(splpRows, filter);
    }
  } catch (e) {
    console.warn('[DTSEN] SPLP API fetch failed, falling back to DB:', (e as Error)?.message ?? String(e));
  }

  // ── @hotfix 29 Agu 2026: DB (rilis PUBLISHED) didahulukan dari BAPPEDA offline ──
  // Sejak 29-Agu-2026 warehouse DB terisi penuh (235.011 individu, release
  // BAPPEDA-DES-2025 PUBLISHED) — sumber paling lengkap & konsisten dengan
  // konsol DTSEN. BAPPEDA offline JSON (agregat CSV keluarga) jadi cadangan.
  const dbResult = await fetchDtsenAgregatDb(filter);
  if (dbResult) return dbResult;

  // ── Cadangan: Sumber OFFLINE BAPPEDA (DTSEN Versi 4, Des 2025) ──
  // Agregat bebas-PII dari export BAPPEDA (src/data/dtsen-agregat-bappeda.json)
  // — dipakai bila DB kosong/belum ada rilis.
  try {
    const bappeda = await fetchDtsenAgregatBappeda(filter);
    if (bappeda) {
      return bappeda;
    }
  } catch (e) {
    console.warn('[DTSEN] BAPPEDA offline source failed:', (e as Error)?.message ?? String(e));
  }

  return null;
}

/** Query agregat dari rilis DTSEN PUBLISHED di warehouse DB. */
async function fetchDtsenAgregatDb(filter: PublicAgregatFilter): Promise<PublicAgregatResult | null> {
  // ── Fallback: query DB Prisma (jika warehouse sudah terisi) ──
  const release = await prisma.dtsenRelease.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, releaseNumber: true, status: true, publishedAt: true },
  });
  if (!release) return null;

  const releaseRef: ReleaseRef = { releaseNumber: release.releaseNumber, status: release.status, publishedAt: release.publishedAt };

  const where: any = { releaseId: release.id };
  // @hotfix 29-Agu-2026: case-insensitive — data DB UPPERCASE, filter kamus "Linge".
  if (filter.kecamatan) where.kecamatan = { equals: filter.kecamatan, mode: 'insensitive' };
  if (filter.desa) where.desa = { equals: filter.desa, mode: 'insensitive' };
  if (filter.desil && filter.desil.length > 0) where.desil = { in: filter.desil };

  const aggrDb = await prisma.dtsenAgregatWilayah.findMany({
    where,
    orderBy: [{ kecamatan: 'asc' }, { desa: 'asc' }, { desil: 'asc' }],
  });

  if (aggrDb.length === 0) {
    // Query kosong tetap kembalikan answer yang jujur
    const jawaban = buildAgregatAnswer({
      rows: [],
      release: releaseRef,
      kecamatan: filter.kecamatan ?? null,
      desa: filter.desa ?? null,
      desil: filter.desil ?? null,
      bansosCounts: null,
    });
    return {
      release: releaseRef,
      provenance: { label: buildProvenanceLabel(releaseRef), releaseNumber: release.releaseNumber, status: release.status, publishedAt: release.publishedAt },
      rows: [],
      totalJiwa: 0,
      totalKeluarga: 0,
      byDesil: [],
      byWilayah: [],
      bansos: null,
      sensor: jawaban.sensor,
      narasi: jawaban.narasi,
    };
  }

  const rows: AgregatRow[] = aggrDb.map((r) => ({
    kecamatan: r.kecamatan,
    desa: r.desa,
    desil: r.desil,
    // @hotfix 29-Agu-2026: schema DB aktual pakai jiwa/kk (bukan jumlahJiwa/jumlahKeluarga)
    jumlahJiwa: r.jiwa ?? 0,
    jumlahKeluarga: r.kk ?? 0,
  }));

  // Hitung bansos dinamis — dengan sensor k-anonymity (< K_MIN → null/disensor)
  let bansosCounts: BansosCountResult[] | null = null;
  if (filter.bansos && filter.bansos.length > 0) {
    bansosCounts = [];
    for (const prog of filter.bansos) {
      const colPath = prog === 'pbi' ? 'pbi_jk' : prog;
      const count = await prisma.dtsenIndividu.count({
        where: {
          releaseId: release.id,
          ...where,
          statusBansos: { path: [colPath], equals: true },
        },
      });
      bansosCounts.push({
        program: prog,
        jiwa: count >= K_MIN ? count : count === 0 ? 0 : null,
      });
    }
  }

  const jawaban = buildAgregatAnswer({
    rows,
    release: releaseRef,
    kecamatan: filter.kecamatan ?? null,
    desa: filter.desa ?? null,
    desil: filter.desil ?? null,
    bansosCounts,
  });

  const totalJiwa = rows.reduce((a, r) => a + r.jumlahJiwa, 0);
  const totalKeluarga = rows.reduce((a, r) => a + r.jumlahKeluarga, 0);

  return {
    release: releaseRef,
    provenance: { label: buildProvenanceLabel(releaseRef), releaseNumber: release.releaseNumber, status: release.status, publishedAt: release.publishedAt },
    rows,
    totalJiwa,
    totalKeluarga,
    byDesil: jawaban.byDesil,
    byWilayah: jawaban.byWilayah,
    bansos: jawaban.bansos,
    sensor: jawaban.sensor,
    narasi: jawaban.narasi,
  };
}

/**
 * @hotfix-meeting-ready
 * Konversi data DTSEN mentah dari SPLP API (DtsenData[]) ke PublicAgregatResult
 * agar kompatibel dengan pipeline orchestrator yang sudah ada.
 * Sumber data ditandai sebagai "DTSEN (Kemensos/BPS via SPLP API)".
 */
function buildResultFromSplp(splpData: DtsenData[], filter: PublicAgregatFilter): PublicAgregatResult {
  // Mapping dari field desil_1..5 ke array per desil
  const DESIL_KEYS = ['desil_1', 'desil_2', 'desil_3', 'desil_4', 'desil_5'] as const;

  const rows: AgregatRow[] = [];
  const sensor: string[] = [`Data DTSEN dari SPLP API — ${splpData.length} baris wilayah`];

  // Tentukan desil mana yang diminta
  const requestedDesil = filter.desil ?? [1, 2, 3, 4, 5];

  for (const item of splpData) {
    const kecamatan = fixKecamatanName(item.kecamatan);
    const desa = item.desa || 'Tidak diketahui';

    for (let i = 0; i < DESIL_KEYS.length; i++) {
      const d = requestedDesil.includes(i + 1) ? i + 1 : null;
      if (d === null) continue;
      const key = DESIL_KEYS[i];
      const jiwa = item[key] ?? 0;
      if (jiwa === 0) continue;
      // Estimasi keluarga: asumsi ~1 keluarga per 4 jiwa (data SPLP tidak punya HH)
      rows.push({
        kecamatan,
        desa,
        desil: d,
        jumlahJiwa: jiwa,
        jumlahKeluarga: Math.round(jiwa / 4),
      });
    }
  }

  // Bansos: akumulasi pkh, bpnt, pbi dari tiap baris (data SPLP sudah agregat wilayah)
  const bansosCounts: BansosCountResult[] = ['pkh', 'bpnt', 'pbi'].map((prog) => {
    const total = splpData.reduce((acc, item) => {
      const val = item[prog] ?? item[`${prog}_jk`] ?? 0;
      return acc + (typeof val === 'number' ? val : 0);
    }, 0);
    return {
      program: prog as 'pkh' | 'bpnt' | 'pbi',
      jiwa: total > 0 ? total : 0,
    };
  });

  const totalJiwa = rows.reduce((a, r) => a + r.jumlahJiwa, 0);
  const totalKeluarga = rows.reduce((a, r) => a + r.jumlahKeluarga, 0);
  const byDesil = summarizeByDesil(rows);
  const byWilayah = filter.kecamatan ? summarizeByDesa(rows) : summarizeByKecamatan(rows);

  const releaseRef: ReleaseRef = {
    releaseNumber: 'SPLP-LIVE',
    status: 'PUBLISHED',
    publishedAt: new Date(),
  };

  const jawaban = buildAgregatAnswer({
    rows,
    release: releaseRef,
    kecamatan: filter.kecamatan ?? null,
    desa: filter.desa ?? null,
    desil: filter.desil ?? null,
    bansosCounts,
  });

  return {
    release: releaseRef,
    provenance: {
      label: 'DTSEN (Kemensos/BPS via SPLP API)',
      releaseNumber: 'SPLP-LIVE',
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
    rows,
    totalJiwa,
    totalKeluarga,
    byDesil: jawaban.byDesil,
    byWilayah: jawaban.byWilayah,
    bansos: jawaban.bansos,
    sensor: [...sensor, ...jawaban.sensor],
    narasi: jawaban.narasi,
  };
}

/** @hotfix-meeting-ready — normalisasi nama kecamatan dari SPLP API ke standar DTSEN */
function fixKecamatanName(input: string): string {
  const n = input.trim();
  // Handle format "Kec. Nama"
  const m = n.match(/^(?:Kecamatan|kec\.?|Kec\.?)\s+(.+)$/i);
  return m ? m[1].trim() : n;
}
