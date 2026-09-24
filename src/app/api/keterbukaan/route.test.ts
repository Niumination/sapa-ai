import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from './route';
import { __clearLocalStore } from '@/lib/store';

/**
 * CMP-02 — endpoint keterbukaan.
 *
 * Yang dijaga: endpoint ini WAJIB mengikuti keadaan nyata (env + saklar), bukan
 * mengembalikan teks tetap. Bila AI dimatikan di env, jawabannya harus "mati" —
 * dan sebaliknya. Kalau uji ini lewat dengan teks tetap, keterbukaannya bohong.
 */

beforeEach(() => {
  __clearLocalStore();
  vi.unstubAllEnvs();
});

describe('GET /api/keterbukaan (CMP-02)', () => {
  it('AI tidak aktif ⇒ melaporkan mati beserta sebabnya + unsur keterbukaan lengkap', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    vi.stubEnv('AI_API_KEY', '');
    const json = await (await GET()).json();

    expect(json.status).toBe('ok');
    expect(json.keadaanAi).toBe('mati');
    expect(json.kalimatKeadaan).toContain('TIDAK aktif');
    expect(json.bagian.length).toBeGreaterThanOrEqual(7);
    expect(json.pemetaanNotis.digunakan).toBe('ai');
    expect(json.kanal.laporAngka).toBe('/api/umpan-balik');
    expect(json.tinjauanBerikutnya > json.ditinjauPada).toBe(true);
  });

  it('AI dikonfigurasi penuh ⇒ melaporkan aktif dengan penyedia & model yang benar', async () => {
    vi.stubEnv('AI_ENABLED', 'true');
    vi.stubEnv('AI_PROVIDER', 'custom');
    vi.stubEnv('AI_BASE_URL', 'http://127.0.0.1:8787/v1');
    vi.stubEnv('AI_API_KEY', 'kunci-uji');
    vi.stubEnv('AI_MODEL', 'model-uji');
    const json = await (await GET()).json();

    expect(json.keadaanAi).toBe('aktif');
    expect(json.penyedia).toBe('custom');
    expect(json.model).toBe('model-uji');
    expect(json.hosPenyedia).toBe('127.0.0.1:8787');
    expect(json.kalimatKeadaan).toContain('layanan AI aktif');
    // Kunci API tidak boleh pernah ikut terkirim.
    expect(JSON.stringify(json)).not.toContain('kunci-uji');
  });

  // Catatan semantik (dibaca dari `isAiShadow()`): mode bayangan = `AI_ENABLED=false`
  // + `AI_SHADOW=true`. Kombinasi `AI_ENABLED=true` + `AI_SHADOW=true` adalah
  // "aktif" — dan itu memang yang terjadi pada layanan, jadi keterbukaan harus
  // mengikuti, bukan mengikuti nama variabelnya.
  it('mode bayangan (AI_ENABLED=false + AI_SHADOW=true) ⇒ dilaporkan bayangan, bukan aktif', async () => {
    vi.stubEnv('AI_ENABLED', 'false');
    vi.stubEnv('AI_SHADOW', 'true');
    vi.stubEnv('AI_PROVIDER', 'custom');
    vi.stubEnv('AI_BASE_URL', 'http://127.0.0.1:8787/v1');
    vi.stubEnv('AI_API_KEY', 'kunci-uji');
    vi.stubEnv('AI_MODEL', 'model-uji');
    const json = await (await GET()).json();

    expect(json.keadaanAi).toBe('bayangan');
    expect(json.kalimatKeadaan).toContain('mode bayangan');
  });
});
