// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../prompt';
import { extractJsonObject } from '../schema';
import { guardQuery, MAX_QUERY_CHARS } from '../guard';
import { parseNilaiSapa } from '@/lib/format-singkat';
import type { EvidenceItem } from '@/services/grounding';

const evidence: EvidenceItem[] = [
  { opd: 'Dinas Kesehatan', indikator: 'Jumlah Balita Stunting', nilai: '730', satuan: 'Orang', tahun: '2025', id: 1945 },
  { opd: 'Bappeda', indikator: 'Prevalensi Stunting', nilai: '31,4', satuan: 'Persen', tahun: '2025', id: 511 },
];

const statistik = { totalRecord: 2055, totalOpd: 38, evidenceDihitung: 2 };

describe('buildPrompt', () => {
  const { system, user } = buildPrompt({ query: 'Bagaimana stunting di Aceh Tengah?', evidence, statistik });

  it('melarang model menulis angka sendiri', () => {
    expect(system).toMatch(/DILARANG/);
    expect(system).toContain('{{id}}');
  });

  it('tidak mengandung contoh fiktif (anti-pola lama: "84 pegawai")', () => {
    // Tidak ada angka di system prompt selain yang ada di aturan/statistik.
    const angkaSystem = (system.match(/\d+/g) ?? []).map(Number);
    // Hanya angka yang muncul pada aturan baku (2–4 kalimat, maksimal 3 butir).
    for (const n of angkaSystem) expect(n).toBeLessThan(10);
  });

  it('setiap angka di payload pengguna berasal dari evidence/statistik/query', () => {
    const payload = JSON.parse(extractJsonObject(user) ?? '{}');
    const diizinkan = new Set<number>([
      ...evidence.map((e) => parseNilaiSapa(String(e.nilai)) ?? NaN),
      ...evidence.map((e) => Number(e.id)),
      ...evidence.map((e) => Number(e.tahun)),
      statistik.totalRecord,
      statistik.totalOpd,
      statistik.evidenceDihitung,
    ]);
    const angka = (JSON.stringify(payload.evidence).match(/\d+(?:[.,]\d+)?/g) ?? [])
      .map((t) => parseNilaiSapa(t))
      .filter((n): n is number => n != null);
    for (const n of angka) {
      const cocok = [...diizinkan].some((v) => Math.abs(v - n) < 1e-9);
      expect(cocok, `angka ${n} tidak ada di evidence`).toBe(true);
    }
  });

  it('mengirim id evidence agar model bisa memakai token {{id}}', () => {
    expect(user).toContain('"id":511');
    expect(user).toContain('"id":1945');
  });

  it('membatasi evidence yang dikirim (maks 20)', () => {
    const banyak = Array.from({ length: 35 }, (_, i) => ({ ...evidence[0], id: 1000 + i }));
    const { user: u } = buildPrompt({ query: 'uji', evidence: banyak, statistik });
    const payload = JSON.parse(extractJsonObject(u) ?? '{}');
    expect(payload.evidence).toHaveLength(20);
  });
});

describe('guardQuery', () => {
  it('memotong query panjang', () => {
    const out = guardQuery('a'.repeat(900));
    expect(out.ok).toBe(true);
    expect(out.query).toHaveLength(MAX_QUERY_CHARS);
  });

  it('menolak query terlalu pendek', () => {
    expect(guardQuery('ab').ok).toBe(false);
  });

  it('menolak pertanyaan yang mengandung pola NIK 16 digit', () => {
    const out = guardQuery('data NIK 3216012345678901 tolong dicek');
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('NIK');
  });

  it('pertanyaan wajar diteruskan', () => {
    expect(guardQuery('Berapa jumlah ASN 2026?').ok).toBe(true);
  });
});
