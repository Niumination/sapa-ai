// Uji logika penyegaran cache (OPS-03).
//
// Fokus uji: hal-hal yang TIDAK boleh salah, yaitu
//   1. tag yang tidak dikenal tidak boleh "diam-diam berhasil";
//   2. kategori balasan harus menunjuk penyebab yang benar — terutama 503
//      fail-closed (rahasia belum diset) versus 503 galat server biasa,
//      karena penjadwal memakai kategori ini untuk memberi tahu operator;
//   3. pembukuan: riwayat terbatas, penghitung benar, kegagalan beruntun
//      terhitung dari ekor;
//   4. kesegaran: `terlewat` hanya bernilai true bila jadwal sudah lewat,
//      bukan sekadar karena data berumur;
//   5. jalur pembatal: `revalidateTag(tag, { expire: 0 })` — bukan profil
//      bawaan 'max' yang hanya menandai basi dan MASIH menyajikan entri lama;
//   6. rahasia tidak pernah masuk pembukuan maupun baris log.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (...args: unknown[]) => revalidateTag(...args) }));

import { __clearLocalStore } from '@/lib/store';
import {
  AMBANG_BASI_JAM,
  JAM_JADWAL_UTC,
  MAKS_RIWAYAT,
  TAG_DIIZINKAN,
  bacaKeadaanSegarkan,
  barisLogSegarkan,
  catatKegagalanSegarkan,
  catatSegarkan,
  gagalBerturut,
  hitungMundur,
  jalankanPenyegaran,
  nilaiBalasan,
  pilihTag,
  ringkasanSegarkan,
  simpanKeadaanSegarkan,
  statusSegarkan,
  type EntriSegarkan,
  type KeadaanSegarkan,
} from '@/lib/penyegar-cache';

const JAM = 3_600_000;
const entri = (kategori: EntriSegarkan['kategori'], waktuMs: number, tag: string[] = ['stats']): EntriSegarkan => ({
  waktuMs,
  tag,
  mode: 'bertanda',
  sumber: 'uji',
  kategori,
  durasiMs: 5,
});

beforeEach(() => {
  __clearLocalStore();
  revalidateTag.mockClear();
});

describe('pilihTag', () => {
  it("'all' → seluruh allowlist", () => {
    const h = pilihTag('all');
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.tag).toEqual([...TAG_DIIZINKAN]);
  });

  it('tag tunggal yang sah diteruskan', () => {
    const h = pilihTag('stats');
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.tag).toEqual(['stats']);
  });

  it('daftar dideduplikasi dan spasi dipangkas', () => {
    const h = pilihTag([' kpi ', 'kpi', 'report']);
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.tag).toEqual(['kpi', 'report']);
  });

  it('tag asing DITOLAK (bukan diabaikan diam-diam)', () => {
    const h = pilihTag(['stats', 'semua']);
    expect(h.ok).toBe(false);
    if (!h.ok) {
      expect(h.pesan).toContain('semua');
      expect(h.pesan).toContain('stats');
    }
  });

  it('kosong → pesan berisi daftar tag yang diizinkan', () => {
    for (const masukan of [undefined, null, '', [], ['  ']]) {
      const h = pilihTag(masukan);
      expect(h.ok).toBe(false);
      if (!h.ok) expect(h.pesan).toContain('sapa-analytics');
    }
  });

  it("'all' bersama tag tak dikenal tetap berarti semua (sengaja)", () => {
    const h = pilihTag(['all', 'entah']);
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.tag).toEqual([...TAG_DIIZINKAN]);
  });
});

describe('nilaiBalasan', () => {
  it('200 + status ok → ok', () => {
    const n = nilaiBalasan(200, { status: 'ok', revalidated: ['stats'] });
    expect(n.ok).toBe(true);
    expect(n.kategori).toBe('ok');
  });

  it('200 tanpa status ok → tak-terduga (jangan percaya 200 buta)', () => {
    expect(nilaiBalasan(200, { apa: 'saja' }).kategori).toBe('tak-terduga');
  });

  it('401/403 → rahasia-salah', () => {
    expect(nilaiBalasan(401, { error: 'Unauthorized' }).kategori).toBe('rahasia-salah');
    expect(nilaiBalasan(403, {}).kategori).toBe('rahasia-salah');
  });

  it('503 fail-closed → endpoint-tertutup dengan pesan yang menuntun', () => {
    const n = nilaiBalasan(503, { error: 'REVALIDATE_SECRET belum diset di lingkungan produksi.' });
    expect(n.ok).toBe(false);
    expect(n.kategori).toBe('endpoint-tertutup');
    expect(n.pesan).toContain('REVALIDATE_SECRET');
  });

  it('503 lain → galat-server (tidak salah kategori)', () => {
    expect(nilaiBalasan(503, { error: 'Service Unavailable' }).kategori).toBe('galat-server');
  });

  it('429 → dibatasi', () => {
    expect(nilaiBalasan(429, { error: 'Terlalu banyak permintaan revalidate.' }).kategori).toBe('dibatasi');
  });

  it('400 → tag-salah', () => {
    expect(nilaiBalasan(400, { error: 'tag tidak dikenal: xyz' }).kategori).toBe('tag-salah');
  });

  it('500 → galat-server; status aneh → tak-terduga; badan string tetap aman', () => {
    expect(nilaiBalasan(500, 'boom').kategori).toBe('galat-server');
    expect(nilaiBalasan(418, '').kategori).toBe('tak-terduga');
    expect(nilaiBalasan(400, null).pesan.length).toBeGreaterThan(0);
  });
});

describe('hitungMundur', () => {
  it('berlipat dua dari basis, dibatasi maksimum', () => {
    expect(hitungMundur(1)).toBe(2000);
    expect(hitungMundur(2)).toBe(4000);
    expect(hitungMundur(3)).toBe(8000);
    expect(hitungMundur(1, { basisMs: 500, faktor: 3 })).toBe(500);
    expect(hitungMundur(3, { basisMs: 500, faktor: 3 })).toBe(4500);
    expect(hitungMundur(20, { maksMs: 60_000 })).toBe(60_000);
  });

  it('percobaan tidak sah tetap menghasilkan jeda basis (tidak 0/NaN)', () => {
    expect(hitungMundur(0)).toBe(2000);
    expect(hitungMundur(-5)).toBe(2000);
    expect(hitungMundur(1.9)).toBe(2000);
  });
});

describe('catatSegarkan & gagalBerturut', () => {
  const kosong: KeadaanSegarkan = { riwayat: [], jumlahOk: 0, jumlahGagal: 0 };

  it('mencatat entri dan menghitung keberhasilan/kegagalan', () => {
    let k = catatSegarkan(kosong, entri('ok', 1000));
    expect(k.jumlahOk).toBe(1);
    expect(k.jumlahGagal).toBe(0);
    k = catatSegarkan(k, entri('endpoint-tertutup', 2000));
    expect(k.jumlahOk).toBe(1);
    expect(k.jumlahGagal).toBe(1);
    expect(k.riwayat).toHaveLength(2);
  });

  it(`riwayat dibatasi MAKS_RIWAYAT (${MAKS_RIWAYAT}) entri — ekor terbaru yang disimpan`, () => {
    let k = kosong;
    for (let i = 0; i < MAKS_RIWAYAT + 7; i += 1) k = catatSegarkan(k, entri('ok', 1000 + i));
    expect(k.riwayat).toHaveLength(MAKS_RIWAYAT);
    expect(k.riwayat[k.riwayat.length - 1].waktuMs).toBe(1000 + MAKS_RIWAYAT + 6);
    expect(k.jumlahOk).toBe(MAKS_RIWAYAT + 7);
  });

  it('kegagalan beruntun dihitung dari ekor dan berhenti di keberhasilan', () => {
    expect(gagalBerturut([])).toBe(0);
    expect(gagalBerturut([entri('ok', 1)])).toBe(0);
    expect(gagalBerturut([entri('ok', 1), entri('galat-server', 2), entri('galat-server', 3)])).toBe(2);
    expect(gagalBerturut([entri('rahasia-salah', 1), entri('ok', 2)])).toBe(0);
  });
});

describe('statusSegarkan', () => {
  const SEKARANG = Date.UTC(2026, 8, 23, 6, 0, 0); // 06:00 UTC, jadwal 22 UTC belum tiba

  it('tanpa riwayat → basi, terlewat, perlu dikabari', () => {
    const s = statusSegarkan({ riwayat: [], jumlahOk: 0, jumlahGagal: 0 }, { sekarangMs: SEKARANG });
    expect(s.terakhirMs).toBeNull();
    expect(s.umurJam).toBeNull();
    expect(s.segar).toBe(false);
    expect(s.terlewat).toBe(true);
    expect(s.perluKabar).toBe(true);
    expect(s.berikutnyaMs).toBeGreaterThan(SEKARANG);
  });

  it('disegarkan 2 jam lalu → segar, tidak terlewat', () => {
    const s = statusSegarkan({ riwayat: [entri('ok', SEKARANG - 2 * JAM)], jumlahOk: 1, jumlahGagal: 0 }, { sekarangMs: SEKARANG });
    expect(s.segar).toBe(true);
    expect(s.terlewat).toBe(false);
    expect(s.umurJam).toBe(2);
    expect(s.perluKabar).toBe(false);
  });

  it(`lebih dari AMBANG_BASI_JAM (${AMBANG_BASI_JAM}) jam → basi; tepat di ambang masih segar`, () => {
    const tepat = statusSegarkan({ riwayat: [entri('ok', SEKARANG - AMBANG_BASI_JAM * JAM)], jumlahOk: 1, jumlahGagal: 0 }, { sekarangMs: SEKARANG });
    expect(tepat.segar).toBe(true);
    const lewat = statusSegarkan(
      { riwayat: [entri('ok', SEKARANG - (AMBANG_BASI_JAM + 0.5) * JAM)], jumlahOk: 1, jumlahGagal: 0 },
      { sekarangMs: SEKARANG },
    );
    expect(lewat.segar).toBe(false);
    expect(lewat.terlewat).toBe(true);
  });

  it('jadwal berikutnya jatuh pada jam jadwal UTC dan selalu di masa depan', () => {
    const s = statusSegarkan({ riwayat: [entri('ok', SEKARANG)], jumlahOk: 1, jumlahGagal: 0 }, { sekarangMs: SEKARANG });
    const b = new Date(s.berikutnyaMs as number);
    expect(b.getUTCHours()).toBe(JAM_JADWAL_UTC);
    expect((s.berikutnyaMs as number) - SEKARANG).toBeLessThanOrEqual(24 * JAM);
    // Tepat SETELAH jadwal hari ini → berikutnya adalah besok.
    const sesudahJadwal = statusSegarkan(
      { riwayat: [entri('ok', SEKARANG)], jumlahOk: 1, jumlahGagal: 0 },
      { sekarangMs: Date.UTC(2026, 8, 23, 22, 30, 0) },
    );
    expect(sesudahJadwal.berikutnyaMs).toBe(Date.UTC(2026, 8, 24, 22, 0, 0));
  });

  it('yang menghitung kesegaran hanya penyegaran BERHASIL (kegagalan tidak menipu)', () => {
    const s = statusSegarkan(
      { riwayat: [entri('ok', SEKARANG - 10 * JAM), entri('galat-server', SEKARANG - 1 * JAM)], jumlahOk: 1, jumlahGagal: 1 },
      { sekarangMs: SEKARANG },
    );
    expect(s.umurJam).toBe(10);
    expect(s.segar).toBe(true);
    expect(s.gagalBerturut).toBe(1);
  });

  it('3 kegagalan beruntun → perluKabar meski belum basi', () => {
    const riwayat = [entri('ok', SEKARANG - JAM), entri('rahasia-salah', SEKARANG - 1800_000), entri('rahasia-salah', SEKARANG - 1700_000), entri('rahasia-salah', SEKARANG - 1600_000)];
    const s = statusSegarkan({ riwayat, jumlahOk: 1, jumlahGagal: 3 }, { sekarangMs: SEKARANG });
    expect(s.segar).toBe(true);
    expect(s.gagalBerturut).toBe(3);
    expect(s.perluKabar).toBe(true);
  });

  it('ringkasan untuk /api/status tidak memuat medan rahasia apa pun', () => {
    const s = statusSegarkan({ riwayat: [entri('ok', SEKARANG)], jumlahOk: 1, jumlahGagal: 0 }, { sekarangMs: SEKARANG });
    const r = ringkasanSegarkan(s);
    expect(Object.keys(r).sort()).toEqual(
      ['berikutnyaMs', 'gagalBerturut', 'jumlahGagal', 'jumlahOk', 'perluKabar', 'segar', 'terakhirMs', 'terlewat', 'umurJam'].sort(),
    );
    expect(JSON.stringify(r)).not.toMatch(/rahasia|secret/i);
  });
});

describe('pembukuan tersimpan', () => {
  it('simpan → baca kembali utuh (backend memori)', async () => {
    const k = catatSegarkan({ riwayat: [], jumlahOk: 0, jumlahGagal: 0 }, entri('ok', 123456));
    await simpanKeadaanSegarkan(k);
    const lagi = await bacaKeadaanSegarkan();
    expect(lagi.riwayat).toHaveLength(1);
    expect(lagi.riwayat[0].waktuMs).toBe(123456);
    expect(lagi.jumlahOk).toBe(1);
  });

  it('keadaan kosong dan keadaan rusak tidak membuat pembaca gagal', async () => {
    const kosong = await bacaKeadaanSegarkan();
    expect(kosong).toEqual({ riwayat: [], jumlahOk: 0, jumlahGagal: 0 });
    // Bentuk tak terduga (mis. sisa versi lama) → aman, bukan lempar.
    const { cacheSet } = await import('@/lib/store');
    await cacheSet('sapa:segarkan:v1', { riwayat: 'bukan-array', jumlahOk: 'x' }, 1000);
    const lagi = await bacaKeadaanSegarkan();
    expect(lagi).toEqual({ riwayat: [], jumlahOk: 0, jumlahGagal: 0 });
  });
});

describe('jalankanPenyegaran', () => {
  it('membatalkan setiap tag dengan { expire: 0 } dan mencatat keberhasilan', async () => {
    const h = await jalankanPenyegaran({ tagDiminta: 'all', mode: 'bertanda', sumber: 'jadwal-github' });
    expect(h.ok).toBe(true);
    expect(h.kering).toBe(false);
    expect(revalidateTag).toHaveBeenCalledTimes(TAG_DIIZINKAN.length);
    for (const t of TAG_DIIZINKAN) expect(revalidateTag).toHaveBeenCalledWith(t, { expire: 0 });
    expect(h.status.segar).toBe(true);
    expect(h.status.terakhirMs).not.toBeNull();
    const tersimpan = await bacaKeadaanSegarkan();
    expect(tersimpan.jumlahOk).toBe(1);
    expect(tersimpan.riwayat[0].sumber).toBe('jadwal-github');
  });

  it('uji kering: tag dihitung dan dicatat, tetapi cache TIDAK dibatalkan', async () => {
    const h = await jalankanPenyegaran({ tagDiminta: ['stats'], mode: 'admin', kering: true });
    expect(h.ok).toBe(true);
    expect(h.kering).toBe(true);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(h.tag).toEqual(['stats']);
    expect((await bacaKeadaanSegarkan()).jumlahOk).toBe(1);
  });

  it('tag tak dikenal → ditolak, tidak ada pembatalan, tidak ada penyimpanan', async () => {
    const h = await jalankanPenyegaran({ tagDiminta: 'entah', mode: 'admin' });
    expect(h.ok).toBe(false);
    expect(h.fase).toBe('ditolak');
    expect(h.entri).toBeNull();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect((await bacaKeadaanSegarkan()).jumlahGagal).toBe(0);
  });

  it('kegagalan sisi-server tercatat (dan menaikkan kegagalan beruntun)', async () => {
    for (let i = 0; i < 3; i += 1) await catatKegagalanSegarkan('endpoint-tertutup', { mode: 'tertutup', sumber: 'jadwal-github' });
    const k = await bacaKeadaanSegarkan();
    expect(k.jumlahGagal).toBe(3);
    const s = statusSegarkan(k);
    expect(s.gagalBerturut).toBe(3);
    expect(s.perluKabar).toBe(true);
  });
});

describe('barisLogSegarkan', () => {
  it('memuat tag/mode/kategori/durasi + kesegaran, tanpa medan isi atau rahasia', async () => {
    const h = await jalankanPenyegaran({ tagDiminta: 'stats', mode: 'bertanda', sumber: 'jadwal-lokal' });
    const baris = barisLogSegarkan({ entri: h.entri, status: h.status, backend: 'memory' });
    const o = JSON.parse(baris) as Record<string, unknown>;
    expect(Object.keys(o).sort()).toEqual(
      ['backend', 'durasiMs', 'gagalBerturut', 'kategori', 'mode', 'segar', 'sumber', 'tag', 'terakhirMs', 'terlewat', 'umurJam', 'waktu'].sort(),
    );
    expect(o.kategori).toBe('ok');
    expect(o.tag).toEqual(['stats']);
    expect(baris).not.toMatch(/secret|rahasia|token/i);
  });
});
