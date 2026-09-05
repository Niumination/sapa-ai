// Uji retry throttle llm-client: 403/429/5xx di-retry 1x, 4xx lain tidak.
// Tanpa jaringan — global.fetch di-stub. Backoff dipercepat via env khusus uji.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('AI_RETRY_BACKOFF_MS', '5');

// eslint-disable-next-line import/first
const { callLlmText } = await import('../llm-client');

const cfgDasar = {
  enabled: false,
  shadow: true,
  provider: 'custom',
  baseUrl: 'http://uji.test',
  endpointPath: '/chat/completions',
  dialect: 'chat-completions',
  apiKey: 'kunci-uji',
  model: 'model-uji',
  timeoutMs: 5000,
  maxOutputTokens: 50,
  temperature: 0,
  jsonMode: false,
  dailyCallLimit: 0,
} as const;

const okJson = (teks: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: teks }, finish_reason: 'stop' }] }), { status: 200 });
const gagal = (status: number, teks = 'galat') => new Response(teks, { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('callLlmText retry throttle', () => {
  it('403 → retry 1x lalu sukses', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(gagal(403, 'error code: 1010')).mockResolvedValueOnce(okJson('halo'));
    vi.stubGlobal('fetch', fetchMock);
    const hasil = await callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }]);
    expect(hasil.text).toBe('halo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('429 → retry 1x lalu sukses', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(gagal(429)).mockResolvedValueOnce(okJson('halo'));
    vi.stubGlobal('fetch', fetchMock);
    const hasil = await callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }]);
    expect(hasil.text).toBe('halo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('401 (kunci salah) → TIDAK retry, langsung lempar', async () => {
    const fetchMock = vi.fn().mockResolvedValue(gagal(401, 'invalid key'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow('HTTP 401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('400 → TIDAK retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(gagal(400, 'bad request'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow('HTTP 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('500 dua kali → lempar setelah 2 upaya', async () => {
    const fetchMock = vi.fn().mockResolvedValue(gagal(500, 'rusak'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow('HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
