// ─── Retrieval: skor berbobot kelangkaan kata (reviu 2026-09-04) ───
// Buktikan kata langka ("miskin") lebih menentukan topik daripada kata umum
// ("penduduk"). Tanpa pembobotan, "Jumlah penduduk miskin?" selalu kalah ke
// "Jumlah Data Penduduk" — dua-duanya cocok satu kata, lalu pemutus seri
// memilih nilai terbesar.

import { describe, it, expect } from 'vitest';
import { retrieveRelevant, tokenizeQuery, konsepTidakDikenal, konsepTakTermuat, normalkanSingkatan, granularitasTidakTersedia } from '../sapa-client';
import type { SapaRecord } from '../sapa-client';

const KORPUS: SapaRecord[] = [
  { id: 1, id_kode_indikator: 11, kode_indikator_kode_indikator: 'a', kode_indikator_nama_indikator: 'Jumlah Data Penduduk', id_opds: 1, opds_nama_opd: 'Dinas Kependudukan dan Pencatatan Sipil', jadwal_pemutakhiran: 'Tahunan', satuan: 'Jiwa', tahun: null, variabel: '236866' },
  { id: 2, id_kode_indikator: 12, kode_indikator_kode_indikator: 'b', kode_indikator_nama_indikator: 'tingkat Kemiskinan', id_opds: 2, opds_nama_opd: 'Badan Perencanaan Pembangunan Daerah', jadwal_pemutakhiran: 'Tahunan', satuan: 'Persen', tahun: '2025', variabel: '12,29' },
  { id: 3, id_kode_indikator: 13, kode_indikator_kode_indikator: 'c', kode_indikator_nama_indikator: 'Jumlah Penduduk Usia 7-12 Tahun', id_opds: 3, opds_nama_opd: 'Dinas Pendidikan dan Kebudayaan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Orang', tahun: '2026', variabel: '19.686' },
];

describe('retrieveRelevant — skor berbobot kelangkaan kata', () => {
  it('"penduduk miskin" menang untuk kemiskinan, bukan penduduk bernilai besar', () => {
    const hits = retrieveRelevant(KORPUS, 'Jumlah penduduk miskin?');
    expect(hits[0]?.record.kode_indikator_nama_indikator).toBe('tingkat Kemiskinan');
  });

  it('tanda tanya di akhir kalimat tidak mematikan pencarian', () => {
    expect(retrieveRelevant(KORPUS, 'berapa jumlah penduduk?').length).toBeGreaterThan(0);
  });

  it('kata pengisi tidak mengosongkan hasil', () => {
    expect(retrieveRelevant(KORPUS, 'Berapa sih total penduduk miskin di tiap wilayah?').length).toBeGreaterThan(0);
  });
});

// ─── Penjaga granularitas: satu sumber untuk penjaga & diagnostik (FR-20) ────
// Bahaya nyata yang dicegah uji ini: penjaga di `retrieveRelevant` dan sinyal
// diagnostik dihitung dengan aturan berbeda, sehingga jawaban kosong diberi tag
// "granularitas" padahal yang menyala adalah penjaga lain — atau sebaliknya.
describe('granularitasTidakTersedia — sepakat dengan perilaku retrieveRelevant', () => {
  const KORPUS_DESA: SapaRecord[] = [
    { id: 1, id_kode_indikator: 11, kode_indikator_kode_indikator: 'a', kode_indikator_nama_indikator: 'Jumlah Koperasi di Kecamatan Bebesen', id_opds: 1, opds_nama_opd: 'Dinas Koperasi dan UKM', jadwal_pemutakhiran: 'Tahunan', satuan: 'Unit', tahun: '2026', variabel: '159' },
    { id: 2, id_kode_indikator: 12, kode_indikator_kode_indikator: 'b', kode_indikator_nama_indikator: 'Jumlah Data Penduduk di Kecamatan Bebesen', id_opds: 2, opds_nama_opd: 'Dinas Kependudukan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Jiwa', tahun: '2026', variabel: '39000' },
  ];

  it('menyala: nama kecamatan ada, rincian per desa tidak ada ⇒ retrieval kosong', () => {
    const q = 'Berapa jumlah keluarga per desa di Kecamatan Bebesen?';
    expect(granularitasTidakTersedia(KORPUS_DESA, q)).toBe(true);
    expect(retrieveRelevant(KORPUS_DESA, q)).toHaveLength(0);
  });

  it('padam bila katalog memuat gabungan nama kecamatan + kata desa', () => {
    const korpus = [
      ...KORPUS_DESA,
      { id: 3, id_kode_indikator: 13, kode_indikator_kode_indikator: 'c', kode_indikator_nama_indikator: 'Jumlah Desa di Kecamatan Bebesen', id_opds: 3, opds_nama_opd: 'Dinas Pemberdayaan Masyarakat', jadwal_pemutakhiran: 'Tahunan', satuan: 'Desa', tahun: '2026', variabel: '18' },
    ];
    const q = 'Berapa jumlah desa per desa di Kecamatan Bebesen?';
    expect(granularitasTidakTersedia(korpus, q)).toBe(false);
    expect(retrieveRelevant(korpus, q).length).toBeGreaterThan(0);
  });

  it('padam bila kueri tidak meminta rincian per desa', () => {
    expect(granularitasTidakTersedia(KORPUS_DESA, 'Jumlah koperasi di Kecamatan Bebesen')).toBe(false);
  });

  it('tetap menyala untuk nama tempat yang tidak ada di katalog (perilaku lama, sengaja tidak diubah)', () => {
    // Kata generik "kecamatan" pun terhitung sebagai kandidat tempat selama df-nya
    // kecil, jadi penjaga ini tetap menyala. Itu AMAN: hasilnya kosong, dan
    // memang tidak ada data per desa. Yang memilih tag yang lebih menolong
    // operator adalah pengklasifikasi FR-20 — ia mendahulukan "konsep asing"
    // (memperbaiki kata kunci jauh lebih murah daripada menambah data per desa).
    expect(granularitasTidakTersedia(KORPUS_DESA, 'Berapa jumlah keluarga per desa di Kecamatan Tanah Rencong?')).toBe(true);
    expect(retrieveRelevant(KORPUS_DESA, 'Berapa jumlah keluarga per desa di Kecamatan Tanah Rencong?')).toHaveLength(0);
  });
});

// ─── Leksikon istilah resmi & pengisi kalimat (uji parafrase FR-12, 22 Sep 2026) ───
// Dua kueri parafrase yang SEMULA ditolak penjaga konsep-asing, bukan karena data
// tidak ada. Sebabnya dua: (a) istilah pemerintahan ditulis lengkap sementara
// katalog memakai akronim; (b) kata tanya pengukur & kata kerja predikat selalu
// ber-df 0 sehingga memaksa gerbang "2 kecocokan" yang tak mungkin dipenuhi.
describe('retrieveRelevant — leksikon frasa istilah resmi', () => {
  const KORPUS_ISTILAH: SapaRecord[] = [
    { id: 1, id_kode_indikator: 11, kode_indikator_kode_indikator: 'a', kode_indikator_nama_indikator: 'Jumlah ASN', id_opds: 1, opds_nama_opd: 'Badan Kepegawaian Daerah', jadwal_pemutakhiran: 'Tahunan', satuan: 'Orang', tahun: '2026', variabel: '9610' },
    { id: 2, id_kode_indikator: 12, kode_indikator_kode_indikator: 'b', kode_indikator_nama_indikator: 'Indeks Pembangunan Manusia (IPM)', id_opds: 2, opds_nama_opd: 'Badan Perencanaan Pembangunan Daerah', jadwal_pemutakhiran: 'Tahunan', satuan: 'Poin', tahun: '2025', variabel: '78,09' },
    { id: 3, id_kode_indikator: 13, kode_indikator_kode_indikator: 'c', kode_indikator_nama_indikator: 'Jumlah Balita Stunting', id_opds: 3, opds_nama_opd: 'Dinas Kesehatan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Balita', tahun: '2025', variabel: '730' },
  ];

  it('"aparatur sipil negara" (UU 5/2014) menemukan indikator ASN yang ditulis akronim', () => {
    expect(tokenizeQuery('Berapa banyak aparatur sipil negara?')).toEqual(['asn']);
    const hits = retrieveRelevant(KORPUS_ISTILAH, 'Berapa banyak aparatur sipil negara?');
    expect(hits[0]?.record.kode_indikator_nama_indikator).toBe('Jumlah ASN');
  });

  it('"indeks pembangunan manusia" (BPS) menemukan indikator IPM', () => {
    expect(tokenizeQuery('Berapa indeks pembangunan manusia?')).toEqual(['ipm']);
    expect(retrieveRelevant(KORPUS_ISTILAH, 'Berapa indeks pembangunan manusia?')[0]?.record.kode_indikator_nama_indikator).toMatch(/IPM/);
  });

  it('kata tanya pengukur & kata kerja predikat dibuang, topiknya tetap terbaca', () => {
    // "seberapa" + "mengalami" selalu ber-df 0; tanpa dibuang, kueri ini ditolak.
    expect(tokenizeQuery('Seberapa banyak anak yang mengalami tengkes?')).toEqual(['anak', 'stunting']);
    expect(retrieveRelevant(KORPUS_ISTILAH, 'Seberapa banyak anak yang mengalami tengkes?')[0]?.record.kode_indikator_nama_indikator).toBe('Jumlah Balita Stunting');
  });

  it('"anak" (kata warga) menemukan indikator yang menulis "Balita"', () => {
    expect(tokenizeQuery('jumlah anak stunting')).toEqual(['anak', 'stunting']);
    expect(retrieveRelevant(KORPUS_ISTILAH, 'jumlah anak stunting').length).toBeGreaterThan(0);
  });
});

// ─── Penjaga kejujuran (reviu 2026-09-04) ───
// Bila pertanyaan menyinggung konsep yang TIDAK PERNAH tercatat di SAPA
// (df = 0) dan kandidat terbaik hanya cocok satu konsep, yang tampil pasti
// data lain yang kebetulan mirip. Lebih baik mengaku tidak punya data.
describe('retrieveRelevant — penjaga kejujuran', () => {
  const KORPUS_MINI: SapaRecord[] = [
    { id: 1, id_kode_indikator: 11, kode_indikator_kode_indikator: 'a', kode_indikator_nama_indikator: 'Jumlah Panjang Jalan Kabupaten', id_opds: 1, opds_nama_opd: 'Dinas Pekerjaan Umum', jadwal_pemutakhiran: 'Tahunan', satuan: 'Km', tahun: '2025', variabel: '2.156,28' },
    { id: 2, id_kode_indikator: 12, kode_indikator_kode_indikator: 'b', kode_indikator_nama_indikator: 'Jumlah Koperasi di Kecamatan Bebesen', id_opds: 2, opds_nama_opd: 'Dinas Koperasi dan UKM', jadwal_pemutakhiran: 'Tahunan', satuan: 'Unit', tahun: '2026', variabel: '159' },
  ];

  it('menolak menjawab bila konsep inti tidak ada dan yang cocok cuma satu', () => {
    // "drainase" tidak ada di korpus mini; yang cocok hanya "jalan" →
    // yang akan tampil adalah data jalan, padahal yang ditanya drainase.
    expect(retrieveRelevant(KORPUS_MINI, 'Berapa drainase jalan?')).toHaveLength(0);
  });

  it('tetap menjawab bila dua konsep cocok meski ada kata yang tidak dikenal', () => {
    // "panjang" dan "jalan" berdua ada di korpus → layak dijawab.
    expect(retrieveRelevant(KORPUS_MINI, 'Berapa panjang drainase jalan?').length).toBeGreaterThan(0);
  });

  it('tetap menjawab bila konsep yang diminta benar-benar ada', () => {
    expect(retrieveRelevant(KORPUS_MINI, 'Jumlah koperasi di kecamatan Bebesen').length).toBeGreaterThan(0);
  });

  it('konsepTidakDikenal menyebut kata yang tidak ada di korpus', () => {
    expect(konsepTidakDikenal(KORPUS_MINI, 'Berapa drainase jalan?')).toContain('drainase');
    expect(konsepTidakDikenal(KORPUS_MINI, 'Jumlah koperasi di kecamatan Bebesen')).toEqual([]);
  });
});

// ─── Peringatan kecocokan parsial (reviu 2026-09-04) ───
// Yang diperingatkan hanya kata TOPIK yang tidak ikut termuat. Kata maksud
// (superlatif, pengelompokan, hubungan) tidak diperingatkan: tidak adanya
// kata "terbanyak" di nama indikator bukan berarti datanya tidak ada.
describe('konsepTakTermuat', () => {
  const KORPUS_MAKSUD: SapaRecord[] = [
    { id: 1, id_kode_indikator: 21, kode_indikator_kode_indikator: 'x', kode_indikator_nama_indikator: 'Jumlah Koperasi di Kecamatan Bebesen', id_opds: 2, opds_nama_opd: 'Dinas Koperasi dan UKM', jadwal_pemutakhiran: 'Tahunan', satuan: 'Unit', tahun: '2026', variabel: '159' },
    { id: 2, id_kode_indikator: 22, kode_indikator_kode_indikator: 'y', kode_indikator_nama_indikator: 'Koperasi dengan anggota terbanyak', id_opds: 2, opds_nama_opd: 'Dinas Koperasi dan UKM', jadwal_pemutakhiran: 'Tahunan', satuan: 'Unit', tahun: '2026', variabel: '12' },
  ];

  it('tidak mempersoalkan kata maksud seperti "terbanyak"', () => {
    const terbaik = KORPUS_MAKSUD[0];
    expect(konsepTakTermuat(KORPUS_MAKSUD, terbaik, 'Tiga kecamatan dengan jumlah koperasi terbanyak')).toEqual([]);
  });

  it('tetap mempersoalkan kata topik yang tidak ikut termuat', () => {
    // "keluarga" ada di korpus ini (lewat record lain), tetapi tidak termuat
    // pada record terbaik → memang tidak ada data keluarga per kecamatan.
    const korpus: SapaRecord[] = [
      ...KORPUS_MAKSUD,
      { id: 3, id_kode_indikator: 23, kode_indikator_kode_indikator: 'z', kode_indikator_nama_indikator: 'Jumlah keluarga berencana aktif', id_opds: 4, opds_nama_opd: 'Dinas Keluarga Berencana PPPA', jadwal_pemutakhiran: 'Tahunan', satuan: 'KK', tahun: '2026', variabel: '5000' },
    ];
    const terbaik = korpus[0];
    expect(konsepTakTermuat(korpus, terbaik, 'Jumlah keluarga di kecamatan Bebesen')).toContain('keluarga');
  });
});

// ─── Normalisasi singkatan & bahasa tidak baku (usulan audit 2026-09-21) ───
// Bukti produksi: "brp jmlh pddk Aceh Tengah 2025" → 0 bukti & jawaban menolak,
// padahal "Jumlah Data Penduduk" ada di katalog. Penyebabnya terukur: setiap
// singkatan ber-df = 0 sehingga penjaga konsep-asing menyala palsu.

describe('tokenizeQuery — normalisasi singkatan', () => {
  it('singkatan penduduk/jumlah/berapa → bentuk baku', () => {
    const t = tokenizeQuery('brp jmlh pddk Aceh Tengah 2025');
    expect(t).toContain('penduduk');
    expect(t).not.toContain('pddk');
    expect(t).not.toContain('jmlh');
  });

  it('kata singkat 2 huruf ikut dipetakan sebelum filter panjang', () => {
    const t = tokenizeQuery('yg tdk ada data stunting');
    expect(t).toContain('stunting');
    expect(t).not.toContain('yg');
  });

  it('sinonim awam "tengkes" → stunting (menutup gerbang konsep-asing)', () => {
    expect(tokenizeQuery('Berapa banyak anak balita tengkes?')).toContain('stunting');
  });

  it('frasa "hidup di bawah garis kemiskinan" menyisakan kata topik', () => {
    const t = tokenizeQuery('berapa warga yang hidup di bawah garis kemiskinan');
    expect(t).toContain('kemiskinan');
    expect(t).not.toContain('hidup');
    expect(t).not.toContain('bawah');
  });

  it('normalkanSingkatan mendukung pemetaan multi-kata', () => {
    expect(normalkanSingkatan('dinkes')).toEqual(['kesehatan']);
    expect(normalkanSingkatan('hdi')).toEqual(['indeks', 'pembangunan', 'manusia']);
    expect(normalkanSingkatan('koperasi')).toEqual(['koperasi']);
  });
});

describe('retrieveRelevant — sinonim awam menemukan indikator yang benar', () => {
  const KORPUS_STUNTING: SapaRecord[] = [
    { id: 1, id_kode_indikator: 11, kode_indikator_kode_indikator: 'a', kode_indikator_nama_indikator: 'Jumlah penerima paket pemeriksaan kesehatan gratis kelompok usia balita dan anak usia pra sekolah', id_opds: 1, opds_nama_opd: 'Dinas Kesehatan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Orang', tahun: '2025', variabel: '16936' },
    { id: 2, id_kode_indikator: 12, kode_indikator_kode_indikator: 'b', kode_indikator_nama_indikator: 'Jumlah anak balita yang mengalami stunting (JAB(5) P stunting)', id_opds: 1, opds_nama_opd: 'Dinas Kesehatan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Orang', tahun: '2025', variabel: '730' },
    { id: 3, id_kode_indikator: 13, kode_indikator_kode_indikator: 'c', kode_indikator_nama_indikator: 'Prevalensi Stunting', id_opds: 2, opds_nama_opd: 'Badan Perencanaan Pembangunan Daerah', jadwal_pemutakhiran: 'Tahunan', satuan: 'Persen', tahun: '2025', variabel: '31,4' },
  ];

  it('"tengkes" kini menemukan indikator stunting, bukan indikator "balita" umum', () => {
    const hits = retrieveRelevant(KORPUS_STUNTING, 'Berapa banyak anak balita tengkes di Aceh Tengah?');
    expect(hits.length).toBeGreaterThan(0);
    expect((hits[0]?.record.kode_indikator_nama_indikator ?? '').toLowerCase()).toContain('stunting');
  });

  it('"tengkes" tidak lagi dianggap konsep asing (df > 0 setelah pemetaan)', () => {
    const hits = retrieveRelevant(KORPUS_STUNTING, 'jumlah balita tengkes');
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('rentang tahun pada pertanyaan tren (reviu 2026-09-21)', () => {
  const korpus: SapaRecord[] = [
    { id: 1, id_kode_indikator: 11, kode_indikator_kode_indikator: 'a', kode_indikator_nama_indikator: 'Prevalensi Stunting', id_opds: 2, opds_nama_opd: 'Bappeda', jadwal_pemutakhiran: 'Tahunan', satuan: 'Persen', tahun: '2025', variabel: '31,4' },
    { id: 2, id_kode_indikator: 12, kode_indikator_kode_indikator: 'b', kode_indikator_nama_indikator: 'Jumlah anak balita yang mengalami stunting', id_opds: 1, opds_nama_opd: 'Dinas Kesehatan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Orang', tahun: '2025', variabel: '730' },
  ];

  it('token rentang tahun tidak lagi membuat retrieval kosong', () => {
    const hits = retrieveRelevant(korpus, 'Bagaimana tren stunting 2023-2025?');
    expect(hits.length).toBeGreaterThan(0);
    expect((hits[0]?.record.kode_indikator_nama_indikator ?? '').toLowerCase()).toContain('stunting');
  });

  it('rentang tahun tidak dianggap konsep asing', () => {
    expect(konsepTidakDikenal(korpus, 'tren stunting 2023-2025')).toEqual([]);
  });

  it('angka desimal Indonesia pada kueri juga dibuang dari token', () => {
    expect(tokenizeQuery('prevalensi stunting 31,4 persen')).toEqual(['prevalensi', 'stunting']);
  });
});

// ─── Aturan entitas-wajib & kejujuran granularitas (butir 1.1b peta jalan) ───
// Terukur pada eval 78 item (21 Sep 2026): item C9 semula dijawab "target INM"
// padahal pengguna bertanya IPM; item D5 dijawab data kader KB padahal pengguna
// meminta rincian per desa. Keduanya = menyesatkan, bukan menjawab.
describe('retrieveRelevant — entitas langka wajib termuat', () => {
  // Korpus mini ini meniru RASIO korpus nyata: "target"/"nasional" adalah kata
  // umum (df besar) yang muncul di banyak indikator capaian, sedangkan "IPM"
  // hanya ada di satu record. Tanpa peniru rasio ini, uji akan menuntut
  // perilaku yang salah.
  const filler = (n: number): SapaRecord => ({
    id: 100 + n, id_kode_indikator: 900 + n, kode_indikator_kode_indikator: `f${n}`,
    kode_indikator_nama_indikator: `Persentase capaian target nasional program ${n}`,
    id_opds: 9, opds_nama_opd: 'Sekretariat Daerah', jadwal_pemutakhiran: 'Tahunan',
    satuan: 'Persen', tahun: '2025', variabel: String(60 + n),
  });
  const KORPUS_ENTITAS: SapaRecord[] = [
    { id: 1, id_kode_indikator: 11, kode_indikator_kode_indikator: 'a', kode_indikator_nama_indikator: 'Persentase puskesmas yang mencapai target INM (Indeks Nasional)', id_opds: 1, opds_nama_opd: 'Dinas Kesehatan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Persen', tahun: '2025', variabel: '78' },
    { id: 2, id_kode_indikator: 12, kode_indikator_kode_indikator: 'b', kode_indikator_nama_indikator: 'Indeks Pembangunan Manusia (IPM)', id_opds: 2, opds_nama_opd: 'Badan Perencanaan Pembangunan Daerah', jadwal_pemutakhiran: 'Tahunan', satuan: 'Poin', tahun: '2025', variabel: '78,09' },
    ...Array.from({ length: 5 }, (_, n) => filler(n + 1)),
  ];

  it('"IPM" (df=1) tidak boleh tersapu oleh kata umum "target"/"nasional" (df=6)', () => {
    const hits = retrieveRelevant(KORPUS_ENTITAS, 'Bandingkan IPM Aceh Tengah dengan target nasional');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].record.kode_indikator_nama_indikator).toContain('Indeks Pembangunan Manusia');
  });

  it('entitas diutamakan, tetapi hasil lain TIDAK dibuang (bukti tetap lengkap)', () => {
    // Pelajaran versi pertama: menyaring hasil dengan entitas malah membuang
    // jawaban benar (T9 sembako, P7 stunting, D4 PPKS). Kontrak yang benar:
    // entitas dinaikkan ke urutan atas, sisanya tetap tersedia.
    const hits = retrieveRelevant(KORPUS_ENTITAS, 'Bandingkan IPM Aceh Tengah dengan target nasional');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0].record.kode_indikator_nama_indikator).toContain('Indeks Pembangunan Manusia');
    expect(
      hits.some((h) => !(h.record.kode_indikator_nama_indikator ?? '').toLowerCase().includes('ipm')),
    ).toBe(true);
  });

  it('pertanyaan tanpa entitas langka tidak terpengaruh aturan ini', () => {
    // "target"/"nasional" di sini kata umum (df=6) → tidak ada entitas-wajib,
    // sehingga hasil tetap seperti biasa (bukan kosong karena aturan baru).
    const hits = retrieveRelevant(KORPUS_ENTITAS, 'Berapa persentase capaian target nasional');
    expect(hits.length).toBeGreaterThan(0);
    // Tidak ada penyaringan entitas: hasil boleh memuat record tanpa "IPM".
    expect(
      hits.some((h) => !(h.record.kode_indikator_nama_indikator ?? '').toLowerCase().includes('ipm')),
    ).toBe(true);
  });
});

describe('retrieveRelevant — kejujuran granularitas per desa', () => {
  const KORPUS_DESA: SapaRecord[] = [
    { id: 1, id_kode_indikator: 21, kode_indikator_kode_indikator: 'c', kode_indikator_nama_indikator: 'Jumlah UMKM Di Kecamatan Bebesen', id_opds: 3, opds_nama_opd: 'Dinas Koperasi dan UKM', jadwal_pemutakhiran: 'Tahunan', satuan: 'Unit', tahun: '2025', variabel: '831' },
    { id: 2, id_kode_indikator: 22, kode_indikator_kode_indikator: 'd', kode_indikator_nama_indikator: 'Jumlah Kader Pada Rumah Data Kependudukan', id_opds: 3, opds_nama_opd: 'Dinas Koperasi dan UKM', jadwal_pemutakhiran: 'Tahunan', satuan: 'Orang', tahun: '2025', variabel: '1463' },
  ];

  it('rincian per desa di kecamatan bernama yang tak punya data desa ⇒ kosong', () => {
    const hits = retrieveRelevant(KORPUS_DESA, 'Bagaimana persebaran jumlah keluarga per desa di Kecamatan Bebesen?');
    expect(hits).toEqual([]);
  });

  it('rincian per desa TETAP dijawab bila korpus memang punya record desa-nya', () => {
    const KORPUS_ADA: SapaRecord[] = [
      ...KORPUS_DESA,
      { id: 3, id_kode_indikator: 23, kode_indikator_kode_indikator: 'e', kode_indikator_nama_indikator: 'Jumlah Keluarga Desa Bebesen', id_opds: 3, opds_nama_opd: 'Dinas Sosial', jadwal_pemutakhiran: 'Tahunan', satuan: 'Keluarga', tahun: '2025', variabel: '1200' },
    ];
    const hits = retrieveRelevant(KORPUS_ADA, 'Bagaimana persebaran jumlah keluarga per desa di Kecamatan Bebesen?');
    expect(hits.length).toBeGreaterThan(0);
  });
});

// ─── Preferensi satuan fisik (reviu 22 Sep 2026, item eval F4) ───
// "Berapa ton kopi yang dihasilkan petani?" tidak boleh dijawab JUMLAH PETANI
// (satuan KK) ketika katalog memuat volume panen (satuan Ton) — yang ditanya
// kuantitas dalam ton.
describe('retrieveRelevant — satuan fisik yang diminta diutamakan', () => {
  const KORPUS_TON: SapaRecord[] = [
    { id: 1, id_kode_indikator: 31, kode_indikator_kode_indikator: 'a', kode_indikator_nama_indikator: 'Jumlah petani komoditas perkebunan Kopi Arabika', id_opds: 1, opds_nama_opd: 'Dinas Perkebunan', jadwal_pemutakhiran: 'Tahunan', satuan: 'KK', tahun: null, variabel: '38294' },
    { id: 2, id_kode_indikator: 32, kode_indikator_kode_indikator: 'b', kode_indikator_nama_indikator: 'Jumlah produksi komoditas perkebunan Kopi Arabika', id_opds: 1, opds_nama_opd: 'Dinas Perkebunan', jadwal_pemutakhiran: 'Tahunan', satuan: 'Ton/Tahun', tahun: null, variabel: '29019' },
  ];

  it('"berapa ton kopi" memilih record satuan Ton, bukan KK', () => {
    const hits = retrieveRelevant(KORPUS_TON, 'Berapa ton kopi yang dihasilkan petani Aceh Tengah?');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].record.satuan).toBe('Ton/Tahun');
  });

  it('tanpa satuan fisik, urutan tidak dipaksa (bukti petani tetap bisa teratas)', () => {
    const hits = retrieveRelevant(KORPUS_TON, 'Berapa jumlah petani kopi Arabika?');
    expect(hits[0].record.kode_indikator_nama_indikator).toContain('petani');
  });

  it('"persen" TIDAK dipakai sebagai preferensi satuan (niat komposisi sudah menanganinya)', () => {
    const hits = retrieveRelevant(KORPUS_TON, 'Berapa persen produksi kopi arabika terhadap total?');
    expect(hits.length).toBeGreaterThan(0);
  });
});
