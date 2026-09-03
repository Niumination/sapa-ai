import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { fetchSapaData } from '@/lib/sapa-client';

vi.mock('@/lib/sapa-client', () => ({ fetchSapaData: vi.fn() }));

const mockedFetch = vi.mocked(fetchSapaData);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_MODEL;
  delete process.env.AI_PROVIDER;
});

describe('GET /api/status', () => {
  it('SAPA active + AI inactive (default tanpa env model)', async () => {
    mockedFetch.mockResolvedValue({ records: new Array(2048), origin: 'splp' } as never);
    const res = await GET();
    const body = await res.json();
    expect(body.sapa).toEqual({ state: 'active', records: 2048 });
    expect(body.ai).toEqual({ state: 'inactive', provider: null, model: null });
  });

  it('SAPA down bila SPLP mati, AI tetap dilaporkan', async () => {
    mockedFetch.mockRejectedValue(new Error('SPLP mati'));
    const res = await GET();
    const body = await res.json();
    expect(body.sapa).toEqual({ state: 'down', records: 0 });
    expect(body.ai.state).toBe('inactive');
  });

  it('AI active + provider/model tampil bila env diisi', async () => {
    mockedFetch.mockResolvedValue({ records: [], origin: 'splp' } as never);
    process.env.AI_MODEL = 'test-model-1';
    process.env.AI_PROVIDER = 'TestProvider';
    const res = await GET();
    const body = await res.json();
    expect(body.ai).toEqual({ state: 'active', provider: 'TestProvider', model: 'test-model-1' });
  });
});
