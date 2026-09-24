// ─── Meta korpus (FR-25/DS-03): stempel waktu tarik + sidik versi ─────────────
// Diuji lewat `fetchSapaData` dengan jaringan di-stub — termasuk perilaku cache
// (sidik harus STABIL selama korpus masih dipegang, sebab ia penanda versi).
//
// Catatan: modul menyimpan cache tingkat-modul, jadi setiap uji memuat modul
// SEGAR lewat `vi.resetModules()`. Tanpa itu, uji kedua akan membaca cache uji
// pertama dan menguji hal yang salah.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SapaRecord } from '../sapa-client';

const record: SapaRecord = {
  id: 1, id_kode_indikator: 1, kode_indikator_kode_indikator: 'X.1',
  kode_indikator_nama_indikator: 'Jumlah ASN', id_opds: 1,
  opds_nama_opd: 'BKPSDM', jadwal_pemutakhiran: 'Tahunan', satuan: 'pegawai', tahun: '2026', variabel: '9610',
};

const jawab = (data: SapaRecord[]) =>
  new Response(JSON.stringify({ api_status: 1, api_message: 'ok', data }), { status: 200 });

async function modulSegar() {
  vi.resetModules();
  return import('../sapa-client');
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('meta korpus', () => {
  it('menyertakan diambilPada (ISO) dan sidik 8 heksadesimal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jawab([record, { ...record, id: 2 }])));
    const { fetchSapaData } = await modulSegar();
    const hasil = await fetchSapaData();
    expect(hasil.meta.diambilPada).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(hasil.meta.sidik).toMatch(/^[0-9a-f]{8}$/);
    expect(hasil.records).toHaveLength(2);
  });

  it('sidik STABIL antar-panggilan selagi cache masih segar (penanda versi, bukan waktu)', async () => {
    const fetchMock = vi.fn(async () => jawab([record]));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchSapaData } = await modulSegar();
    const a = await fetchSapaData();
    const b = await fetchSapaData();
    expect(b.meta.sidik).toBe(a.meta.sidik);
    expect(b.meta.diambilPada).toBe(a.meta.diambilPada);
    // Sekali tarik saja: panggilan kedua dilayani cache 10 menit.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('jumlah record yang berbeda menghasilkan sidik berbeda (versi korpus berubah)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jawab([record])));
    const satu = await (await modulSegar()).fetchSapaData();
    vi.stubGlobal('fetch', vi.fn(async () => jawab([record, { ...record, id: 2 }])));
    const dua = await (await modulSegar()).fetchSapaData();
    expect(dua.meta.sidik).not.toBe(satu.meta.sidik);
  });

  it('ISI berubah dengan JUMLAH record sama ⇒ sidik berbeda (inti DS-03)', async () => {
    // Inilah alasan kunci cache jawaban tidak boleh memakai jumlah record:
    // OPD memutakhirkan ANGKA pada indikator yang sudah ada, sehingga jumlah
    // record tetap 2.065 sementara isinya berubah. Kalau sidik (dan karenanya
    // kunci cache) tidak ikut berubah, warga tetap menerima angka lama.
    const isiA = [{ ...record, variabel: '9610' }, { ...record, id: 2, variabel: '31,4' }];
    const isiB = [{ ...record, variabel: '9700' }, { ...record, id: 2, variabel: '31,4' }];
    vi.stubGlobal('fetch', vi.fn(async () => jawab(isiA)));
    const a = await (await modulSegar()).fetchSapaData();
    vi.stubGlobal('fetch', vi.fn(async () => jawab(isiB)));
    const b = await (await modulSegar()).fetchSapaData();
    expect(a.records).toHaveLength(b.records.length);
    expect(b.meta.sidik).not.toBe(a.meta.sidik);
  });

  it('lupakanKorpus: tarikan berikutnya benar-benar mengambil ulang, sidik ikut versi baru', async () => {
    const fetchMock = vi.fn(async () => jawab([{ ...record, variabel: '9610' }]));
    vi.stubGlobal('fetch', fetchMock);
    const mod = await modulSegar();
    const lama = await mod.fetchSapaData();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Tanpa lupakanKorpus: masih dari memori (TTL 10 menit).
    await mod.fetchSapaData();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Sesudah dilupakan: ambil ulang — inilah yang membuat tombol "segarkan
    // sekarang" benar-benar terlihat hasilnya oleh operator (DS-03).
    expect(mod.lupakanKorpus()).toBe(true);
    fetchMock.mockImplementation(async () => jawab([{ ...record, variabel: '9700' }]));
    const baru = await mod.fetchSapaData();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(baru.meta.sidik).not.toBe(lama.meta.sidik);
    // Dua panggilan berurutan: yang pertama melupakan, yang kedua tidak ada
    // apa-apa lagi untuk dilupakan (dipakai operator untuk membedakan
    // "memang tidak ada salinan" dari "salinan baru saja dibuang").
    expect(mod.lupakanKorpus()).toBe(true);
    expect(mod.lupakanKorpus()).toBe(false);
  });

  it('data yang SAMA pada proses berbeda (waktu tarik berbeda) menghasilkan sidik SAMA', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jawab([record, { ...record, id: 2 }])));
    const prosesA = await (await modulSegar()).fetchSapaData();
    const prosesB = await (await modulSegar()).fetchSapaData();
    expect(prosesB.meta.sidik).toBe(prosesA.meta.sidik);
    // Waktu tarik justru boleh berbeda — dan memang berbeda; sidiknya yang sama.
    expect(typeof prosesB.meta.diambilPada).toBe('string');
  });

  it('perubahan ISI (bukan jumlah) mengubah sidik — inilah gunanya sebagai penanda versi', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jawab([record])));
    const asli = await (await modulSegar()).fetchSapaData();
    vi.stubGlobal('fetch', vi.fn(async () => jawab([{ ...record, variabel: '9611' }])));
    const berubah = await (await modulSegar()).fetchSapaData();
    expect(berubah.records).toHaveLength(asli.records.length);
    expect(berubah.meta.sidik).not.toBe(asli.meta.sidik);
  });

  it('urutan balasan SPLP tidak mengubah sidik (yang diukur isi, bukan urutan)', async () => {
    const dua = [record, { ...record, id: 2 }];
    vi.stubGlobal('fetch', vi.fn(async () => jawab(dua)));
    const urut = await (await modulSegar()).fetchSapaData();
    vi.stubGlobal('fetch', vi.fn(async () => jawab([...dua].reverse())));
    const terbalik = await (await modulSegar()).fetchSapaData();
    expect(terbalik.meta.sidik).toBe(urut.meta.sidik);
  });

  it('metaKorpusTerakhir() mengembalikan meta yang sedang dipegang proses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jawab([record])));
    const mod = await modulSegar();
    expect(mod.metaKorpusTerakhir()).toBeNull();
    const hasil = await mod.fetchSapaData();
    expect(mod.metaKorpusTerakhir()).toEqual(hasil.meta);
  });

  it('SPLP gagal ⇒ melempar, dan meta tidak berubah (tidak ada versi palsu)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const mod = await modulSegar();
    await expect(mod.fetchSapaData()).rejects.toThrow(/SPLP API error 500/);
    expect(mod.metaKorpusTerakhir()).toBeNull();
  });
});

describe('SAPA_SPLP_BASE_URL — pengujian luring / pementasan', () => {
  it('alamat dasar dapat ditimpa lewat lingkungan, dan garis miring di ujung dibersihkan', async () => {
    vi.stubEnv('SAPA_SPLP_BASE_URL', 'http://127.0.0.1:9911/sapa/1.0/api/');
    const panggilan: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      panggilan.push(String(url));
      return jawab([record]);
    }));
    const mod = await modulSegar();
    await mod.fetchSapaData();
    expect(panggilan[0]).toBe('http://127.0.0.1:9911/sapa/1.0/api/daftar_data');
    vi.unstubAllEnvs();
  });
});
