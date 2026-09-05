// ─── Konfigurasi model AI ───
// Satu pintu pembacaan env. Tidak ada pemetaan model tersembunyi di kode
// (anti-pola lama: 'nemotron-3-ultra-free' diam-diam dipetakan ke model lain).
//
// Catatan provider (verifikasi 2026-09-04):
//  • OpenCode Go — `https://opencode.ai/zen/go/v1`. Tiap model bisa beda dialek:
//    sebagian `/chat/completions`, sebagian `/messages` (Anthropic), sebagian
//    `/responses`. Modul ini hanya mendukung `/chat/completions`; model berdialek
//    lain DITOLAK dengan jelas (jatuh ke deterministik), bukan gagal diam-diam.
//  • Gemini (Google AI Studio) — endpoint OpenAI-compatible resmi:
//    `https://generativelanguage.googleapis.com/v1beta/openai`.
//  • custom — OpenAI-compatible apa pun (Vercel AI Gateway, OpenRouter, lokal).

export type AiProviderId = 'opencode-go' | 'gemini' | 'custom';
export type AiDialect = 'chat-completions' | 'tidak-didukung';

export interface AiConfig {
  /** Aktif penuh: narasi AI dikirim ke pengguna. */
  enabled: boolean;
  /** Mode shadow: model tetap dipanggil & dievaluasi, pengguna tetap menerima jawaban deterministik. */
  shadow: boolean;
  provider: AiProviderId;
  baseUrl: string;
  endpointPath: string;
  dialect: AiDialect;
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  jsonMode: boolean;
  /** Batas panggilan model per hari (pengaman biaya). 0 = tanpa batas. */
  dailyCallLimit: number;
}

/** Model OpenCode Go yang TIDAK memakai /chat/completions (dialek Anthropic/Responses). */
const NON_CHAT_MODELS = /^(minimax-|qwen3\.\d-(max|plus)|grok-|gpt-5\.6-luna|muse-spark)/i;

function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return /^(1|true|yes|ya|on)$/i.test(raw.trim());
}

function envNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

// HANYA base URL & endpoint yang punya bawaan. Model TIDAK pernah dipilihkan
// diam-diam oleh kode (anti-pola lama: model env ditimpa hardcode) — AI_MODEL
// wajib diisi eksplisit, sehingga /api/status selalu jujur tentang yang berjalan.
const PRESETS: Record<Exclude<AiProviderId, 'custom'>, Pick<AiConfig, 'baseUrl' | 'endpointPath'>> = {
  'opencode-go': {
    baseUrl: 'https://opencode.ai/zen/go/v1',
    endpointPath: '/chat/completions',
  },
  gemini: {
    // Endpoint OpenAI-compatible resmi Google.
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    endpointPath: '/chat/completions',
  },
};

export function getAiConfig(): AiConfig {
  const provider = (process.env.AI_PROVIDER?.trim() || 'opencode-go') as AiProviderId;
  const preset = PRESETS[provider as 'opencode-go' | 'gemini'];
  const baseUrl = process.env.AI_BASE_URL?.trim() || preset?.baseUrl || '';
  const model = process.env.AI_MODEL?.trim() || '';
  const endpointPath = process.env.AI_ENDPOINT_PATH?.trim() || preset?.endpointPath || '/chat/completions';

  const knownNonChat = provider === 'opencode-go' && NON_CHAT_MODELS.test(model);

  return {
    enabled: envFlag('AI_ENABLED'),
    shadow: envFlag('AI_SHADOW'),
    provider,
    baseUrl,
    endpointPath,
    dialect: knownNonChat ? 'tidak-didukung' : 'chat-completions',
    apiKey: process.env.AI_API_KEY?.trim() || '',
    model,
    timeoutMs: envNumber('AI_TIMEOUT_MS', 20_000),
    // 1600: model reasoning (mis. glm-5.3) menghabiskan ~800 token hanya
    // untuk berpikir — dengan 800, content kosong + finish length (terukur
    // 2026-09-05: 5/6 gagal parse). Ukur gerbang pakai 4000 via env.
    maxOutputTokens: envNumber('AI_MAX_OUTPUT_TOKENS', 1600),
    temperature: Number(process.env.AI_TEMPERATURE ?? '0.2') || 0.2,
    jsonMode: envFlag('AI_JSON_MODE', true),
    dailyCallLimit: Number(process.env.AI_DAILY_CALL_LIMIT ?? '2000') || 0,
  };
}

/** Konfigurasi lengkap & dialek didukung → model boleh dipanggil (aktif atau shadow). */
export function isAiConfigured(cfg: AiConfig = getAiConfig()): boolean {
  return Boolean(cfg.baseUrl && cfg.apiKey && cfg.model) && cfg.dialect === 'chat-completions';
}

/** Model dipakai untuk menjawab pengguna (bukan sekadar shadow). */
export function isAiEnabled(cfg: AiConfig = getAiConfig()): boolean {
  return cfg.enabled && isAiConfigured(cfg);
}

/** Model dipanggil untuk evaluasi, jawaban ke pengguna tetap deterministik. */
export function isAiShadow(cfg: AiConfig = getAiConfig()): boolean {
  return !cfg.enabled && cfg.shadow && isAiConfigured(cfg);
}

/** Alasan singkat mengapa AI nonaktif — dipakai /api/status dan log. */
export function aiStatusReason(cfg: AiConfig = getAiConfig()): string | null {
  if (cfg.dialect === 'tidak-didukung') {
    return `model "${cfg.model}" tidak memakai endpoint /chat/completions — pilih model lain atau set AI_ENDPOINT_PATH`;
  }
  if (!cfg.baseUrl) return 'AI_BASE_URL belum diisi';
  if (!cfg.apiKey) return 'AI_API_KEY belum diisi';
  if (!cfg.model) return 'AI_MODEL belum diisi';
  if (!cfg.enabled && !cfg.shadow) return 'AI_ENABLED=false dan AI_SHADOW=false (mode deterministik)';
  return null;
}
