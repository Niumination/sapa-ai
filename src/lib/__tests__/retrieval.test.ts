// ─── Retrieval: skor berbobot kelangkaan kata (reviu 2026-09-04) ───
// Buktikan kata langka ("miskin") lebih menentukan topik daripada kata umum
// ("penduduk"). Tanpa pembobotan, "Jumlah penduduk miskin?" selalu kalah ke
// "Jumlah Data Penduduk" — dua-duanya cocok satu kata, lalu pemutus seri
// memilih nilai terbesar.

import { describe, it, expect } from 'vitest';
import { retrieveRelevant, konsepTidakDikenal, konsepTakTermuat } from '../sapa-client';
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
import { tokenizeQuery, normalkanSingkatan } from '../sapa-client';

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
