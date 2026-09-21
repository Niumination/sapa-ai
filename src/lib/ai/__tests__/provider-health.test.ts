// Uji circuit breaker penyedia model.
// Kasus yang dijaga: (1) 403 langganan mati TIDAK diulang & membuka sirkuit,
// (2) 403 throttle (error code 1010) tetap diulang seperti sebelumnya,
// (3) sirkuit terbuka → panggilan berikutnya gagal seketika (fail fast),
// (4) satu keberhasilan menutup sirkuit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('AI_CIRCUIT_FAIL_THRESHOLD', '3');
vi.stubEnv('AI_CIRCUIT_AUTH_THRESHOLD', '2');
vi.stubEnv('AI_CIRCUIT_COOLDOWN_MS', '50');
vi.stubEnv('AI_CIRCUIT_AUTH_COOLDOWN_MS', '100');

// eslint-disable-next-line import/first
const { klasifikasiStatus, klasifikasiGalat, tandaThrottle, bolehPanggilPenyedia, catatGagal, catatSukses, resetKesehatan, ringkasKesehatan } =
  await import('../provider-health');
// eslint-disable-next-line import/first
const { callLlmText } = await import('../llm-client');
// eslint-disable-next-line import/first
const { __clearLocalStore } = await import('@/lib/store');

const cfgDasar = {
  enabled: true,
  shadow: false,
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

const PESAN_LANGGANAN =
  '{"error":{"type":"server_error","message":"Upstream request failed: An active OpenCode Go subscription is required to use Go models."}}';

beforeEach(async () => {
  __clearLocalStore();
  await resetKesehatan();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('klasifikasi galat penyedia', () => {
  it('403 langganan mati = auth, bukan throttle', () => {
    expect(klasifikasiStatus(403, PESAN_LANGGANAN)).toBe('auth');
    expect(klasifikasiStatus(401, 'invalid key')).toBe('auth');
    expect(klasifikasiStatus(402, 'quota')).toBe('auth');
  });

  it('403 throttle (1010) tetap throttle', () => {
    expect(tandaThrottle('error code: 1010')).toBe(true);
    expect(klasifikasiStatus(403, 'error code: 1010')).toBe('throttle');
    expect(klasifikasiStatus(429, 'too many requests')).toBe('throttle');
    expect(klasifikasiStatus(503, 'overloaded')).toBe('server');
    expect(klasifikasiStatus(400, 'bad request')).toBe('konfigurasi');
  });

  it('timeout dan mandek dibedakan dari galat jaringan', () => {
    expect(klasifikasiGalat(new Error('timeout setelah 5000 ms'))).toBe('timeout');
    expect(klasifikasiGalat(new Error('stall: tidak ada data dalam 15000 ms'))).toBe('stall');
    expect(klasifikasiGalat(new Error('fetch failed'))).toBe('jaringan');
  });
});

describe('sirkuit penyedia', () => {
  it('satu kegagalan auth belum membuka sirkuit; dua membukanya', async () => {
    expect((await bolehPanggilPenyedia()).ok).toBe(true);
    await catatGagal('auth', PESAN_LANGGANAN);
    expect((await bolehPanggilPenyedia()).ok).toBe(true);
    const k = await catatGagal('auth', PESAN_LANGGANAN);
    expect(k.state).toBe('terbuka');
    const izin = await bolehPanggilPenyedia();
    expect(izin.ok).toBe(false);
    expect(izin.alasan).toContain('sirkuit terbuka');
  });

  it('cooldown lewat → satu percobaan setengah terbuka diizinkan', async () => {
    await catatGagal('auth', PESAN_LANGGANAN);
    await catatGagal('auth', PESAN_LANGGANAN);
    await new Promise((r) => setTimeout(r, 120));
    const izin = await bolehPanggilPenyedia();
    expect(izin.ok).toBe(true);
    expect(izin.setengahTerbuka).toBe(true);
  });

  it('keberhasilan menutup sirkuit', async () => {
    await catatGagal('server', 'rusak');
    await catatGagal('server', 'rusak');
    await catatGagal('server', 'rusak');
    expect((await bolehPanggilPenyedia()).ok).toBe(false);
    const k = await catatSukses();
    expect(k.state).toBe('sehat');
    expect((await bolehPanggilPenyedia()).ok).toBe(true);
  });

  it('ringkasan kesehatan jujur (reachable) dan tanpa kredensial', async () => {
    await catatGagal('auth', PESAN_LANGGANAN);
    await catatGagal('auth', PESAN_LANGGANAN);
    const ringkas = ringkasKesehatan(await catatGagal('auth', PESAN_LANGGANAN));
    expect(ringkas.reachable).toBe(false);
    expect(ringkas.sebab).toBe('auth');
    expect(ringkas.sisaDetik).toBeGreaterThan(0);
    expect(JSON.stringify(ringkas)).not.toMatch(/sk-|key/i);
  });
});

describe('llm-client menghormati sirkuit', () => {
  it('403 langganan mati: TIDAK di-retry (1 panggilan) lalu sirkuit terbuka', async () => {
    const fetchMock = vi.fn().mockResolvedValue(gagal(403, PESAN_LANGGANAN));
    vi.stubGlobal('fetch', fetchMock);

    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow('HTTP 403');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Sirkuit kini terbuka: panggilan berikutnya gagal cepat TANPA menyentuh jaringan.
    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow(/circuit-open/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('493 bukan penyebab sirkuit: 400 konfigurasi tetap 1 panggilan', async () => {
    const fetchMock = vi.fn().mockResolvedValue(gagal(400, 'bad request'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow('HTTP 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await bolehPanggilPenyedia()).ok).toBe(true);
  });

  it('pulih setelah langganan kembali: sirkuit menutup dan jawaban mengalir', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(gagal(403, PESAN_LANGGANAN))
      .mockResolvedValueOnce(gagal(403, PESAN_LANGGANAN))
      .mockResolvedValue(okJson('halo'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow();
    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow();
    await expect(callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }])).rejects.toThrow(/circuit-open/);
    await new Promise((r) => setTimeout(r, 120)); // cooldown auth lewat
    const hasil = await callLlmText({ ...cfgDasar }, [{ role: 'user', content: 'hai' }]);
    expect(hasil.text).toBe('halo');
    expect((await bolehPanggilPenyedia()).ok).toBe(true);
  });
});

describe('sirkuit penyedia — kegagalan jaringan & timeout ikut dihitung (reviu 2026-09-22)', () => {
  it('dua kegagalan jaringan belum membuka sirkuit; tiga membukanya', async () => {
    await catatSukses();
    await catatGagal('jaringan', 'fetch failed');
    await catatGagal('jaringan', 'fetch failed');
    expect((await bolehPanggilPenyedia()).ok).toBe(true);
    await catatGagal('jaringan', 'fetch failed');
    const izin = await bolehPanggilPenyedia();
    expect(izin.ok).toBe(false);
    expect(izin.alasan).toContain('jaringan');
  });

  it('kegagalan timeout berturut juga membuka sirkuit', async () => {
    await catatSukses();
    for (let i = 0; i < 3; i++) await catatGagal('timeout', 'timeout setelah 48000 ms');
    const ringkas = ringkasKesehatan(await catatGagal('timeout', 'timeout setelah 48000 ms'));
    expect(ringkas.state).toBe('terbuka');
    expect(ringkas.reachable).toBe(false);
    expect(ringkas.sebab).toBe('timeout');
  });

  it('galat konfigurasi (400) tetap TIDAK membuka sirkuit', async () => {
    await catatSukses();
    for (let i = 0; i < 5; i++) await catatGagal('konfigurasi', 'HTTP 400: bad request');
    expect((await bolehPanggilPenyedia()).ok).toBe(true);
  });
});
