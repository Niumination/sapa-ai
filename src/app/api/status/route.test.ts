import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { fetchSapaData } from '@/lib/sapa-client';

vi.mock('@/lib/sapa-client', () => ({
  fetchSapaData: vi.fn(),
  // Perbaikan 2026-09-21: /api/status kini melaporkan opd & indikator (ukuran
  // katalog yang sebenarnya). Mock ini menghitung dari data mock, bukan angka tetap.
  getUniqueOpd: (r: unknown[]) => [...new Set((r as { opds_nama_opd?: string }[]).map((x) => x?.opds_nama_opd))],
  getUniqueIndicators: (r: unknown[]) => [...new Set((r as { kode_indikator_nama_indikator?: string }[]).map((x) => x?.kode_indikator_nama_indikator))],
}));

const mockedFetch = vi.mocked(fetchSapaData);

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ['AI_ENABLED', 'AI_SHADOW', 'AI_PROVIDER', 'AI_MODEL', 'AI_API_KEY', 'AI_BASE_URL']) {
    delete process.env[k];
  }
});

describe('GET /api/status', () => {
  it('SAPA active + AI inactive (default tanpa env model)', async () => {
    // 40 baris dari 38 OPD + 40 indikator unik — angka mock, bukan angka katalog nyata,
    // supaya uji ini tidak ikut membusuk saat katalog bertambah.
    const mock = Array.from({ length: 40 }, (_, i) => ({
      opds_nama_opd: `OPD ${i % 38}`,
      kode_indikator_nama_indikator: `Indikator ${i}`,
    }));
    mockedFetch.mockResolvedValue({ records: mock, origin: 'splp' } as never);
    const res = await GET();
    const body = await res.json();
    expect(body.sapa).toEqual({ state: 'active', records: 40, opd: 38, indikator: 40 });
    expect(body.ai.state).toBe('inactive');
    // Sejak 19 Sep 2026 model punya default per-provider (opencode-go →
    // deepseek-v4.1-flash) supaya menghapus AI_MODEL di Vercel tidak pernah
    // meninggalkan model kosong. Status tetap inactive karena AI_API_KEY absen.
    expect(body.ai.model).toBe('deepseek-v4.1-flash');
    expect(body.ai.reason).toContain('AI_API_KEY');
  });

  it('SAPA down bila SPLP mati, AI tetap dilaporkan', async () => {
    mockedFetch.mockRejectedValue(new Error('SPLP mati'));
    const res = await GET();
    const body = await res.json();
    expect(body.sapa).toEqual({ state: 'down', records: 0, opd: 0 });
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
