// Uji telemetri per tahap (NFR-07).
//
// Yang dijaga di sini bukan "kodenya jalan", melainkan sifat-sifat yang membuat
// telemetri ini layak dipercaya sebagai alat diagnosa:
//   (1) satu permintaan = SATU baris log (tidak ada baris ganda karena konteks
//       bersarang — kalau ganda, p95 akan terhitung dua kali per permintaan);
//   (2) jumlah durasi tahap tidak pernah melebihi total (kalau melebihi, ada
//       pengukuran yang dihitung dua kali dan p95 tiap tahap jadi menyesatkan);
//   (3) konteks tidak bocor antar-permintaan paralel (AsyncLocalStorage);
//   (4) di luar konteks, seluruh fungsi pencatat DIAM (llm-client memanggilnya
//       tanpa tahu apakah ada konteks — itu harus aman);
//   (5) `SAPA_TELEMETRI=off` benar-benar tidak menulis apa pun;
//   (6) persentil dihitung dengan metode nearest-rank dan bisa dihitung ulang
//       dari sampel mentah (itulah dasar §6g: angka yang dilaporkan harus sama
//       dengan angka yang dihitung ulang dari data yang sama);
//   (7) medan `gen_ai.*` mengikuti semconv (finish_reasons berupa ARRAY, token
//       MASUK/KELUAR, provider.name) — bukan nama lama yang sudah usang.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  TAHAP_URUT,
  adaKonteks,
  bacaAgregat,
  catatHasil,
  catatModel,
  catatTahap,
  denganTelemetri,
  hitungPersentil,
  jendelaTelemetri,
  nolkanAgregat,
  rekapSetiap,
  ringkasTahap,
  ringkasTelemetri,
  telemetriAktif,
  tungguAgregatSelesai,
  tulisRekapSekarang,
  ukurTahap,
  ukurTahapAsync,
} = await import('../telemetri');
const { cacheSet, __clearLocalStore } = await import('@/lib/store');

/** Kumpulkan baris log selama `fn` dijalankan. */
async function tangkapLog(fn: () => Promise<void>): Promise<string[]> {
  const baris: string[] = [];
  const tiruan = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    baris.push(args.map(String).join(' '));
  });
  try {
    await fn();
  } finally {
    tiruan.mockRestore();
  }
  return baris;
}

function ambilJson(baris: string[], awalan: string): Record<string, unknown>[] {
  return baris
    .filter((b) => b.startsWith(awalan))
    .map((b) => JSON.parse(b.slice(awalan.length)) as Record<string, unknown>);
}

beforeEach(() => {
  __clearLocalStore();
  vi.unstubAllEnvs();
  vi.stubEnv('SAPA_TELEMETRI_REKAP_N', '0'); // jangan ganggu uji dengan baris rekap
});
afterEach(() => {
  vi.unstubAllEnvs();
  __clearLocalStore();
  vi.restoreAllMocks();
});

describe('telemetri · persentil', () => {
  it('nearest-rank: p50/p95 tidak menebak, dan tahan masukan tak terurut', () => {
    const s = [40, 10, 30, 20];
    expect(hitungPersentil(s, 50)).toBe(20);
    expect(hitungPersentil(s, 95)).toBe(40);
    expect(hitungPersentil(s, 100)).toBe(40);
    expect(hitungPersentil([7], 95)).toBe(7);
    expect(hitungPersentil([], 95)).toBe(0);
  });

  it('ringkasTahap: n, maks, rata, dan kejadian terpisah dari jendela', () => {
    const r = ringkasTahap([10, 20, 30], 99);
    expect(r).toMatchObject({ n: 3, p50: 20, p95: 30, maks: 30, kejadian: 99 });
    expect(r.rata).toBe(20);
  });
});

describe('telemetri · konteks per permintaan', () => {
  it('satu permintaan = satu baris log, dengan seluruh tahap yang dicatat', async () => {
    const baris = await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'uji' }, async () => {
        catatTahap('retrieval', 12, { jumlah_record: 1210 });
        catatTahap('prompt', 3);
        catatModel(240, { sukses: true, model: 'mock-pintar', penyedia: 'custom', tokenMasuk: 900, tokenKeluar: 120, finishReason: 'stop' });
        catatTahap('grounding', 5, { lolos: true });
        catatTahap('gerbang', 2, { nilai_tambah: 'dipakai' });
        catatHasil({ mode: 'ai', jumlah_bukti: 15 });
      });
    });

    const gen = ambilJson(baris, '[gen_ai] ');
    expect(gen).toHaveLength(1);
    const isi = gen[0];
    const tahap = isi.tahap as Record<string, { ms: number }>;
    expect(Object.keys(tahap).sort()).toEqual(['gerbang', 'grounding', 'model', 'prompt', 'retrieval']);
    expect(tahap.model.ms).toBe(240);
    expect((isi.hasil as Record<string, unknown>).mode).toBe('ai');
    // Jumlah durasi tahap = penjumlahan tahap yang tercatat. (Bahwa jumlah itu
    // ≤ total waktu nyata diperiksa di uji UJUNG-KE-UJUNG §6g — di sini durasinya
    // angka buatan, sementara totalnya waktu jam sungguhan.)
    const jumlahMs = Object.values(tahap).reduce((n, t) => n + t.ms, 0);
    expect(isi.jumlah_tahap_ms as number).toBe(jumlahMs);
  });

  it('konteks bersarang tidak menghasilkan baris kedua (yang menumpang diam)', async () => {
    const baris = await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'luar' }, async () => {
        catatTahap('retrieval', 5);
        await denganTelemetri({ jalan: 'dalam' }, async () => {
          catatTahap('prompt', 2);
        });
      });
    });
    const gen = ambilJson(baris, '[gen_ai] ');
    expect(gen).toHaveLength(1);
    expect(gen[0].jalan).toBe('luar');
    // Tahap yang dicatat konteks dalam tetap masuk ke baris milik konteks luar.
    expect(Object.keys(gen[0].tahap as Record<string, unknown>).sort()).toEqual(['prompt', 'retrieval']);
  });

  it('dua permintaan paralel tidak saling mencampur tahap', async () => {
    let potong: (() => void) | null = null;
    const tunggu = new Promise<void>((r) => (potong = r));

    const jalankan = (nama: string, ms: number) =>
      denganTelemetri({ jalan: nama }, async () => {
        catatTahap('retrieval', ms);
        if (nama === 'A') await tunggu; // A berhenti dulu; B jalan sampai selesai
        catatModel(ms, { sukses: true, model: nama, penyedia: 'uji' });
        catatHasil({ mode: nama });
      });

    const baris = await tangkapLog(async () => {
      const a = jalankan('A', 100);
      await jalankan('B', 7);
      potong?.();
      await a;
    });

    const gen = ambilJson(baris, '[gen_ai] ');
    expect(gen).toHaveLength(2);
    const A = gen.find((g) => g.jalan === 'A')!;
    const B = gen.find((g) => g.jalan === 'B')!;
    expect((A.tahap as Record<string, { ms: number }>).retrieval.ms).toBe(100);
    expect((B.tahap as Record<string, { ms: number }>).retrieval.ms).toBe(7);
    expect((A.hasil as Record<string, unknown>).mode).toBe('A');
    expect((B.hasil as Record<string, unknown>).mode).toBe('B');
  });

  it('tahap yang dipanggil berkali-kali dijumlahkan (pemeriksa pasangan berjalan dua kali)', async () => {
    const baris = await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'uji' }, async () => {
        catatTahap('gerbang', 3);
        catatTahap('gerbang', 4, { keluaran_diperiksa: 2 });
      });
    });
    const tahap = ambilJson(baris, '[gen_ai] ')[0].tahap as Record<string, { ms: number; dipanggil: number }>;
    expect(tahap.gerbang.ms).toBe(7);
    expect(tahap.gerbang.dipanggil).toBe(2);
  });

  it('permintaan yang gagal tetap meninggalkan baris log (justru itu yang paling dicari)', async () => {
    const baris = await tangkapLog(async () => {
      await expect(
        denganTelemetri({ jalan: 'uji' }, async () => {
          catatTahap('retrieval', 9);
          catatModel(30, { sukses: false, model: 'mock', penyedia: 'custom', galat: 'auth: HTTP 401' });
          throw new Error('gagal');
        }),
      ).rejects.toThrow('gagal');
    });
    const gen = ambilJson(baris, '[gen_ai] ');
    expect(gen).toHaveLength(1);
    const model = (gen[0].tahap as Record<string, { sukses: boolean }>).model;
    expect(model.sukses).toBe(false);
  });

  it('ukurTahap/ukurTahapAsync mencatat durasi dan menandai kegagalan', async () => {
    const baris = await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'uji' }, async () => {
        const nilai = ukurTahap('retrieval', () => 21 * 2, () => ({ jumlah_record: 5 }));
        expect(nilai).toBe(42);
        // `ukurTahap` sinkron: lemparan harus tetap tercatat sebagai kegagalan
        // tahap, lalu diteruskan ke pemanggil (bukan ditelan).
        expect(() =>
          ukurTahap('prompt', () => {
            throw new Error('boom');
          }),
        ).toThrow('boom');
        await ukurTahapAsync('grounding', async () => 'ok');
      });
    });
    const tahap = ambilJson(baris, '[gen_ai] ')[0].tahap as Record<string, Record<string, unknown>>;
    expect(tahap.retrieval.jumlah_record).toBe(5);
    expect(tahap.prompt.galat).toBe(true);
    expect(tahap.grounding.dipanggil).toBe(1);
  });

  it('di luar konteks semua pencatat DIAM (aman dipanggil dari mana saja)', async () => {
    expect(adaKonteks()).toBe(false);
    const baris = await tangkapLog(async () => {
      catatTahap('retrieval', 5);
      catatModel(10, { sukses: true });
      catatHasil({ mode: 'x' });
    });
    expect(baris).toHaveLength(0);
  });

  it('SAPA_TELEMETRI=off → tidak ada baris log sama sekali', async () => {
    vi.stubEnv('SAPA_TELEMETRI', 'off');
    expect(telemetriAktif()).toBe(false);
    const baris = await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'uji' }, async () => {
        catatTahap('retrieval', 5);
      });
    });
    expect(baris).toHaveLength(0);
  });
});

describe('telemetri · medan semconv gen_ai.*', () => {
  it('memakai nama yang berlaku sekarang (provider.name, input/output_tokens, finish_reasons array)', async () => {
    const baris = await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'uji' }, async () => {
        catatModel(120, { sukses: true, model: 'mock-pintar', penyedia: 'custom', tokenMasuk: 800, tokenKeluar: 90, finishReason: 'stop' });
        catatHasil({ mode: 'ai' });
      });
    });
    const gen = ambilJson(baris, '[gen_ai] ')[0].gen_ai as Record<string, unknown>;
    expect(gen['gen_ai.operation.name']).toBe('chat');
    expect(gen['gen_ai.provider.name']).toBe('custom');
    expect(gen['gen_ai.request.model']).toBe('mock-pintar');
    expect(gen['gen_ai.usage.input_tokens']).toBe(800);
    expect(gen['gen_ai.usage.output_tokens']).toBe(90);
    expect(gen['gen_ai.response.finish_reasons']).toEqual(['stop']);
    // Nama lama TIDAK dipakai — supaya dasbor tidak pernah membaca medan usang.
    expect(gen['gen_ai.system']).toBeUndefined();
    expect(gen['gen_ai.usage.prompt_tokens']).toBeUndefined();
    expect(gen['sapa.jalan']).toBe('uji');
    expect(gen['sapa.mode']).toBe('ai');
  });

  it('panggilan model gagal → error.type terisi, finish_reasons kosong (bukan diisi asal)', async () => {
    const baris = await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'uji' }, async () => {
        catatModel(60, { sukses: false, model: 'mock', penyedia: 'custom', galat: 'timeout: penyedia tidak menjawab' });
      });
    });
    const gen = ambilJson(baris, '[gen_ai] ')[0].gen_ai as Record<string, unknown>;
    expect(String(gen['error.type'])).toContain('timeout');
    expect(gen['gen_ai.response.finish_reasons']).toEqual([]);
    expect(gen['gen_ai.usage.input_tokens']).toBeUndefined();
  });
});

describe('telemetri · agregat bergulir', () => {
  it('menyimpan sampel per tahap dan menghitung persentil dari jendela', async () => {
    await tangkapLog(async () => {
      for (const ms of [10, 20, 30, 40]) {
        await denganTelemetri({ jalan: 'uji' }, async () => {
          catatTahap('retrieval', ms);
          catatModel(100, { sukses: true, model: 'm', penyedia: 'uji' });
          catatHasil({ mode: 'ai' });
        });
      }
    });
    await tungguAgregatSelesai();
    const ringkas = await ringkasTelemetri();
    expect(ringkas.jumlah.permintaan).toBe(4);
    expect(ringkas.jumlah.modelDipanggil).toBe(4);
    // 4 sampel: p50 = elemen ke-2 (20), p95 = elemen ke-4 (40) — nearest-rank.
    expect(ringkas.tahap.retrieval).toMatchObject({ n: 4, p50: 20, p95: 40, maks: 40 });
  });

  it('jendela membatasi jumlah sampel yang ditahan (yang lama dibuang)', async () => {
    vi.stubEnv('SAPA_TELEMETRI_JENDELA', '3');
    expect(jendelaTelemetri()).toBe(3);
    await tangkapLog(async () => {
      for (const ms of [10, 20, 30, 40, 50]) {
        await denganTelemetri({ jalan: 'uji' }, async () => {
          catatTahap('retrieval', ms);
        });
      }
    });
    await tungguAgregatSelesai();
    const ag = await bacaAgregat();
    expect(ag.tahap.retrieval.sampel).toEqual([30, 40, 50]);
    expect(ag.tahap.retrieval.kejadian).toBe(5);
  });

  it('baris rekap ditulis setiap N permintaan dan memuat p50/p95 per tahap', async () => {
    vi.stubEnv('SAPA_TELEMETRI_REKAP_N', '2');
    expect(rekapSetiap()).toBe(2);
    const baris = await tangkapLog(async () => {
      for (const ms of [10, 50]) {
        await denganTelemetri({ jalan: 'uji' }, async () => {
          catatTahap('retrieval', ms);
        });
      }
      await new Promise((r) => setTimeout(r, 30)); // biarkan agregat selesai ditulis
    });
    const rekap = ambilJson(baris, '[gen_ai-rekap] ');
    expect(rekap).toHaveLength(1);
    const tahap = rekap[0].tahap as Record<string, { n: number; p95: number }>;
    expect(tahap.retrieval).toMatchObject({ n: 2, p95: 50 });
    expect(rekap[0].sebab).toBe('otomatis-2');
  });

  it('tulisRekapSekarang menulis sekarang dan mengembalikan baris yang sama dengan yang masuk log', async () => {
    await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'uji' }, async () => {
        catatTahap('retrieval', 33);
      });
    });
    let dikembalikan: Record<string, unknown> = {};
    const baris = await tangkapLog(async () => {
      dikembalikan = await tulisRekapSekarang('manual-uji');
    });
    const masukLog = ambilJson(baris, '[gen_ai-rekap] ')[0];
    expect(masukLog).toEqual(dikembalikan);
    expect((masukLog.tahap as Record<string, { p95: number }>).retrieval.p95).toBe(33);
  });

  it('nolkanAgregat mengosongkan jendela', async () => {
    await tangkapLog(async () => {
      await denganTelemetri({ jalan: 'uji' }, async () => {
        catatTahap('retrieval', 10);
      });
    });
    expect((await ringkasTelemetri()).jumlah.permintaan).toBe(1);
    await nolkanAgregat();
    const setelah = await ringkasTelemetri();
    expect(setelah.jumlah.permintaan).toBe(0);
    expect(setelah.tahap.retrieval).toBeUndefined();
  });

  it('nilai tersimpan yang rusak tidak melempar — hanya dianggap kosong', async () => {
    await cacheSet('sapa:telemetri:v1', { jumlah: 'bukan-objek', tahap: 42 }, 1000);
    const ag = await bacaAgregat();
    expect(ag.jumlah.permintaan).toBe(0);
    expect(typeof ag.tahap).toBe('object');
    const ringkas = await ringkasTelemetri();
    expect(ringkas.tahap).toEqual({});
  });

  it('urutan tahap tetap dilaporkan (pengurutan log bisa dibaca mata)', () => {
    expect(TAHAP_URUT.slice(0, 5)).toEqual(['pengambilan_data', 'indeks_semantik', 'retrieval', 'prompt', 'model']);
    expect(TAHAP_URUT).toContain('grounding');
    expect(TAHAP_URUT).toContain('gerbang');
  });
});
