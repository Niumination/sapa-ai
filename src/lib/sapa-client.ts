// ─── SAPA Client — SPLP only ───
// Source: api-splp.layanan.go.id

import { parseNumericId } from './parse-numeric';

const SPLP_BASE = 'https://api-splp.layanan.go.id/sapa/1.0/api';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';


async function getSapaAccessToken(): Promise<string> {
  const clientId = process.env.SAPA_CLIENT_ID ?? '3';
  const clientSecret = process.env.SAPA_CLIENT_SECRET ?? '';
  if (!clientSecret) throw new Error('SAPA_CLIENT_SECRET tidak dikonfigurasi');
  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);
  const res = await fetch('https://sapa.acehtengahkab.go.id/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': BROWSER_UA },
    body: form.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`SAPA OAuth error ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('SAPA OAuth response tanpa access_token');
  return data.access_token;
}
// ─── Types ───

/** Metadata untuk tiap record — dipakai scoring intent & dedup. */
export interface RecordMeta {
  id: number;
  indikator: string;
  nilai: number | null;
  satuan: string;
  opd: string;
  tahun: string | null;
  isAggregate: boolean;
  _score?: number;
}

export interface SapaRecord {
  id: number;
  id_kode_indikator: number;
  kode_indikator_kode_indikator: string | null;
  kode_indikator_nama_indikator: string | null;
  id_opds: number;
  opds_nama_opd: string;
  jadwal_pemutakhiran: string;
  satuan: string;
  tahun: string | null;
  variabel: string;
}

export interface SapaResponse {
  api_status: number;
  api_message: string;
  data: SapaRecord[];
}

export type SapaDataOrigin = 'splp';

export function dataSourceLabel(_origin: SapaDataOrigin): string {
  return 'SAPA Aceh Tengah (api-splp.layanan.go.id)';
}

/**
 * Build dataSource label secara dinamis berdasarkan evidence yang ditemukan.
 * Jika evidence berasal dari campuran sumber, gabungkan semua.
 */
export function dataSourceFromEvidence(evidence: { opd?: string }[]): string {
  const sources: string[] = [];
  const opds = new Set<string>();

  for (const e of evidence) {
    const opd = e.opd || '';
    if (opd.includes('Bapokting')) opds.add('Bapokting Aceh Tengah (SPLP API)');
    // @hotfix 28 Agu 2026: label jujur untuk DTSEN demo — jangan klaim "via SPLP API"
    // padahal data simulasi (user: jawaban DTSEN muncul padahal API masih 401).
    else if (opd.includes('DTSEN Demo') || opd.includes('DTSEN (Demo')) opds.add('DTSEN (data demo — simulasi)');
    // @hotfix 29 Agu 2026: sumber dibedakan dari opd yang dikirim planner:
    else if (opd.includes('BAPPEDA') || opd.includes('offline')) opds.add('DTSEN (BAPPEDA Des 2025 — offline)');
    else if (opd.includes('SPLP')) opds.add('DTSEN (Kemensos/BPS via SPLP API)');
    else if (opd.includes('DTSEN')) opds.add('DTSEN (Kemensos/BPS)');
    else if (opd.includes('Dokumen')) opds.add(opd); // label "Dokumen A — <OPD>"
    else opds.add('SAPA Aceh Tengah');
  }

  return Array.from(opds).join(' + ');
}

// ─── Fetch: SPLP only (LRU 10 mnt — audit autoskills 2026-09-03) ───
// Route memakai `force-dynamic` sehingga fetch cache Next tidak berlaku;
// cache manual di sini. Data publik statis + TTL = aman dibagikan lintas request.

const SPLP_TTL_MS = 10 * 60 * 1000;
let splpCache: { at: number; records: SapaRecord[] } | null = null;

export async function fetchSapaData(): Promise<{ records: SapaRecord[]; origin: 'splp' }> {
  if (splpCache && Date.now() - splpCache.at < SPLP_TTL_MS) {
    return { records: splpCache.records, origin: 'splp' };
  }

  const res = await fetch(`${SPLP_BASE}/daftar_data`, {
    headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    throw new Error(`SPLP API error ${res.status}: ${res.statusText}`);
  }

  const json: SapaResponse = await res.json();
  if (json.api_status !== 1) {
    throw new Error(`SPLP API failed: ${json.api_message}`);
  }
  splpCache = { at: Date.now(), records: json.data };
  return { records: json.data, origin: 'splp' };
}

// ─── Helpers: Normalisasi & Filtering ───

/** Normalize text: lowercase, strip diacritics-ish, collapse spaces. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,;:'"()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token set dari query — hapus stopwords umum + stopword domain (PR Lapis 1). */
export function tokenizeQuery(query: string): string[] {
  const stopWords = new Set([
    // umum
    'bagaimana', 'tentang', 'berapa', 'data', 'status', 'informasi',
    'untuk', 'dari', 'dengan', 'apa', 'siapa', 'dimana', 'kapan',
    'mengapa', 'adalah', 'ada', 'yang', 'di', 'dan', 'atau', 'ini',
    'itu', 'bisa', 'tolong', 'jelaskan', 'tampilkan', 'perlihatkan',
    'daftar', 'list', 'show', 'opd', 'sapa', 'kabupaten', 'aceh',
    'tengah', 'saja', 'saya', 'mau', 'ingin', 'tolong', 'hitung',
    'jumlah', 'total', 'berapa', 'banyak', 'sebutkan', 'jelaskan',
    // domain (Lapis 1): kata-kata ini cocok ke ribuan indikator dan
    // merusak relevansi — mis. "angka" ⊂ "Angkat", "tahun" ⊂ "...tahun lalu"
    'angka', 'tahun', 'hari', 'dinas', 'badan', 'sekretariat', 'kantor',
    'perangkat', 'indikator', 'persentase', 'persen', 'tingkat', 'capaian',
    'tren', 'perkembangan', 'perbandingan', 'bandingkan', 'dibandingkan',
    'banding', 'versus', 'vs', 'per', 'terkini', 'terbaru', 'kondisi',
    'profil', 'gambaran', 'statistik', 'periode', 'wilayah', 'daerah',
    'nilai', 'satuan', 'kategori', 'sektor',
  ]);
  return normalizeText(query)
    .split(' ')
    .filter((w) => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w));
}

// ─── Retrieval v2 (PR Lapis 1): word-boundary + stemming ringan + sinonim ───
// Menggantikan substring matching mentah yang membuat "angka" cocok ke
// "Angkat Berat" dan "tren" cocok ke "Koppontren/Pesantren".

/**
 * Stemmer Bahasa Indonesia yang SENGAJA naif & konservatif: hanya memotong
 * afiksia umum jika sisa kata ≥ 4 huruf. Yang penting kedua sisi (query dan
 * sedangkan "sehat" tidak terpotong jadi "hat" (sisa < 4 → tidak dipotong).
 */
export function stemId(word: string): string {
  let w = word;
  // sufiks (urutan panjang dulu): -kan, -an, -i, -nya
  for (const suf of ['kan', 'nya', 'an', 'i']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) {
      w = w.slice(0, w.length - suf.length);
      break;
    }
  }
  // prefiks: me-*, pe-*, ber-, ter-, di-, ke-, se-
  for (const pre of ['memper', 'meny', 'meng', 'mem', 'men', 'peng', 'peny', 'pem', 'pen', 'per', 'ber', 'ter', 'me', 'pe', 'di', 'ke', 'se']) {
    if (w.startsWith(pre) && w.length - pre.length >= 4) {
      w = w.slice(pre.length);
      break;
    }
  }
  return w;
}

function stemSet(text: string | null | undefined): Set<string> {
  return new Set(
    normalizeText(text)
      .split(' ')
      .filter(Boolean)
      .flatMap((w) => [w, stemId(w)]),
  );
}

/**
 * Sinonim/akronim domain → alternatif pencocokan. Satu "grup" per token query;
 * grup dianggap cocok jika SALAH SATU alternatif (semua kata alternatif) hadir.
 * Akronim seperti IPM hanya cocok jika frasa lengkapnya hadir — mencegah
 * "indeks" saja menyeret ratusan indikator tak relevan.
 */
const SYNONYM_ALTERNATIVES: Record<string, string[][]> = {
  ipm: [['ipm'], ['indeks', 'pembangunan', 'manusia']],
  bansos: [['bansos'], ['bantuan', 'sosial']],
  blt: [['blt'], ['bantuan', 'langsung', 'tunai']],
  asn: [['asn'], ['casn'], ['pns'], ['pppk']],
  pariwisata: [['pariwisata'], ['wisata'], ['wisatawan']],
  wisata: [['wisata'], ['pariwisata'], ['wisatawan']],
  vaksinasi: [['vaksinasi'], ['vaksin'], ['imunisasi']],
  imunisasi: [['imunisasi'], ['vaksinasi'], ['vaksin']],
  inflasi: [['inflasi'], ['ihk']],
  kemiskinan: [['kemiskinan'], ['miskin'], ['gakin']],
  miskin: [['miskin'], ['kemiskinan'], ['gakin']],
  stunting: [['stunting']],
  kokurikuler: [['kokurikuler']],
};

export interface MatchGroup {
  token: string;
  /** Setiap alternatif = daftar kata yang SEMUANYA harus hadir (raw ATAU stem). */
  alternatives: string[][];
}

/** Bangun grup pencocokan dari token query (dengan ekspansi sinonim). */
export function buildMatchGroups(tokens: string[]): MatchGroup[] {
  return tokens.map((token) => {
    const extra = SYNONYM_ALTERNATIVES[token];
    const alternatives: string[][] = extra ? extra.map((alt) => [...alt]) : [[token]];
    if (!alternatives.some((a) => a.length === 1 && a[0] === token)) alternatives.unshift([token]);
    return { token, alternatives };
  });
}

function alternativeHit(alt: string[], words: Set<string>): boolean {
  return alt.every((w) => words.has(w) || words.has(stemId(w)));
}

export interface ScoredRecord {
  record: SapaRecord;
  score: number;
  indHits: number; // grup yang cocok di nama indikator (sinyal terkuat)
  opdHits: number; // grup yang cocok di nama OPD saja
}

/**
 * Skor satu record terhadap grup query.
 * +3 per grup cocok di INDIKATOR, +1 per grup cocok hanya di OPD,
 * +4 bila semua grup cocok, +2 bila semua grup cocok di indikator.
 */
export function scoreRecord(record: SapaRecord, groups: MatchGroup[]): ScoredRecord {
  const indWords = stemSet(record.kode_indikator_nama_indikator);
  const opdWords = stemSet(record.opds_nama_opd);
  let indHits = 0;
  let opdHits = 0;
  for (const g of groups) {
    const inInd = g.alternatives.some((alt) => alternativeHit(alt, indWords));
    if (inInd) {
      indHits++;
      continue;
    }
    const inOpd = g.alternatives.some((alt) => alternativeHit(alt, opdWords));
    if (inOpd) opdHits++;
  }
  let score = indHits * 3 + opdHits * 1;
  if (groups.length > 0 && indHits + opdHits === groups.length) score += 4;
  if (groups.length > 0 && indHits === groups.length) score += 2;
  return { record, score, indHits, opdHits };
}

/**
 * Ambil record relevan: minimal satu grup cocok di nama indikator.
 * Inilah gerbang kepercayaan retrieval — tanpa satu pun kata query yang cocok
 * di NAMA INDIKATOR, sistem lebih baik menjawab "tidak ditemukan" daripada
 * menyajikan data salah topik (kasus nyata: "saham" → data bayi).
 */
export function retrieveRelevant(records: SapaRecord[], query: string, cap = 80): ScoredRecord[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];
  const groups = buildMatchGroups(tokens);
  // Precisi untuk query panjang: ≥3 kata topik menuntut minimal 2 grup cocok,
  // supaya 1 kata umum (mis. "harga" pada pertanyaan "saham") tidak menyeret
  // data tak relevan. Query 1–2 kata cukup 1 grup.
  const minIndHits = groups.length >= 3 ? 2 : 1;
  return records
    .map((r) => scoreRecord(r, groups))
    .filter((s) => s.indHits >= minIndHits)
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
}

/** Ekstrak tahun eksplisit dari query (mis. "produksi kopi 2024"). */
export function extractYears(query: string): string[] {
  return (normalizeText(query).match(/\b(19|20)\d{2}\b/g) ?? []).filter(
    (y, i, arr) => arr.indexOf(y) === i,
  );
}

/** Unique OPD list from records */
export function getUniqueOpd(records: SapaRecord[]): { nama: string; id: number; jumlah: number }[] {
  const map = new Map<string, { nama: string; id: number; jumlah: number }>();
  for (const r of records) {
    const key = normalizeText(r.opds_nama_opd) || 'unknown';
    const existing = map.get(key);
    if (existing) {
      existing.jumlah++;
    } else {
      map.set(key, { nama: r.opds_nama_opd.trim(), id: r.id_opds, jumlah: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.jumlah - a.jumlah);
}

/** Unique indicators */
export function getUniqueIndicators(records: SapaRecord[]): { kode: string | null; nama: string | null; jumlah: number }[] {
  const map = new Map<string, { kode: string | null; nama: string | null; jumlah: number }>();
  for (const r of records) {
    const key = r.id_kode_indikator.toString();
    const existing = map.get(key);
    if (existing) {
      existing.jumlah++;
    } else {
      map.set(key, { kode: r.kode_indikator_kode_indikator, nama: r.kode_indikator_nama_indikator, jumlah: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.jumlah - a.jumlah);
}

/** Filter by OPD name (case-insensitive, partial match, normalized) */
export function filterByOpd(records: SapaRecord[], opdQuery: string): SapaRecord[] {
  const q = normalizeText(opdQuery);
  const tokens = q.split(' ').filter(Boolean);
  return records.filter((r) => {
    const name = normalizeText(r.opds_nama_opd);
    return tokens.every((t) => name.includes(t));
  });
}

/** Filter by indicator keyword — OR over tokens (more permissive than AND) */
export function filterByIndicator(records: SapaRecord[], keyword: string): SapaRecord[] {
  const q = normalizeText(keyword);
  if (!q) return [];
  return records.filter((r) => {
    const name = normalizeText(r.kode_indikator_nama_indikator);
    return name.includes(q);
  });
}

/** Filter by ANY of the given keywords (token-level OR match) */
export function filterByAnyKeyword(records: SapaRecord[], keywords: string[]): SapaRecord[] {
  const normalized = keywords.map(normalizeText).filter(Boolean);
  if (normalized.length === 0) return [];
  return records.filter((r) => {
    const name = normalizeText(r.kode_indikator_nama_indikator);
    return normalized.some((kw) => name.includes(kw));
  });
}

/** Filter by ALL keywords (token-level AND match) — indikator + OPD combined */
export function filterByAllKeywords(records: SapaRecord[], keywords: string[]): SapaRecord[] {
  const normalized = keywords.map(normalizeText).filter(Boolean);
  if (normalized.length === 0) return [];
  return records.filter((r) => {
    const combined =
      normalizeText(r.kode_indikator_nama_indikator) + ' ' + normalizeText(r.opds_nama_opd);
    return normalized.every((kw) => combined.includes(kw));
  });
}

function parseYear(tahun: string | null): number | null {
  if (!tahun) return null;
  const t = tahun.trim();
  if (!t) return null;
  if (!/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Aggregate records per indicator — latest numeric value per indicator.
 * Pilih tahun numerik maksimum per id_kode_indikator (order-independent).
 * Jika semua tahun null/non-numerik → keep first. Sorted by nilaiNumber desc.
 */
export function aggregateByIndicator(records: SapaRecord[]): {
  id: number;
  nama: string;
  opd: string;
  nilai: string;
  nilaiNumber: number;
  satuan: string;
  tahun: string | null;
}[] {
  const map = new Map<number, {
    id: number; nama: string; opd: string; nilai: string; nilaiNumber: number;
    satuan: string; tahun: string | null;
  }>();

  for (const r of records) {
    const nama = r.kode_indikator_nama_indikator?.trim();
    if (!nama) continue;
    const nilaiNumber = parseNumericId(String(r.variabel ?? ''));
    if (nilaiNumber == null) continue;

    const existing = map.get(r.id_kode_indikator);
    if (!existing) {
      map.set(r.id_kode_indikator, {
        id: r.id_kode_indikator,
        nama,
        opd: r.opds_nama_opd.trim(),
        nilai: r.variabel,
        nilaiNumber,
        satuan: r.satuan,
        tahun: r.tahun || null,
      });
    } else {
      const ey = parseYear(existing.tahun);
      const ny = parseYear(r.tahun);
      let shouldReplace = false;
      if (ey === null && ny !== null) shouldReplace = true;
      else if (ey !== null && ny !== null && ny > ey) shouldReplace = true;
      if (shouldReplace) {
        map.set(r.id_kode_indikator, {
          id: r.id_kode_indikator,
          nama,
          opd: r.opds_nama_opd.trim(),
          nilai: r.variabel,
          nilaiNumber,
          satuan: r.satuan,
          tahun: r.tahun,
        });
      }
    }
  }

  return [...map.values()].sort((a, b) => b.nilaiNumber - a.nilaiNumber);
}

/** Summary stats */
export function getSapaSummary(records: SapaRecord[]) {
  const opds = getUniqueOpd(records);
  const indicators = getUniqueIndicators(records);
  return {
    totalRecords: records.length,
    totalOpd: opds.length,
    totalIndicators: indicators.length,
    topOpd: opds[0],
    tahun: [...new Set(records.map((r) => r.tahun?.trim() || '').filter(Boolean))],
  };
}
// ─── Rekons: Intent Scoring + Dedup ───

/** Kata agregat umum yang harus diberi penalti (-50) — bukan primary headline. */
const AGGREGATE_TERMS = new Set([
  'seluruh', 'total', 'jumlah seluruh', 'pemeriksaan', 'penerima', 'pengadaan',
  'pemindahan', 'penambahan', 'pengurangan', 'perubahan', 'penyesuaian',
  'penetapan', 'pengesahan', 'penunjukan', 'pengangkatan',
]);

/** Apakah nama indikator mengandung agregat umum? */
function isAggregateIndicator(indicatorName: string): boolean {
  const n = normalizeText(indicatorName);
  return [...AGGREGATE_TERMS].some((term) => n.includes(term));
}

/** Indikator yang mengandung kata topik utama — dapat +100. */
function indicatorContainsTopic(indicatorName: string, topic: string): boolean {
  const n = normalizeText(indicatorName);
  const t = normalizeText(topic);
  if (n.includes(t)) return true;
  const topicWords = t.split(/\s+/).filter(Boolean);
  if (topicWords.length >= 2) return topicWords.every((w) => n.includes(w));
  return false;
}

/**
 * Scoring intent: pilih primary headline indicator berdasarkan keyword matching.
 * +100 exact match topik, +50 sinonim, -50 agregat umum.
 */
export interface ScoredRecordMeta extends RecordMeta {
  _score: number;
}

export function scoreIntent(records: RecordMeta[], topic: string): ScoredRecordMeta[] {
  if (records.length === 0) return [];
  const scored = records.map((m) => {
    let score = 0;
    if (indicatorContainsTopic(m.indikator, topic)) score += 100;
    const sinonimBonus = ['kurus', 'gizi', 'gizi buruk', 'vitamin', 'vaksin', 'bkb', 'sarana', 'materi'];
    const lowerInd = normalizeText(m.indikator).toLowerCase();
    sinonimBonus.forEach((syn) => { if (lowerInd.includes(syn)) score += 50; });
    if (m.isAggregate) score -= 50;
    return { ...m, _score: score } as ScoredRecordMeta;
  });
  scored.sort((a, b) => b._score - a._score || (a.isAggregate ? 1 : -1));
  return scored;
}

/** Dedup: jika ada duplikat nilai & satuan & opd, jadikan satu (pilih yang lebih spesifik). */
export function dedupIndicators(records: RecordMeta[]): RecordMeta[] {
  if (records.length <= 1) return records;
  const seen = new Map<string, RecordMeta>();
  const result: RecordMeta[] = [];
  for (const r of records) {
    const key = `${r.nilai}-${r.satuan}-${r.opd}`;
    const existing = seen.get(key);
    if (existing) {
      const existingAgg = isAggregateIndicator(existing.indikator);
      const currentAgg = isAggregateIndicator(r.indikator);
      const existingSpec = existing.indikator.length * (existingAgg ? 0.5 : 1);
      const currentSpec = r.indikator.length * (currentAgg ? 0.5 : 1);
      if (currentSpec > existingSpec) {
        seen.set(key, r);
        const idx = result.findIndex((x) => x.nilai === r.nilai && x.satuan === r.satuan && x.opd === r.opd);
        if (idx >= 0) result[idx] = r;
      }
    } else {
      seen.set(key, r);
      result.push(r);
    }
  }
  return result;
}

/** Buat RecordMeta[] dari baris tabel visualisasi. */
export function toRecordMetasFromRows(
  rows: (string | number | null | undefined)[][],
  columns: { key: string }[],
): RecordMeta[] {
  const indicIdx = columns.findIndex((c) => c.key === 'Indikator' || c.key === 'indikator');
  const nilaiIdx = columns.findIndex((c) => c.key === 'Nilai' || c.key === 'nilai');
  const satIdx = columns.findIndex((c) => c.key === 'Satuan' || c.key === 'satuan');
  const opdIdx = columns.findIndex((c) => c.key === 'OPD' || c.key === 'opd');
  const thnIdx = columns.findIndex((c) => c.key === 'Tahun' || c.key === 'tahun');
  return rows.map((row) => {
    const indicator = (row[indicIdx] ?? '') as string;
    const nilaiStr = (row[nilaiIdx] ?? '') as string;
    const nilai = parseNumericId(nilaiStr.replace(/\./g, '').replace(',', '.'));
    const satuan = (row[satIdx] ?? '—') as string;
    const opd = (row[opdIdx] ?? '—') as string;
    const tahun = (row[thnIdx] ?? null) as string | null;
    return { id: Math.random(), indikator: indicator, nilai, satuan, opd, tahun, isAggregate: isAggregateIndicator(indicator) };
  });
}
