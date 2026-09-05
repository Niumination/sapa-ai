// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
// ─── Orkestrasi jawaban: deterministik + AI (aktif/shadow) ───
// Semua panggilan model di-mock — tidak ada jaringan, tidak ada biaya.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { composeAnswer } from '../answer-compose';
import type { SapaRecord } from '@/lib/sapa-client';
import { cacheGet, cacheSet, incrementCounter } from '@/lib/store';

vi.mock('@/lib/store', () => ({
  cacheGet: vi.fn(async () => null),
  cacheSet: vi.fn(async () => {}),
  incrementCounter: vi.fn(async () => ({ count: 1, resetAt: Date.now() + 60_000, backend: 'memory' as const })),
  activeBackend: vi.fn(() => 'memory' as const),
}));

const records: SapaRecord[] = [
  {
    id: 1, id_kode_indikator: 511, kode_indikator_kode_indikator: 'X.1',
    kode_indikator_nama_indikator: 'Prevalensi Stunting', id_opds: 1,
    opds_nama_opd: 'Badan Perencanaan Pembangunan Daerah',
    jadwal_pemutakhiran: 'Tahunan', satuan: 'Persen', tahun: '2025', variabel: '31,4',
  },
  {
    id: 2, id_kode_indikator: 21, kode_indikator_kode_indikator: 'X.2',
    kode_indikator_nama_indikator: 'Jumlah ASN', id_opds: 2,
    opds_nama_opd: 'Badan Kepegawaian dan Pengembangan SDM',
    jadwal_pemutakhiran: 'Tahunan', satuan: 'pegawai', tahun: '2026', variabel: '9610',
  },
];

const ENV = ['AI_ENABLED', 'AI_SHADOW', 'AI_PROVIDER', 'AI_MODEL', 'AI_API_KEY', 'AI_BASE_URL'];

function jawabModel(isi: unknown) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: typeof isi === 'string' ? isi : JSON.stringify(isi) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 900, completion_tokens: 120 },
    }),
    text: async () => '',
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cacheGet).mockResolvedValue(null);
  vi.mocked(incrementCounter).mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000, backend: 'memory' });
  for (const k of ENV) delete process.env[k];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV) delete process.env[k];
});

describe('composeAnswer — jalur deterministik & pengaman', () => {
  it('evidence kosong ⇒ model TIDAK dipanggil sama sekali (hemat 100%)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    process.env.AI_ENABLED = 'true';
    process.env.AI_API_KEY = 'k';
    process.env.AI_MODEL = 'glm-5.2';

    const hasil = await composeAnswer({ query: 'qwertyzzz', records, stream: false });
    expect(hasil.evidence).toHaveLength(0);
    expect(hasil.ai.used).toBe(false);
    expect(hasil.ai.limitedBy).toBe('no-evidence');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tanpa env AI ⇒ jawaban deterministik, tanpa menyentuh jaringan', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const hasil = await composeAnswer({ query: 'stunting', records, stream: false });
    expect(hasil.response.narasi).toContain('31,4');
    expect(hasil.ai.used).toBe(false);
    expect(hasil.ai.limitedBy).toBe('unconfigured');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('batas harian tercapai ⇒ jatuh ke deterministik', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(incrementCounter).mockResolvedValue({ count: 999_999, resetAt: Date.now() + 1000, backend: 'memory' });
    process.env.AI_ENABLED = 'true';
    process.env.AI_API_KEY = 'k';
    process.env.AI_MODEL = 'glm-5.2';
    process.env.AI_DAILY_CALL_LIMIT = '10';

    const hasil = await composeAnswer({ query: 'stunting', records, stream: false });
    expect(hasil.ai.used).toBe(false);
    expect(hasil.ai.limitedBy).toBe('daily-limit');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('model gagal ⇒ jawaban tetap ada (deterministik), bukan error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'server error' })) as unknown as typeof fetch,
    );
    process.env.AI_ENABLED = 'true';
    process.env.AI_API_KEY = 'k';
    process.env.AI_MODEL = 'glm-5.2';

    const hasil = await composeAnswer({ query: 'stunting', records, stream: false });
    expect(hasil.ai.used).toBe(false);
    expect(hasil.response.narasi).toContain('31,4');
  });

  it('keluaran model tidak sesuai skema ⇒ tidak pernah ditampilkan mentah', async () => {
    vi.stubGlobal('fetch', jawabModel('saya tidak tahu, maaf'));
    process.env.AI_ENABLED = 'true';
    process.env.AI_API_KEY = 'k';
    process.env.AI_MODEL = 'glm-5.2';

    const hasil = await composeAnswer({ query: 'stunting', records, stream: false });
    expect(hasil.ai.used).toBe(false);
    expect(hasil.ai.reason).toContain('JSON');
    expect(hasil.response.narasi).not.toContain('maaf, saya');
  });
});

describe('composeAnswer — dengan model aktif', () => {
  const aktifkan = () => {
    process.env.AI_ENABLED = 'true';
    process.env.AI_API_KEY = 'kunci-uji';
    process.env.AI_MODEL = 'glm-5.2';
    process.env.AI_PROVIDER = 'opencode-go';
  };

  it('token {{id}} diganti nilai evidence — angka berasal dari SAPA', async () => {
    vi.stubGlobal(
      'fetch',
      jawabModel({
        narasi: 'Prevalensi stunting tercatat {{511}} pada {{511|t}}.',
        rekomendasi: ['Koordinasikan dengan OPD pengampu.'],
        followUps: ['Bagaimana tren stunting?'],
        visualHint: 'metric',
        confidence: 'tinggi',
      }),
    );
    aktifkan();

    const hasil = await composeAnswer({ query: 'stunting', records, stream: false });
    expect(hasil.ai.used).toBe(true);
    expect(hasil.ai.grounded).toBe('pass');
    expect(hasil.response.narasi).toContain('31,4 Persen');
    expect(hasil.response.narasi).toContain('(2025)');
    expect(hasil.response.narasi).not.toContain('{{');
    expect(hasil.response.rekomendasi).toHaveLength(1);
  });

  it('angka karangan model DITOLAK oleh grounding dan diganti template', async () => {
    vi.stubGlobal(
      'fetch',
      jawabModel({ narasi: 'Prevalensi stunting mencapai 12,7 persen pada 2019.' }),
    );
    aktifkan();

    const hasil = await composeAnswer({ query: 'stunting', records, stream: false });
    expect(hasil.ai.grounded).toBe('replaced');
    expect(hasil.response.narasi).not.toContain('12,7');
    expect(hasil.response.narasi).not.toContain('2019');
    expect(hasil.response.narasi).toContain('31,4');
  });

  it('token yang tidak dikenal dicatat (indikasi model mengarang referensi)', async () => {
    vi.stubGlobal('fetch', jawabModel({ narasi: 'Nilai {{777}} tercatat.' }));
    aktifkan();

    const hasil = await composeAnswer({ query: 'stunting', records, stream: false });
    expect(hasil.ai.unknownTokens).toBe(1);
    expect(hasil.response.narasi).not.toContain('777');
  });

  it('hasil disimpan ke cache untuk query yang sama', async () => {
    vi.stubGlobal('fetch', jawabModel({ narasi: 'Prevalensi stunting {{511}}.' }));
    aktifkan();

    await composeAnswer({ query: 'stunting', records, stream: false });
    expect(cacheSet).toHaveBeenCalledTimes(1);
  });
});

describe('composeAnswer — mode shadow (Fase 1)', () => {
  it('model dipanggil & dievaluasi, tetapi pengguna tetap menerima jawaban deterministik', async () => {
    const fetchMock = jawabModel({ narasi: 'Prevalensi stunting tercatat {{511}}.' });
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.AI_SHADOW = 'true';
    process.env.AI_API_KEY = 'kunci-uji';
    process.env.AI_MODEL = 'glm-5.2';

    const hasil = await composeAnswer({ query: 'stunting', records, stream: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hasil.ai.used).toBe(true);
    expect(hasil.ai.shadow).toBe(true);
    // Narasi yang dikirim ke pengguna = versi deterministik.
    expect(hasil.response.narasi).toContain('Berdasarkan data SAPA');
    expect(log).toHaveBeenCalled();
    const baris = log.mock.calls.find((c) => String(c[0]).includes('[ai-shadow]'));
    expect(baris).toBeTruthy();
    log.mockRestore();
  });
});

// ─── T-21: pagar data pribadi di jalur DETERMINISTIK (AI nonaktif) ───
// Celah yang ditemukan saat kurasi eval: NIK diteruskan ke retrieval, dipakai
// sebagai kata kunci, lalu dikembalikan ke layar lewat echo pertanyaan.
describe('composeAnswer — pagar data pribadi (AI nonaktif)', () => {
  beforeEach(() => {
    for (const k of ENV) delete process.env[k];
    vi.resetModules();
  });

  it('NIK 16 digit ditolak walau AI nonaktif — tidak ada retrieval, tidak ada echo', async () => {
    const { composeAnswer } = await import('../answer-compose');
    const hasil = await composeAnswer({ query: 'Cari data NIK 1234567890123456', records });
    expect(hasil.evidence).toHaveLength(0);
    expect(hasil.matched).toBe(0);
    expect(hasil.ai.limitedBy).toBe('guard');
    expect(hasil.response.narasi).toMatch(/tidak dilayani/);
    expect(hasil.response.narasi).toMatch(/NIK/);
    // NIK tidak boleh muncul kembali dalam bentuk apa pun
    expect(hasil.response.narasi).not.toMatch(/1234567890123456/);
    expect(hasil.response.narasi.replace(/[.,\s]/g, '')).not.toMatch(/\d{16}/);
    // sumber & rekomendasi tetap terisi (jawaban utuh, bukan error)
    expect(hasil.response.dataSource).toBeTruthy();
    expect(hasil.response.rekomendasi.length).toBeGreaterThan(0);
  });

  it('pertanyaan agregat tidak terblokir oleh pagar', async () => {
    const { composeAnswer } = await import('../answer-compose');
    const hasil = await composeAnswer({ query: 'Prevalensi Stunting', records });
    expect(hasil.ai.limitedBy).not.toBe('guard');
    expect(hasil.evidence.length).toBeGreaterThan(0);
  });
});
