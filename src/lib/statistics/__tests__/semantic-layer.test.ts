// ─── Test: WP1 Semantic Layer ─────────────────────────────────────────────────
import { describe, it, expect } from 'vitest';
import { parseNumericId, parseNumericIdOrFallback } from '@/lib/parse-numeric';
import { normalizeUnit, normalizeOpd } from '@/lib/statistics/normalize';
import { normalizeKecamatan } from '@/lib/normalize-kecamatan';
import { resolveConceptId, getConcept } from '@/lib/statistics/indicator-registry';
import { parsePeriod } from '@/lib/statistics/metric';
import { routeQuestion } from '@/services/statistics/question-router';

// ─── WP1.2 — parser angka Indonesia ─────────────────────────────────────────
describe('parseNumericId — semua kasus nyata', () => {
  const KASUS: [string, number | null][] = [
    ['31,4',                   31.4],
    ['2.156,28',               2156.28],
    ['11.503.360.000.000',     11503360000000],
    ['Rp 1.250.000',           1250000],
    ['16.000',                 16000],
    ['16000',                  16000],
    ['4,9',                    4.9],
    ['0',                      0],
    ['1.234,567',              1234.567],
    ['-1.234,5',               -1234.5],
    ['730 Orang',              730],
    ['',                       null],
    ['-',                      null],
    ['N/A',                    null],
    ['belum ada data',         null],
  ];

  it.each(KASUS)('"%s" → %s', (raw, expected) => {
    expect(parseNumericId(raw)).toBe(expected);
  });

  it('fallback ke 0 jika null', () => {
    expect(parseNumericIdOrFallback('N/A', 0)).toBe(0);
    expect(parseNumericIdOrFallback('16.000', 0)).toBe(16000);
  });
});

// ─── WP1.4 — normalizer ──────────────────────────────────────────────────────
describe('normalizeUnit', () => {
  it.each([
    ['Orang', 'jiwa'], ['orang', 'jiwa'], ['jiwa', 'jiwa'],
    ['%', 'persen'], ['Persen', 'persen'],
    ['Rp', 'rupiah'], ['IDR', 'rupiah'],
    ['Ha', 'ha'], ['Hektar', 'ha'],
    ['KM', 'km'],
    ['Ton', 'ton'],
    ['Indeks', 'indeks'],
    ['unit', 'unit'],
    ['buah', 'unit'],
    ['XYZ', 'XYZ'],  // passthrough
  ])('"%s" → "%s"', (raw, expected) => {
    expect(normalizeUnit(raw)).toBe(expected);
  });
  it('null/undefined → ""', () => {
    expect(normalizeUnit(null)).toBe('');
    expect(normalizeUnit(undefined)).toBe('');
  });
});

describe('normalizeKecamatan', () => {
  it.each([
    ['LUT TAWAR',   'Laut Tawar'],
    ['lut tawar',   'Laut Tawar'],
    ['Laut Tawar',  'Laut Tawar'],
    ['BEBESEN',     'Bebesen'],
    ['jagong jeget','Jagong Jeget'],
    ['SILIH NARA',  'Silih Nara'],
    ['bukan ada',   undefined],
  ])('"%s" → %s', (raw, expected) => {
    expect(normalizeKecamatan(raw)).toBe(expected);
  });
});

describe('normalizeOpd', () => {
  it('alias → kanonik', () => {
    expect(normalizeOpd('dinkes')).toBe('Dinas Kesehatan');
    expect(normalizeOpd('BAPPEDA')).toBe('BAPPEDA');
  });
  it('null → ""', () => { expect(normalizeOpd(null)).toBe(''); });
});

// ─── WP1.3 — registri indikator ──────────────────────────────────────────────
describe('resolveConceptId', () => {
  it.each([
    ['jumlah balita stunting',                          'stunting.balita.count'],
    ['Jumlah Anak Balita yang Mengalami Stunting',      'stunting.balita.count'],
    ['prevalensi stunting',                             'stunting.balita.rate'],
    ['jumlah penduduk',                                 'penduduk.total.count'],
    ['IPM',                                             'ipm.index'],
    ['PDRB',                                            'pdrb.total.currency'],
    ['PKH',                                             'bansos.pkh.count'],
    ['penerima bpnt',                                   'bansos.bpnt.count'],
    ['produksi kopi arabika',                           'kopi.arabika.produksi.weight'],
    ['XYZ tidak ada',                                   undefined],
  ])('"%s" → %s', (name, expected) => {
    expect(resolveConceptId(name)).toBe(expected);
  });

  it('getConcept mengembalikan konsep lengkap', () => {
    const c = getConcept('stunting.balita.count');
    expect(c?.canonicalName).toBe('Jumlah Balita Stunting');
    expect(c?.measure).toBe('count');
  });
});

// ─── WP1.5 — parsePeriod ─────────────────────────────────────────────────────
describe('parsePeriod', () => {
  it.each([
    ['2025',  { kind: 'year', year: 2025, label: '2025' }],
    ['2024',  { kind: 'year', year: 2024, label: '2024' }],
    [null,    { kind: 'none', label: 'Tidak diketahui' }],
    [undefined, { kind: 'none', label: 'Tidak diketahui' }],
  ])('%s → %j', (input, expected) => {
    const r = parsePeriod(input);
    expect(r.kind).toBe((expected as { kind: string }).kind);
    expect(r.label).toBe((expected as { label: string }).label);
  });
});

// ─── WP2.1 — question router ──────────────────────────────────────────────────
describe('routeQuestion — arketipe', () => {
  it.each([
    ['tren stunting 5 tahun terakhir',               'trend'],
    ['bandingkan kemiskinan antar kecamatan',        'comparison'],
    ['kecamatan tertinggi stunting',                 'ranking'],
    ['persen desil 1 per kecamatan',                'distribution'],
    ['hubungan kemiskinan dan stunting',             'correlation'],
    ['berapa OPD yang melaporkan data',             'meta'],
    ['data NIK warga Bebesen',                      'personal'],
    ['jumlah penduduk Aceh Tengah 2025',            'level'],
    ['berapa persen keluarga desil 1',              'level'],          // persen tanpa geo breakdown
  ])('"%s" → %s', (query, expected) => {
    const plan = routeQuestion(query);
    expect(plan.archetype).toBe(expected);
  });

  it('measureNeed = rate_percent bila query minta persen', () => {
    const plan = routeQuestion('berapa persen balita stunting 2025');
    expect(plan.measureNeed).toBe('rate_percent');
  });

  it('concepts terdeteksi', () => {
    const plan = routeQuestion('tren jumlah balita stunting');
    expect(plan.concepts).toContain('stunting.balita.count');
  });

  it('trace tidak kosong', () => {
    const plan = routeQuestion('jumlah penduduk');
    expect(plan.trace.length).toBeGreaterThan(0);
  });

  it('confidence 0–1', () => {
    const plan = routeQuestion('hubungan kemiskinan dan stunting');
    expect(plan.confidence).toBeGreaterThan(0);
    expect(plan.confidence).toBeLessThanOrEqual(1);
  });
});
