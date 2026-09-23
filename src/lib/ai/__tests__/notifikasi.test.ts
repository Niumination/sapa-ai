// Uji notifikasi operator (OPS-04).
//
// Yang dijaga di sini bukan "kodenya jalan", melainkan sifat yang membuat
// notifikasi LAYAK DIPERCAYA oleh operator:
//   (1) peringatan pertama keluar SEGERA saat sirkuit terbuka (bukan 15 menit
//       kemudian — operator tidak boleh kehilangan fase awal gangguan);
//   (2) tidak ada spam: satu episode = satu peringatan pertama, pengulangan
//       hanya setelah ambang tahan-lama (15 menit) DAN jeda ulang (60 menit);
//   (3) notifikasi pemulihan dikirim saat sirkuit menutup, lalu episode ditutup;
//   (4) tanpa saluran: modul DIAM tetapi melaporkan `siap:false` (bukan
//       dianggap sukses palsu), dan episode tidak dibuka;
//   (5) pengiriman gagal tidak melempar, tidak menggagalkan permintaan pengguna,
//       dan dicoba lagi dengan jeda (bukan setiap permintaan);
//   (6) rahasia tidak pernah ikut keluar (pesan galat penyedia kadang mengutip kunci);
//   (7) jalur jawaban memakai pembungkus nirblokir yang tidak pernah melempar.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KesehatanPenyedia } from '../provider-health';

const {
  bacaSaluran,
  hitungTerbukaMenit,
  kirimKeSaluran,
  periksaPeringatan,
  periksaPeringatanSirkuit,
  ringkasanPeringatan,
  saringRahasia,
  susunPesan,
} = await import('../notifikasi');
const { __clearLocalStore } = await import('@/lib/store');

type Kesehatan = KesehatanPenyedia;

const SALURAN = [
  { jenis: 'webhook' as const, nama: 'webhook', url: 'http://sink.test/hook', rahasia: 'rahasia-hook-123456' },
  { jenis: 'telegram' as const, nama: 'telegram:99', url: 'https://api.telegram.org/botTOKEN/sendMessage', rahasia: 'TOKEN' },
];

/** Keadaan sirkuit terbuka pada waktu tertentu (tanpa menyentuh penyimpanan). */
function terbukaPada(isoWaktu: string, extra: Partial<Kesehatan> = {}): Kesehatan {
  return {
    state: 'terbuka',
    sebabTerakhir: 'auth',
    pesanTerakhir: 'HTTP 401: kunci ditolak',
    gagalBerturut: 2,
    gagalAuthBerturut: 2,
    dibukaSampai: Date.parse(isoWaktu) + 600_000,
    dibukaPada: isoWaktu,
    berhasilTerakhir: null,
    backend: 'memory',
    ...extra,
  } as Kesehatan;
}

function sehat(extra: Partial<Kesehatan> = {}): Kesehatan {
  return {
    state: 'sehat',
    sebabTerakhir: null,
    pesanTerakhir: null,
    gagalBerturut: 0,
    gagalAuthBerturut: 0,
    dibukaSampai: null,
    dibukaPada: null,
    berhasilTerakhir: '2026-09-23T00:00:00.000Z',
    backend: 'memory',
    ...extra,
  } as Kesehatan;
}

const MENIT = 60_000;
const T0 = Date.parse('2026-09-23T04:00:00.000Z');
const kirimTiruan = () => vi.fn(async (_p: unknown, s: { nama: string }[]) => s.map((x) => ({ saluran: x.nama, ok: true, catatan: 'terkirim' })));

beforeEach(() => {
  __clearLocalStore();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OPS-04 · peringatan sirkuit penyedia', () => {
  it('sirkuit sehat & belum pernah ada episode → tenang, tidak ada kiriman', async () => {
    const kirim = kirimTiruan();
    const h = await periksaPeringatan({ kesehatan: sehat(), sekarang: T0, saluran: SALURAN, kirim });
    expect(h.status).toBe('tenang');
    expect(h.dikirim).toEqual([]);
    expect(kirim).not.toHaveBeenCalled();
  });

  it('sirkuit terbuka → peringatan pertama keluar SEGERA dan memuat sebab + panel', async () => {
    const kirim = kirimTiruan();
    const h = await periksaPeringatan({ kesehatan: terbukaPada('2026-09-23T04:00:00.000Z'), sekarang: T0, saluran: SALURAN, kirim });
    expect(h.status).toBe('peringatan-dikirim');
    expect(kirim).toHaveBeenCalledTimes(1);
    const pesan = kirim.mock.calls[0][0] as { teks: string; jenis: string };
    expect(pesan.jenis).toBe('sirkuit-terbuka');
    expect(pesan.teks).toContain('TERBUKA');
    expect(pesan.teks).toContain('auth');
    expect(pesan.teks).toContain('/admin/ai-toggle');
    expect(h.keadaan.aktif).toBe(true);
    expect(h.keadaan.jumlahKirim).toBe(1);
  });

  it('tidak spam: pemeriksaan berulang < 15 menit tidak mengirim apa-apa', async () => {
    const kirim = kirimTiruan();
    await periksaPeringatan({ kesehatan: terbukaPada('2026-09-23T04:00:00.000Z'), sekarang: T0, saluran: SALURAN, kirim });
    for (const menit of [1, 5, 14]) {
      const h = await periksaPeringatan({
        kesehatan: terbukaPada('2026-09-23T04:00:00.000Z'),
        sekarang: T0 + menit * MENIT,
        saluran: SALURAN,
        kirim,
      });
      expect(h.status).toBe('masih-terbuka');
    }
    expect(kirim).toHaveBeenCalledTimes(1); // tetap satu
  });

  it('pengulangan menuntut gangguan bertahan ≥ 15 menit DAN jeda ulang 60 menit', async () => {
    const kirim = kirimTiruan();
    const k = terbukaPada('2026-09-23T04:00:00.000Z');
    await periksaPeringatan({ kesehatan: k, sekarang: T0, saluran: SALURAN, kirim }); // peringatan #1 (segera)

    // 16 menit: ambang tahan-lama sudah lewat, tetapi jeda ulang belum → tidak diulang.
    const sebelumJeda = await periksaPeringatan({ kesehatan: k, sekarang: T0 + 16 * MENIT, saluran: SALURAN, kirim });
    expect(sebelumJeda.status).toBe('masih-terbuka');
    expect(kirim).toHaveBeenCalledTimes(1);

    const ulang = await periksaPeringatan({ kesehatan: k, sekarang: T0 + 61 * MENIT, saluran: SALURAN, kirim });
    expect(ulang.status).toBe('peringatan-diulang');
    expect(kirim).toHaveBeenCalledTimes(2);

    const hen = await periksaPeringatan({ kesehatan: k, sekarang: T0 + 90 * MENIT, saluran: SALURAN, kirim });
    expect(hen.status).toBe('masih-terbuka');
    expect(kirim).toHaveBeenCalledTimes(2);

    const lagi = await periksaPeringatan({ kesehatan: k, sekarang: T0 + 125 * MENIT, saluran: SALURAN, kirim });
    expect(lagi.status).toBe('peringatan-diulang');
    expect(kirim).toHaveBeenCalledTimes(3);
  });

  it('ambang & jeda dapat diatur lewat env', async () => {
    vi.stubEnv('SAPA_ALERT_ESKALASI_MENIT', '2');
    vi.stubEnv('SAPA_ALERT_JEDA_ULANG_MENIT', '2');
    const kirim = kirimTiruan();
    const k = terbukaPada('2026-09-23T04:00:00.000Z');
    await periksaPeringatan({ kesehatan: k, sekarang: T0, saluran: SALURAN, kirim });
    const h = await periksaPeringatan({ kesehatan: k, sekarang: T0 + 3 * MENIT, saluran: SALURAN, kirim });
    expect(h.status).toBe('peringatan-diulang');
  });

  it('sirkuit pulih → notifikasi pemulihan dikirim dan episode ditutup', async () => {
    const kirim = kirimTiruan();
    const k = terbukaPada('2026-09-23T04:00:00.000Z');
    await periksaPeringatan({ kesehatan: k, sekarang: T0, saluran: SALURAN, kirim });
    const h = await periksaPeringatan({ kesehatan: sehat(), sekarang: T0 + 20 * MENIT, saluran: SALURAN, kirim });

    expect(h.status).toBe('pulih-dikirim');
    expect(kirim).toHaveBeenCalledTimes(2); // peringatan + pemulihan
    expect(h.keadaan.aktif).toBe(false);
    expect((kirim.mock.calls[1][0] as { jenis: string }).jenis).toBe('sirkuit-pulih');

    // Setelah pulih, pemeriksaan berikutnya benar-benar tenang.
    const tenang = await periksaPeringatan({ kesehatan: sehat(), sekarang: T0 + 21 * MENIT, saluran: SALURAN, kirim });
    expect(tenang.status).toBe('tenang');
    expect(kirim).toHaveBeenCalledTimes(2);
  });

  it('episode baru setelah pulih → peringatan pertama dikirim lagi', async () => {
    const kirim = kirimTiruan();
    await periksaPeringatan({ kesehatan: terbukaPada('2026-09-23T04:00:00.000Z'), sekarang: T0, saluran: SALURAN, kirim });
    await periksaPeringatan({ kesehatan: sehat(), sekarang: T0 + 5 * MENIT, saluran: SALURAN, kirim });
    const h = await periksaPeringatan({
      kesehatan: terbukaPada('2026-09-23T05:00:00.000Z', { sebabTerakhir: 'server' }),
      sekarang: T0 + 60 * MENIT,
      saluran: SALURAN,
      kirim,
    });
    expect(h.status).toBe('peringatan-dikirim');
    expect(kirim).toHaveBeenCalledTimes(3);
  });

  it('tanpa saluran: melaporkan siap=false dan TIDAK membuka episode', async () => {
    const kirim = kirimTiruan();
    const h = await periksaPeringatan({ kesehatan: terbukaPada('2026-09-23T04:00:00.000Z'), sekarang: T0, saluran: [], kirim });
    expect(h.status).toBe('tanpa-saluran');
    expect(h.siap).toBe(false);
    expect(kirim).not.toHaveBeenCalled();
    expect(h.keadaan.aktif).toBe(false);

    // Begitu saluran dipasang, peringatan pertama tetap terkirim (tidak hilang).
    const lagi = await periksaPeringatan({ kesehatan: terbukaPada('2026-09-23T04:00:00.000Z'), sekarang: T0 + MENIT, saluran: SALURAN, kirim });
    expect(lagi.status).toBe('peringatan-dikirim');
  });

  it('pengiriman gagal: tidak melempar, status gagal-kirim, dan tidak dicoba ulang setiap detik', async () => {
    const gagal = vi.fn(async (_p: unknown, s: { nama: string }[]) => s.map((x) => ({ saluran: x.nama, ok: false, catatan: 'HTTP 500' })));
    const k = terbukaPada('2026-09-23T04:00:00.000Z');
    const h = await periksaPeringatan({ kesehatan: k, sekarang: T0, saluran: SALURAN, kirim: gagal });
    expect(h.status).toBe('gagal-kirim');
    expect(h.keadaan.percobaanGagal).toBe(1);
    expect(h.keadaan.terakhirKirim).toBeNull();

    const cepat = await periksaPeringatan({ kesehatan: k, sekarang: T0 + 30_000, saluran: SALURAN, kirim: gagal });
    expect(cepat.status).toBe('masih-terbuka'); // jeda gagal 5 menit
    expect(gagal).toHaveBeenCalledTimes(1);

    const nanti = await periksaPeringatan({ kesehatan: k, sekarang: T0 + 6 * MENIT, saluran: SALURAN, kirim: gagal });
    expect(nanti.status).toBe('gagal-kirim');
    expect(gagal).toHaveBeenCalledTimes(2);
  });

  it('sebagian saluran gagal → tetap dihitung terkirim (operator tetap tahu)', async () => {
    const separuh = vi.fn(async (_p: unknown, s: { nama: string }[]) =>
      s.map((x, i) => ({ saluran: x.nama, ok: i === 0, catatan: i === 0 ? 'terkirim' : 'HTTP 500' })),
    );
    const h = await periksaPeringatan({ kesehatan: terbukaPada('2026-09-23T04:00:00.000Z'), sekarang: T0, saluran: SALURAN, kirim: separuh });
    expect(h.status).toBe('peringatan-dikirim');
    expect(h.dikirim.filter((d) => d.ok)).toHaveLength(1);
    expect(h.keadaan.jumlahKirim).toBe(1);
  });

  it('mode kering: melaporkan rencana + pratinjau pesan tanpa mengirim dan tanpa mengubah keadaan', async () => {
    const kirim = kirimTiruan();
    const k = terbukaPada('2026-09-23T04:00:00.000Z');
    const kering = await periksaPeringatan({ kesehatan: k, sekarang: T0, saluran: SALURAN, kirim, kering: true });
    expect(kering.status).toBe('kering');
    expect(kering.pesan).toContain('peringatan pertama');
    expect(kering.pratinjau).toContain('TERBUKA');
    expect(kering.keadaan.aktif).toBe(false);
    expect(kirim).not.toHaveBeenCalled();

    // Karena kering tidak mengubah apa pun, pemeriksaan nyata berikutnya tetap mengirim yang pertama.
    const nyata = await periksaPeringatan({ kesehatan: k, sekarang: T0, saluran: SALURAN, kirim });
    expect(nyata.status).toBe('peringatan-dikirim');
  });

  it('hitungTerbukaMenit tahan dibukaPada kosong/rusak', () => {
    expect(hitungTerbukaMenit(terbukaPada('2026-09-23T04:00:00.000Z'), T0 + 9 * MENIT)).toBe(9);
    expect(hitungTerbukaMenit(terbukaPada('2026-09-23T04:00:00.000Z', { dibukaPada: null }), T0)).toBe(0);
    expect(hitungTerbukaMenit(terbukaPada('2026-09-23T04:00:00.000Z', { dibukaPada: 'bukan-tanggal' }), T0)).toBe(0);
  });

  it('pembungkus jalur jawaban tidak pernah melempar walau penyimpanan bermasalah', async () => {
    const tolak = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('jaringan mati'));
    expect(() => periksaPeringatanSirkuit(terbukaPada('2026-09-23T04:00:00.000Z'))).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    tolak.mockRestore();
  });

  it('ringkasan melaporkan saluran terpasang apa adanya', async () => {
    vi.stubEnv('SAPA_ALERT_WEBHOOK_URL', 'http://sink.test/hook');
    const r = await ringkasanPeringatan();
    expect(r.siap).toBe(true);
    expect(r.saluran).toEqual([{ nama: 'webhook', jenis: 'webhook' }]);
    expect(r.keadaan.aktif).toBe(false);
  });
});

describe('OPS-04 · saluran & penyaringan rahasia', () => {
  it('bacaSaluran: kosong, telegram, webhook, dan keduanya', () => {
    expect(bacaSaluran({})).toEqual([]);
    const tg = bacaSaluran({ SAPA_ALERT_TELEGRAM_BOT_TOKEN: 'TOKEN', SAPA_ALERT_TELEGRAM_CHAT_ID: '12345' });
    expect(tg).toHaveLength(1);
    expect(tg[0].url).toBe('https://api.telegram.org/botTOKEN/sendMessage');
    expect(tg[0].nama).toBe('telegram:12345');

    const kedua = bacaSaluran({ SAPA_ALERT_TELEGRAM_BOT_TOKEN: 'T', SAPA_ALERT_TELEGRAM_CHAT_ID: '1', SAPA_ALERT_WEBHOOK_URL: 'http://x.test/h' });
    expect(kedua.map((s) => s.jenis)).toEqual(['telegram', 'webhook']);

    // token ada tapi chat id tidak → saluran telegram TIDAK dipasang (tidak setengah jadi)
    expect(bacaSaluran({ SAPA_ALERT_TELEGRAM_BOT_TOKEN: 'T' })).toEqual([]);
  });

  it('saringRahasia membuang kunci pada pesan', () => {
    expect(saringRahasia('HTTP 401: {"key":"rahasia-hook-123456"}', ['rahasia-hook-123456'])).not.toContain('rahasia-hook-123456');
    expect(saringRahasia('Authorization: Bearer abcdefghijklmnop')).toContain('«disunting»');
    expect(saringRahasia('token sk-live-abcdef123456 ditolak')).not.toContain('sk-live-abcdef123456');
    expect(saringRahasia('id 12345678901234567890:AABBCCDDEEFFGGHHIIJJKKLL')).toContain('«disunting»');
    expect(saringRahasia('HTTP 500: server sibuk')).toBe('HTTP 500: server sibuk');
  });

  it('pesan peringatan tidak pernah memuat token meski pesan galat penyedia memuatnya', () => {
    const p = susunPesan({
      kesehatan: terbukaPada('2026-09-23T04:00:00.000Z', {
        // Bentuk kunci uji sengaja PENDEK: cukup untuk menguji penyaring, tidak
        // menyerupai kredensial sungguhan (gerbang PII menolak pola sk- panjang).
        pesanTerakhir: 'HTTP 401: {"error":"invalid key sk-proj-uji-123"}',
      }),
      terbukaMenit: 3,
      jenis: 'sirkuit-terbuka',
      panel: 'https://panel.test',
      rahasia: ['rahasia-hook-123456'],
      sekarang: T0,
    });
    expect(p.teks).not.toContain('sk-proj-uji-123');
    expect(p.teks).toContain('«disunting»');
  });

  it('kirimKeSaluran: webhook menerima JSON + header rahasia, telegram memakai chat_id', async () => {
    const panggilan: { url: string; init: RequestInit }[] = [];
    const fetchTiruan = vi.spyOn(global, 'fetch').mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      panggilan.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const hasil = await kirimKeSaluran(
      { jenis: 'sirkuit-terbuka', judul: 'judul', teks: 'teks pesan', data: { sebab: 'auth' } },
      SALURAN,
    );
    expect(hasil.every((h) => h.ok)).toBe(true);
    expect(panggilan).toHaveLength(2);

    const hook = panggilan.find((x) => x.url === 'http://sink.test/hook');
    expect((hook?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer rahasia-hook-123456');
    expect(JSON.parse(String(hook?.init.body))).toMatchObject({ jenis: 'sirkuit-terbuka', judul: 'judul' });

    const tg = panggilan.find((x) => x.url.includes('api.telegram.org'));
    expect(JSON.parse(String(tg?.init.body))).toMatchObject({ chat_id: '99', text: 'teks pesan' });

    fetchTiruan.mockRestore();
  });

  it('kirimKeSaluran: galat jaringan jadi hasil gagal, bukan lemparan', async () => {
    const fetchTiruan = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const hasil = await kirimKeSaluran({ jenis: 'uji', judul: 'j', teks: 't', data: {} }, [SALURAN[0]]);
    expect(hasil[0].ok).toBe(false);
    expect(hasil[0].catatan).toContain('ECONNREFUSED');
    fetchTiruan.mockRestore();
  });

  it('telegram yang menolak (ok:false) dihitung GAGAL meski HTTP 200', async () => {
    const fetchTiruan = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: 'chat not found' }), { status: 200 }),
    );
    const hasil = await kirimKeSaluran({ jenis: 'uji', judul: 'j', teks: 't', data: {} }, [SALURAN[1]]);
    expect(hasil[0].ok).toBe(false);
    expect(hasil[0].catatan).toContain('chat not found');
    fetchTiruan.mockRestore();
  });
});
