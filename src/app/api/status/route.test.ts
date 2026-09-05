import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { fetchSapaData } from '@/lib/sapa-client';

vi.mock('@/lib/sapa-client', () => ({ fetchSapaData: vi.fn() }));

const mockedFetch = vi.mocked(fetchSapaData);

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ['AI_ENABLED', 'AI_SHADOW', 'AI_PROVIDER', 'AI_MODEL', 'AI_API_KEY', 'AI_BASE_URL']) {
    delete process.env[k];
  }
});

describe('GET /api/status', () => {
  it('SAPA active + AI inactive (default tanpa env model)', async () => {
    mockedFetch.mockResolvedValue({ records: new Array(2055), origin: 'splp' } as never);
    const res = await GET();
    const body = await res.json();
    expect(body.sapa).toEqual({ state: 'active', records: 2055 });
    expect(body.ai.state).toBe('inactive');
    expect(body.ai.model).toBeNull();
    expect(body.ai.reason).toContain('AI_API_KEY');
  });

  it('SAPA down bila SPLP mati, AI tetap dilaporkan', async () => {
    mockedFetch.mockRejectedValue(new Error('SPLP mati'));
    const res = await GET();
    const body = await res.json();
    expect(body.sapa).toEqual({ state: 'down', records: 0 });
    expect(body.ai.state).toBe('inactive');
  });

  it('AI inactive walau model terisi — selama API key belum ada', async () => {
    mockedFetch.mockResolvedValue({ records: [], origin: 'splp' } as never);
    process.env.AI_MODEL = 'test-model-1';
    process.env.AI_PROVIDER = 'TestProvider';
    const res = await GET();
    const body = await res.json();
    expect(body.ai.state).toBe('inactive');
    expect(body.ai.provider).toBe('TestProvider');
    expect(body.ai.model).toBe('test-model-1');
    // Provider tak dikenal ⇒ base URL kosong ⇒ alasan harus menyebut apa yang kurang.
    expect(body.ai.reason).toBeTruthy();
  });

  it('AI active hanya bila AI_ENABLED=1 + key + model', async () => {
    mockedFetch.mockResolvedValue({ records: [], origin: 'splp' } as never);
    process.env.AI_ENABLED = 'true';
    process.env.AI_API_KEY = 'kunci-uji';
    process.env.AI_MODEL = 'glm-5.2';
    const res = await GET();
    const body = await res.json();
    expect(body.ai.state).toBe('active');
    expect(body.ai.model).toBe('glm-5.2');
    expect(body.ai.reason).toBeNull();
  });

  it('AI shadow bila AI_SHADOW=1 tanpa AI_ENABLED', async () => {
    mockedFetch.mockResolvedValue({ records: [], origin: 'splp' } as never);
    process.env.AI_SHADOW = 'true';
    process.env.AI_API_KEY = 'kunci-uji';
    process.env.AI_MODEL = 'glm-5.2';
    const res = await GET();
    const body = await res.json();
    expect(body.ai.state).toBe('shadow');
  });

  it('model berdialek Anthropic ditolak dengan alasan jelas (bukan gagal diam-diam)', async () => {
    mockedFetch.mockResolvedValue({ records: [], origin: 'splp' } as never);
    process.env.AI_ENABLED = 'true';
    process.env.AI_API_KEY = 'kunci-uji';
    process.env.AI_MODEL = 'minimax-m3';
    const res = await GET();
    const body = await res.json();
    expect(body.ai.state).toBe('inactive');
    expect(body.ai.reason).toContain('/chat/completions');
  });
});
