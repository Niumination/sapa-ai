// ─── EWS Engine (PR Lapis 2) — murni, deterministik, tanpa IO ───
// Membandingkan dua snapshot warehouse dan menghasilkan keputusan alert.
// Prinsip: EWS boleh memberi sinyal salah-kaprah kadang, tapi tidak boleh diam
// saat data berubah besar — dan tidak boleh membanjiri (ada cap + prioritas).

export interface IndicatorPoint {
  idKodeIndikator: number;
  indikator: string;
  satuan: string;
  opd: string;
  nilaiNumber: number;
  tahun: string | null;
}

export type EwsSeverityLabel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface EwsDecision {
  kind: 'change' | 'new' | 'missing';
  idKodeIndikator: number;
  indikator: string;
  satuan: string;
  opd: string;
  nilaiAktual: number;
  nilaiSebelumnya: number | null;
  perubahanRel: number | null; // fraksi (0.25 = +25%)
  severity: EwsSeverityLabel;
  threshold: number;
  pesan: string;
}

export interface EwsThresholds {
  info: number; // |perubahan relatif| minimal INFO
  warning: number; // minimal WARNING
  critical: number; // minimal CRITICAL
  maxAlerts: number; // cap total per evaluasi (anti-banjiri)
}

export const DEFAULT_EWS_THRESHOLDS: EwsThresholds = {
  info: 0.1, // ±10%
  warning: 0.2, // ±20%
  critical: 0.5, // ±50%
  maxAlerts: 20,
};

/** Perubahan relatif terhadap prev. prev=0 → null (div-0; ditangani terpisah). */
export function relativeChange(prev: number, curr: number): number | null {
  if (!Number.isFinite(prev) || !Number.isFinite(curr)) return null;
  if (prev === 0) return null;
  return (curr - prev) / Math.abs(prev);
}

function severityFor(absRel: number, t: EwsThresholds): EwsSeverityLabel | null {
  if (absRel >= t.critical) return 'CRITICAL';
  if (absRel >= t.warning) return 'WARNING';
  if (absRel >= t.info) return 'INFO';
  return null;
}

const fmtPct = (rel: number) => `${rel >= 0 ? '+' : ''}${(rel * 100).toFixed(1)}%`;

export function evaluateEws(
  prev: IndicatorPoint[],
  curr: IndicatorPoint[],
  thresholds: EwsThresholds = DEFAULT_EWS_THRESHOLDS,
): EwsDecision[] {
  const prevMap = new Map(prev.map((p) => [p.idKodeIndikator, p]));
  const currIds = new Set(curr.map((c) => c.idKodeIndikator));
  const decisions: EwsDecision[] = [];

  for (const c of curr) {
    const p = prevMap.get(c.idKodeIndikator);
    if (!p) {
      decisions.push({
        kind: 'new',
        idKodeIndikator: c.idKodeIndikator,
        indikator: c.indikator,
        satuan: c.satuan,
        opd: c.opd,
        nilaiAktual: c.nilaiNumber,
        nilaiSebelumnya: null,
        perubahanRel: null,
        severity: 'INFO',
        threshold: 0,
        pesan: `Indikator baru tercatat di SAPA: ${c.indikator} (${c.opd}) = ${c.nilaiNumber} ${c.satuan}.`,
      });
      continue;
    }
    const rel = relativeChange(p.nilaiNumber, c.nilaiNumber);
    if (rel === null) continue; // prev 0 / non-finite → lewati (terdokumentasi)
    const sev = severityFor(Math.abs(rel), thresholds);
    if (!sev) continue;
    decisions.push({
      kind: 'change',
      idKodeIndikator: c.idKodeIndikator,
      indikator: c.indikator,
      satuan: c.satuan,
      opd: c.opd,
      nilaiAktual: c.nilaiNumber,
      nilaiSebelumnya: p.nilaiNumber,
      perubahanRel: rel,
      severity: sev,
      threshold: sev === 'CRITICAL' ? thresholds.critical : sev === 'WARNING' ? thresholds.warning : thresholds.info,
      pesan: `${c.indikator} (${c.opd}) berubah ${fmtPct(rel)}: ${p.nilaiNumber} → ${c.nilaiNumber} ${c.satuan}.`,
    });
  }

  for (const p of prev) {
    if (currIds.has(p.idKodeIndikator)) continue;
    decisions.push({
      kind: 'missing',
      idKodeIndikator: p.idKodeIndikator,
      indikator: p.indikator,
      satuan: p.satuan,
      opd: p.opd,
      nilaiAktual: p.nilaiNumber,
      nilaiSebelumnya: p.nilaiNumber,
      perubahanRel: null,
      severity: 'INFO',
      threshold: 0,
      pesan: `Indikator tidak lagi hadir di payload SAPA terbaru: ${p.indikator} (${p.opd}).`,
    });
  }

  // Prioritas anti-banjiri: perubahan besar dulu (CRITICAL→WARNING→INFO),
  // lalu indikator baru, lalu yang hilang.
  const rank = (d: EwsDecision) =>
    d.severity === 'CRITICAL' ? 0 : d.severity === 'WARNING' ? 1 : d.kind === 'new' ? 2 : 3;
  return decisions
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return Math.abs(b.perubahanRel ?? 0) - Math.abs(a.perubahanRel ?? 0);
    })
    .slice(0, thresholds.maxAlerts);
}
