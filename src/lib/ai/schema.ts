// ─── Kontrak keluaran model (Zod) ───
// Keluaran model TIDAK pernah dipakai mentah: di-parse di sini, lalu diground
// terhadap evidence. Gagal parse = gagal satu kali, jatuh ke jawaban deterministik.

import { z } from 'zod';

export const LLMAnswerSchema = z.object({
  /** Narasi eksekutif. Angka wajib ditulis sebagai token {{id}}, bukan digit. */
  narasi: z.string().trim().min(1).max(1200),
  rekomendasi: z.array(z.string().max(300)).max(3).default([]),
  followUps: z.array(z.string().max(120)).max(3).default([]),
  visualHint: z.enum(['metric', 'table', 'chart', 'none']).default('none'),
  confidence: z.enum(['tinggi', 'sedang', 'rendah']).default('sedang'),
});

export type LLMAnswer = z.infer<typeof LLMAnswerSchema>;

/** Ambil objek JSON pertama yang seimbang dari teks (tahan "thinking prefix"). */
export function extractJsonObject(raw: string): string | null {
  const text = raw.trim();
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
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
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export type ParseResult =
  | { ok: true; data: LLMAnswer; repaired: boolean }
  | { ok: false; error: string };

export function parseLlmAnswer(raw: string): ParseResult {
  const kandidat = extractJsonObject(raw);
  if (!kandidat) return { ok: false, error: 'keluaran model tidak mengandung objek JSON' };

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(kandidat);
  } catch {
    return { ok: false, error: 'JSON tidak valid' };
  }

  const hasil = LLMAnswerSchema.safeParse(parsedJson);
  if (hasil.success) return { ok: true, data: hasil.data, repaired: false };

  // Perbaikan terbatas: narasi kadang dikirim sebagai bukan-string (angka/objek).
  const kasar = parsedJson as Record<string, unknown>;
  const perbaikan = LLMAnswerSchema.safeParse({
    ...kasar,
    narasi: typeof kasar?.narasi === 'string' ? kasar.narasi : '',
    rekomendasi: Array.isArray(kasar?.rekomendasi) ? kasar.rekomendasi.filter((r) => typeof r === 'string') : [],
    followUps: Array.isArray(kasar?.followUps) ? kasar.followUps.filter((r) => typeof r === 'string') : [],
  });
  if (perbaikan.success && perbaikan.data.narasi.trim()) {
    return { ok: true, data: perbaikan.data, repaired: true };
  }
  return { ok: false, error: 'keluaran model tidak sesuai skema' };
}
