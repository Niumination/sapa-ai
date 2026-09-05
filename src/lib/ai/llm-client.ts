// ─── Klien LLM — OpenAI-compatible /chat/completions (+ SSE) ───
// Satu dialek untuk semua provider (OpenCode Go, Gemini via endpoint
// OpenAI-compatible, atau gateway apa pun). Pola diwarisi dari llm-client.ts lama
// (strip thinking, retry 5xx, AbortSignal) dengan anggaran yang jauh lebih ketat:
// timeout 20 s dan max_tokens 800 — cukup untuk narasi ber-token, bukan esai.

import type { AiConfig } from './env';

export interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface LlmResult {
  text: string;
  finishReason?: string;
  usage?: LlmUsage;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

function gabungSignal(eksternal?: AbortSignal, timeoutMs = 20_000): { signal: AbortSignal; selesai: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const onAbort = () => controller.abort(eksternal?.reason);
  if (eksternal) {
    if (eksternal.aborted) onAbort();
    else eksternal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    selesai: () => {
      clearTimeout(timer);
      if (eksternal) eksternal.removeEventListener('abort', onAbort);
    },
  };
}

function url(cfg: AiConfig): string {
  return `${cfg.baseUrl.replace(/\/+$/, '')}${cfg.endpointPath.startsWith('/') ? cfg.endpointPath : `/${cfg.endpointPath}`}`;
}

function headers(cfg: AiConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
}

function body(cfg: AiConfig, messages: LlmMessage[], stream: boolean, jsonMode: boolean) {
  return {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.maxOutputTokens,
    stream,
    ...(jsonMode && !stream ? { response_format: { type: 'json_object' } } : {}),
  };
}

async function kirim(cfg: AiConfig, messages: LlmMessage[], stream: boolean, signal: AbortSignal, jsonMode: boolean) {
  let res = await fetch(url(cfg), {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify(body(cfg, messages, stream, jsonMode)),
    signal,
  });

  // Sebagian provider menolak response_format — coba sekali tanpa itu.
  if (!res.ok && res.status === 400 && jsonMode) {
    res = await fetch(url(cfg), {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify(body(cfg, messages, stream, false)),
      signal,
    });
  }
  return res;
}

/** Panggil model sekali (tanpa streaming). 1 retry untuk 429/5xx/gangguan jaringan. */
export async function callLlmText(
  cfg: AiConfig,
  messages: LlmMessage[],
  signal?: AbortSignal,
): Promise<LlmResult> {
  if (cfg.dialect !== 'chat-completions') {
    throw new LlmError(`dialek "${cfg.dialect}" tidak didukung`);
  }

  let terakhirError: unknown;
  for (let percobaan = 1; percobaan <= 2; percobaan++) {
    const { signal: sig, selesai } = gabungSignal(signal, cfg.timeoutMs);
    try {
      const res = await kirim(cfg, messages, false, sig, cfg.jsonMode);
      if (!res.ok) {
        const teks = await res.text().catch(() => '');
        // 4xx selain 429 = salah konfigurasi/permintaan — jangan retry.
        if (res.status < 500 && res.status !== 429) {
          throw new LlmError(`HTTP ${res.status}: ${teks.slice(0, 200)}`, res.status);
        }
        throw new LlmError(`HTTP ${res.status}: ${teks.slice(0, 200)}`, res.status);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: json.choices?.[0]?.message?.content ?? '',
        finishReason: json.choices?.[0]?.finish_reason,
        usage: {
          promptTokens: json.usage?.prompt_tokens,
          completionTokens: json.usage?.completion_tokens,
        },
      };
    } catch (e) {
      terakhirError = e;
      if (percobaan < 2) await new Promise((r) => setTimeout(r, 300));
    } finally {
      selesai();
    }
  }
  throw terakhirError instanceof Error ? terakhirError : new LlmError('panggilan model gagal');
}

/** Streaming SSE. Menghasilkan potongan teks mentah (belum di-eject token). */
export async function* streamLlm(
  cfg: AiConfig,
  messages: LlmMessage[],
  signal?: AbortSignal,
): AsyncGenerator<{ delta: string; finishReason?: string }> {
  if (cfg.dialect !== 'chat-completions') {
    throw new LlmError(`dialek "${cfg.dialect}" tidak didukung`);
  }

  const { signal: sig, selesai } = gabungSignal(signal, cfg.timeoutMs);
  try {
    const res = await kirim(cfg, messages, true, sig, false);
    if (!res.ok || !res.body) {
      const teks = await res.text().catch(() => '');
      throw new LlmError(`HTTP ${res.status}: ${teks.slice(0, 200)}`, res.status);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const baris = buffer.split('\n');
      buffer = baris.pop() ?? '';
      for (const b of baris) {
        const trimmed = b.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; finish_reason?: string }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield { delta, finishReason: json.choices?.[0]?.finish_reason };
        } catch {
          // baris parsial/keep-alive — lewati
        }
      }
    }
  } finally {
    selesai();
  }
}

/**
 * Ambil sebagian isi field "narasi" dari potongan JSON yang belum lengkap —
 * untuk pratinjau langsung (live narasi) tanpa menampilkan JSON mentah.
 */
export function extractNarasiPartial(buffer: string): string {
  const idx = buffer.indexOf('"narasi"');
  if (idx < 0) return '';
  const mulai = buffer.indexOf('"', idx + 8);
  if (mulai < 0) return '';
  let out = '';
  for (let i = mulai + 1; i < buffer.length; i++) {
    const ch = buffer[i];
    if (ch === '\\') {
      const next = buffer[i + 1];
      if (next === 'n') out += '\n';
      else if (next === '"') out += '"';
      else if (next !== undefined) out += next;
      i++;
      continue;
    }
    if (ch === '"') break;
    out += ch;
  }
  return out;
}
