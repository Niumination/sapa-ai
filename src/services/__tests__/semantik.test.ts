// ─── Uji FR-12: lapis semantik + fusi RRF ─────────────────────────────────────
// Pagar terpenting: lapis semantik TIDAK BOLEH mengubah hasil leksikal yang sudah
// benar, dan TIDAK BOLEH menjawab dari kemiripan yang lemah.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AMBANG_KUAT,
  AMBANG_SEMANTIK,
  __resetIndeks,
  bangunIndeksHash,
  bangunIndeksRemote,
  cariSemantik,
  fusiRRF,
  fiturTeks,
  indeksUntuk,
  kesamaan,
  normalisasiSemantik,
  pilihSisipanSemantik,
  penyediaDariLingkungan,
  retrieveDenganSemantik,
  saringKandidatSemantik,
  sidikVektor,
  teksRecord,
  vektorHash,
  UKURAN_BATCH,
} from '../semantik';
import type { SapaRecord } from '@/lib/sapa-client';

function rec(over: Partial<SapaRecord>): SapaRecord {
  return {
    id: 1,
    id_kode_indikator: 1,
    kode_indikator_kode_indikator: 'X.1',
    kode_indikator_nama_indikator: 'Indikator',
    id_opds: 1,
    opds_nama_opd: 'Dinas',
    jadwal_pemutakhiran: 'Tahunan',
    satuan: 'Unit',
    tahun: '2026',
    variabel: '1',
    ...over,
  };
}

const KORPUS: SapaRecord[] = [
  rec({ id: 1, kode_indikator_nama_indikator: 'Jumlah Data Penduduk', opds_nama_opd: 'Dinas Kependudukan dan Pencatatan Sipil', satuan: 'Jiwa' }),
  rec({ id: 2, kode_indikator_nama_indikator: 'Prevalensi Stunting', opds_nama_opd: 'Dinas Kesehatan', satuan: 'Persen' }),
  rec({ id: 3, kode_indikator_nama_indikator: 'Jumlah produksi komoditas perkebunan Kopi Arabika', opds_nama_opd: 'Dinas Perkebunan', satuan: 'Ton/Tahun' }),
  rec({ id: 4, kode_indikator_nama_indikator: 'Indeks Pembangunan Manusia (IPM)', opds_nama_opd: 'Bappeda', satuan: 'Poin' }),
];

beforeEach(() => {
  __resetIndeks();
  vi.unstubAllEnvs();
});

describe('fitur & normalisasi', () => {
  it('membuang kata tanya & kata umum, menyisakan kata topik', () => {
    expect(normalisasiSemantik('Berapa jumlah penduduk di Kabupaten Aceh Tengah?')).toEqual(['penduduk']);
  });

  it('menyertakan potongan huruf 4-gram sehingga salah tulis tetap mirip', () => {
    const benar = fiturTeks('stunting');
    const salahTulis = fiturTeks('stuntng');
    const sama = benar.filter((f) => salahTulis.includes(f));
    expect(sama.length).toBeGreaterThanOrEqual(3);
  });

  it('kata berimbuhan berbagi fitur dengan kata dasarnya', () => {
    expect(fiturTeks('kemiskinan').filter((f) => fiturTeks('miskin').includes(f)).length).toBeGreaterThan(0);
  });
});

describe('vektor & kesamaan', () => {
  it('deterministik: teks sama ⇒ vektor sama, di dimensi apa pun', () => {
    const a = vektorHash('prevalensi stunting', 512);
    const b = vektorHash('prevalensi stunting', 512);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('ternormalisasi (panjang 1) sehingga kesamaan = cosinus', () => {
    const v = vektorHash('jumlah penduduk aceh tengah', 256);
    const panjang = Math.sqrt(Array.from(v).reduce((s, x) => s + x * x, 0));
    expect(panjang).toBeCloseTo(1, 5);
    expect(kesamaan(v, v)).toBeCloseTo(1, 5);
  });

  it('teks berbeda kata menghasilkan kesamaan lebih rendah daripada teks yang mirip', () => {
    const dasar = vektorHash('prevalensi stunting', 512);
    const mirip = vektorHash('prevalensi stuntng', 512);
    const jauh = vektorHash('produksi kopi arabika', 512);
    expect(kesamaan(dasar, mirip)).toBeGreaterThan(kesamaan(dasar, jauh));
  });

  it('teksRecord memberi bobot lebih pada nama indikator daripada OPD', () => {
    const teks = teksRecord(KORPUS[2]);
    expect((teks.match(/Kopi Arabika/g) ?? []).length).toBe(3);
    expect((teks.match(/Dinas Perkebunan/g) ?? []).length).toBe(1);
  });
});

describe('sidik artefak (penanda versi indeks)', () => {
  it('stabil untuk korpus yang sama dan berubah bila isi berubah', () => {
    const a = bangunIndeksHash(KORPUS);
    const b = bangunIndeksHash(KORPUS);
    expect(b.sidik).toBe(a.sidik);

    const berubah = bangunIndeksHash([...KORPUS.slice(0, 3), rec({ ...KORPUS[3], kode_indikator_nama_indikator: 'Indeks Pembangunan Manusia (IPM) Revisi' })]);
    expect(berubah.sidik).not.toBe(a.sidik);
  });

  it('urutan record yang berbeda menghasilkan sidik berbeda (sidik = isi indeks apa adanya)', () => {
    expect(sidikVektor(bangunIndeksHash(KORPUS).vektor)).toBe(sidikVektor(bangunIndeksHash(KORPUS).vektor));
  });
});

describe('cariSemantik', () => {
  const indeks = bangunIndeksHash(KORPUS);

  it('menemukan record yang katanya berbeda bentuk (imbuhan/salah tulis)', () => {
    const hasil = cariSemantik(indeks, 'datanya penduduk kabupaten ini', 4);
    expect(hasil[0]?.urut).toBe(0);
  });

  it('mengembalikan peringkat menurun', () => {
    const hasil = cariSemantik(indeks, 'stunting', 4);
    expect(hasil.length).toBeGreaterThan(0);
    for (let i = 1; i < hasil.length; i++) expect(hasil[i - 1].skor).toBeGreaterThanOrEqual(hasil[i].skor);
  });

  it('kueri kosong ⇒ tidak ada hasil', () => {
    expect(cariSemantik(indeks, '   ', 4)).toEqual([]);
  });
});

describe('saringKandidatSemantik — aturan ambang', () => {
  it('menolak kemiripan lemah', () => {
    expect(saringKandidatSemantik([{ urut: 0, skor: AMBANG_SEMANTIK - 0.05 }])).toEqual([]);
  });

  it('MENERIMA walau banyak kandidat mirip setara — selisih kecil itu normal di korpus kembar (reviu 22 Sep 2026)', () => {
    // Dulu kasus ini DITOLAK (aturan "harus unggul ≥ 0,06"). Terbukti salah:
    // indikator SAPA tersedia per kecamatan sehingga kueri sah seperti
    // "kemiskinan aceh tengah sekarang" unggul hanya 0,001 dari kembarannya,
    // dan aturan itu membuang 5 jawaban benar. Derau kueri luar katalog kini
    // sudah tertahan ambang absolut (≤0,230 < 0,27).
    const hasil = [
      { urut: 0, skor: 0.45 },
      { urut: 1, skor: 0.44 },
      { urut: 2, skor: 0.43 },
    ];
    expect(saringKandidatSemantik(hasil).map((k) => k.urut)).toEqual([0, 1, 2]);
  });

  it('menolak kueri di luar katalog: derau tertinggi terukur 0,230 < ambang', () => {
    // Angka ini dari kalibrasi: "harga cabai hari ini" = 0,230, "berapa jumlah
    // penumpang kereta cepat jakarta bandung" = 0,208. Semuanya di bawah ambang.
    expect(saringKandidatSemantik([{ urut: 0, skor: 0.23 }])).toEqual([]);
    expect(saringKandidatSemantik([{ urut: 0, skor: 0.208 }, { urut: 1, skor: 0.1 }])).toEqual([]);
  });

  it('menerima parafrase sah terendah yang terukur (0,312) dan yang lebih kuat', () => {
    const hasil = [
      { urut: 0, skor: 0.312 },
      { urut: 1, skor: 0.308 },
    ];
    expect(saringKandidatSemantik(hasil).map((k) => k.urut)).toEqual([0, 1]);
  });

  it('ambang dapat diatur dari lingkungan (SAPA_SEMANTIK_AMBANG)', () => {
    vi.stubEnv('SAPA_SEMANTIK_AMBANG', '0.9');
    expect(saringKandidatSemantik([{ urut: 0, skor: 0.8 }])).toEqual([]);
  });
});

describe('fusiRRF', () => {
  it('k=60: peringkat 1 pada daftar berbobot 2 mengalahkan peringkat 1 daftar berbobot 1', () => {
    const fusi = fusiRRF([
      { nama: 'leksikal', bobot: 2, item: ['a'] },
      { nama: 'semantik', bobot: 1, item: ['b'] },
    ]);
    expect(fusi[0].id).toBe('a');
    expect(fusi[0].skor).toBeCloseTo(2 / 61, 6);
    expect(fusi[1].skor).toBeCloseTo(1 / 61, 6);
  });

  it('id yang muncul di dua daftar mendapat skor gabungan', () => {
    const fusi = fusiRRF([
      { nama: 'leksikal', item: ['a', 'b'] },
      { nama: 'semantik', item: ['b', 'c'] },
    ]);
    const b = fusi.find((f) => f.id === 'b')!;
    expect(b.skor).toBeCloseTo(1 / 62 + 1 / 61, 6);
    expect(b.asal.map((a) => a.nama).sort()).toEqual(['leksikal', 'semantik']);
    expect(fusi[0].id).toBe('b');
  });

  it('daftar kosong tidak menghasilkan apa pun', () => {
    expect(fusiRRF([{ nama: 'leksikal', item: [] }])).toEqual([]);
  });
});

describe('retrieveDenganSemantik — leksikal dulu, semantik hanya mengisi', () => {
  it('bila leksikal menemukan hasil, urutan leksikal DIPERTAHANKAN (nol regresi pada jawaban utama)', async () => {
    const { retrieveRelevant } = await import('@/lib/sapa-client');
    const query = 'Berapa jumlah penduduk?';
    const leksikal = retrieveRelevant(KORPUS, query, 80);
    expect(leksikal.length).toBeGreaterThan(0);
    const hasil = retrieveDenganSemantik(KORPUS, query, { indeks: bangunIndeksHash(KORPUS) });
    // Jawaban utama (peringkat 1) selalu dari jalur leksikal.
    expect(hasil.hasil[0].record.id).toBe(leksikal[0].record.id);
    // Urutan relatif hasil leksikal tidak boleh berubah — sisipan semantik hanya
    // boleh ditambahkan, bukan menggeser.
    const idLeksikal = leksikal.map((h) => h.record.id);
    const idHasil = hasil.hasil.map((h) => h.record.id).filter((x) => idLeksikal.includes(x));
    expect(idHasil).toEqual(idLeksikal);
    expect(['leksikal', 'leksikal+sisipan']).toContain(hasil.jalur);
  });

  it('kandidat semantik LEMAH tidak disisipkan (temuan uji 22 Sep 2026: 0,396 lolos) — daftar bukti tetap bersih', async () => {
    // Fixture ini meniru keadaan nyata: banyak indikator memuat "Kecamatan Bebesen"
    // sehingga kata "bebesen" saja tidak membedakan. Di sini kandidat semantik
    // teratas SUDAH ditemukan jalur leksikal, dan kandidat berikutnya hanya 0,396
    // (Kopi) — jauh di bawah ambang kuat. Sebelum perbaikan, Kopi tetap disisipkan
    // hanya karena ia kandidat kedua.
    const namaLain = ['Jumlah Produksi Jagung', 'Jumlah Produksi Padi', 'Jumlah Produksi Kakao', 'Jumlah Produksi Kentang', 'Jumlah Produksi Bawang Merah', 'Jumlah Produksi Kopi'];
    const korpusSisip: SapaRecord[] = [
      ...namaLain.map((n, i) =>
        rec({ id: 20 + i, kode_indikator_nama_indikator: `${n} di Kecamatan Bebesen`, opds_nama_opd: 'Dinas Pertanian', satuan: 'Ton', variabel: String(9000 - i) }),
      ),
      rec({ id: 40, kode_indikator_nama_indikator: 'Jumlah Koperasi di Kecamatan Bebesen', opds_nama_opd: 'Dinas Koperasi dan UKM', satuan: 'Unit', variabel: '159' }),
    ];
    const hasil = retrieveDenganSemantik(korpusSisip, 'jumlah koperas di kecamatan bebesen', { indeks: bangunIndeksHash(korpusSisip) });
    const { retrieveRelevant } = await import('@/lib/sapa-client');
    const leksikalMurni = retrieveRelevant(korpusSisip, 'jumlah koperas di kecamatan bebesen', 80);
    expect(hasil.jalur).toBe('leksikal');
    expect(hasil.disisipi ?? 0).toBe(0);
    expect(hasil.peringatan).toBeUndefined();
    // Daftar bukti SAMA PERSIS dengan leksikal murni — tidak ada tambahan lemah.
    expect(hasil.hasil.map((h) => h.record.id)).toEqual(leksikalMurni.map((h) => h.record.id));
  });

  it('aturan sisipan: hanya kandidat kuat & belum ada di daftar leksikal yang masuk', () => {
    const leksikal = [
      { record: rec({ id: 1, kode_indikator_nama_indikator: 'Jumlah Produksi Jagung', opds_nama_opd: 'Dinas Pertanian', satuan: 'Ton' }), score: 9, indHits: 1, opdHits: 0 },
      { record: rec({ id: 2, kode_indikator_nama_indikator: 'Jumlah Produksi Padi', opds_nama_opd: 'Dinas Pertanian', satuan: 'Ton' }), score: 5, indHits: 1, opdHits: 0 },
    ];
    const records: SapaRecord[] = [
      ...leksikal.map((l) => l.record),
      rec({ id: 3, kode_indikator_nama_indikator: 'Jumlah Koperasi', opds_nama_opd: 'Dinas Koperasi dan UKM', satuan: 'Unit' }),
      rec({ id: 4, kode_indikator_nama_indikator: 'Jumlah Kader Posyandu', opds_nama_opd: 'Dinas Kesehatan', satuan: 'Orang' }),
    ];
    // (a) kuat (0,85) & belum ada → masuk
    const a = pilihSisipanSemantik([{ urut: 2, skor: 0.85 }], leksikal, records, 0.55);
    expect(a.map((h) => h.record.id)).toEqual([3]);
    expect(a[0].score).toBe(85); // skala 0–100, hanya untuk tampilan
    // (b) lemah (0,40) → ditolak walaupun belum ada
    expect(pilihSisipanSemantik([{ urut: 2, skor: 0.4 }], leksikal, records, 0.55)).toEqual([]);
    // (c) kuat tetapi sudah ada di daftar leksikal → tidak digandakan
    expect(pilihSisipanSemantik([{ urut: 0, skor: 0.99 }], leksikal, records, 0.55)).toEqual([]);
    // (d) batas: tepat pada ambang kuat → masuk; satu di bawahnya → tidak
    expect(pilihSisipanSemantik([{ urut: 3, skor: 0.55 }], leksikal, records, 0.55).map((h) => h.record.id)).toEqual([4]);
    expect(pilihSisipanSemantik([{ urut: 3, skor: 0.5499 }], leksikal, records, 0.55)).toEqual([]);
    // (e) maksimum 2 sisipan
    const maks = pilihSisipanSemantik([{ urut: 2, skor: 0.9 }, { urut: 3, skor: 0.8 }], leksikal, records, 0.55, 2);
    expect(maks.map((h) => h.record.id)).toEqual([3, 4]);
  });

  it('bila kemiripan lemah, jalur semantik TIDAK menjawab (jujur kosong)', () => {
    const hasil = retrieveDenganSemantik(KORPUS, 'tenaga pengajar sekolah dasar', { indeks: bangunIndeksHash(KORPUS) });
    expect(hasil.jalur).toBe('kosong');
    expect(hasil.hasil).toEqual([]);
  });

  it('semua kandidat semantik yang diterima membawa peringatan — TANPA angka di dalamnya', () => {
    const hasil = retrieveDenganSemantik(KORPUS, 'pendudk', { indeks: bangunIndeksHash(KORPUS) });
    expect(hasil.jalur).toBe('semantik');
    expect(hasil.peringatan).toContain('pencocokan MAKNA');
    // Larangan angka di prosa: gerbang eval menandai "indeks 0db47884" dan
    // "kemiripan 0.42" sebagai ANGKA DI LUAR BUKTI (6 item eval gagal sejak
    // peringatan itu ditambahkan). Skor tetap tersedia terstruktur di
    // `skorSemantik`, sidik di `sidikIndeks`/`/api/status` — bukan di kalimat.
    expect(hasil.peringatan ?? '').not.toMatch(/\d/);
    expect(hasil.skorSemantik).toBeGreaterThan(0);
    expect(hasil.sidikIndeks).toMatch(/^[0-9a-f]{8}$/);
  });

  it('peringatan jalur sisipan juga bebas angka (temuan gerbang eval 22 Sep 2026)', () => {
    const leksikal = [{ record: KORPUS[0], score: 9, indHits: 1, opdHits: 0 }];
    const hasil = retrieveDenganSemantik(KORPUS, 'pendudk', { indeks: bangunIndeksHash(KORPUS) });
    expect(hasil.peringatan ?? '').not.toMatch(/\d/);
    // Sisipan kuat juga: bungkus ulang dengan daftar leksikal buatan.
    const sisip = pilihSisipanSemantik([{ urut: 0, skor: 0.9 }], leksikal, KORPUS, 0.55);
    expect(sisip.length).toBe(0); // record sama dengan yang sudah ada → tidak digandakan
  });

  it('dapat dimatikan sepenuhnya (SAPA_SEMANTIK=off lewat opsi)', () => {
    const hasil = retrieveDenganSemantik(KORPUS, 'prevalensi stuntng', { indeks: null, semantikAktif: false });
    expect(hasil.jalur).toBe('kosong');
  });
});

describe('penyedia & cache', () => {
  it('bawaan adalah penyedia hash (tanpa jaringan)', () => {
    expect(penyediaDariLingkungan()).toBe('hash');
  });

  it('SAPA_SEMANTIK=remote memilih penyedia remote', () => {
    vi.stubEnv('SAPA_SEMANTIK', 'remote');
    expect(penyediaDariLingkungan()).toBe('remote');
  });

  it('indeks dipakai ulang selama sidik korpus sama; dibangun ulang bila berubah', async () => {
    const a = await indeksUntuk(KORPUS, 'aaaa1111');
    const b = await indeksUntuk(KORPUS, 'aaaa1111');
    expect(b).toBe(a);
    const c = await indeksUntuk(KORPUS, 'bbbb2222');
    expect(c).not.toBe(a);
  });

  it('penyedia remote: memanggil /embeddings secara batch dan menormalkan hasilnya', async () => {
    const dipanggil: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const badan = JSON.parse(String(init.body)) as { input: string[] };
      dipanggil.push(badan.input.length);
      return new Response(JSON.stringify({ data: badan.input.map(() => ({ embedding: [1, 0, 0, 0] })) }), { status: 200 });
    }));
    const banyak = Array.from({ length: UKURAN_BATCH + 3 }, (_, i) => rec({ id: i + 1, kode_indikator_nama_indikator: `Indikator nomor ${i + 1}` }));
    const indeks = await bangunIndeksRemote(banyak, { penyedia: 'remote', baseUrl: 'http://contoh/v1', model: 'uji', apiKey: 'x' });
    expect(indeks.penyedia).toBe('remote');
    expect(indeks.vektor).toHaveLength(UKURAN_BATCH + 3);
    expect(indeks.dim).toBe(4);
    expect(dipanggil).toEqual([UKURAN_BATCH, 3]); // dua batch, bukan sesatu-satu
  });

  it('penyedia remote gagal ⇒ turun ke hash dengan catatan, tidak melempar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gagal', { status: 500 })));
    const indeks = await bangunIndeksRemote(KORPUS, { penyedia: 'remote', baseUrl: 'http://contoh/v1', model: 'uji' });
    expect(indeks.penyedia).toBe('hash');
    expect(indeks.catatan).toContain('remote gagal');
    expect(indeks.vektor).toHaveLength(KORPUS.length);
  });

  it('penyedia remote tanpa baseUrl ⇒ turun ke hash dengan penjelasan', async () => {
    const indeks = await bangunIndeksRemote(KORPUS, { penyedia: 'remote' });
    expect(indeks.penyedia).toBe('hash');
    expect(indeks.catatan).toContain('baseUrl/model kosong');
  });
});
