import { describe, it, expect } from 'vitest';
import { dataSourceLabel } from '@/lib/sapa-client';
import { buildObservabilityMeta } from '@/services/ai-orchestrator';
import type { EvidenceItem } from '@/services/grounding';

const ev: EvidenceItem[] = [
  { opd: 'BKPSDM', indikator: 'Jumlah ASN', nilai: '9610', satuan: 'orang', tahun: '2024', id: 101 },
  { opd: 'Dinkes', indikator: 'Stunting', nilai: '12.5', satuan: 'persen', tahun: '2023', id: 102 },
];

describe('Fase E — observabilitas SoT', () => {
  it('dataSourceLabel direct vs splp', () => {
    expect(dataSourceLabel('direct')).toBe('SAPA Aceh Tengah (sapa.acehtengahkab.go.id)');
    expect(dataSourceLabel('splp')).toBe('SAPA Aceh Tengah (api-splp.layanan.go.id)');
  });

  it('buildObservabilityMeta: field lengkap pass/direct', () => {
    const m = buildObservabilityMeta({
      opdFilter: 'BKPSDM',
      filterDipakai: 'opd+AND',
      evidence: ev,
      grounding: 'pass',
      groundingReason: null,
      totalData: 150,
      filteredCount: 12,
      matchedCount: 12,
      latencyMs: 1200,
      stepsMs: { context: 300, llm: 800 },
      model: 'x-preview-f-free',
      finishReason: 'stop',
      dataOrigin: 'direct',
      streamed: true,
    });
    expect(m.dataOrigin).toBe('direct');
    expect(m.dataSource).toBe('SAPA Aceh Tengah (sapa.acehtengahkab.go.id)');
    expect(m.finish_reason).toBe('stop');
    expect(m.model).toBe('x-preview-f-free');
    expect(m.evidenceCount).toBe(2);
    expect(m.evidenceIds).toEqual([101, 102]);
    expect(m.grounding).toBe('pass');
    expect(m.filterDipakai).toBe('opd+AND');
    expect(m.streamed).toBe(true);
    expect(m.latencyMs).toBe(1200);
  });

  it('buildObservabilityMeta: splp + replaced + length', () => {
    const many: EvidenceItem[] = Array.from({ length: 35 }, (_, i) => ({ ...ev[0], id: 200 + i, indikator: `Ind ${i}` }));
    const m = buildObservabilityMeta({
      filterDipakai: 'none',
      evidence: many,
      grounding: 'replaced',
      groundingReason: 'angka halu',
      totalData: 200,
      filteredCount: 35,
      latencyMs: 50,
      stepsMs: {},
      model: null,
      finishReason: null,
      dataOrigin: 'splp',
      streamed: false,
    });
    expect(m.dataOrigin).toBe('splp');
    expect(m.finish_reason).toBeNull();
    expect(m.grounding).toBe('replaced');
    expect(m.evidenceIds.length).toBe(30); // cap 30
    expect(m.evidenceCount).toBe(35);
  });

  it('buildObservabilityMeta: evidence kosong (tidak ditemukan)', () => {
    const m = buildObservabilityMeta({
      filterDipakai: 'none',
      evidence: [],
      grounding: 'pass',
      totalData: 100,
      filteredCount: 0,
      latencyMs: 10,
      stepsMs: { context: 10 },
      model: 'x-preview-f-free',
      finishReason: null,
      dataOrigin: 'splp',
      streamed: true,
    });
    expect(m.evidenceCount).toBe(0);
    expect(m.evidenceIds).toEqual([]);
    expect(m.dataOrigin).toBe('splp');
  });
});
