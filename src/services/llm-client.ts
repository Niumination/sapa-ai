// ─── Cloud LLM via OpenAI-compatible API ───
// Supports: OpenAI, OpenRouter, Groq, Together, DeepSeek, etc.
// Config via env: AI_API_KEY, AI_BASE_URL, AI_MODEL

interface LLMInput {
  query: string;
  data?: any;
  konteks?: any[];
}

function getConfig() {
  // PR Lapis 1: tidak ada lagi pemetaan tersembunyi antar-model di kode —
  // model yang dipakai PERSIS = AI_MODEL; default hanya bila env kosong.
  // (Sebelumnya 'nemotron-3-ultra-free' diam-diam dipetakan ke 'x-preview-f-free',
  // sehingga konfigurasi tidak bisa dipercaya dari luar.)
  return {
    baseUrl: process.env.AI_BASE_URL ?? 'https://api.openai.com/v1',
    apiKey: process.env.AI_API_KEY ?? '',
    model: process.env.AI_MODEL ?? 'x-preview-f-free',
  };
}

/** Build message list shared by streaming & non-streaming calls. */
function buildMessages(systemPrompt: string, input: LLMInput): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (input.konteks?.length) {
    messages.push({
      role: 'system',
      content: `Konteks Regulasi:\n${JSON.stringify(input.konteks, null, 2)}`,
    });
  }

  if (input.data) {
    // SoT Fase C: compact JSON — jangan pretty-print 15k yang putus tengah objek
    const dataStr = JSON.stringify(input.data);
    const truncated = dataStr.length > 12000 ? dataStr.slice(0, 12000) + '\n...[dipotong]' : dataStr;
    messages.push({
      role: 'system',
      content: `Data Terkini dari SAPA:\n${truncated}`,
    });
  }

  messages.push({ role: 'user', content: input.query });
  return messages;
}

/**
 * Strip reasoning/thinking prefixes from model output.
 * Some reasoning models (DeepSeek, etc.) put chain-of-thought before the answer.
 */
export function stripReasoningPrefix(content: string): string {
  let cleaned = content;

  // Strip <think>...</think> (DeepSeek-style)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // Strip ```thinking ... ``` fenced blocks
  cleaned = cleaned.replace(/```thinking[\s\S]*?```/gi, '').trim();

  // Strip bare "thinking" prose prefixes models sometimes emit
  const prefixes = [
    /^Thinking[\.\s:]+/i,
    /^Let me (?:think|analyze|consider|break)/i,
    /^I need to (?:analyze|consider|look)/i,
    /^\*\*Thinking\*\*[\.\s:]+/i,
    /^Step \d+[\.\s:]+/i,
    /^(?:[\s\S])*?(?=\{\s*"narasi")/, // anything before the JSON object starts
  ];

  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '').trim();
  }

  if (cleaned.startsWith('Thinking\n')) {
    cleaned = cleaned.replace(/^Thinking\n/, '').trim();
  }

  return cleaned || content;
}

/** Extract "narasi" field value from a partial/full JSON string (progressive rendering). */
export function extractNarasiPartial(raw: string): string {
  // Strip leading markdown fences / prose before the JSON object
  const start = raw.indexOf('{');
  if (start === -1) return '';
  const jsonish = raw.slice(start);
  // Match "narasi":"... (handles escaped quotes)
  const match = jsonish.match(/"narasi"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!match) return '';
  // Unescape common sequences
  return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

export type LLMResult = { text: string; finishReason: string | null; model: string };

/**
 * Non-streaming LLM call — temperature 0.1, max_tokens 2500.
 * Hotfix live Vercel Aug 2026: model reasoning (x-preview-f-free) memakai ratusan token
 * untuk reasoning_content sebelum content; max_tokens 800 membuat JSON terpotong
 * (finish_reason=length) sehingga jawaban selalu jatuh ke template fallback.
 * Eksperimen: 2500 → JSON utuh (finish=stop), latensi ~38s < timeout 60s.
 */
export async function callLLM(systemPrompt: string, input: LLMInput): Promise<LLMResult> {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error('AI_API_KEY tidak dikonfigurasi. Set di .env.local');
  }

  const messages = buildMessages(systemPrompt, input);

  const doFetch = async (): Promise<Response> => {
    return fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 2500,
      }),
      signal: AbortSignal.timeout(60000), // 60s — sinkron dengan dashboard 65s + maxDuration 60
    });
  };

  // Hotfix live Vercel Aug 2026: provider (OpenCode Zen) kerap balas 503 intermiten
  // (~1 dari 3 request, gagal cepat 1–3s). Retry lama cuma 1x — tidak cukup.
  // Sekarang: maksimal 3 percobaan dgn backoff eksponensial 500ms → 1500ms
  // untuk status 5xx maupun network/timeout error. Kegagalan cepat, jadi worst case
  // tambahan ~5–10s — masih aman di dalam maxDuration 60s.
  const MAX_ATTEMPTS = 3;
  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await doFetch();
    } catch (err) {
      // Network/timeout error — perlakukan seperti 5xx
      if (attempt === MAX_ATTEMPTS) throw err;
      const delayMs = 500 * Math.pow(3, attempt - 1);
      console.warn(
        `[LLM] callLLM network error (attempt ${attempt}/${MAX_ATTEMPTS}), retry dalam ${delayMs}ms:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (res.ok || res.status < 500) break;
    if (attempt === MAX_ATTEMPTS) break;
    const delayMs = 500 * Math.pow(3, attempt - 1); // 500 → 1500
    console.warn(`[LLM] callLLM ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retry dalam ${delayMs}ms`);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  if (!res) {
    throw new Error('AI API gagal setelah retry (tidak ada respons)');
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`AI API error ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message;

  if (!message) {
    throw new Error('AI returned empty response');
  }

  let content = message.content ?? '';

  // Reasoning model fallback: if content empty but reasoning_content exists
  if (!content && message.reasoning_content) {
    console.warn('[LLM] Model returned reasoning but no content. Reasoning length:', message.reasoning_content.length);
    content = message.reasoning_content;
  }

  if (!content) {
    throw new Error('AI returned completely empty response');
  }

  return { text: stripReasoningPrefix(content), finishReason: choice?.finish_reason ?? null, model: config.model };
}

/**
 * Streaming LLM call — temperature 0.1, max_tokens 2500 (sama dgn callLLM, lihat catatan hotfix di atas).
 * Timeout 60s sinkron dengan dashboard 65s + maxDuration 60.
 */
export async function streamLLM(
  systemPrompt: string,
  input: LLMInput,
  onChunk: (delta: string) => void,
): Promise<LLMResult> {
  const config = getConfig();

  if (!config.apiKey) {
    throw new Error('AI_API_KEY tidak dikonfigurasi. Set di .env.local');
  }

  const messages = buildMessages(systemPrompt, input);
  const body = JSON.stringify({
    model: config.model,
    messages,
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: 2500,
    stream: true,
  });

  const doFetch = async (): Promise<{ res: Response }> => {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal: AbortSignal.timeout(60000), // 60s
    });
    return { res };
  };

  // Hotfix live Vercel Aug 2026: retry 3x backoff eksponensial utk 5xx —
  // hanya sebelum chunk pertama (idempotent-safe). Sama dgn callLLM.
  const MAX_ATTEMPTS = 3;
  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const attemptRes = await doFetch();
      res = attemptRes.res;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      const delayMs = 500 * Math.pow(3, attempt - 1);
      console.warn(
        `[LLM] Stream network error (attempt ${attempt}/${MAX_ATTEMPTS}), retry dalam ${delayMs}ms:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    if (!res.ok && res.status >= 500 && attempt < MAX_ATTEMPTS) {
      const delayMs = 500 * Math.pow(3, attempt - 1); // 500 → 1500
      console.warn(`[LLM] Stream ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retry dalam ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    break;
  }

  if (!res) {
    throw new Error('AI streaming gagal setelah retry (tidak ada respons)');
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`AI API error ${res.status}: ${errBody.slice(0, 300)}`);
  }

  if (!res.body) {
    throw new Error('AI streaming response has no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let fullReasoning = '';
  let lastFinishReason: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;

      try {
        const chunk = JSON.parse(payload);
        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) lastFinishReason = choice.finish_reason;
        const delta = choice?.delta ?? {};
        const text = delta.content ?? '';
        const reasoning = delta.reasoning_content ?? delta.reasoning ?? '';
        if (text) {
          fullContent += text;
          onChunk(text);
        } else if (reasoning) {
          // Reasoning model: accumulate reasoning, don't leak it to the user
          fullReasoning += reasoning;
        }
      } catch {
        // Ignore malformed chunk lines (heartbeats, etc.)
      }
    }
  }

  // If content is empty but reasoning exists, fall back to reasoning (better than nothing)
  const cleaned = stripReasoningPrefix(fullContent);
  if (!cleaned && fullReasoning) {
    console.warn('[LLM] Stream returned reasoning but no content. Reasoning length:', fullReasoning.length);
    return { text: stripReasoningPrefix(fullReasoning), finishReason: lastFinishReason, model: config.model };
  }
  return { text: cleaned, finishReason: lastFinishReason, model: config.model };
}
