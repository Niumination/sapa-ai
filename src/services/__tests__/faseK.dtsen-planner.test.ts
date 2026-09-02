// ─── PR-4c: query planner DTSEN lintas sumber + provenance (inti murni) ───
// Baterai privasi desain §11 + kriteria terima §10: 10-query battery
// (5 agregat, 3 ditolak benar, 2 by-name). Jaminan berat yang dipaku di sini:
//   1. Jawaban agregat SAPA (pkh/bansos/kemiskinan) TIDAK PERNAH terdefleksi.
//   2. NIK/nama tidak pernah bocor ke narasi lookup maupun label audit.
//   3. Sensor k-anonymity dinamis memakai kalimat baku §6.2.
//   4. Semua jawaban DTSEN membawa provenance ("Menurut DTSEN <versi> …").

import { describe, it, expect } from 'vitest';
import {
  isDtsenQuery,
  extractNik,
  hasIndividuMarker,
  detectKecamatan,
  detectDesa,
  detectDesil,
  detectBansos,
  planDtsenQuery,
  sensitivityForPlan,
  publicDeflectionKind,
  buildPublicDeflectionNarasi,
  PUBLIC_DEFLECTION_REKOMENDASI,
  buildProvenanceLabel,
  buildNarasiHeader,
  formatTanggalId,
  jalurLabel,
  fmtId,
  SENSOR_MESSAGE,
  ENUMERASI_MESSAGE,
  NO_RELEASE_MESSAGE,
  NOT_DTSEN_MESSAGE,
  maskNikForAudit,
  summarizeByDesil,
  summarizeByKecamatan,
  buildAgregatAnswer,
  buildLookupNarasi,
  BANSOS_LABEL,
  type ReleaseRef,
  type LookupFound,
} from '@/services/dtsen-planner';
import type { AgregatRow } from '@/services/dtsen-import';

const NIK16 = '1108010101801234';
const RELEASE: ReleaseRef = { releaseNumber: 'v2.0-2026-08', status: 'MANUAL', publishedAt: new Date('2026-08-20T03:00:00Z') };

// Rilis sintetis: 2 kecamatan, Bebesen punya desil 1-3 di 2 desa; Linge hanya desil 1.
const ROWS: AgregatRow[] = [
  { kecamatan: 'Bebesen', desa: 'Atu', desil: 1, jumlahJiwa: 12, jumlahKeluarga: 4 },
  { kecamatan: 'Bebesen', desa: 'Atu', desil: 2, jumlahJiwa: 8, jumlahKeluarga: 3 },
  { kecamatan: 'Bebesen', desa: 'Blang', desil: 1, jumlahJiwa: 20, jumlahKeluarga: 6 },
  { kecamatan: 'Linge', desa: 'Pantan', desil: 1, jumlahJiwa: 5, jumlahKeluarga: 2 },
];

// ═══ A. Deteksi token & entitas ═══

describe('isDtsenQuery — token DTSEN word-boundary', () => {
  it.each(['dtsen', 'DESIL 1-2', 'bansos', 'PKH', 'bpnt', 'PBI', 'kemiskinan individu', 'penerima bantuan'])(
    'mengenali: %s',
    (t) => expect(isDtsenQuery(`berapa ${t} di aceh tengah`)).toBe(true),
  );
  it('TIDAK terpicu kata yang kebetulan mengandung potongan token', () => {
    expect(isDtsenQuery('berapa realisasi pembiayaan daerah')).toBe(false); // "pembiayaan" ⊃ "pbi"? tidak (bukan kata utuh)
    expect(isDtsenQuery('jumlah pendapatan asli daerah')).toBe(false);
  });
});

describe('extractNik', () => {
  it('menangkap NIK 16 digit di tengah kalimat', () => {
    expect(extractNik(`cek nik ${NIK16} dong`)).toBe(NIK16);
  });
  it('menolak 15/17 digit dan bagian angka lebih panjang', () => {
    expect(extractNik('nik 110801010180123')).toBeNull();
    expect(extractNik('nik 11080101018012345')).toBeNull();
    expect(extractNik(`anggaran 1${NIK16}9 miliar`)).toBeNull();
  });
});

describe('detectKecamatan / detectDesa / detectDesil / detectBansos', () => {
  it('kecamatan kanonik dari berbagai bentuk ketikan', () => {
    expect(detectKecamatan('berapa jiwa di kec linge?')).toBe('Linge');
    expect(detectKecamatan('Sebaran Kecamatan Laut Tawar')).toBe('Laut Tawar');
    expect(detectKecamatan('di JAGONG JEGET dong')).toBe('Jagong Jeget');
    expect(detectKecamatan('berapa tinggi takengon')).toBeNull();
  });
  it('desa dari pola "desa X"/"gampong X", terpotong di kata penutup', () => {
    expect(detectDesa('desil 2 di Desa Pantan Musara')).toBe('Pantan Musara');
    expect(detectDesa('penerima pkh gampong Atu desil 1')).toBe('Atu');
    expect(detectDesa('berapa total seluruhnya')).toBeNull();
  });
  it('desil tunggal, rentang, daftar', () => {
    expect(detectDesil('sebaran desil 1')).toEqual([1]);
    expect(detectDesil('desil 1-3')).toEqual([1, 2, 3]);
    expect(detectDesil('desil 1 s.d. 2')).toEqual([1, 2]);
    expect(detectDesil('desil 1 sampai 3')).toEqual([1, 2, 3]);
    expect(detectDesil('desil 1 dan 3')).toEqual([1, 3]);
    expect(detectDesil('desil 3, 4')).toEqual([3, 4]);
    expect(detectDesil('desil 0')).toBeNull(); // di luar 1..10
    expect(detectDesil('desil 11')).toBeNull();
    expect(detectDesil('berapa desil warga')).toBeNull();
  });
  it('bansos spesifik & generic', () => {
    expect(detectBansos('berapa penerima pkh')).toEqual(['pkh']);
    expect(detectBansos('status bpnt dan pbi')).toEqual(['bpnt', 'pbi']);
    expect(detectBansos('penerima bansos')).toEqual(['pkh', 'bpnt', 'pbi']);
    expect(detectBansos('sebaran desil')).toBeNull();
  });
});

// ═══ B. Keputusan plan & gate scope (desain §8/§6.1) ═══

describe('planDtsenQuery + sensitivityForPlan', () => {
  it('NIK → PERSONAL meski sisa kalimat tampak agregat', () => {
    const p = planDtsenQuery(`berapa desil dan status pkh untuk ${NIK16}`);
    expect(p.asksDtsen).toBe(true);
    expect(p.scope).toBe('PERSONAL');
    expect(p.nik).toBe(NIK16);
    expect(sensitivityForPlan(p)).toBe('RESTRICTED_PERSONAL');
  });
  it('niat per-orang tanpa NIK → PERSONAL + flag enumerasi', () => {
    const p = planDtsenQuery('siapa saja penerima pkh di desa Atu');
    expect(p.scope).toBe('PERSONAL');
    expect(p.enumerasi).toBe(true);
    expect(sensitivityForPlan(p)).toBe('RESTRICTED_PERSONAL');
  });
  it('agregat murni → AGGR', () => {
    const p = planDtsenQuery('berapa jiwa desil 1-2 di Kecamatan Linge');
    expect(p.scope).toBe('AGGR');
    expect(p.kecamatan).toBe('Linge');
    expect(p.desil).toEqual([1, 2]);
    expect(sensitivityForPlan(p)).toBe('RESTRICTED_AGGR');
  });
  it('bukan DTSEN → asksDtsen false', () => {
    expect(planDtsenQuery('berapa ekspor kopi 2024').asksDtsen).toBe(false);
  });
});

// ═══ C. Defleksi publik (pengetatan §8 — jangan rusak jawaban SAPA) ═══

describe('publicDeflectionKind — bertingkat, berbasis bukti indikator SAPA', () => {
  it('NIK selalu dialihkan', () => {
    expect(publicDeflectionKind(`tolong cek ${NIK16}`)).toBe('NIK');
  });
  it('konsep tanpa padanan SAPA dialihkan', () => {
    expect(publicDeflectionKind('berapa jiwa desil 1 di aceh tengah')).toBe('DTSEN_KHUSUS');
    expect(publicDeflectionKind('data dtsen terbaru')).toBe('DTSEN_KHUSUS');
    expect(publicDeflectionKind('berapa penerima bpnt per jiwa')).toBe('DTSEN_KHUSUS');
  });
  it('niat per-orang + token DTSEN dialihkan sebagai PER_ORANG', () => {
    expect(publicDeflectionKind('siapa saja penerima pkh di aceh tengah')).toBe('PER_ORANG');
    expect(publicDeflectionKind('daftar nama warga miskin penerima bansos')).toBe('PER_ORANG');
  });
  it('JAMINAN: agregat program SAPA TIDAK terdefleksi (46 indikator nyata)', () => {
    expect(publicDeflectionKind('berapa jumlah penerima bantuan sosial PKH')).toBeNull();
    expect(publicDeflectionKind('berapa total nilai bantuan sosial sembako berhasil salur')).toBeNull();
    expect(publicDeflectionKind('bagaimana tren tingkat kemiskinan')).toBeNull();
    expect(publicDeflectionKind('jumlah santunan bulanan lansia miskin')).toBeNull();
    expect(publicDeflectionKind('berapa penerima bantuan iuran jaminan kesehatan')).toBeNull();
  });
  it('narasi defleksi jujur & mengarahkan; rekomendasi tersedia', () => {
    for (const kind of ['NIK', 'DTSEN_KHUSUS', 'PER_ORANG'] as const) {
      const n = buildPublicDeflectionNarasi(kind);
      expect(n).toContain('SAPA');
      expect(n).toContain('Konsol DTSEN');
      expect(n).not.toContain(NIK16);
    }
    expect(PUBLIC_DEFLECTION_REKOMENDASI.length).toBeGreaterThan(0);
  });
});

// ═══ D. Provenance (desain §8 — 3 tempat) ═══

describe('provenance — label, header narasi, tanggal', () => {
  it('label membawa versi + jalur + tanggal rilis', () => {
    const label = buildProvenanceLabel(RELEASE);
    expect(label).toContain('DTSEN rilis v2.0-2026-08');
    expect(label).toContain('impor manual');
    expect(label).toContain(formatTanggalId(RELEASE.publishedAt));
  });
  it('jalur API diberi label Portal SDI', () => {
    expect(jalurLabel('API')).toContain('Portal SDI');
    expect(jalurLabel('MANUAL')).toContain('impor manual');
  });
  it('header narasi persis pola desain §8', () => {
    expect(buildNarasiHeader(RELEASE)).toMatch(/^Menurut DTSEN rilis v2\.0-2026-08 .+:$/);
  });
  it('tanggal diformat Indonesia Asia/Jakarta', () => {
    expect(formatTanggalId(new Date('2026-08-20T03:00:00Z'))).toBe('20 Agustus 2026');
    expect(formatTanggalId(null)).toBe('-');
  });
});

// ═══ E. Util privat ═══

describe('fmtId / maskNikForAudit / pesan baku', () => {
  it('ribuan ala Indonesia', () => {
    expect(fmtId(1234567)).toBe('1.234.567');
  });
  it('audit tidak pernah menyimpan NIK utuh (4 awal + 2 akhir)', () => {
    const m = maskNikForAudit(NIK16);
    expect(m).toBe('1108**********34');
    expect(m).not.toContain(NIK16);
    expect(maskNikForAudit('123')).toBe('(bukan-nik)');
  });
  it('kalimat sensor persis baku desain §6.2', () => {
    expect(SENSOR_MESSAGE).toBe(
      'Kelompok terlalu kecil untuk ditampilkan (< 5 jiwa) — ditampilkan pada tingkat lebih tinggi.',
    );
    expect(ENUMERASI_MESSAGE).toContain('NIK lengkap');
    expect(NO_RELEASE_MESSAGE).toContain('belum memiliki rilis aktif');
    expect(NOT_DTSEN_MESSAGE).toContain('khusus data DTSEN');
  });
});

// ═══ F. BATERAI §11 — 5 query agregat (dari rows rilis sintetis) ═══

describe('buildAgregatAnswer — baterai 5 agregat', () => {
  it('A1: desil per kecamatan (filter kecamatan + rentang desil)', () => {
    const rows = ROWS.filter((r) => r.kecamatan === 'Bebesen' && (r.desil === 1 || r.desil === 2));
    const a = buildAgregatAnswer({ rows, release: RELEASE, kecamatan: 'Bebesen', desa: null, desil: [1, 2], bansosCounts: null });
    expect(a.narasi).toContain('Menurut DTSEN rilis v2.0-2026-08'); // provenance header
    expect(a.totalJiwa).toBe(40); // 12+8+20
    expect(a.totalKeluarga).toBe(13);
    expect(a.byDesil.map((d) => d.desil)).toEqual([1, 2]);
    expect(a.byDesil[0].jiwa).toBe(32); // desil 1: 12+20
    expect(a.scopeLabel).toContain('Bebesen');
    expect(a.narasi).toContain('32 jiwa');
  });

  it('A2: sebaran desil seluruh kabupaten (tanpa filter)', () => {
    const a = buildAgregatAnswer({ rows: ROWS, release: RELEASE, kecamatan: null, desa: null, desil: null, bansosCounts: null });
    expect(a.totalJiwa).toBe(45);
    expect(a.scopeLabel).toContain('Seluruh');
    expect(a.byWilayah[0].nama).toBe('Bebesen'); // terbanyak lebih dulu
    expect(a.narasi).toContain('45 jiwa');
    expect(a.narasi).toContain('k≥5'); // disclaimer k-anonymity selalu ada
  });

  it('A3: hitung bansos dinamis di atas ambang k ditampilkan', () => {
    const a = buildAgregatAnswer({
      rows: ROWS,
      release: RELEASE,
      kecamatan: null, desa: null, desil: null,
      bansosCounts: [{ program: 'pkh', jiwa: 214 }],
    });
    expect(a.narasi).toContain(`penerima ${BANSOS_LABEL.pkh}: 214 jiwa`);
    expect(a.sensor).toHaveLength(0);
  });

  it('A4: kelompok bansos dinamis < 5 → DISENSOR dgn kalimat baku §6.2', () => {
    const a = buildAgregatAnswer({
      rows: ROWS,
      release: RELEASE,
      kecamatan: 'Linge', desa: null, desil: null,
      bansosCounts: [{ program: 'bpnt', jiwa: null }], // 3 jiwa → route memasukkan null
    });
    expect(a.bansos?.[0].jiwa).toBeNull();
    expect(a.narasi).toContain(SENSOR_MESSAGE);
    expect(a.narasi).not.toContain('3 jiwa'); // angka kecil tak boleh bocor ke narasi
    expect(a.sensor[0]).toContain(SENSOR_MESSAGE);
  });

  it('A5: scope tanpa baris agregat → jawaban jujur (bukan klaim "nol")', () => {
    const a = buildAgregatAnswer({ rows: [], release: RELEASE, kecamatan: 'Bies', desa: null, desil: [5], bansosCounts: null });
    expect(a.totalJiwa).toBe(0);
    expect(a.narasi).toContain('Tidak ada baris agregat');
    expect(a.narasi).toContain('disensor k-anonymity');
  });

  it('ringkas per desil/kecamatan menjumlah lintas desa dengan benar', () => {
    expect(summarizeByDesil(ROWS)).toEqual([
      { desil: 1, jiwa: 37, keluarga: 12 },
      { desil: 2, jiwa: 8, keluarga: 3 },
    ]);
    expect(summarizeByKecamatan(ROWS).map((w) => [w.nama, w.jiwa])).toEqual([
      ['Bebesen', 40],
      ['Linge', 5],
    ]);
  });
});

// ═══ G. BATERAI §11 — 2 query by-name (lookup NIK) ═══

const FOUND: LookupFound = {
  namaMasked: 'S*****H',
  kecamatan: 'Linge',
  desa: 'Pantan Musara',
  desil: 2,
  statusBansos: { pkh: true, bpnt: false, pbi: true },
};

describe('buildLookupNarasi — baterai 2 by-name', () => {
  it('B1: ditemukan → terminimasi penuh, provenance, TANPA kebocoran apa pun', () => {
    const n = buildLookupNarasi(FOUND, RELEASE);
    expect(n).toContain('Menurut DTSEN rilis v2.0-2026-08');
    expect(n).toContain('S*****H');
    expect(n).toContain('Pantan Musara');
    expect(n).toMatch(/desil kesejahteraan: 2/i);
    expect(n).toContain('PKH');
    expect(n).toContain('PBI');
    expect(n).not.toContain('BPNT/'); // bpnt false tidak diklaim aktif
    // Kebocoran: nik, hash, dan nama utuh tak boleh muncul
    expect(n).not.toContain(NIK16);
    expect(n).not.toMatch(/[0-9a-f]{64}/);
    expect(n).not.toContain('SITI');
  });

  it('B2: tidak ditemukan → jujur, tanpa menyebut data lain', () => {
    const n = buildLookupNarasi(null, RELEASE);
    expect(n).toContain('TIDAK tercatat pada rilis aktif');
    expect(n).toContain('audit trail');
    expect(n).not.toContain(NIK16);
  });

  it('status bansos kosong → "bukan penerima"', () => {
    const n = buildLookupNarasi({ ...FOUND, statusBansos: { pkh: false, bpnt: false, pbi: false } }, RELEASE);
    expect(n).toContain('bukan penerima');
  });
});

// ═══ H. hasIndividuMarker — penanda enumerasi ═══

describe('hasIndividuMarker', () => {
  it.each([
    'siapa yang menerima bansos',
    'siapa saja penerima pkh',
    'daftar nama penerima',
    'daftar penerima bpnt',
    'nama warga desil 1',
    'cek nik warga ini',
    'data per orang penerima bantuan',
  ])('menangkap: %s', (q) => expect(hasIndividuMarker(q)).toBe(true));
  it('agregat murni tidak terpicu', () => {
    expect(hasIndividuMarker('berapa jumlah penerima bantuan sosial pkh')).toBe(false);
    expect(hasIndividuMarker('sebaran desil kecamatan linge')).toBe(false);
  });
});
