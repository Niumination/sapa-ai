// ─── AI Orchestrator — SAPA + Cloud AI (Optimized + Streaming) ───

import { detectIntent } from './intent-detector';
import { callLLM, streamLLM, extractNarasiPartial, stripReasoningPrefix } from './llm-client';
import { retrieveContext } from './rag-retriever';
import { groundOutput, buildVizFromEvidence, buildDeterministicNarasi, formatAngkaPresentasi } from './grounding';
import type { EvidenceItem } from './grounding';
import {
  fetchSapaData,
  dataSourceLabel,
  dataSourceFromEvidence,
  filterByOpd,
  getUniqueOpd,
  getUniqueIndicators,
  aggregateByIndicator,
  normalizeText,
  tokenizeQuery,
  buildMatchGroups,
  scoreRecord,
  stemId,
  extractYears,
  type MatchGroup,
  type SapaRecord,
  type SapaDataOrigin,
} from '@/lib/sapa-client';
import { detectMetaQuery, buildMetaResponse } from './meta-query';
import {
  publicDeflectionKind,
  buildPublicDeflectionNarasi,
  buildLookupNarasi,
  PUBLIC_DEFLECTION_REKOMENDASI,
  planDtsenQuery,
  fetchDtsenAgregatPublik,
  type PublicAgregatResult,
  type DtsenPlan,
  type PublicDeflectionKind,
  type ReleaseRef,
  type LookupFound,
} from './dtsen-planner';
import { hmac } from './dtsen-import';
import { buildExcelDocResponse, buildFusedMultiSourceResponse, detectExcelDocQuery } from './excel-doc-query';
import {
  isTrendQuery,
  findTrendCandidate,
  buildTrendResponse,
  buildTrendUnavailableResponse,
  isComparisonQuery,
  detectOpdsInQuery,
  buildOpdComparisonRows,
  buildComparisonResponse,
} from './trend-analysis';
import { HybridResponse } from '@/types';
import { prisma } from '@/lib/prisma';
import { ensureChatSessionTable } from '@/lib/db-migration';
import { fetchLatestBapoktingPrices, fetchBapoktingFromSplp, fetchDtsenFromSplp, type BapoktingPrice, SPLP_BAPOKTING_URL } from '@/lib/bapokting-client';
import { routeQuestion } from '@/services/statistics/question-router';
import { parseNumericIdOrFallback } from '@/lib/parse-numeric';
import { normalizeKecamatan } from '@/lib/normalize-kecamatan';
import { metricsFromSapa, metricsFromDtsen, metricsFromExcelDoc } from '@/lib/statistics/to-metrics';
import { fuseMetrics } from '@/lib/statistics/fusion';
import { buildNarrative } from '@/lib/statistics/narrative';
import { buildInsights, buildAnalysis } from '@/lib/statistics/insight';
import type { AgregatRow } from '@/services/dtsen-import';
import type { Archetype } from '@/lib/statistics/types';

// ─── SAPA Data Cache (10 menit) ───
let sapaCache: { records: SapaRecord[]; origin: SapaDataOrigin; expiresAt: number } | null = null;
const SAPA_CACHE_TTL = 10 * 60 * 1000;

async function getCachedSapaData(): Promise<{ records: SapaRecord[]; origin: SapaDataOrigin }> {
  if (sapaCache && sapaCache.expiresAt > Date.now()) {
    return { records: sapaCache.records, origin: sapaCache.origin };
  }
  const { records, origin } = await fetchSapaData();
  sapaCache = { records, origin, expiresAt: Date.now() + SAPA_CACHE_TTL };
  return { records, origin };
}

// ─── LLM Response Cache (5 menit) ───
const queryCache = new Map<string, { response: HybridResponse; expiresAt: number }>();

function getCached(query: string): HybridResponse | null {
  const key = normalizeText(query);
  const cached = queryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.response;
  queryCache.delete(key);
  return null;
}

function setCache(query: string, response: HybridResponse) {
  const key = normalizeText(query);
  queryCache.set(key, { response, expiresAt: Date.now() + 5 * 60 * 1000 });
  if (queryCache.size > 50) {
    const oldest = queryCache.keys().next().value;
    if (oldest) queryCache.delete(oldest);
  }
}

// ─── Core pipeline: intent + fetch + filter + build context ───
async function buildContext(query: string) {
  const intent = await detectIntent(query);
  const opdFilter = (intent as any).opdFilter as string | undefined;

  const { records: sapaRecords, origin: dataOrigin } = await getCachedSapaData();

  // Tahun dibiarkan apa adanya (null jika kosong) — jangan relabel 'terbaru'
  const normalizedRecords = sapaRecords;

  const tokens = tokenizeQuery(query);

  // ─── Retrieval v2 (PR Lapis 1) ───
  // Substring matching lama digantikan skor relevansi kata-utuh + stemming
  // + sinonim. Gerbang kepercayaan: tanpa kata query yang cocok di NAMA
  // INDIKATOR → tidak ada evidence (jawab "tidak ditemukan", jangan mengarang).
  let filteredData: SapaRecord[] = [];
  let matchedRecords: SapaRecord[] = [];
  let filterDipakai: string = 'none';
  const yearsRequested = extractYears(query);
  let availableYears: string[] = [];
  /** Skor relevansi per id_kode_indikator (untuk urutan evidence). */
  const relevanceScore = new Map<number, number>();

  const byOpd = opdFilter ? filterByOpd(normalizedRecords, opdFilter) : [];

  // Grup token yang hanya mengulang nama OPD (mis. "kesehatan" saat opdFilter
  // = Dinas Kesehatan) bukan topik substantif — itu permintaan ringkasan OPD.
  const groupsAll = buildMatchGroups(tokens);
  const opdWords = new Set(
    normalizeText(opdFilter ?? '').split(' ').filter(Boolean).flatMap((w) => [w, stemId(w)]),
  );
  const groups: MatchGroup[] = opdFilter
    ? groupsAll.filter(
        (g) =>
          !g.alternatives.every((alt) => alt.every((w) => opdWords.has(w) || opdWords.has(stemId(w)))),
      )
    : groupsAll;

  const rank = (scored: { record: SapaRecord; score: number; indHits: number }[]) => {
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 80).map((s) => {
      const key = s.record.id_kode_indikator;
      relevanceScore.set(key, Math.max(relevanceScore.get(key) ?? 0, s.score));
      return s.record;
    });
  };

  if (groups.length === 0) {
    // Tanpa kata substantif: hanya ringkasan OPD yang masuk akal.
    if (opdFilter && byOpd.length > 0) {
      filteredData = byOpd;
      filterDipakai = 'opd';
    }
  } else {
    // Samakan dengan ambang retrieveRelevant: ≥3 kata topik → minimal 2 grup cocok.
    const minIndHits = groups.length >= 3 ? 2 : 1;
    const scoreAgainst = (pool: SapaRecord[]) =>
      pool.map((r) => scoreRecord(r, groups)).filter((s) => s.indHits >= minIndHits);
    if (opdFilter) {
      const scoped = scoreAgainst(byOpd);
      if (scoped.length > 0) {
        filteredData = rank(scoped);
        filterDipakai = 'opd+relevansi';
      }
    }
    if (filteredData.length === 0) {
      const global = scoreAgainst(normalizedRecords);
      if (global.length > 0) {
        filteredData = rank(global);
        filterDipakai = 'relevansi';
      } else if (opdFilter && byOpd.length > 0) {
        // OPD jelas tapi topik tak ditemukan di katalog → ringkasan OPD
        // (lebih jujur daripada memaksa jawaban salah topik).
        filteredData = byOpd;
        filterDipakai = 'opd-fallback';
      }
    }
  }

  // Filter tahun eksplisit ("produksi kopi 2024"): jika tak ada data tahun itu,
  // kosongkan evidence (jujur) dan catat tahun yang memang tersedia.
  if (yearsRequested.length > 0 && filteredData.length > 0) {
    const yr = new Set(yearsRequested);
    const byYear = filteredData.filter((r) => yr.has((r.tahun ?? '').trim()));
    if (byYear.length > 0) {
      filteredData = byYear;
      filterDipakai += '+tahun';
    } else {
      availableYears = [
        ...new Set(
          filteredData
            .map((r) => (r.tahun ?? '').trim())
            .filter((t) => /^\d{4}$/.test(t)),
        ),
      ].sort();
      filteredData = [];
      filterDipakai += '+tahun:kosong';
    }
  }

  matchedRecords = filteredData;

  const allOpds = getUniqueOpd(normalizedRecords);
  const allIndicators = getUniqueIndicators(normalizedRecords);

  // AGGREGASI per indikator (tahun maks per id), urut: skor relevansi → nilai
  const aggregated = aggregateByIndicator(filteredData);
  aggregated.sort((a, b) => {
    const ra = relevanceScore.get(a.id) ?? 0;
    const rb = relevanceScore.get(b.id) ?? 0;
    if (rb !== ra) return rb - ra;
    return b.nilaiNumber - a.nilaiNumber;
  });

  // Dedupe nama+tahun identik (katalog SAPA kadang berisi entri ganda)
  const seenKeys = new Set<string>();
  const ordered = aggregated.filter((a) => {
    const key = `${normalizeText(a.nama)}|${a.tahun ?? ''}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // Evidence cap 30 compact — untuk grounding SoT
  const evidence: EvidenceItem[] = ordered.slice(0, 30).map((a) => ({
    opd: a.opd,
    indikator: a.nama,
    nilai: a.nilai,
    satuan: a.satuan,
    tahun: a.tahun,
    id: a.id,
  }));

  // ─── DTSEN Multi-Source Integration ───
  // Jika query relevan dengan DTSEN agregat, fetch dan gabungkan evidence DTSEN.
  // @hotfix-meeting-ready: Branch ini memungkinkan semua query DTSEN agregat
  // (bukan NIK/personal) untuk ditampilkan untuk demo. Filter UU PDP diterapkan
  // hanya di branch produksi/v3.
  const plan = planDtsenQuery(query);
  let dtsenEvidence: EvidenceItem[] = [];
  let dtsenProvenance: { label: string } = { label: '' };
  let dtsenNarasi: string | undefined;
  let dtsenSensor: string[] = [];

  if (plan.asksDtsen && plan.scope === 'AGGR') {
    let dtsenResult: PublicAgregatResult | null = null;

    try {
      const kecKanonik = plan.kecamatan ? normalizeKecamatan(plan.kecamatan) ?? plan.kecamatan : undefined;
      dtsenResult = await fetchDtsenAgregatPublik({
        kecamatan: kecKanonik,
        desa: plan.desa,
        desil: plan.desil,
        bansos: plan.bansos,
      });
    } catch (e) {
      console.warn('[Orchestrator] fetchDtsenAgregatPublik error, using demo fallback:', e);
      dtsenResult = null;
    }

    // @hotfix 28 Agu 2026: Fallback demo HANYA saat data DTSEN benar-benar kosong.
    // Sebelumnya `!hasBansosNeeded` (bansos diminta tapi hasil null) juga memicu demo —
    // itu menimpa data BAPPEDA/SPLP/DB yang valid (mis. query PKH: BAPPEDA tidak punya
    // kolom pkh, hanya PBI) dengan angka simulasi. Kini hasil valid dipertahankan dan
    // bansos yang tidak tersedia ditangani jujur oleh narasi (bukan demo).
    const hasValidDtsen = dtsenResult &&
      dtsenResult.byDesil &&
      Array.isArray(dtsenResult.byDesil) &&
      dtsenResult.byDesil.length > 0 &&
      dtsenResult.byWilayah &&
      Array.isArray(dtsenResult.byWilayah);

    if (!hasValidDtsen) {
      // @hotfix 29-Agu-2026: DEMO DATA DIHAPUS SEPENUHNYA — semua output murni
      // dari sumber nyata (SPLP API → DB rilis BAPPEDA → BAPPEDA offline JSON).
      // dtsenResult tetap null → narasi DTSEN jujur "tidak tersedia" + fallback
      // ke evidence SAPA/Dokumen (tanpa angka simulasi).
      console.warn('[DTSEN] Tidak ada data valid dari SPLP/DB/BAPPEDA — jawab tanpa klaim DTSEN.');
    }

    if (dtsenResult) {
      // @hotfix-meeting-ready: Safety — pastikan semua field ada sebelum build evidence
      dtsenResult.byDesil = dtsenResult.byDesil || [];
      dtsenResult.byWilayah = dtsenResult.byWilayah || [];
      dtsenResult.provenance = dtsenResult.provenance || { label: 'DTSEN (demo)', releaseNumber: 'DEMO', status: 'PUBLISHED', publishedAt: null };
      dtsenResult.bansos = dtsenResult.bansos || null;
      // @hotfix 29 Agu 2026: label jujur — sumber DTSEN dibedakan dari label
      // provenance yang SEBENARNYA dikirim planner (bukan tebakan dari nama
      // file/kode): DB rilis → "DB rilis…"; BAPPEDA offline → "…offline";
      // SPLP live → "…via SPLP API". Urutan cek: demo → DB → offline → SPLP.
      const provLabel = dtsenResult.provenance?.label ?? '';
      const provLower = provLabel.toLowerCase();
      const isDemoDtsen = provLower.includes('demo');
      const isDbDtsen = provLower.includes('db rilis');
      const isBappedaOffline = provLower.includes('offline');
      const isSplpDtsen = provLower.includes('splp');
      const dtsenOpd = isDemoDtsen
        ? 'DTSEN (Demo — simulasi)'
        : isDbDtsen
          ? 'DTSEN (DB rilis — warehouse)'
          : isBappedaOffline
            ? 'DTSEN (BAPPEDA Des 2025 — offline)'
            : isSplpDtsen
              ? 'DTSEN (Kemensos/BPS via SPLP API)'
              : 'DTSEN (Kemensos/BPS)';
      for (const d of dtsenResult.byDesil) {
        dtsenEvidence.push({
          opd: dtsenOpd,
          indikator: `Desil ${d.desil} — jiwa`,
          nilai: String(d.jiwa),
          satuan: 'jiwa',
          tahun: null,
          id: `dtsen:desil:${d.desil}`,
        });
      }
      if (dtsenResult.bansos) {
        for (const b of dtsenResult.bansos) {
          dtsenEvidence.push({
            opd: dtsenOpd,
            indikator: `Penerima ${b.program.toUpperCase()}`,
            nilai: b.jiwa === null ? '(disensor)' : String(b.jiwa),
            satuan: 'jiwa',
            tahun: null,
            id: `dtsen:bansos:${b.program}`,
          });
        }
      }
      for (const w of (dtsenResult.byWilayah || []).slice(0, 10)) {
        dtsenEvidence.push({
          opd: dtsenOpd,
          indikator: `${plan.kecamatan ? 'Desa' : 'Kecamatan'} ${w.nama} — jiwa`,
          nilai: String(w.jiwa),
          satuan: 'jiwa',
          tahun: null,
          id: `dtsen:wilayah:${encodeURIComponent(w.nama)}`,
        });
      }
      dtsenProvenance = { label: dtsenResult.provenance.label };
      dtsenNarasi = dtsenResult.narasi;
      dtsenSensor = dtsenResult.sensor;
    }
  }

  // ─── Bapokting Integration (Harga Komoditas via SPLP API) ───
  let bapoktingEvidence: EvidenceItem[] = [];
  let bapoktingProvenance: { label: string } = { label: '' };
  let bapoktingTrendData: any = null;

  // Deteksi query harga komoditas
  const priceKeywords = /\b(harga|prix|market|commodity|komoditas|sayur|buah|pangan|bahan pokok)\b/i;
  if (priceKeywords.test(query)) {
    try {
      const bapoktingData = await fetchLatestBapoktingPrices(50);
      if (bapoktingData.length > 0) {
        // Ekstrak komoditas spesifik dari query (beras, cabai, bawang, minyak)
        const queryLower = query.toLowerCase();
        const specificCommodities = ['beras', 'cabai', 'bawang', 'minyak', 'gula', 'sapi', 'ayam']
          .filter((c) => new RegExp(`\\b${c}\\b`, 'i').test(queryLower));

        // Filter: jika query spesifik (beras/cabai/dll), hanya tampilkan komoditas itu
        // Jika umum ("harga bahan pokok"), tampilkan semua
        const filtered = specificCommodities.length > 0
          ? bapoktingData.filter((p) =>
              specificCommodities.some((c) => (p.namaBarang || '').toLowerCase().includes(c))
            )
          : bapoktingData;

        // Ambil top 10 komoditas yang relevan
        for (const p of filtered.slice(0, 10)) {
          bapoktingEvidence.push({
            opd: 'Bapokting Aceh Tengah (SPLP API)',
            indikator: `Harga ${p.namaBarang}`,
            nilai: String(p.harga || 0),
            satuan: p.satuan || 'Kg',
            tahun: null,
            id: `bapokting:${(p.namaBarang || '').toLowerCase()}`,
          });
        }
        bapoktingProvenance = { label: 'Menurut Bapokting Aceh Tengah (SPLP API)' };

        // Fetch data historis mingguan (karena API hanya update mingguan)
        const today = new Date();
        // Cari 4 minggu terakhir
        const weekDates: string[] = [];
        for (let i = 0; i < 4; i++) {
          const date = new Date(today);
          date.setDate(date.getDate() - i * 7);
          weekDates.push(date.toISOString().split('T')[0]);
        }

        // Untuk setiap komoditas target, kumpulkan harga per minggu
        type TrendPoint = { date: string; price: number };
        type CommodityTrend = {
          nama: string;
          points: TrendPoint[];
          latest: number;
          oldest: number;
          trend: 'naik' | 'turun' | 'stabil';
          change: number;
        };

        const trendMap = new Map<string, CommodityTrend>();

        for (const commodity of filtered.slice(0, 15)) {
          const commodityName = commodity.namaBarang;
          const points: TrendPoint[] = [];
          const queryLower = query.toLowerCase();
          const isTarget = specificCommodities.some((c) =>
            commodityName.toLowerCase().includes(c)
          );

          for (const dateStr of weekDates) {
            try {
              const res = await fetch(
                `${SPLP_BAPOKTING_URL}?tb=data_aset&s=kecamatan&f=desil&tanggal=${dateStr}`,
                { signal: AbortSignal.timeout(8000) }
              );
              if (res.ok) {
                const histData = await res.json();
                const items = histData?.daftar_harga || [];
                const match = items.find((item: any) =>
                  item.komoditi === commodityName ||
                  (item.komoditi || '').toLowerCase() === commodityName.toLowerCase()
                );
                if (match && match.harga_eceran > 0) {
                  points.push({
                    date: dateStr,
                    price: match.harga_eceran,
                  });
                }
              }
            } catch {
              // Skip errors
            }
          }

          // Hanya simpan jika ada data
          if (points.length > 0) {
            points.sort((a, b) => a.date.localeCompare(b.date));
            const latest = points[points.length - 1].price;
            const oldest = points[0].price;
            const change = oldest > 0 ? ((latest - oldest) / oldest) * 100 : 0;
            trendMap.set(commodityName, {
              nama: commodityName,
              points,
              latest,
              oldest,
              trend: change > 2 ? 'naik' : change < -2 ? 'turun' : 'stabil',
              change,
            });
          }
        }

        bapoktingTrendData = Array.from(trendMap.values());
      }
    } catch (e) {
      console.warn('[Orchestrator] Bapokting fetch failed:', e);
    }
  }

  // Payload LLM ringkas: top-5 saat evidence besar; visualisasi penuh tetap
  // dibangun lokal via buildVizFromEvidence (tidak perlu LLM buat tabel besar).
  const allEvidence = [...evidence, ...dtsenEvidence, ...bapoktingEvidence];
  console.log('[DEBUG] allEvidence:', allEvidence.length, 'dtsenProvenance:', dtsenProvenance, 'dtsenNarasi:', dtsenNarasi);
  const evidenceForLLM = allEvidence.length > 8 ? allEvidence.slice(0, 5) : allEvidence;
  const dataForLLM = {
    query,
    intent: intent.kategori,
    filterDipakai,
    evidence: evidenceForLLM,
    evidenceCount: allEvidence.length,
    statistik_resmi: {
      total_data: normalizedRecords.length,
      total_opd: allOpds.length,
      total_indikator: allIndicators.length,
      ...(yearsRequested.length > 0 ? { tahun_diminta: yearsRequested } : {}),
    },
    ...(dtsenProvenance.label ? { dtsen_provenance: dtsenProvenance } : {}),
    ...(dtsenNarasi ? { dtsen_narasi: dtsenNarasi } : {}),
    ...(dtsenSensor.length > 0 ? { dtsen_sensor: dtsenSensor } : {}),
    ...(bapoktingProvenance.label ? { bapokting_provenance: bapoktingProvenance } : {}),
  };

  const konteksRegulasi = await retrieveContext(query, intent.kategori);
  const systemPrompt = buildSystemPrompt({
    totalOpd: allOpds.length,
    totalIndicators: allIndicators.length,
    totalData: normalizedRecords.length,
    evidenceCount: allEvidence.length,
    dtsenEvidence: dtsenEvidence.length,
  });

  return {
    intent,
    opdFilter,
    filterDipakai,
    dataOrigin,
    allRecords: normalizedRecords,
    filteredData,
    matchedRecords,
    evidence: allEvidence,
    dtsenEvidence,
    dtsenProvenance,
    dtsenNarasi,
    bapoktingEvidence,
    bapoktingProvenance,
    bapoktingTrendData,
    dataSource: dataSourceFromEvidence(allEvidence),
    dataForLLM,
    konteksRegulasi,
    systemPrompt,
    yearsRequested,
    availableYears,
  };
}

// ─── PR Lapis 1: guard output — placeholder/kekosongan model ───
// Model lemah kadang menyalin literal placeholder format ("...", "…") atau
// mengembalikan narasi nyaris kosong. Grounding angka tidak menangkap itu.
export function isPlaceholderText(s: string): boolean {
  const t = (s ?? '').trim();
  if (!t) return true;
  if (/^[\s.…"'\-–—_*`~:;!?]*$/.test(t)) return true;
  const alpha = (t.match(/[A-Za-zÀ-ɏ]/g) ?? []).length;
  return alpha < 3;
}

/** Narasi "tidak ditemukan" — jujur, plus catatan tahun bila relevan. */
export function buildNotFoundNarasi(yearsRequested: string[], availableYears: string[], dataSource: string = 'SAPA'): string {
  const base = `Data untuk pertanyaan ini tidak ditemukan di ${dataSource}.`;
  if (yearsRequested.length > 0) {
    const tersedia = availableYears.length > 0 ? ` Data terkait tersedia untuk tahun: ${availableYears.join(', ')}.` : '';
    return `Data untuk pertanyaan ini tidak ditemukan di ${dataSource} untuk tahun ${yearsRequested.join(', ')}.${tersedia}`;
  }
  return base;
}

// ─── Non-blocking DB save with latency metadata ───
// PR-3: pemanggil WAJIB await — sebelumnya fire-and-forget (`void`), yang di
// serverless (Vercel) berisiko log hilang karena fungsi dibekukan begitu
// response terkirim (temuan audit §6). Satu INSERT ini hanya ~puluhan ms,
// jauh di bawah latensi LLM; error DB tetap tidak menggagalkan response.
async function saveChatSession(params: {
  query: string;
  intent: string;
  result: HybridResponse;
  metadata: Record<string, any>;
}) {
  try {
    await prisma.chatSession.create({
      data: {
        query: params.query,
        intent: params.intent,
        aiResponse: params.result as any,
        metadata: params.metadata,
      },
    });
  } catch (dbErr) {
    // Jangan sampai error DB menggagalkan response ke user
    console.error('[AI] DB save failed (non-blocking):', dbErr);
  }
}

// ─── Observability metadata builder (pure, testable) ───
export function buildObservabilityMeta(input: {
  opdFilter?: string | null;
  filterDipakai: string;
  evidence: EvidenceItem[];
  grounding: 'pass' | 'replaced' | 'excel-doc' | 'multi-source-fusion';
  groundingReason?: string | null;
  totalData: number;
  filteredCount: number;
  matchedCount?: number;
  latencyMs: number;
  stepsMs: Record<string, number>;
  model: string | undefined | null;
  finishReason: string | null;
  dataOrigin: SapaDataOrigin;
  streamed: boolean;
  error?: string | null;
}): Record<string, any> {
  return {
    opdFilter: input.opdFilter ?? null,
    filterDipakai: input.filterDipakai,
    evidenceCount: input.evidence.length,
    evidenceIds: input.evidence.map((e) => e.id).slice(0, 30),
    grounding: input.grounding,
    groundingReason: input.groundingReason ?? null,
    totalData: input.totalData,
    filteredCount: input.filteredCount,
    matchedCount: input.matchedCount ?? null,
    latencyMs: input.latencyMs,
    stepsMs: input.stepsMs,
    model: input.model ?? null,
    finish_reason: input.finishReason ?? null,
    dataOrigin: input.dataOrigin,
    dataSource: dataSourceLabel(input.dataOrigin),
    streamed: input.streamed,
    ...(input.error ? { error: input.error } : {}),
  };
}

/** Jalur meta (daftar OPD / statistik portal / sebaran tahun) — deterministik, tanpa LLM. */
async function tryMetaQuery(
  query: string,
  startedAt: number,
  steps: Record<string, number>,
  streamed: boolean,
): Promise<HybridResponse | null> {
  const metaKind = detectMetaQuery(query);
  if (!metaKind) return null;
  const { records, origin } = await getCachedSapaData();
  const result = buildMetaResponse(metaKind, records, origin);
  steps.meta = Date.now() - startedAt;
  const metadata = buildObservabilityMeta({
    opdFilter: null,
    filterDipakai: `meta:${metaKind}`,
    evidence: [],
    grounding: 'pass',
    totalData: records.length,
    filteredCount: 0,
    latencyMs: Date.now() - startedAt,
    stepsMs: steps,
    model: null,
    finishReason: null,
    dataOrigin: origin,
    streamed,
  });
  await saveChatSession({ query, intent: 'meta', result, metadata });
  setCache(query, result);
  return result;
}

/**
 * PR-4c Enhanced (desain §8): integrasi DTSEN multi-source ke pipeline publik.
 * Berbeda dengan defleksi lama yang sepenuhnya mengalihkan, sekarang:
 *
 * - NIK / niat per-orang → tetap defleksi (privacy, audit trail)
 * - DTSEN agregat (desil, bansos, pembagian wilayah) → fetch publik DTSEN,
 *   gabungkan ke evidence, AI menjawab berdasarkan SAPA + DTSEN agregat
 * - DTSEN literal (kata kunci tanpa konteks agregat) → defleksi dengan saran

 * Provenance: setiap evidence DTSEN dilabeli dataOrigin 'dtsen' + provenance chip.
 * Sensor: k-anonymity sudah diterapkan saat publish (k≥5); sensor dinamis untuk
 * perhitungan bansos hasil query.
 */
interface DtsenIntegrationResult {
  /** Evidence tambahan dari DTSEN (untuk ditambah ke pipeline SAPA) */
  evidence: EvidenceItem[];
  /** Provenance DTSEN (untuk narasi header + chip visual) */
  provenance: { label: string; versi?: string; jalur?: string; publishedAt?: Date | string | null };
  /** Narasi DTSEN yang bisa langsung digabung ke prompt LLM */
  dtsenNarasi?: string;
  /** Apakah query ini defleksi (NIK/personal) */
  defleksi: boolean;
  /** Tipe defleksi bila ada */
  defleksiKind: PublicDeflectionKind | null;
}

async function integrateDtsenData(query: string, dtsenResult: PublicAgregatResult | null): Promise<DtsenIntegrationResult> {
  const plan: DtsenPlan = planDtsenQuery(query);

  // 1. NIK / per-orang → defleksi (privacy)
  if (plan.scope === 'PERSONAL' || (plan.nik !== null)) {
    const kind = publicDeflectionKind(query);
    return {
      evidence: [],
      provenance: { label: '' },
      defleksi: true,
      defleksiKind: kind ?? 'NIK',
    };
  }

  // 2. DTSEN agregat → fetch dan gabung ke evidence
  if (plan.asksDtsen && plan.scope === 'AGGR' && dtsenResult) {
    // Bangun evidence dari DTSEN agregat
    const evidence: EvidenceItem[] = [];

    // Evidence per desil
    for (const d of dtsenResult.byDesil) {
      evidence.push({
        opd: 'DTSEN (Kemensos/BPS)',
        indikator: `Desil ${d.desil} — jiwa`,
        nilai: String(d.jiwa),
        satuan: 'jiwa',
        tahun: null,
        id: `dtsen:desil:${d.desil}`,
      });
    }

    // Evidence bansos
    if (dtsenResult.bansos) {
      for (const b of dtsenResult.bansos) {
        evidence.push({
          opd: 'DTSEN (Kemensos/BPS)',
          indikator: `Penerima ${b.program.toUpperCase()}`,
          nilai: b.jiwa === null ? '(disensor)' : String(b.jiwa),
          satuan: 'jiwa',
          tahun: null,
          id: `dtsen:bansos:${b.program}`,
        });
      }
    }

    // Evidence per wilayah (kecamatan/desa)
    for (const w of dtsenResult.byWilayah.slice(0, 10)) {
      evidence.push({
        opd: 'DTSEN (Kemensos/BPS)',
        indikator: `${plan.kecamatan ? 'Desa' : 'Kecamatan'} ${w.nama} — jiwa`,
        nilai: String(w.jiwa),
        satuan: 'jiwa',
        tahun: null,
        id: `dtsen:wilayah:${encodeURIComponent(w.nama)}`,
      });
    }

    return {
      evidence,
      provenance: dtsenResult.provenance,
      dtsenNarasi: dtsenResult.narasi,
      defleksi: false,
      defleksiKind: null,
    };
  }

  // 3. DTSEN literal (kata kunci tanpa konteks agregat) → defleksi dengan saran
  const kind = publicDeflectionKind(query);
  if (kind && !plan.asksDtsen) {
    return {
      evidence: [],
      provenance: { label: '' },
      defleksi: true,
      defleksiKind: kind,
    };
  }

  return {
    evidence: [],
    provenance: { label: '' },
    defleksi: false,
    defleksiKind: null,
  };
}

/**
 * Lookup by-NIK untuk role DTSEN_LOOKUP/SUPERADMIN (dipakai jalur publik
 * /api/query ketika pengguna login dengan role DTSEN). Membaca rilis
 * PUBLISHED aktif → HMAC NIK → cari DtsenIndividu → narasi via buildLookupNarasi.
 * Data sensitif TIDAK pernah memuat NIK mentah; nama selalu termask.
 */
async function lookupDtsenByNik(nik: string): Promise<{ found: LookupFound | null; narasi: string; bansosTxt: string } | null> {
  const secret = process.env.DTSEN_NIK_KEY;
  if (!secret || secret.length < 16) return null; // fail-closed tanpa kunci
  try {
    const release = await prisma.dtsenRelease.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      select: { id: true, releaseNumber: true, status: true, publishedAt: true },
    });
    if (!release) return null;
    const nikHash = hmac(nik, secret);
    const row = await prisma.dtsenIndividu.findFirst({
      where: { releaseId: release.id, nikHash },
      select: { namaMasked: true, kecamatan: true, desa: true, desil: true, bansos: true },
    });
    const releaseRef: ReleaseRef = { releaseNumber: release.releaseNumber, status: release.status, publishedAt: release.publishedAt };
    const found = row
      ? {
          namaMasked: row.namaMasked,
          kecamatan: row.kecamatan ?? '',
          desa: row.desa ?? '',
          desil: row.desil,
          statusBansos: row.bansos ? { pkh: false, bpnt: false, pbi: true } : { pkh: false, bpnt: false, pbi: false },
        }
      : null;
    const bansosTxt = found?.statusBansos
      ? Object.entries(found.statusBansos).filter(([, v]) => v).map(([k]) => k.toUpperCase()).join(', ') || 'bukan penerima'
      : 'bukan penerima';
    return { found, narasi: buildLookupNarasi(found, releaseRef), bansosTxt };
  } catch (e) {
    console.error('[dtsen] lookup by-NIK gagal:', e);
    return null;
  }
}

async function tryDtsenDeflection(  query: string,
  startedAt: number,
  steps: Record<string, number>,
  streamed: boolean,
  role: string | null = null,
): Promise<HybridResponse | null> {
  const plan = planDtsenQuery(query);

  // @hotfix 29-Agu-2026: role DTSEN_LOOKUP/SUPERADMIN yang login → query NIK
  // (scope PERSONAL) dijawab LANGSUNG dari DB (lookup by-NIK + audit trail),
  // bukan defleksi. Pengguna publik / role lain tetap di-defleksi (privacy).
  const canLookupNik = role === 'DTSEN_LOOKUP' || role === 'SUPERADMIN';
  if (canLookupNik && plan.scope === 'PERSONAL' && plan.nik) {
    const lookup = await lookupDtsenByNik(plan.nik);
    if (lookup) {
      steps.dtsenDefleksi = Date.now() - startedAt;
      const result: HybridResponse = {
        narasi: lookup.narasi,
        visualisasi: {
          tipe: 'table',
          konfigurasi: {
            columns: ['Nama (termask)', 'Wilayah', 'Desil', 'Status Bansos'],
            rows: lookup.found
              ? [[lookup.found.namaMasked, `Desa ${lookup.found.desa}, Kec. ${lookup.found.kecamatan}`, lookup.found.desil ?? '-', lookup.bansosTxt]]
              : [['—', 'NIK tidak tercatat pada rilis aktif', '-', '-']],
          },
        },
        rekomendasi: [
          'Akses by-NIK ini tercatat di audit trail (UU 27/2022).',
          'Gunakan data ini untuk verifikasi data penerima bantuan / program OPD.',
        ],
        dataSource: 'DTSEN (lookup by-NIK — role DTSEN)',
        timestamp: new Date().toISOString(),
      };
      const metadata = {
        ...buildObservabilityMeta({
          opdFilter: null,
          filterDipakai: `dtsen-lookup:${role}`,
          evidence: [],
          grounding: 'pass',
          totalData: 0,
          filteredCount: 0,
          latencyMs: Date.now() - startedAt,
          stepsMs: steps,
          model: null,
          finishReason: null,
          dataOrigin: 'dtsen',
          streamed,
        }),
      };
      await saveChatSession({ query, intent: 'dtsen-personal', result, metadata }).catch(() => {});
      setCache(query, result);
      return result;
    }
    // lookup gagal (release tidak ada) → jatuh ke defleksi biasa
  }

  // @hotfix-meeting-ready: Untuk branch hotfix ini, semua query DTSEN agregat
  // DI-BLOCK. Hanya NIK/per-orang yang defleksi (privacy). Ini bertujuan agar
  // tim bisa melihat output AI lengkap dari semua sumber (SAPA + DTSEN + Bapokting).
  // Peraturan UU PDP hanya diterapkan di branch produksi/v3.
  if (plan.scope === 'AGGR') {
    // Aggregate queries — biarkan lewat ke buildContext untuk integrasi DTSEN
    return null;
  }
  const kind = publicDeflectionKind(query);
  if (!kind) return null;
  steps.dtsenDefleksi = Date.now() - startedAt;
  const result: HybridResponse = {
    narasi: buildPublicDeflectionNarasi(kind),
    visualisasi: { tipe: 'none', konfigurasi: {} },
    rekomendasi: [...PUBLIC_DEFLECTION_REKOMENDASI],
    dataSource: 'DTSEN (terbatas) — dialihkan dari jalur publik SAPA',
    timestamp: new Date().toISOString(),
  };
  const metadata = {
    ...buildObservabilityMeta({
      opdFilter: null,
      filterDipakai: `dtsen-defleksi:${kind.toLowerCase()}`,
      evidence: [],
      grounding: 'pass',
      totalData: 0,
      filteredCount: 0,
      latencyMs: Date.now() - startedAt,
      stepsMs: steps,
      model: null,
      finishReason: null,
      dataOrigin: 'splp',
      streamed,
    }),
    dataOrigin: 'dtsen',
    dataSource: 'DTSEN (terbatas) — dialihkan',
    dtsenDefleksi: kind,
  };
  await saveChatSession({ query, intent: 'dtsen-defleksi', result, metadata });
  setCache(query, result);
  return result;
}

/** Statistik resmi yang juga disuplai ke prompt — grounding tidak boleh menghukumnya. */
interface OfficialStats {
  total_data?: number;
  total_opd?: number;
  total_indikator?: number;
}
function groundingExtras(ctx: { evidence: EvidenceItem[]; dataForLLM: { statistik_resmi?: OfficialStats } }) {
  const s = ctx.dataForLLM?.statistik_resmi ?? {};
  return {
    extraAllowedNumbers: [
      s.total_data ?? 0,
      s.total_opd ?? 0,
      s.total_indikator ?? 0,
      ctx.evidence.length,
    ].filter((n) => Number.isFinite(Number(n)) && Number(n) > 0),
  };
}

/**
 * PR Lapis 2: jawaban tren & perbandingan secara deterministik dari data —
 * TANPA LLM. Tren dibangun dari baris multi-tahun SAPA yang dulu dibuang
 * agregasi; perbandingan dari deteksi ≥2 nama OPD nyata di query.
 */
async function tryDeterministicDomainQuery(
  query: string,
  ctx: Awaited<ReturnType<typeof buildContext>>,
  startedAt: number,
  steps: Record<string, number>,
  streamed: boolean,
): Promise<HybridResponse | null> {
  let result: HybridResponse | null = null;
  let filterDipakai = '';

  // WP7.2 — wiring fusion+narrative (flag STATISTICS_LAYER=1)
  if (process.env.STATISTICS_LAYER === '1') {
    try {
      const excelDocs: any[] = [];
      try {
        const dokB = await import('@/data/excel/json/dok-b-01-stunting-2026-07.json');
        excelDocs.push((dokB as any).default ?? dokB);
      } catch {}
      const excelMetrics = excelDocs.flatMap((d) => { try { return metricsFromExcelDoc(d); } catch { return []; } });
      const sapaMetrics = (() => { try { return metricsFromSapa(ctx.filteredData as any); } catch { return []; } })();
      const plan = (() => { try { return routeQuestion(query); } catch { return null; } })();
      const fused = fuseMetrics([...excelMetrics, ...sapaMetrics]);
      const cerita = buildNarrative({ fused, question: query, archetype: plan?.archetype });
      if (cerita.caveats.length > 0) (ctx as any).__statisticsCaveats = cerita.caveats;
      if ((cerita as any).ringkasan) (ctx as any).__statisticsSummary = (cerita as any).ringkasan;
      const insights = buildInsights(fused);
      if (insights.length) (ctx as any).__statisticsAnalysis = buildAnalysis(insights);
    } catch (e) { console.warn('[WP7.2] wiring skipped:', e); }
  }

  if (isTrendQuery(query)) {
    const cand = findTrendCandidate(ctx.filteredData);
    if (cand) {
      result = buildTrendResponse(query, cand, ctx.dataOrigin);
      filterDipakai = 'tren-deterministik';
    } else {
      // Kata "tren" TANPA data multi-tahun jangan sampai lolos ke LLM
      // (undangan halusinasi) — jawab keterbatasannya secara jujur.
      const unavailable = buildTrendUnavailableResponse(ctx.filteredData, ctx.dataOrigin);
      if (unavailable) {
        result = unavailable;
        filterDipakai = 'tren-tidak-tersedia';
      }
    }
  }

  if (!result && isComparisonQuery(query)) {
    const opdNames = getUniqueOpd(ctx.allRecords).map((o) => o.nama);
    const matches = detectOpdsInQuery(query, opdNames);
    if (matches.length >= 2) {
      const rows = buildOpdComparisonRows(matches, ctx.allRecords);
      result = buildComparisonResponse(matches, rows, ctx.dataOrigin);
      filterDipakai = `perbandingan-deterministik:${matches.length}-opd`;
    }
  }

  // @hotfix 29 Agu 2026 — Jalur DTSEN deterministik: query DTSEN murni (desil/dtsen/
  // bpnt/pbi) dengan dtsenNarasi yang tersedia → jawab LANGSUNG dari narasi agregat
  // (BAPPEDA offline / SPLP / DB), TANPA LLM. Sebelumnya query seperti "desil 1 di
  // kecamatan Bebesen" diteruskan ke LLM yang memilih evidence SAPA tidak relevan
  // (mis. jalan kabupaten) — padahal dtsenNarasi sudah berisi angka yang benar.
  if (!result && ctx.dtsenNarasi && isPureDtsenQuery(query)) {
    const evRows = ctx.evidence
      .filter((e) => (e.opd ?? '').toLowerCase().includes('dtsen'))
      .slice(0, 10)
      .map((e) => [e.indikator ?? '', e.nilai ?? '', e.satuan ?? '']);
    result = {
      narasi: ctx.dtsenNarasi,
      visualisasi: evRows.length > 0
        ? { tipe: 'table', konfigurasi: { columns: ['Indikator', 'Nilai', 'Satuan'], rows: evRows } }
        : { tipe: 'none', konfigurasi: {} },
      rekomendasi: [
        `Verifikasi angka DTSEN di atas dengan OPD terkait (Dinas Sosial/BAPPEDA) untuk perencanaan program.`,
        `Data ini dari ${ctx.dataSource}; gunakan bersama data SAPA untuk analisis lintas sumber.`,
      ],
      dataSource: ctx.dataSource,
      timestamp: new Date().toISOString(),
    };
    filterDipakai = 'dtsen-deterministik';
  }

  // @hotfix 31-Agu-2026 — Jalur Bapokting deterministik: query harga komoditas
  // (beras, cabai, bawang, minyak, dll) dijawab LANGSUNG dari data Bapokting
  // (SPLP API), TANPA LLM. Sebelumnya query harga jatuh ke LLM dengan evidence
  // campuran SAPA+DTSEN yang tidak relevan — output "masih sama seperti lama".
  // Kini query harga mengembalikan:
  // - Narasi harga aktual (tertinggi/terendah) + tren naik/turun
  // - Chart line/area tren harga (jika data historis tersedia)
  // - Chart bar perbandingan harga (fallback)
  // - Filter hanya komoditas yang disebutkan di query
  if (!result && ctx.bapoktingEvidence.length > 0) {
    const bk = ctx.bapoktingEvidence;

    // Ekstrak komoditas target dari query
    const queryLower = query.toLowerCase();
    const komoditasKeywords = ['beras', 'cabe', 'bawang', 'minyak', 'gula', 'sapi', 'ayam'];
    const targetKomoditas = komoditasKeywords.filter((k) => new RegExp(`\\b${k}\\b`, 'i').test(queryLower));

    // Filter evidence hanya untuk komoditas yang relevan
    const relevantEvidence = targetKomoditas.length > 0
      ? bk.filter((e) =>
          targetKomoditas.some((k) => (e.indikator ?? '').toLowerCase().includes(k))
        )
      : bk;

    // Handle komoditas yang tidak ada di API (contoh: cabai)
    if (targetKomoditas.length > 0 && relevantEvidence.length === 0) {
      const unavailable = targetKomoditas.filter(k => !bk.some(e => (e.indikator ?? '').toLowerCase().includes(k)));
      if (unavailable.length > 0) {
        result = {
          narasi: `Maaf, data harga untuk ${unavailable.join(' dan ')} saat ini belum tersedia di Bapokting Aceh Tengah. Data yang tersedia meliputi: beras, bawang, minyak, gula, ternak, dan bahan pokok lainnya.`,
          visualisasi: { tipe: 'none', konfigurasi: {} },
          rekomendasi: [`Coba tanyakan harga komoditas lain yang tersedia seperti beras, bawang, atau minyak.`],
          dataSource: 'Bapokting Aceh Tengah (SPLP API)',
          timestamp: new Date().toISOString(),
        };
        filterDipakai = 'bapokting-deterministik';
        steps.deterministic = Date.now() - startedAt;
        return result;
      }
    }

    // Sort descending by price (highest first)
    const sorted = [...relevantEvidence].sort((a, b) => Number(b.nilai) - Number(a.nilai));
    const top = sorted.slice(0, 3);
    const bottom = [...sorted].reverse().slice(0, 3);

    // Narasi harga aktual dari data (bukan LLM)
    const topTxt = top.map((e) => `${e.indikator.replace(/^Harga /, '')}: Rp ${Number(e.nilai).toLocaleString('id-ID')}/${e.satuan}`).join('; ');
    const bottomTxt = bottom.map((e) => `${e.indikator.replace(/^Harga /, '')}: Rp ${Number(e.nilai).toLocaleString('id-ID')}/${e.satuan}`).join('; ');
    const commodityLabel = targetKomoditas.length > 0
      ? ` komoditas "${targetKomoditas.join(', ')}"`
      : ' bahan pokok';
    const narasi = `Berdasarkan data Bapokting Aceh Tengah (SPLP API, ${new Date().toLocaleDateString('id-ID')}), harga${commodityLabel} saat ini: ${topTxt}. Harga terendah:${bottomTxt.replace(/^Harga/, '')}. Harga dapat berubah sesuai pasokan dan permintaan pasar.`;

    // Tambahkan informasi tren jika tersedia
    let trendNarasi = '';
    if (ctx.bapoktingTrendData && ctx.bapoktingTrendData.length > 0) {
      const naik = ctx.bapoktingTrendData.filter((t: any) => t.trend === 'naik');
      const turun = ctx.bapoktingTrendData.filter((t: any) => t.trend === 'turun');
      if (naik.length > 0 || turun.length > 0) {
        const naikTxt = naik.map((t: any) => `"${t.nama}": +${Math.round(t.change * 10) / 10}%`).join(', ');
        const turunTxt = turun.map((t: any) => `"${t.nama}": ${Math.round(t.change * 10) / 10}%`).join(', ');
        trendNarasi = ` Dalam 4 minggu terakhir, harga ${naik.length > 0 ? naikTxt : ''}${naik.length > 0 && turun.length > 0 ? ' sedangkan ' : ''}${turun.length > 0 ? turunTxt : ''}.`;
      }
    }

    // Tentukan chart: line tren mingguan jika tersedia, else bar perbandingan
    let visualisasi: any = { tipe: 'chart', konfigurasi: {} };
    if (ctx.bapoktingTrendData && ctx.bapoktingTrendData.length > 0) {
      // Chart line: tren harga per minggu
      const allDates = ctx.bapoktingTrendData[0]?.points?.map((p: any) => p.date) || [];
      const uniqueDates = [...new Set(allDates)].sort();

      // Build stacked data for chart
      const chartData: any[] = [];
      for (const date of uniqueDates) {
        const row: any = { minggu: date };
        for (const trend of ctx.bapoktingTrendData) {
          const point = trend.points.find((p: any) => p.date === date);
          row[trend.nama] = point ? point.price : null;
        }
        chartData.push(row);
      }

      // X-axis: format tanggal menjadi "31 Agu"
      const formattedData = chartData.map((row: any) => {
        const formatted: any = { label: '' };
        try {
          const d = new Date(row.minggu);
          formatted.label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        } catch {
          formatted.label = row.minggu;
        }
        for (const trend of ctx.bapoktingTrendData) {
          formatted[trend.nama] = row[trend.nama];
        }
        return formatted;
      });

      const lines = ctx.bapoktingTrendData.map((t: any) => t.nama);

      visualisasi = {
        tipe: 'chart',
        konfigurasi: {
          type: 'line',
          xKey: 'label',
          data: formattedData,
          lines,
        },
      };
    } else {
      // Fallback: chart bar perbandingan harga
      const chartData = relevantEvidence.slice(0, 10).map((e: any) => ({
        nama: e.indikator.replace(/^Harga /, ''),
        harga: Number(e.nilai) || 0,
        satuan: e.satuan ?? 'Kg',
      }));
      visualisasi = {
        tipe: 'chart',
        konfigurasi: {
          type: 'bar',
          xKey: 'nama',
          data: chartData,
          bars: ['harga'],
        },
      };
    }

    result = {
      narasi: narasi + trendNarasi,
      visualisasi,
      rekomendasi: targetKomoditas.length > 0
        ? [
            `Pantau tren harga ${targetKomoditas.join(', ')} secara berkala untuk antisipasi inflasi daerah.`,
            `Data harga berasal dari Bapokting (SPLP API); gunakan bersama data SAPA untuk analisis ketahanan pangan.`,
          ]
        : [
            `Pantau tren harga bahan pokok secara berkala untuk antisipasi inflasi daerah.`,
            `Data harga berasal dari Bapokting (SPLP API); gunakan bersama data SAPA untuk analisis ketahanan pangan.`,
          ],
      dataSource: 'Bapokting Aceh Tengah (SPLP API)',
      timestamp: new Date().toISOString(),
    };
    filterDipakai = 'bapokting-deterministik';
  }

  // PR Lapis 2.1: Question Router (WP2) — archetype-driven deterministic responses
  // Untuk archetype yang belum di-cover oleh handler lama (trend/comparison/bapokting/dtsen):
  // ranking, distribution, composition, correlation, anomaly → jawab dari evidence tanpa LLM.
  if (!result) {
    const plan = routeQuestion(query);
    // C-fix: sort by relevance to plan.concepts (sebelumnya return 0 → tidak pernah rangking)
    const evidenceSorted = [...ctx.evidence].sort((a, b) => {
      const aScore = plan.concepts.filter(c => (a.indikator ?? '').toLowerCase().includes(c.toLowerCase())).length;
      const bScore = plan.concepts.filter(c => (b.indikator ?? '').toLowerCase().includes(c.toLowerCase())).length;
      return bScore - aScore;
    });
    const top3 = evidenceSorted.slice(0, 3);

    if (plan.archetype === 'ranking' && top3.length > 0) {
      // Gunakan filteredData (SapaRecord[]) untuk ranking
      const ranked = [...ctx.filteredData]
        .map((r) => ({
          nama: r.kode_indikator_nama_indikator ?? '',
          nilai: parseNumericIdOrFallback(r.variabel, 0),
          satuan: r.satuan ?? '',
          tahun: r.tahun ?? '',
          opd: r.opds_nama_opd ?? '',
        }))
        .sort((a, b) => b.nilai - a.nilai)
        .slice(0, 5);
      result = {
        narasi: `Berdasarkan data ${ctx.dataSource}, ${top3[0]?.indikator ?? ''} tertinggi di Aceh Tengah: ${ranked.map((it, i) => `${i + 1}. ${it.opd}: ${it.nilai.toLocaleString('id-ID')} ${it.satuan} (${it.tahun})`).join('; ')}.`,
        visualisasi: { tipe: 'chart', konfigurasi: { type: 'bar', xKey: 'nama', data: ranked, bars: ['nilai'] } },
        rekomendasi: [`Verifikasi ranking di atas dengan OPD terkait untuk memastikan konsistensi pelaporan.`],
        dataSource: ctx.dataSource,
        timestamp: new Date().toISOString(),
      };
      filterDipakai = `ranking-deterministik:${plan.concepts.join(',')}`;
      steps.deterministic = Date.now() - startedAt;
    }

    if (plan.archetype === 'distribution' && plan.geo.level !== 'kabupaten' && top3.length > 0) {
      // Distribution: group filteredData by kecamatan/desa (field tidak ada di SapaRecord)
      // Fallback ke OPD grouping jika geo field tidak tersedia
      const grouped: Record<string, number> = {};
      for (const r of ctx.filteredData) {
        // SapaRecord tidak punya field kecamatan/desa — gunakan OPD sebagai proxy
        const key = r.opds_nama_opd || 'tidak diketahui';
        const val = parseNumericIdOrFallback(r.variabel, 0);
        grouped[key] = (grouped[key] ?? 0) + val;
      }
      const distRows = Object.entries(grouped)
        .sort((a, b) => b[1] - a[1])
        .map(([nama, nilai]) => ({ nama, nilai }));
      const total = Object.values(grouped).reduce((s, v) => s + v, 0);
      const distNarasi = distRows.slice(0, 5).map((r) => {
        const pct = total > 0 ? ((r.nilai / total) * 100).toFixed(1) : '0.0';
        return `${r.nama}: ${r.nilai.toLocaleString('id-ID')} (${pct}%)`;
      }).join('; ');
      result = {
        narasi: `Distribusi ${top3[0]?.indikator ?? ''} per OPD di Aceh Tengah: ${distNarasi}.`,
        visualisasi: { tipe: 'chart', konfigurasi: { type: 'pie', xKey: 'nama', data: distRows.map((r) => ({ nama: r.nama, nilai: r.nilai })), bars: ['nilai'] } },
        rekomendasi: [`Analisis distribusi per OPD untuk identifikasi area prioritas intervensi.`],
        dataSource: ctx.dataSource,
        timestamp: new Date().toISOString(),
      };
      filterDipakai = `distribution-deterministik:${plan.geo.level}`;
      steps.deterministic = Date.now() - startedAt;
    }

    if ((plan.archetype === 'correlation' || plan.archetype === 'anomaly') && top3.length >= 2) {
      const concepts = plan.concepts.length > 0 ? plan.concepts.join(', ') : top3.map((e) => e.indikator).join(' dan ');
      result = {
        narasi: top3.length >= 2
          ? `Berdasarkan data tersedia, terdapat ${plan.archetype === 'correlation' ? 'asosiasi antara' : 'indikator dengan pola tidak wajar'} ${concepts}. ${ctx.dataSource} mencatat: ${top3.map((e) => `${e.indikator}: ${Number(e.nilai ?? 0).toLocaleString('id-ID')} ${e.satuan ?? ''}`).join('; ')}. Analisis lebih lanjut disarankan untuk verifikasi pola.`
          : `Data untuk analisis ${plan.archetype} belum cukup lengkap. Pertimbangkan menambah periode data atau indikator terkait.`,
        visualisasi: { tipe: 'table', konfigurasi: { columns: ['Indikator', 'Nilai', 'Satuan'], rows: top3.map((e) => [e.indikator ?? '', String(e.nilai ?? ''), e.satuan ?? '']) } },
        rekomendasi: [`Diskusikan temuan dengan OPD pemilik data untuk validasi pola korelasi/anomali.`],
        dataSource: ctx.dataSource,
        timestamp: new Date().toISOString(),
      };
      filterDipakai = `${plan.archetype}-deterministik`;
      steps.deterministic = Date.now() - startedAt;
    }
  }

  if (!result) return null;

  steps.deterministic = Date.now() - startedAt;
  const isTrend = filterDipakai.startsWith('tren');
  const isBapokting = filterDipakai === 'bapokting-deterministik';
  const metadata = buildObservabilityMeta({
    opdFilter: ctx.opdFilter ?? null,
    filterDipakai,
    evidence: ctx.evidence,
    grounding: 'pass',
    totalData: ctx.allRecords.length,
    filteredCount: ctx.filteredData.length,
    matchedCount: ctx.matchedRecords.length,
    latencyMs: Date.now() - startedAt,
    stepsMs: steps,
    model: null,
    finishReason: null,
    dataOrigin: ctx.dataOrigin,
    streamed,
  });
  await saveChatSession({
    query,
    intent: isTrend ? 'tren' : isBapokting ? 'bapokting' : 'perbandingan',
    result,
    metadata,
  });
  setCache(query, result);
  return result;
}

/** Guard Lapis 1: narasi placeholder / format gagal → template deterministik; rekomendasi bersih. */
function sanitizeParsed(parsed: HybridResponse, evidence: EvidenceItem[], query: string): HybridResponse {
  let narasi = parsed.narasi;
  if (
    isPlaceholderText(narasi) ||
    narasi.startsWith('Maaf, AI gagal') ||
    narasi.startsWith('Maaf, AI tidak memberikan')
  ) {
    narasi = buildDeterministicNarasi(evidence, query);
  }
  let rekomendasi = (parsed.rekomendasi ?? []).filter((r) => !isPlaceholderText(r)).slice(0, 3);
  // Hotfix Aug 26 (laporan user): model reasoning hampir selalu memilih "[]" meski
  // prompt sudah minta diisi — panel rekomendasi tak pernah tampil di live.
  // Prompt diperkuat ATURAN 6; ini garansi kedua: fallback deterministik tanpa
  // angka baru agar panel tetap berguna.
  if (rekomendasi.length === 0 && evidence.length > 0 && !narasi.startsWith('Maaf,')) {
    rekomendasi = [
      `Tindak lanjuti pertanyaan "${query}" dengan mengonsultasikan temuan di atas ke OPD pemilik indikator untuk verifikasi data terbaru dan dasar perencanaan program.`,
    ];
  }
  return { ...parsed, narasi, rekomendasi };
}

/**
 * Query DTSEN murni (agregat): token desil/dtsen/bpnt/pbi sebagai kata kunci utama.
 * Dipakai untuk jalur deterministik — jawab dari dtsenNarasi tanpa LLM.
 */
function isPureDtsenQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\bdesil\b/.test(q) ||
    /\bdtsen\b/.test(q) ||
    /\bbpnt\b/.test(q) ||
    /\bpbi\b/.test(q)
  );
}

/** Format nilai numerik ke id-ID (12.345) — teks/satuan dibiarkan apa adanya. */
function fmtNilaiId(v: string): string {
  const t = v.trim();
  // Numerik murni (integer/desimal, boleh minus) → format ribuan id-ID
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n.toLocaleString('id-ID');
  }
  // Sudah berformat "12.345" atau "12,5" → biarkan
  return t;
}

/** Ringkas evidence SAPA/DTSEN jadi 1-2 kalimat untuk narasi fusi multi-sumber. */
function summarizeEvidence(evidence: EvidenceItem[]): string {
  const top = evidence.slice(0, 3);
  const parts = top
    .map((e) => {
      // @hotfix 29-Agu-2026: format angka id-ID konsisten (12.345 bukan 12345)
      const v = e.nilai ? ` ${fmtNilaiId(e.nilai)}${e.satuan ? ' ' + e.satuan : ''}` : '';
      const yr = e.tahun ? ` (${e.tahun})` : '';
      return `${e.indikator}${v}${yr}`;
    })
    .filter(Boolean);
  if (parts.length === 0) return '';
  return `indikator terkait: ${parts.join('; ')}.`;
}

export async function processAIQuery(query: string, opts: { role?: string | null } = {}): Promise<HybridResponse> {
  const cached = getCached(query);
  if (cached) return cached;

  const startedAt = Date.now();
  const steps: Record<string, number> = {};

  try {
    // PR Lapis 1: meta-query portal → deterministik, tanpa LLM
    const meta = await tryMetaQuery(query, startedAt, steps, false);
    if (meta) return meta;

    // PR-4c: defleksi DTSEN (NIK/desil/per-orang) — sebelum retrieval SAPA
    const deflected = await tryDtsenDeflection(query, startedAt, steps, false, opts.role);
    if (deflected) return deflected;

    // Deteksi sumber Dokumen A/B/C (agregat Excel bebas-PII) — deterministik.
    // Tidak langsung di-return; dipakai untuk fusi multi-sumber bila topik sama
    // muncul pula di SAPA/DTSEN (mis. "stunting" ada di Dokumen B + SAPA).
    const matchedDoc = detectExcelDocQuery(query);

    // Step 1-3: intent + fetch + filter (context build). Di-wrap agar kegagalan
    // pembangunan konteks SAPA/DTSEN rapuh tidak menghalangi jawaban Dokumen.
    let ctx: Awaited<ReturnType<typeof buildContext>>;
    try {
      ctx = await buildContext(query);
    } catch (ctxErr) {
      if (matchedDoc) {
        const docResp = buildExcelDocResponse(query, matchedDoc);
        const metadata = buildObservabilityMeta({
          opdFilter: null,
          filterDipakai: '-',
          evidence: [],
          grounding: 'excel-doc',
          totalData: 0,
          filteredCount: 0,
          latencyMs: Date.now() - startedAt,
          stepsMs: steps,
          model: process.env.AI_MODEL,
          finishReason: null,
          dataOrigin: 'direct',
          streamed: false,
        });
        await saveChatSession({ query, intent: 'dokumen', result: docResp, metadata });
        setCache(query, docResp);
        return docResp;
      }
      throw ctxErr;
    }
    steps.context = Date.now() - startedAt;

    // ─── Multi-Source Fusion (Dokumen A/B/C + SAPA/DTSEN) ───
    // Bila topik sama ditemukan di Dokumen DAN di evidence SAPA/DTSEN, gabung
    // menjadi SATU jawaban deterministik (tanpa LLM). Tabel otoritatif dari Dokumen.
    if (matchedDoc && ctx.evidence.length > 0) {
      try {
        const fused = buildFusedMultiSourceResponse(query, matchedDoc, {
          evidence: ctx.evidence,
          dataSource: ctx.dataSource,
          sapaSummary: summarizeEvidence(ctx.evidence),
        });
        if (fused) {
          const metadata = buildObservabilityMeta({
            opdFilter: ctx.opdFilter ?? null,
            filterDipakai: ctx.filterDipakai,
            evidence: ctx.evidence,
            grounding: 'multi-source-fusion',
            totalData: ctx.allRecords.length,
            filteredCount: ctx.filteredData.length,
            latencyMs: Date.now() - startedAt,
            stepsMs: steps,
            model: process.env.AI_MODEL,
            finishReason: null,
            dataOrigin: ctx.dataOrigin,
            streamed: false,
          });
          await saveChatSession({ query, intent: ctx.intent.kategori, result: fused, metadata });
          setCache(query, fused);
          return fused;
        }
      } catch (fusionErr) {
        // Fusi gagal → lanjut ke jalur normal (SAPA/LLM), jangan crash pipeline.
        console.warn('[Orchestrator] fusion skipped:', fusionErr);
      }
    }

    // Bila query cocok dengan Dokumen (A/B/C) tetapi tidak memenuhi syarat fusi
    // multi-sumber, jawab langsung dari Dokumen secara deterministik. Mengutamakan
    // jalur Dokumen (deterministik, PII-aman) dan mencegah jatuh ke jalur SAPA/LLM
    // yang rapuh untuk pertanyaan bertopik Dokumen.
    if (matchedDoc) {
      const docResp = buildExcelDocResponse(query, matchedDoc);
      const metadata = buildObservabilityMeta({
        opdFilter: ctx.opdFilter ?? null,
        filterDipakai: ctx.filterDipakai,
        evidence: ctx.evidence,
        grounding: 'excel-doc',
        totalData: ctx.allRecords.length,
        filteredCount: ctx.filteredData.length,
        latencyMs: Date.now() - startedAt,
        stepsMs: steps,
        model: process.env.AI_MODEL,
        finishReason: null,
        dataOrigin: ctx.dataOrigin,
        streamed: false,
      });
      await saveChatSession({ query, intent: ctx.intent.kategori, result: docResp, metadata });
      setCache(query, docResp);
      return docResp;
    }

    // PR Lapis 2: tren & perbandingan → deterministik dari data, tanpa LLM
    const deterministic = await tryDeterministicDomainQuery(query, ctx, startedAt, steps, false);
    if (deterministic) return deterministic;

    // SoT Fase C: jika evidence kosong → jangan panggil LLM
    if (ctx.evidence.length === 0) {
      const empty: HybridResponse = {
        narasi: buildNotFoundNarasi(ctx.yearsRequested, ctx.availableYears, ctx.dataSource),
        visualisasi: { tipe: 'none', konfigurasi: {} },
        rekomendasi: [],
        dataSource: ctx.dataSource,
        timestamp: new Date().toISOString(),
      };
      const metadata = buildObservabilityMeta({
        opdFilter: ctx.opdFilter ?? null,
        filterDipakai: ctx.filterDipakai,
        evidence: [],
        grounding: 'pass',
        totalData: ctx.allRecords.length,
        filteredCount: ctx.filteredData.length,
        latencyMs: Date.now() - startedAt,
        stepsMs: steps,
        model: process.env.AI_MODEL,
        finishReason: null,
        dataOrigin: ctx.dataOrigin,
        streamed: false,
      });
      await saveChatSession({ query, intent: ctx.intent.kategori, result: empty, metadata });
      setCache(query, empty);
      return empty;
    }

    // Step 4: Panggil LLM (satu kali)
    const llmStarted = Date.now();
    const llmRes = await callLLM(ctx.systemPrompt, {
      query,
      data: ctx.dataForLLM,
      konteks: ctx.konteksRegulasi,
    });
    steps.llm = Date.now() - llmStarted;

    // Step 5: Parse + guard + grounding SoT (dengan statistik resmi yang diizinkan)
    const parsed = sanitizeParsed(parseHybridResponse(llmRes.text, ctx.filteredData, ctx.dataOrigin, ctx.evidence), ctx.evidence, query);
    const { response: grounded, grounding, reason } = groundOutput(parsed, ctx.evidence, query, groundingExtras(ctx));
    let result = grounded;
    // Viz dari evidence jika model tidak kasih atau grounding mengganti
    if (result.visualisasi.tipe === 'none' && ctx.evidence.length > 0) {
      result = { ...result, visualisasi: buildVizFromEvidence(ctx.evidence) };
    } else if (grounding === 'replaced') {
      // groundOutput sudah pakai viz dari evidence, pastikan konsisten
      result = { ...grounded, visualisasi: buildVizFromEvidence(ctx.evidence) };
    }

    // Hotfix Aug 26 (laporan user): format ribuan utk keterbacaan (19686 → 19.686)
    // di narasi + sel tabel/metric. Kosmetik murni SETELAH grounding selesai.
    // WP7.2: tambah ringkasan + caveats dari statistik layer bila ada.
    if ((ctx as any).__statisticsSummary) result.narasi = `${result.narasi}\n\n${(ctx as any).__statisticsSummary}`;
    if ((ctx as any).__statisticsCaveats?.length) result.rekomendasi = [...(result.rekomendasi ?? []), ...(ctx as any).__statisticsCaveats];
    result = formatAngkaPresentasi(result);

    // Step 6: Simpan ke DB (non-blocking — tidak menunggu)
    const metadata = buildObservabilityMeta({
      opdFilter: ctx.opdFilter ?? null,
      filterDipakai: ctx.filterDipakai,
      evidence: ctx.evidence,
      grounding,
      groundingReason: reason ?? null,
      totalData: ctx.allRecords.length,
      filteredCount: ctx.filteredData.length,
      matchedCount: ctx.matchedRecords.length,
      latencyMs: Date.now() - startedAt,
      stepsMs: steps,
      model: llmRes.model,
      finishReason: llmRes.finishReason,
      dataOrigin: ctx.dataOrigin,
      streamed: false,
    });
    await saveChatSession({ query, intent: ctx.intent.kategori, result, metadata });

    setCache(query, result);
    return result;
  } catch (err) {
    console.error('[AI] Fallback triggered:', err);
    const errorResult: HybridResponse = {
      // Hotfix live Vercel Aug 2026: jangan bocorkan pesan error mentah (mis. body
      // HTML/JSON provider) ke user — detail lengkap sudah ada di console.error di atas.
      narasi: 'Maaf, layanan AI sedang sibuk atau tidak dapat dihubungi. Silakan coba lagi beberapa saat lagi.',
      visualisasi: { tipe: 'none', konfigurasi: {} },
      rekomendasi: [],
      dataSource: 'error',
      timestamp: new Date().toISOString(),
    };

    await saveChatSession({
      query,
      intent: 'error',
      result: errorResult,
      metadata: { error: err instanceof Error ? err.message : 'Unknown', latencyMs: Date.now() - startedAt, finish_reason: null, dataOrigin: 'splp' as const },
    });

    return errorResult;
  }
}

/**
 * Streaming pipeline — onStatus() for progress events, onChunk() for narasi deltas.
 * Returns the final parsed HybridResponse.
 */
export async function processAIQueryStreaming(
  query: string,
  onStatus: (status: string) => void,
  onChunk: (delta: string) => void,
  opts: { role?: string | null } = {},
): Promise<HybridResponse> {
  const cached = getCached(query);
  if (cached) return cached;

  const startedAt = Date.now();
  const steps: Record<string, number> = {};

  try {
    // PR Lapis 1: meta-query portal → deterministik, tanpa LLM
    onStatus('Menganalisis pertanyaan...');
    const meta = await tryMetaQuery(query, startedAt, steps, true);
    if (meta) return meta;

    // PR-4c: defleksi DTSEN (NIK/desil/per-orang) — konvensi jalur deterministik:
    // role DTSEN_LOOKUP/SUPERADMIN yang login → lookup by-NIK langsung (bukan defleksi).
    const deflected = await tryDtsenDeflection(query, startedAt, steps, true, opts.role);
    if (deflected) return deflected;

    // Deteksi sumber Dokumen A/B/C (agregat Excel bebas-PII) — deterministik.
    // Dipakai untuk fusi multi-sumber bila topik sama muncul pula di SAPA/DTSEN.
    const matchedDoc = detectExcelDocQuery(query);

    // Step 1: Deteksi intent & ambil data. Di-wrap agar bila pembangunan konteks
    // SAPA/DTSEN rapuh gagal, pertanyaan bertopik Dokumen tetap terjamah jalur
    // deterministik (doc-only) dan tidak crash ke error generik.
    let ctx: Awaited<ReturnType<typeof buildContext>>;
    try {
      ctx = await buildContext(query);
    } catch (ctxErr) {
      if (matchedDoc) {
        const docResp = buildExcelDocResponse(query, matchedDoc);
        const metadata = buildObservabilityMeta({
          opdFilter: null,
          filterDipakai: '-',
          evidence: [],
          grounding: 'excel-doc',
          totalData: 0,
          filteredCount: 0,
          latencyMs: Date.now() - startedAt,
          stepsMs: steps,
          model: process.env.AI_MODEL,
          finishReason: null,
          dataOrigin: 'direct',
          streamed: true,
        });
        await saveChatSession({ query, intent: 'dokumen', result: docResp, metadata });
        setCache(query, docResp);
        return docResp;
      }
      throw ctxErr;
    }
    steps.context = Date.now() - startedAt;

    // ─── Multi-Source Fusion (Dokumen A/B/C + SAPA/DTSEN) ───
    if (matchedDoc && ctx.evidence.length > 0) {
      try {
        const fused = buildFusedMultiSourceResponse(query, matchedDoc, {
          evidence: ctx.evidence,
          dataSource: ctx.dataSource,
          sapaSummary: summarizeEvidence(ctx.evidence),
        });
        if (fused) {
          const metadata = buildObservabilityMeta({
            opdFilter: ctx.opdFilter ?? null,
            filterDipakai: ctx.filterDipakai,
            evidence: ctx.evidence,
            grounding: 'multi-source-fusion',
            totalData: ctx.allRecords.length,
            filteredCount: ctx.filteredData.length,
            latencyMs: Date.now() - startedAt,
            stepsMs: steps,
            model: process.env.AI_MODEL,
            finishReason: null,
            dataOrigin: ctx.dataOrigin,
            streamed: true,
          });
          await saveChatSession({ query, intent: ctx.intent.kategori, result: fused, metadata });
          setCache(query, fused);
          return fused;
        }
      } catch (fusionErr) {
        console.warn('[Orchestrator] fusion skipped:', fusionErr);
      }
    }

    // Bila query cocok dengan Dokumen (A/B/C) tetapi tidak memenuhi syarat fusi
    // multi-sumber, jawab langsung dari Dokumen secara deterministik. Mengutamakan
    // jalur Dokumen (deterministik, PII-aman) dan mencegah jatuh ke jalur SAPA/LLM
    // streaming yang rapuh untuk pertanyaan bertopik Dokumen.
    if (matchedDoc) {
      const docResp = buildExcelDocResponse(query, matchedDoc);
      const metadata = buildObservabilityMeta({
        opdFilter: ctx.opdFilter ?? null,
        filterDipakai: ctx.filterDipakai,
        evidence: ctx.evidence,
        grounding: 'excel-doc',
        totalData: ctx.allRecords.length,
        filteredCount: ctx.filteredData.length,
        latencyMs: Date.now() - startedAt,
        stepsMs: steps,
        model: process.env.AI_MODEL,
        finishReason: null,
        dataOrigin: ctx.dataOrigin,
        streamed: true,
      });
      await saveChatSession({ query, intent: ctx.intent.kategori, result: docResp, metadata });
      setCache(query, docResp);
      return docResp;
    }

    // PR Lapis 2: tren & perbandingan → deterministik dari data, tanpa LLM.
    // Konvensi sama seperti meta-query: jalur deterministik tidak men-stream
    // narasi via onChunk (onChunk route mengharapkan fragmen JSON LLM);
    // narasi utuh dikirim lewat event 'result' oleh route.
    const deterministic = await tryDeterministicDomainQuery(query, ctx, startedAt, steps, true);
    if (deterministic) return deterministic;

    // SoT: evidence kosong → jangan panggil LLM
    if (ctx.evidence.length === 0) {
      const empty: HybridResponse = {
        narasi: buildNotFoundNarasi(ctx.yearsRequested, ctx.availableYears, ctx.dataSource),
        visualisasi: { tipe: 'none', konfigurasi: {} },
        rekomendasi: [],
        dataSource: ctx.dataSource,
        timestamp: new Date().toISOString(),
      };
      const metadata = buildObservabilityMeta({
        opdFilter: ctx.opdFilter ?? null,
        filterDipakai: ctx.filterDipakai,
        evidence: [],
        grounding: 'pass',
        totalData: ctx.allRecords.length,
        filteredCount: ctx.filteredData.length,
        latencyMs: Date.now() - startedAt,
        stepsMs: steps,
        model: process.env.AI_MODEL,
        finishReason: null,
        dataOrigin: ctx.dataOrigin,
        streamed: true,
      });
      await saveChatSession({ query, intent: ctx.intent.kategori, result: empty, metadata });
      setCache(query, empty);
      return empty;
    }

    // Step 2: Panggil LLM dengan streaming (satu kali)
    onStatus('AI sedang menyusun jawaban...');
    const llmStarted = Date.now();
    const llmRes = await streamLLM(ctx.systemPrompt, { query, data: ctx.dataForLLM, konteks: ctx.konteksRegulasi }, onChunk);
    steps.llm = Date.now() - llmStarted;

    // Step 3: Parse + guard + grounding SoT (dengan statistik resmi yang diizinkan)
    const parsed = sanitizeParsed(parseHybridResponse(llmRes.text, ctx.filteredData, ctx.dataOrigin, ctx.evidence), ctx.evidence, query);
    const { response: grounded, grounding, reason } = groundOutput(parsed, ctx.evidence, query, groundingExtras(ctx));
    let result = grounded;
    if (result.visualisasi.tipe === 'none' && ctx.evidence.length > 0) {
      result = { ...result, visualisasi: buildVizFromEvidence(ctx.evidence) };
    } else if (grounding === 'replaced') {
      result = { ...grounded, visualisasi: buildVizFromEvidence(ctx.evidence) };
    }

    // Hotfix Aug 26: sama dgn jalur non-streaming — format ribuan presentasi.
    result = formatAngkaPresentasi(result);

    // Step 4: Simpan ke DB (non-blocking)
    const metadata = buildObservabilityMeta({
      opdFilter: ctx.opdFilter ?? null,
      filterDipakai: ctx.filterDipakai,
      evidence: ctx.evidence,
      grounding,
      groundingReason: reason ?? null,
      totalData: ctx.allRecords.length,
      filteredCount: ctx.filteredData.length,
      matchedCount: ctx.matchedRecords.length,
      latencyMs: Date.now() - startedAt,
      stepsMs: steps,
      model: llmRes.model,
      finishReason: llmRes.finishReason,
      dataOrigin: ctx.dataOrigin,
      streamed: true,
    });
    await saveChatSession({ query, intent: ctx.intent.kategori, result, metadata });

    setCache(query, result);
    return result;
  } catch (err) {
    console.error('[AI] Streaming fallback triggered:', err);
    const errorResult: HybridResponse = {
      // Hotfix live Vercel Aug 2026: sama dgn jalur non-streaming — tanpa bocoran error mentah.
      narasi: 'Maaf, layanan AI sedang sibuk atau tidak dapat dihubungi. Silakan coba lagi beberapa saat lagi.',
      visualisasi: { tipe: 'none', konfigurasi: {} },
      rekomendasi: [],
      dataSource: 'error',
      timestamp: new Date().toISOString(),
    };

    await saveChatSession({
      query,
      intent: 'error',
      result: errorResult,
      metadata: { error: err instanceof Error ? err.message : 'Unknown', latencyMs: Date.now() - startedAt },
    });

    return errorResult;
  }
}

/** Extract progressive narasi from accumulated LLM stream (for live rendering). */
export { extractNarasiPartial };

function buildSystemPrompt(stats: {
  totalOpd: number;
  totalIndicators: number;
  totalData: number;
  evidenceCount: number;
  dtsenEvidence?: number;
}): string {
  return `Anda adalah SAPA Smart AI Pemerintah Kabupaten Aceh Tengah.
Tugas: Merumuskan data dalam field "evidence" menjadi narasi Bahasa Indonesia yang akurat.

STATISTIK RESMI (BOLEH dikutip apa adanya): total ${stats.totalData} data indikator, ${stats.totalOpd} OPD, ${stats.totalIndicators} jenis indikator, ${stats.evidenceCount} evidence terkait pertanyaan ini. Sumber: sapa.acehtengahkab.go.id / api-splp.layanan.go.id.

ATURAN WAJIB:
1. HANYA gunakan angka, tahun, nama OPD, dan nama indikator yang ada di "evidence" atau STATISTIK RESMI di atas. DILARANG angka lain.
2. Jika "evidence" tidak menjawab pertanyaan secara spesifik: katakan data spesifik itu tidak tersedia, lalu sebut data terkait yang ADA di evidence — tanpa mengarang.
3. Tahun: gunakan nilai "tahun" dari evidence. Jika null/kosong → tulis "tahun tidak tercantum di SAPA".
4. Selalu sebutkan OPD dan satuan dari evidence. Jangan menyebut OPD lain jika tidak ada di evidence.
5. Bahasa Indonesia formal, lugas. Narasi = interpretasi evidence, bukan membaca ulang mentah. Maksimal 3 kalimat. DILARANG menulis literal "..." atau placeholder kosong.
6. "rekomendasi": WAJIB terisi 1-3 kalimat TANPA angka baru — tindakan lanjutan konkret yang berguna bagi pimpinan berdasarkan narasi & evidence (mis. fokus perhatian pada indikator tertentu, verifikasi data tahun terbaru ke OPD terkait, tindak lanjut program yang menyentuh indikator teratas). Kosongkan ([]) HANYA jika benar-benar tidak ada tindak lanjut yang bermakna.
7. "visualisasi" HANYA dari evidence:
   - 1 item → "metric" {metrics:[{label, value, unit}]}
   - 2-8 item SATUAN SERAGAM → "chart" bar {type:"bar", xKey:"indikator", data:[{indikator, nilai}], bars:["nilai"]}
   - >8 item ATAU satuan campur → "table" {columns:["Indikator","Nilai","Satuan","OPD","Tahun"], rows} — jika rows banyak (>12), sertakan minimal 5 baris teratas di narasi ringkasan juga.
   - kosong → "none"
8. Jangan menambah detail di luar evidence (contoh: pecahan PNS/PPPK, jumlah pegawai turunan, dsb).

FORMAT OUTPUT: tepat SATU object JSON valid, tanpa teks lain sebelum/sesudah:
{"narasi":"...","visualisasi":{"tipe":"metric|table|chart|none","konfigurasi":{}},"rekomendasi":["..."]}`;
}

/**
 * Robust JSON extraction — handles markdown code fences (```json ... ```),
 * surrounding prose, and truncated-but-complete objects.
 */
function extractJsonObject(raw: string): any | null {
  // Strip markdown code fences
  let cleaned = raw.replace(/```(?:json)?/gi, '').trim();

  // Fallback: if there's a JSON object anywhere, extract the first balanced {...}
  const start = cleaned.indexOf('{');
  if (start === -1) return null;
  cleaned = cleaned.slice(start);

  // Find matching closing brace (respecting strings)
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(0, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseHybridResponse(raw: string, _records: SapaRecord[], dataOrigin: SapaDataOrigin = 'splp', evidence: { opd?: string }[] = []): HybridResponse {
  // Bersihkan dulu dari markdown fence / reasoning / prose di luar JSON
  const cleanedInput = stripReasoningPrefix(raw);
  const extracted = extractJsonObject(cleanedInput);
  const dynamicDataSource = evidence.length > 0 ? dataSourceFromEvidence(evidence) : dataSourceLabel(dataOrigin);

  // Adaptor: format alternatif SDI {"type":"data_dashboard", title, summary, metrics, table, metadata}
  if (extracted && extracted.type === 'data_dashboard') {
    const narasi = [extracted.title, extracted.summary].filter(Boolean).join(' — ') || 'Ringkasan data SAPA.';
    const metrics = Array.isArray(extracted.metrics) ? extracted.metrics : [];
    const table = extracted.table ?? { headers: [], rows: [] };
    const headers: string[] = Array.isArray(table.headers) ? table.headers : Array.isArray(table.columns) ? table.columns : [];
    const rows: any[][] = Array.isArray(table.rows) ? table.rows : Array.isArray(table.baris) ? table.baris : [];
    // Pilih visualisasi: metrics kecil → metric, rows ada → table, else metric
    let visualisasi: HybridResponse['visualisasi'];
    if (rows.length > 0 && headers.length > 0) {
      visualisasi = { tipe: 'table', konfigurasi: { columns: headers, rows } };
    } else if (metrics.length > 0) {
      visualisasi = { tipe: 'metric', konfigurasi: { metrics: metrics.map((m: any) => ({ label: m.label, value: m.value, unit: m.unit ?? '' })) } };
    } else {
      visualisasi = { tipe: 'none', konfigurasi: {} };
    }
    return {
      narasi,
      visualisasi: normalizeVisualization(visualisasi),
      rekomendasi: [],
      dataSource: dynamicDataSource,
      timestamp: new Date().toISOString(),
    };
  }

  if (extracted && typeof extracted === 'object') {
    const narasi = typeof extracted.narasi === 'string' ? extracted.narasi.trim() : '';
    // Jika narasi kosong TAPI ada field lain, jangan tampilkan JSON mentah
    if (narasi) {
      return {
        narasi,
        visualisasi: normalizeVisualization(extracted.visualisasi),
        rekomendasi: Array.isArray(extracted.rekomendasi) ? extracted.rekomendasi : [],
        dataSource: dynamicDataSource,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Fallback: model tidak mengembalikan JSON valid — viz tetap dari evidence
  const fallbackNarasi = extractReadableNarasi(cleanedInput);
  return {
    narasi: fallbackNarasi,
    visualisasi: { tipe: 'none', konfigurasi: {} },
    rekomendasi: [],
    dataSource: dynamicDataSource,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Ekstrak narasi yang bisa dibaca dari output model yang gagal jadi JSON.
 * - Jika ada field "narasi":"..." (meski JSON corrupt), ambil itu.
 * - Jika murni prose (bukan JSON object), gunakan prose tersebut.
 * - Jika benar-benar JSON mentah tanpa narasi, kembalikan pesan ramah.
 */
function extractReadableNarasi(cleaned: string): string {
  // Coba ekstrak nilai narasi via regex (tangani JSON korup sebagian)
  const m = cleaned.match(/"narasi"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) {
    const s = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    if (s) return s;
  }

  const trimmed = cleaned.trim();
  // Jika output berupa JSON object mentah (diawali { dan bukan prose), jangan tampilkan mentah
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('```')) {
    return 'Maaf, AI gagal memformat respons dengan benar. Silakan ajukan pertanyaan dengan kalimat yang lebih spesifik.';
  }
  // Prosa biasa — gunakan apa adanya (sudah dibersihkan dari reasoning)
  return trimmed || 'Maaf, AI tidak memberikan respons yang dapat ditampilkan. Silakan coba lagi.';
}

// Dihapus Fase C SoT: generateAutoChart & ensureRekomendasi (LLM ke-2) —
// Viz sekarang hanya dari evidence via buildVizFromEvidence; rekomendasi tanpa angka baru.


/**
 * Normalize visualization config to the format the frontend renderer expects:
 * - "metric"  → { metrics: [{label, value, unit}] } (accepts {nilai,satuan,label,detail} from some models)
 * - "table"   → { columns, rows } (accepts {kolom, baris})
 * - "chart"   → { type, xKey, data, lines } (accepts {jenis, sumbuX, data, garis})
 * - "none"    → {}
 */
function normalizeVisualization(vis: any): { tipe: 'chart' | 'table' | 'map' | 'metric' | 'none'; konfigurasi: Record<string, any> } {
  const rawTipe = vis?.tipe ?? 'none';
  const tipe: 'chart' | 'table' | 'map' | 'metric' | 'none' =
    ['chart', 'table', 'map', 'metric', 'none'].includes(rawTipe) ? rawTipe : 'none';
  const cfg = vis?.konfigurasi ?? {};

  if (tipe === 'metric') {
    // Format A (deepseek): { metrics: [{label, value, unit}] }
    if (Array.isArray(cfg.metrics)) {
      return { tipe, konfigurasi: { metrics: cfg.metrics } };
    }
    // Format B (ling): { nilai, satuan, label, detail: [{label, nilai, satuan}] }
    const metrics: any[] = [];
    if (cfg.nilai != null) {
      metrics.push({ label: cfg.label ?? 'Nilai', value: cfg.nilai, unit: cfg.satuan ?? '' });
    }
    if (Array.isArray(cfg.detail)) {
      for (const d of cfg.detail) {
        metrics.push({
          label: d.label ?? 'Nilai',
          value: d.nilai ?? d.value,
          unit: d.satuan ?? d.unit ?? '',
        });
      }
    }
    if (metrics.length > 0) return { tipe, konfigurasi: { metrics } };
    return { tipe, konfigurasi: {} };
  }

  if (tipe === 'table') {
    // Format B: { kolom, baris } → { columns, rows }
    if (Array.isArray(cfg.kolom)) {
      return { tipe, konfigurasi: { columns: cfg.kolom, rows: cfg.baris ?? [] } };
    }
    return { tipe, konfigurasi: { columns: cfg.columns ?? [], rows: cfg.rows ?? [] } };
  }

  if (tipe === 'chart') {
    // Format B: { jenis, sumbuX, data, garis } → { type, xKey, data, lines }
    return {
      tipe,
      konfigurasi: {
        type: cfg.type ?? cfg.jenis ?? 'bar',
        xKey: cfg.xKey ?? cfg.sumbuX ?? 'name',
        data: cfg.data ?? [],
        lines: Array.isArray(cfg.lines) ? cfg.lines : (Array.isArray(cfg.garis) ? cfg.garis : (Array.isArray(cfg.bars) ? cfg.bars : [])),
      },
    };
  }

  return { tipe, konfigurasi: cfg };
}
