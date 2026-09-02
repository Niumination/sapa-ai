import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fuseMetrics } from '@/lib/statistics/fusion';
import { buildNarrative } from '@/lib/statistics/narrative';

describe('WP6 — golden-queries harness', () => {
  const raw = JSON.parse(readFileSync('data/golden-queries.json', 'utf8'));
  for (const q of raw.queries as any[]) {
    it(`${q.id}: ${q.question.slice(0, 40)}`, () => {
      // Mock same as scripts/eval-harness.ts
      const metrics: any[] = [];
      if (q.expectedConceptId === 'penduduk.total.count') {
        metrics.push(
          { id: 'sapa-1', conceptId: q.expectedConceptId, label: q.expectedConceptId, measure: 'count', value: 222643, valueRaw: '222643', unitCanonical: 'jiwa', unitRaw: 'jiwa', period: { kind: 'year', year: 2023, label: '2023' }, geo: { level: 'kabupaten' }, opd: 'BPS', source: { id: 'sapa', label: 'SAPA BPS 2023' } },
          { id: 'bappeda-1', conceptId: q.expectedConceptId, label: q.expectedConceptId, measure: 'count', value: 234740, valueRaw: '234740', unitCanonical: 'jiwa', unitRaw: 'jiwa', period: { kind: 'year', year: 2025, label: '2025' }, geo: { level: 'kabupaten' }, opd: 'BAPPEDA', source: { id: 'dtsen-bappeda', label: 'DTSEN-BAPPEDA Des 2025' } },
        );
      } else if (q.expectedConceptId) {
        metrics.push({ id: 'x', conceptId: q.expectedConceptId, label: q.expectedConceptId, measure: 'count', value: 1234, valueRaw: '1234', unitCanonical: 'jiwa', unitRaw: 'jiwa', period: { kind: 'year', year: 2024, label: '2024' }, geo: { level: 'kabupaten' }, opd: 'X', source: { id: 'sapa', label: 'SAPA' } });
      }
      const fused = fuseMetrics(metrics);
      const out = buildNarrative({ fused, question: q.question });
      if (q.expectEmpty) expect(out.ringkasan).toContain('Tidak ada data');
      else if (q.expectedConceptId) {
        expect(fused.has(q.expectedConceptId)).toBe(true);
        if (q.expectDiscrepancy) expect(out.hasDiscrepancy).toBe(true);
        if (q.expectDiscrepancy === false) expect(out.hasDiscrepancy).toBe(false);
      }
    });
  }
});
