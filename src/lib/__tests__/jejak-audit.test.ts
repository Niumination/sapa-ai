// pii-gate: izinkan NIK sintetis uji — angka 16 digit di berkas ini adalah contoh uji, bukan NIK warga.
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  MAKS_PER_HARI,
  RETENSI_HARI,
  adaPenandaPribadi,
  ambilJejak,
  catatJejak,
  diLuarRetensi,
  eksporCsv,
  eksporMengandungPii,
  eksporNdjson,
  hariIni,
  hariSah,
  hariTersedia,
  jejakDariHasil,
  samarkanPribadi,
} from '@/lib/jejak-audit';
import { __clearLocalStore, cacheGet, cacheSet } from '@/lib/store';

/**
 * CMP-04 — jejak audit jawaban.
 *
 * Empat hal yang dijaga uji ini, semuanya pernah jadi sumber insiden di sistem
 * lain: (1) data pribadi TIDAK tersimpan mentah, (2) pencatatan tidak pernah
 * menggagalkan jawaban, (3) retensi benar-benar berlaku (di luar jendela ⇒ tidak
 * dibaca), (4) ekspor CSV/NDJSON aman dibuka dan tidak menyelundupkan PII.
 */

beforeEach(() => {
  __clearLocalStore();
});

describe('CMP-04 — penyamaran data pribadi', () => {
  it('NIK (padat & berkelompok), telepon, surel, dan tautan disamarkan', () => {
    const padat = samarkanPribadi('cek NIK 1234567890123456 milik warga');
    expect(padat.disamarkan).toBe(true);
    expect(padat.teks).toContain('[NIK]');
    expect(padat.teks).not.toContain('1234567890123456');

    const berkelompok = samarkanPribadi('nik 1234 5678 9012 3456 atas nama X');
    expect(berkelompok.teks).toContain('[NIK]');
    expect(berkelompok.teks).toContain('atas nama X');

    const bertitik = samarkanPribadi('nomor 1234.5678.9012.3456');
    expect(bertitik.teks).toContain('[NIK]');

    const telepon = samarkanPribadi('hubungi 081234567890 atau +62 812-3456-7890');
    expect(telepon.teks).toContain('[nomor]');
    expect(telepon.teks).not.toContain('081234567890');

    const surel = samarkanPribadi('kirim ke budi@contoh.id soal data');
    expect(surel.teks).toContain('[surel]');

    const tautan = samarkanPribadi('lihat https://contoh.id/laporan dan www.contoh.id');
    expect(tautan.teks).toContain('[tautan]');
  });

  it('angka biasa TETAP disimpan — jejak audit tanpa angka tidak berguna', () => {
    const biasa = samarkanPribadi('produksi kopi 2024 sebesar 29019 ton dari 5 kecamatan');
    expect(biasa.disamarkan).toBe(false);
    expect(biasa.teks).toContain('2024');
    expect(biasa.teks).toContain('29019');
  });

  it('daftar id bukti BUKAN NIK (positif palsu yang pernah terjadi, 24 Sep 2026)', () => {
    // Sepuluh id 4 digit berurutan pada ekspor CSV pernah dituduh "NIK berkelompok"
    // dan membuat pemeriksaan PII gagal pada data yang bersih.
    expect(adaPenandaPribadi('1411 1493 1001 1370 1176 1260 1512 1989 1333 1173')).toBe(false);
    expect(adaPenandaPribadi('1411;1493;1001;1370')).toBe(false);
    // Rentang tahun juga bukan NIK (aturan sama dengan pagar masukan).
    expect(adaPenandaPribadi('tahun 2020 2021 2022 2023')).toBe(false);
    // Tetapi NIK berkelompok yang sesungguhnya tetap tertangkap.
    expect(adaPenandaPribadi('1234 5678 9012 3456')).toBe(true);
    expect(adaPenandaPribadi('nomor 1234 5678 9012 3456 atas nama X')).toBe(true);
    // Dan ekspor jejak dengan id 4 digit tidak lagi dianggap memuat PII.
    const idEmpatDigit = {
      waktu: '2026-09-24T05:00:00.000Z',
      kueri: 'berapa jumlah penduduk kecamatan Bebesen',
      piiDisamarkan: false,
      niat: 'nilai_saat_ini',
      mode: 'deterministik' as const,
      jumlahBukti: 10,
      idBukti: ['1411', '1493', '1001', '1370', '1176', '1260', '1512', '1989', '1333', '1173'],
      gerbang: { ok: true, keras: 0, lunak: 0 },
      sebab: 'selesai:leksikal',
      status: 'menjawab',
      aiUsed: false,
      grounded: 'skipped',
      durasiMs: 260,
    };
    expect(eksporMengandungPii(eksporCsv([idEmpatDigit]))).toBe(false);
    expect(eksporCsv([idEmpatDigit])).toContain('1411;1493;1001;1370');
  });

  it('pemeriksa penanda pribadi mengenali bentuk-bentuk berbahaya (dan tidak salah tuduh)', () => {
    expect(adaPenandaPribadi('1234567890123456')).toBe(true);
    expect(adaPenandaPribadi('1234 5678 9012 3456')).toBe(true);
    expect(adaPenandaPribadi('081234567890')).toBe(true);
    expect(adaPenandaPribadi('budi@contoh.id')).toBe(true);
    expect(adaPenandaPribadi('https://contoh.id')).toBe(true);
    expect(adaPenandaPribadi('produksi kopi 29.019 ton tahun 2024')).toBe(false);
    expect(adaPenandaPribadi('jumlah penduduk 123.456 jiwa')).toBe(false);
  });
});

describe('CMP-04 — pencatatan & pembacaan', () => {
  it('mencatat jejak lengkap: pertanyaan tersamar, bukti, gerbang, sebab, status', async () => {
    const hasil = await catatJejak({
      kueri: 'cek NIK 1234567890123456 dan jumlah penduduk',
      niat: 'nilai_saat_ini',
      mode: 'ditolak-pagar',
      jumlahBukti: 0,
      idBukti: [],
      gerbang: { ok: true, keras: 0, lunak: 0 },
      sebab: 'masukan:data-personal',
      status: 'ditolak',
      aiUsed: false,
      grounded: 'skipped',
      durasiMs: 12.7,
    });
    expect(hasil.tersimpan).toBe(true);

    const ringkas = await ambilJejak(hasil.hari);
    expect(ringkas.jumlah).toBe(1);
    expect(ringkas.piiDisamarkan).toBe(1);
    const j = ringkas.item[0];
    expect(j.kueri).toContain('[NIK]');
    expect(j.kueri).toContain('jumlah penduduk');
    expect(j.sebab).toBe('masukan:data-personal');
    expect(j.status).toBe('ditolak');
    expect(j.durasiMs).toBe(13);
    expect(ringkas.perStatus.ditolak).toBe(1);
    // Tidak boleh ada 16 digit tersimpan di mana pun.
    expect(JSON.stringify(ringkas.item)).not.toMatch(/\d{16}/);
  });

  it('urutan terbaru di depan dan id bukti dibatasi 10', async () => {
    await catatJejak({ kueri: 'pertama', mode: 'deterministik', sebab: 'selesai:leksikal', idBukti: Array.from({ length: 15 }, (_, i) => `e${i}`) });
    await catatJejak({ kueri: 'kedua', mode: 'deterministik', sebab: 'selesai:leksikal' });
    const ringkas = await ambilJejak();
    expect(ringkas.item[0].kueri).toBe('kedua');
    expect(ringkas.item[1].kueri).toBe('pertama');
    expect(ringkas.item[1].idBukti.length).toBe(10);
    expect(ringkas.item[1].jumlahBukti).toBe(15);
  });

  it('penuh ⇒ menolak dengan alasan "penuh" dan menghitung yang dilewati (jujur, bukan diam)', async () => {
    const hari = hariIni();
    const palsu = Array.from({ length: MAKS_PER_HARI }, () => ({
      waktu: new Date().toISOString(),
      kueri: 'x',
      piiDisamarkan: false,
      niat: null,
      mode: 'deterministik',
      jumlahBukti: 0,
      idBukti: [],
      gerbang: null,
      sebab: 'selesai:leksikal',
      status: 'menjawab',
      aiUsed: false,
      grounded: 'skipped',
      durasiMs: 1,
    }));
    await cacheSet(`audit:v1:${hari}`, palsu, 1000);
    const hasil = await catatJejak({ kueri: 'satu lagi', mode: 'deterministik', sebab: 'selesai:leksikal' });
    expect(hasil.tersimpan).toBe(false);
    expect(hasil.alasan).toBe('penuh');
    const ringkas = await ambilJejak(hari);
    expect(ringkas.jumlah).toBe(MAKS_PER_HARI);
    expect(ringkas.dilewati).toBe(1);
  });

  it('retensi: di luar jendela ⇒ tidak dibaca sama sekali & ditandai', async () => {
    const lama = new Date(Date.now() - (RETENSI_HARI + 10) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await cacheSet(`audit:v1:${lama}`, [{ kueri: 'lama' }], 1000);
    const ringkas = await ambilJejak(lama);
    expect(ringkas.item).toEqual([]);
    expect(ringkas.diluarRetensi).toBe(true);
    expect(diLuarRetensi(lama)).toBe(true);
    expect(diLuarRetensi(hariIni())).toBe(false);
    const daftar = hariTersedia();
    expect(daftar.length).toBe(RETENSI_HARI);
    expect(daftar[0]).toBe(hariIni());
    expect(daftar).not.toContain(lama);
    expect(hariSah('2026-09-24')).toBe(true);
    expect(hariSah('24-09-2026')).toBe(false);
  });

  it('jejakDariHasil memetakan jawaban ke mode yang benar (satu pintu untuk JSON & SSE)', () => {
    const dasar = { evidence: [{ id: 'e1' }], diagnosa: { sebab: 'selesai:leksikal', status: 'menjawab' }, ai: { used: false, grounded: 'skipped', intent: 'tren' } };
    expect(jejakDariHasil({ query: 'q', hasil: dasar }).mode).toBe('deterministik');
    expect(jejakDariHasil({ query: 'q', hasil: { ...dasar, ai: { used: true, grounded: 'pass', intent: 'tren' } } }).mode).toBe('ai');
    expect(jejakDariHasil({ query: 'q', hasil: { evidence: [], diagnosa: { sebab: 'retrieval:konsep-asing', status: 'jujur-kosong' }, ai: { used: false } } }).mode).toBe('tanpa-bukti');
    expect(jejakDariHasil({ query: 'q', hasil: { evidence: [], diagnosa: { sebab: 'masukan:data-personal', status: 'ditolak' }, ai: { used: false } } }).mode).toBe('ditolak-pagar');
    expect(jejakDariHasil({ query: 'q', hasil: { evidence: [], diagnosa: { sebab: 'masukan:permintaan-sistem', status: 'ditolak' }, ai: { used: false } } }).mode).toBe('ditolak-pagar');
    expect(jejakDariHasil({ query: 'q', hasil: dasar }).niat).toBe('tren');
  });
});

describe('CMP-04 — ekspor', () => {
  const contoh = [
    {
      waktu: '2026-09-24T05:00:00.000Z',
      kueri: 'produksi kopi, "arabika" 2024',
      piiDisamarkan: false,
      niat: 'nilai_saat_ini',
      mode: 'deterministik' as const,
      jumlahBukti: 15,
      idBukti: ['e1', 'e2'],
      gerbang: { ok: true, keras: 0, lunak: 1 },
      sebab: 'selesai:leksikal',
      status: 'menjawab',
      aiUsed: false,
      grounded: 'skipped',
      durasiMs: 120,
    },
  ];

  it('CSV memuat baris kepala, mengutip nilai bertanda khusus, dan sebaris per catatan', () => {
    const csv = eksporCsv(contoh);
    const baris = csv.trim().split('\n');
    expect(baris.length).toBe(2);
    expect(baris[0]).toContain('waktu,kueri,piiDisamarkan,niat,mode,jumlahBukti,idBukti,gerbang,sebab,status,aiUsed,grounded,durasiMs');
    // Nilai dengan koma & kutip ganda harus dikutip dan kutipnya digandakan.
    expect(baris[1]).toContain('"produksi kopi, ""arabika"" 2024"');
    expect(baris[1]).toContain('keras=0;lunak=1;ok=true');
  });

  it('NDJSON: satu catatan per baris dan dapat diuraikan kembali', () => {
    const nd = eksporNdjson(contoh).trim().split('\n');
    expect(nd.length).toBe(1);
    expect(JSON.parse(nd[0]).kueri).toContain('arabika');
    expect(eksporNdjson([])).toBe('');
  });

  it('jaring terakhir: ekspor yang memuat pola PII tertangkap pemeriksa', () => {
    expect(eksporMengandungPii(eksporCsv(contoh))).toBe(false);
    const bocor = [{ ...contoh[0], kueri: 'nik 1234567890123456' }];
    expect(eksporMengandungPii(eksporCsv(bocor))).toBe(true);
    expect(eksporMengandungPii(eksporNdjson(bocor))).toBe(true);
  });
});

describe('CMP-04 — pencatatan tidak pernah menggagalkan jawaban (fail-open)', () => {
  it('penyimpanan bermasalah ⇒ catatJejak selesai dengan alasan "gagal", tidak melempar', async () => {
    const store = await import('@/lib/store');
    const asli = store.cacheGet;
    const spy = vi.spyOn(store, 'cacheGet').mockRejectedValueOnce(new Error('penyimpanan mati'));
    const hasil = await catatJejak({ kueri: 'berapa jumlah penduduk', mode: 'deterministik', sebab: 'selesai:leksikal' });
    expect(hasil.tersimpan).toBe(false);
    expect(hasil.alasan).toBe('gagal');
    spy.mockRestore();
    expect(typeof asli).toBe('function');
    // Dan setelah penyimpanan sehat kembali, pencatatan berjalan normal.
    const lagi = await catatJejak({ kueri: 'berapa jumlah penduduk', mode: 'deterministik', sebab: 'selesai:leksikal' });
    expect(lagi.tersimpan).toBe(true);
    expect((await cacheGet<unknown[]>(`audit:v1:${lagi.hari}`))?.length).toBe(1);
  });
});
