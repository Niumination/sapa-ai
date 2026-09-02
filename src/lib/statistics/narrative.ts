// ─── Narasi "Data Bercerita" (WP5) ────────────────────────────────────────────
// Layer narasi deterministik di ATAS fusion (WP4) + compute (WP3.0c).
// Bukan LLM — menghasilkan paragraf pimpinan dari FusedMetric dengan caveat jujur.
// LLM (bila dipakai) hanya merapikan bahasa, tidak menambah angka.

import type { FusedMetric } from './fusion';

export interface NarrativeInput {
  fused: Map<string, FusedMetric>;
  question?: string;
  archetype?: string; // WP7.4 — optional, fallback ke generic
}

export interface NarrativeOutput {
  judul: string;
  ringkasan: string; // 1 paragraf utama
  poin: string[]; // bullet deterministik
  caveats: string[]; // caveat gabungan
  hasDiscrepancy: boolean;
}

/** Format angka Indonesia: 222643 → "222.643" */
function fmt(n: number): string {
  return n.toLocaleString('id-ID');
}

/** Buat narasi untuk penduduk total bila ada, fallback ke ringkasan umum. */
export function buildNarrative(input: NarrativeInput): NarrativeOutput {
  const caveats: string[] = [];
  const poin: string[] = [];
  let hasDiscrepancy = false;
  let judul = 'Ringkasan Data';
  let ringkasan = '';

  // Kumpulkan caveat global
  for (const fm of input.fused.values()) {
    for (const c of fm.caveats) caveats.push(c.message);
    if (fm.discrepancy?.isMaterial) hasDiscrepancy = true;
  }

  // Kasus khusus: penduduk total
  const penduduk = input.fused.get('penduduk.total.count');
  if (penduduk && penduduk.metrics.length > 0) {
    judul = 'Penduduk Aceh Tengah — Rekonsiliasi Antar Sumber';
    const primary = penduduk.primary!;
    const others = penduduk.metrics.filter(m => m.id !== primary.id);
    if (penduduk.metrics.length === 1) {
      ringkasan = `Menurut ${primary.source.label} (${primary.period.label}), jumlah penduduk Aceh Tengah tercatat ${fmt(primary.value)} ${primary.unitCanonical}.`;
      poin.push(`Sumber tunggal: ${primary.source.label} — ${fmt(primary.value)} jiwa (${primary.period.label}).`);
    } else {
      const srcList = penduduk.metrics.map(m => `${m.source.label} ${fmt(m.value)} (${m.period.label})`).join('; ');
      ringkasan = `Terdapat ${penduduk.metrics.length} angka untuk penduduk Aceh Tengah: ${srcList}. Angka acuan yang ditampilkan adalah ${fmt(primary.value)} jiwa dari ${primary.source.label} (${primary.period.label}). Perbedaan antar sumber wajar karena metodologi dan tahun pencacahan berbeda — lihat caveat.`;
      for (const m of penduduk.metrics) poin.push(`${m.source.label} (${m.period.label}): ${fmt(m.value)} ${m.unitCanonical}.`);
      if (penduduk.discrepancy) poin.push(`Selisih ${penduduk.discrepancy.pctDiff.toFixed(1)}% antar sumber — material (ambang 3%).`);
    }
    if (!penduduk.isPlausible) caveats.push('Nilai di luar rentang wajar — periksa kembali sumber.');
  } else if (input.fused.size > 0) {
    // WP7.4 — Template per arketipe (fallback umum tetap ada)
    const archetype = input.archetype ?? 'level';
    const concepts = [...input.fused.values()];
    if (archetype === 'trend') {
      const points = concepts.flatMap(fm => fm.metrics.map(m => ({ period: m.period.label, value: m.value, source: m.source.label })));
      const uniquePeriods = [...new Set(points.map(p => p.period))].sort();
      if (uniquePeriods.length < 2) {
        ringkasan = `Data hanya tersedia untuk ${uniquePeriods.length} titik waktu (${uniquePeriods.join(', ')}). Tren membutuhkan minimal 2 periode.`;
        poin.push('Yang bisa dijawab: sebaran per wilayah/indikator pada periode yang tersedia.');
      } else {
        const first = points.find(p => p.period === uniquePeriods[0]!);
        const last = points.find(p => p.period === uniquePeriods.at(-1)!);
        const change = first && last && first.value !== 0 ? ((last.value - first.value) / first.value) * 100 : 0;
        const arah = change > 2 ? 'naik' : change < -2 ? 'turun' : 'stabil';
        ringkasan = `Tren ${arah} ${change.toFixed(1)}% dari ${uniquePeriods[0]!} ke ${uniquePeriods.at(-1)!} (${last?.source ?? 'SAPA'}).`;
        poin.push(...uniquePeriods.slice(0, 5).map(p => `${p}: ${fmt(points.find(x => x.period === p)?.value ?? 0)}`));
      }
      caveats.push('Interpretasi tren mengasumsikan metodologi konsisten antar periode.');
    } else if (archetype === 'ranking') {
      const ranked = concepts.slice(0, 5).sort((a, b) => (b.primary?.value ?? 0) - (a.primary?.value ?? 0));
      ringkasan = ranked.map((fm, i) => `${i + 1}. ${fm.label}: ${fmt(fm.primary?.value ?? 0)} ${fm.primary?.unitCanonical ?? ''}`).join('; ') + '.';
      poin.push('Urutan berdasarkan nilai terbaru per indikator.');
    } else if (archetype === 'distribution') {
      const rows = concepts.slice(0, 8).map(fm => `${fm.label}: ${fmt(fm.primary?.value ?? 0)} ${fm.primary?.unitCanonical ?? ''}`);
      ringkasan = rows.join('; ') + '.';
      poin.push('Distribusi berdasarkan available geo/indikator.');
    } else if (archetype === 'comparison') {
      const pairs = concepts.slice(0, 4).map(fm => `${fm.label}: ${fmt(fm.primary?.value ?? 0)} ${fm.primary?.unitCanonical ?? ''}`);
      ringkasan = `Perbandingan: ${pairs.join(' vs ')}.`;
      poin.push('Selisih dihitung dari nilai primary masing-masing kelompok.');
    } else if (archetype === 'composition' || archetype === 'correlation' || archetype === 'anomaly') {
      ringkasan = `${concepts.length} indikator terdeteksi relevan. ` + concepts.slice(0, 3).map(fm => `${fm.label}: ${fmt(fm.primary?.value ?? 0)} ${fm.primary?.unitCanonical ?? ''}`).join('; ') + '.';
      poin.push('Analisis lebih lanjut membutuhkan verifikasi OPD terkait.');
    } else {
      // level / default
      ringkasan = concepts.slice(0, 3).map(fm => `${fm.label}: ${fmt(fm.primary?.value ?? 0)} ${fm.primary?.unitCanonical ?? ''} (${fm.primary?.source.label ?? '-'})`).join(' • ') + (concepts.length > 3 ? ` • dan ${concepts.length - 3} indikator lain.` : '.');
      for (const fm of concepts) poin.push(`${fm.label}: ${fmt(fm.primary?.value ?? 0)} (${fm.primary?.source.label ?? '-'})`);
    }
  } else {
    ringkasan = 'Tidak ada data yang memenuhi filter — coba longgarkan periode atau geografi, atau periksa ketersediaan sumber (SAPA/DTSEN/Bapokting/Dokumen).';
  }

  // Deduplicate caveats
  const uniqCaveats = [...new Set(caveats)];

  return { judul, ringkasan, poin, caveats: uniqCaveats, hasDiscrepancy };
}
