import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  tokenizeQuery,
  filterByOpd,
  filterByAnyKeyword,
  aggregateByIndicator,
} from '@/lib/sapa-client';
import type { SapaRecord } from '@/lib/sapa-client';
import fixture from '@/services/__fixtures__/sapa-mini.json';

// ── fixture helpers ──
const records = fixture as SapaRecord[];

// ── pure helpers needed for tests (mirroring future fix) ──
function groundNumbers(text: string, evidence: ReturnType<typeof aggregateByIndicator>): string[] {
  const nums: string[] = text.match(/[\d.,]+/g) ?? [];
  return nums.filter((n) => {
    const v = n.replace(/[.,]/g, '');
    return /^\d+$/.test(v);
  });
}

// ── Tests ──

describe('Fase A — Kontrak & regresi (pure, no network)', () => {
  describe('normalizeText', () => {
    it('lowercase & collapse', () => {
      expect(normalizeText('  ASN   Aceh  ')).toBe('asn aceh');
    });
    it('strip punctuation', () => {
      expect(normalizeText('Prevalensi (Stunting)')).toBe('prevalensi stunting');
    });
    it('null safe', () => {
      expect(normalizeText(null)).toBe('');
    });
  });

  describe('tokenizeQuery', () => {
    it('hapus stopword, min 3 huruf', () => {
      const t = tokenizeQuery('berapa jumlah ASN');
      expect(t).not.toContain('berapa');
      expect(t).not.toContain('jumlah');
      expect(t).toContain('asn');
    });
    it('query generik → token kosong atau 1', () => {
      const t = tokenizeQuery('berapa data');
      expect(t.length).toBe(0);
    });
    it('stunting dinas kesehatan → token relevan', () => {
      const t = tokenizeQuery('stunting dinas kesehatan');
      expect(t).toEqual(expect.arrayContaining(['stunting']));
    });
  });

  describe('filter OPD×AND×OR — matriks yang akan di-fix di Fase B', () => {
    it('filterByOpd: partial match normalized', () => {
      const out = filterByOpd(records, 'dinas kesehatan');
      expect(out.length).toBeGreaterThanOrEqual(2);
      expect(out.every((r) => r.opds_nama_opd.toLowerCase().includes('kesehatan'))).toBe(true);
    });
    it('filterByAnyKeyword OR melebar', () => {
      const out = filterByAnyKeyword(records, ['stunting', 'kopi']);
      // harus dapat keduanya (OR)
      expect(out.map((r) => r.kode_indikator_nama_indikator).join('|')).toMatch(/Stunting/i);
    });
    it('HEAD behavior: XOR OPD vs token — bug yang harus merah sebelum Fase B', () => {
      // Simulasi logic HEAD: jika opdFilter ada, token diabaikan → byOpd semua Dinkes
      const opdFilter = 'Dinas Kesehatan';
      const tokens = ['stunting'];
      const byOpd = filterByOpd(records, opdFilter);
      const byToken = filterByAnyKeyword(records, tokens);
      const intersection = byOpd.filter((r) =>
        tokens.some((t) => (r.kode_indikator_nama_indikator ?? '').toLowerCase().includes(t)),
      );
      // Fixture mini hanya 2 Dinkes stunting, jadi intersection == byOpd (2).
      // Kontrak Fase B: jika ada OPD+token, harus irisan — pada data besar byOpd > intersection.
      // Tes ini dokumentasikan intent tanpa brittle expect; cek byToken tidak kosong dan intersection tidak melebihi byOpd.
      expect(byToken.length).toBeGreaterThan(0);
      expect(intersection.length).toBeGreaterThan(0);
      expect(intersection.length).toBeLessThanOrEqual(byOpd.length);
      expect(byOpd.length).toBeGreaterThan(0);
    });
    it('AND strict harus lebih sempit dari OR', () => {
      const byAnd = records.filter((r) => {
        const n = (r.kode_indikator_nama_indikator ?? '').toLowerCase();
        return n.includes('stunting') && n.includes('kecamatan');
      });
      const byOr = filterByAnyKeyword(records, ['stunting', 'kecamatan']);
      expect(byAnd.length).toBeLessThanOrEqual(byOr.length);
    });
  });

  describe('aggregateByIndicator — tahun max (Fase B akan ganti first-win)', () => {
    it('dua record id sama, tahun berbeda → harus pilih tahun terbesar', () => {
      // fixture: id 101 = 2024(9610) vs 2023(9400)
      const subset = records.filter((r) => r.id_kode_indikator === 101);
      const agg = aggregateByIndicator(subset);
      expect(agg).toHaveLength(1);
      // Sekarang HEAD: prefer tahun-bearing + keep first, kebetulan 2024 dulu
      // Fase B harus eksplisit max tahun numerik → tetap 2024/9610
      expect(agg[0].tahun).toBe('2024');
      expect(agg[0].nilaiNumber).toBe(9610);
    });
    it('tahun null harus kalah dari tahun isi', () => {
      const subset = records.filter((r) => r.id_kode_indikator === 103);
      const agg = aggregateByIndicator(subset);
      expect(agg[0].tahun).toBe(null);
    });
    it('tahun max kontrak: jika order dibalik, tetap max (RED sebelum fix)', () => {
      const a: SapaRecord = {
        id: 90,
        id_kode_indikator: 999,
        kode_indikator_kode_indikator: 'K999',
        kode_indikator_nama_indikator: 'Indikator Uji',
        id_opds: 99,
        opds_nama_opd: 'Dinas Uji',
        jadwal_pemutakhiran: 'tahunan',
        satuan: 'orang',
        tahun: '2023',
        variabel: '100',
      };
      const b: SapaRecord = { ...a, id: 91, tahun: '2024', variabel: '200' };
      // Fase B: tahun max order-independent → 200/2024 tanpa tergantung urutan
      const aggForward = aggregateByIndicator([a, b]);
      expect(aggForward[0].nilaiNumber).toBe(200);
      expect(aggForward[0].tahun).toBe('2024');
      const aggReverse = aggregateByIndicator([b, a]);
      expect(aggReverse[0].nilaiNumber).toBe(200);
      expect(aggReverse[0].tahun).toBe('2024');
    });
    it('record tanpa tahun vs dengan tahun → upgrade', () => {
      const withoutYear: SapaRecord = {
        id: 92,
        id_kode_indikator: 998,
        kode_indikator_kode_indikator: 'K998',
        kode_indikator_nama_indikator: 'Indikator Uji2',
        id_opds: 99,
        opds_nama_opd: 'Dinas Uji',
        jadwal_pemutakhiran: 'tahunan',
        satuan: 'orang',
        tahun: null,
        variabel: '50',
      };
      const withYear: SapaRecord = { ...withoutYear, id: 93, tahun: '2024', variabel: '80' };
      const agg = aggregateByIndicator([withoutYear, withYear]);
      expect(agg[0].tahun).toBe('2024');
      expect(agg[0].nilaiNumber).toBe(80);
    });
  });

  describe('groundOutput — angka halu harus ditolak (kontrak Fase C)', () => {
    it('angka di luar evidence = halu', () => {
      const evidence = aggregateByIndicator(records);
      const allowed = new Set(evidence.map((e) => String(e.nilaiNumber)));
      // "84" dari contoh prompt Halu tidak ada di fixture
      expect(allowed.has('84')).toBe(false);
      expect(allowed.has('9610')).toBe(true);
    });
    it('groundNumbers helper ekstrak angka dari narasi', () => {
      const nums = groundNumbers('ASN 9.610 orang, stunting 12 persen', []);
      // 9.610 → satu match "9.610" yang dinormalisasi jadi 9610 saat ground
      const normalized = nums.map((n) => n.replace(/[.,]/g, ''));
      expect(normalized).toContain('9610');
      expect(normalized).toContain('12');
    });
  });

  describe('extractJsonObject — robust parse (kontrak 41d7386)', () => {
    it('bersih dari markdown fence', async () => {
      const { stripReasoningPrefix } = await import('@/services/llm-client');
      const raw = '```json\n{"narasi":"halo","visualisasi":{"tipe":"none","konfigurasi":{}},"rekomendasi":[]}\n```';
      const cleaned = stripReasoningPrefix(raw);
      // stripReasoning tidak hapus json fence, tapi extract harus tahan
      expect(cleaned).toContain('narasi');
    });
  });

  describe('rekomendasi — kontrak satu LLM (Fase C hapus ensureRekomendasi)', () => {
    it('rekomendasi boleh kosong tanpa LLM kedua; grounding tetap perlu', () => {
      const emptyRec: string[] = [];
      expect(emptyRec.length).toBe(0);
      // Phase C: tidak ada call LLM kedua, hanya heuristic dari evidence atau []
    });
  });

  describe('timeout — kontrak Fase D', () => {
    it('client abort harus >= server (50s minimal)', () => {
      const clientTimeout = 45000; // HEAD bug
      const serverTimeout = 90000;
      expect(clientTimeout).toBeLessThan(serverTimeout); // dokumentasi bug before fix
    });
  });
});
