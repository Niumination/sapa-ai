import { describe, it, expect } from 'vitest';
import { parseLlmAnswer, extractJsonObject, LLMAnswerSchema } from '../schema';

describe('extractJsonObject', () => {
  it('mengambil objek JSON walau ada awalan "thinking"', () => {
    const raw = 'Baik, saya akan menjawab.\n{"narasi":"Prevalensi stunting {{511}}.","rekomendasi":[]}';
    expect(extractJsonObject(raw)).toBe('{"narasi":"Prevalensi stunting {{511}}.","rekomendasi":[]}');
  });

  it('tahan terhadap string yang mengandung kurung kurawal', () => {
    const raw = '{"narasi":"Nilai {{{511}}} ada di sini.","rekomendasi":[]}';
    const out = extractJsonObject(raw);
    expect(out).toBe('{"narasi":"Nilai {{{511}}} ada di sini.","rekomendasi":[]}');
  });

  it('null bila tidak ada objek', () => {
    expect(extractJsonObject('maaf, saya tidak tahu')).toBeNull();
  });
});

describe('parseLlmAnswer', () => {
  it('menerima keluaran sesuai skema', () => {
    const hasil = parseLlmAnswer(
      JSON.stringify({
        narasi: 'Prevalensi stunting tercatat {{511}} pada {{511|t}}.',
        rekomendasi: ['Koordinasikan dengan Dinas Kesehatan.'],
        followUps: ['Bagaimana tren stunting?'],
        visualHint: 'metric',
        confidence: 'tinggi',
      }),
    );
    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      expect(hasil.data.narasi).toContain('{{511}}');
      expect(hasil.data.rekomendasi).toHaveLength(1);
    }
  });

  it('mengisi bawaan untuk field opsional', () => {
    const hasil = parseLlmAnswer('{"narasi":"Data tercatat {{511}}."}');
    expect(hasil.ok).toBe(true);
    if (hasil.ok) {
      expect(hasil.data.rekomendasi).toEqual([]);
      expect(hasil.data.visualHint).toBe('none');
      expect(hasil.data.confidence).toBe('sedang');
    }
  });

  it('menolak narasi kosong', () => {
    expect(parseLlmAnswer('{"narasi":"   "}').ok).toBe(false);
  });

  it('menolak JSON rusak', () => {
    expect(parseLlmAnswer('{"narasi":"tanpa penutup"').ok).toBe(false);
  });

  it('menolak teks tanpa JSON', () => {
    expect(parseLlmAnswer('maaf, saya tidak bisa').ok).toBe(false);
  });

  it('skema membatasi panjang & jumlah butir', () => {
    const panjang = LLMAnswerSchema.safeParse({ narasi: 'x'.repeat(1300) });
    expect(panjang.success).toBe(false);
    const banyak = LLMAnswerSchema.safeParse({
      narasi: 'isi',
      rekomendasi: ['1', '2', '3', '4'],
    });
    expect(banyak.success).toBe(false);
  });
});
