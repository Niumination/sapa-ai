// Uji penjaga jalur streaming: sambungan mandek (tidak ada data sama sekali)
// harus diputus cepat lalu dicoba ulang, BUKAN menunggu timeout penuh.
// Tanpa jaringan — global.fetch di-stub dengan ReadableStream yang menghormati
// AbortSignal seperti fetch sungguhan (abort → pembacaan body gagal dengan reason).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('AI_FIRST_TOKEN_MS', '60'); // watchdog cepat untuk uji
vi.stubEnv('AI_RETRY_BACKOFF_MS', '5');

// eslint-disable-next-line import/first
const { streamLlm } = await import('../llm-client');

interface OpsiFetch {
  signal?: AbortSignal;
}

const cfgDasar = {
  enabled: true,
  shadow: false,
  provider: 'custom',
  baseUrl: 'http://uji.test',
  endpointPath: '/chat/completions',
  dialect: 'chat-completions',
  apiKey: 'x',
  model: 'model-uji',
  timeoutMs: 30_000,
  maxOutputTokens: 50,
  temperature: 0,
  jsonMode: false,
  dailyCallLimit: 0,
} as const;

const potonganSse = (teks: string) =>
  new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: teks } }] })}\n\n`);

/** Sambungan yang tidak pernah mengirim data — meniru mandek. */
function responsMandek({ signal }: OpsiFetch): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener('abort', () => controller.error(signal.reason ?? new Error('aborted')));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Kirim delta pertama, lalu diam selamanya (mandek di tengah jalan). */
function responsSetengahJalan(teks: string, { signal }: OpsiFetch): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(potonganSse(teks));
      signal?.addEventListener('abort', () => controller.error(signal.reason ?? new Error('aborted')));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Stream sehat: satu delta lalu ditutup. */
function responsSehat(teks: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(potonganSse(teks));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

async function kumpulkan(gen: AsyncGenerator<{ delta: string }>): Promise<string> {
  let out = '';
  for await (const c of gen) out += c.delta;
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('streamLlm — sambungan mandek', () => {
  it('mandek pada percobaan 1 → dicoba ulang, berhasil tanpa menggandakan teks', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_u: string, o: OpsiFetch) => responsMandek(o))
      .mockImplementationOnce(async () => responsSehat('halo'));
    vi.stubGlobal('fetch', fetchMock);

    const teks = await kumpulkan(streamLlm({ ...cfgDasar }, [{ role: 'user', content: 'hai' }]));
    expect(teks).toBe('halo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mandek dua kali → lempar cepat, tidak menggantung sampai timeout penuh', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_u: string, o: OpsiFetch) => responsMandek(o));
    vi.stubGlobal('fetch', fetchMock);

    const mulai = Date.now();
    await expect(kumpulkan(streamLlm({ ...cfgDasar }, [{ role: 'user', content: 'hai' }]))).rejects.toThrow(/stall/);
    // timeoutMs 30 dtk; watchdog 60 ms → dua percobaan harus selesai jauh lebih cepat.
    expect(Date.now() - mulai).toBeLessThan(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mandek SETELAH ada data → TIDAK dicoba ulang (cegah teks ganda)', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (_u: string, o: OpsiFetch) => responsSetengahJalan('awal', o));
    vi.stubGlobal('fetch', fetchMock);

    const keluar: string[] = [];
    await expect(
      (async () => {
        for await (const c of streamLlm({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])) keluar.push(c.delta);
      })(),
    ).rejects.toThrow(/stall/);

    expect(keluar).toEqual(['awal']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('403 tetap dicoba ulang (throttle gateway)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('throttled', { status: 403 }))
      .mockResolvedValueOnce(responsSehat('ok'));
    vi.stubGlobal('fetch', fetchMock);

    const teks = await kumpulkan(streamLlm({ ...cfgDasar }, [{ role: 'user', content: 'hai' }]));
    expect(teks).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stream sehat pada percobaan pertama → sekali panggil saja', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => responsSehat('langsung'));
    vi.stubGlobal('fetch', fetchMock);

    const teks = await kumpulkan(streamLlm({ ...cfgDasar }, [{ role: 'user', content: 'hai' }]));
    expect(teks).toBe('langsung');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
