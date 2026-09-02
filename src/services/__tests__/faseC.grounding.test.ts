import { describe, it, expect } from 'vitest';
import { groundOutput, isGrounded, buildVizFromEvidence, extractNumbers, normalizeNumber } from '@/services/grounding';
import type { HybridResponse } from '@/types';
import type { EvidenceItem } from '@/services/grounding';

const ev: EvidenceItem[] = [
  { opd: 'BKPSDM', indikator: 'Jumlah ASN', nilai: '9610', satuan: 'orang', tahun: '2024', id: 101 },
  { opd: 'Dinkes', indikator: 'Prevalensi Stunting', nilai: '12.5', satuan: 'persen', tahun: '2023', id: 102 },
];

function mk(narasi: string, rekomendasi: string[] = [], viz: any = { tipe: 'none', konfigurasi: {} }): HybridResponse {
  return { narasi, rekomendasi, visualisasi: viz, dataSource: 'test', timestamp: new Date().toISOString() };
}

describe('Fase C — grounding SoT', () => {
  it('angka halu harus ditolak', () => {
    const p = mk('Terdapat 84 pegawai tumpang tindih');
    expect(isGrounded(p, ev).ok).toBe(false);
  });
  it('angka dari evidence lolos', () => {
    const p = mk('Jumlah ASN 9610 orang (BKPSDM, 2024)');
    expect(isGrounded(p, ev).ok).toBe(true);
  });
  it('format ribuan 9.610 == 9610 lolos', () => {
    const p = mk('Jumlah ASN 9.610 orang');
    expect(isGrounded(p, ev).ok).toBe(true);
  });
  it('tahun halu ditolak', () => {
    const p = mk('Data tahun 2025 menunjukkan...');
    expect(isGrounded(p, ev).ok).toBe(false);
  });
  it('tahun di evidence lolos', () => {
    const p = mk('Prevalensi 12.5 persen tahun 2023');
    expect(isGrounded(p, ev).ok).toBe(true);
  });
  it('evidence kosong + narasi berangka → tidak grounded', () => {
    const p = mk('Jumlah ASN 9610 orang');
    expect(isGrounded(p, []).ok).toBe(false);
  });
  it('evidence kosong + tanpa angka → grounded (boleh bilang tidak tersedia)', () => {
    const p = mk('Data untuk pertanyaan ini tidak ditemukan di SAPA.');
    expect(isGrounded(p, []).ok).toBe(true);
  });
  it('angka di rekomendasi juga di-ground', () => {
    const p = mk('Jumlah ASN 9610 orang', ['Tambah 1000 guru']);
    expect(isGrounded(p, ev).ok).toBe(false);
  });
  it('groundOutput replace → narasi deterministik + viz dari evidence + fallback rekomendasi (hotfix Aug 26: panel tak boleh kosong)', () => {
    const p = mk('Terdapat 84 pegawai', ['Tambah 500 orang'], { tipe: 'chart', konfigurasi: { data: [{ nilai: 84 }] } });
    const { response, grounding } = groundOutput(p, ev, 'berapa asn');
    expect(grounding).toBe('replaced');
    expect(response.narasi).toMatch(/Jumlah ASN/);
    // Kontrak baru: rekomendasi asli yang lolos grounding dipertahankan;
    // jika kosong semua, diisi fallback deterministik tanpa angka baru.
    expect(response.rekomendasi.length).toBeGreaterThan(0);
    // Rekomendasi halusinatif ('Tambah 500 orang') TIDAK dibawa ke hasil.
    expect(response.rekomendasi.join(' ')).not.toMatch(/500/);
  });
  it('groundOutput pass → tidak replace', () => {
    const p = mk('Jumlah ASN 9610 orang (BKPSDM, 2024)');
    const { response, grounding } = groundOutput(p, ev, 'berapa asn');
    expect(grounding).toBe('pass');
    expect(response.narasi).toBe(p.narasi);
  });
  it('buildVizFromEvidence: 1→metric, 2 satuan seragam→chart, satuan campur→table, >8→table (kontrak Lapis 1)', () => {
    expect(buildVizFromEvidence(ev.slice(0, 1)).tipe).toBe('metric');
    const seragam: EvidenceItem[] = [
      { ...ev[0], id: 301, indikator: 'Ind A', satuan: 'orang' },
      { ...ev[0], id: 302, indikator: 'Ind B', satuan: 'orang' },
    ];
    expect(buildVizFromEvidence(seragam).tipe).toBe('chart');
    // PR Lapis 1: fixture ev satuan campur (orang + persen) → tabel, bukan chart menyesatkan
    expect(buildVizFromEvidence(ev).tipe).toBe('table');
    const many: EvidenceItem[] = Array.from({ length: 10 }, (_, i) => ({ ...ev[0], id: 200 + i, indikator: `Ind ${i}` }));
    expect(buildVizFromEvidence(many).tipe).toBe('table');
  });
  it('extractNumbers + normalize', () => {
    expect(extractNumbers('9.610 orang')).toContain('9.610');
    expect(normalizeNumber('9.610')).toBe('9610');
  });
});
