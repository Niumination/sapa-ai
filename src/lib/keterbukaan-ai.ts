// ─── CMP-02 · Keterbukaan penggunaan AI pada layanan publik ───────────────────
//
// Rujukan: SE Menteri Kominfo No. 9 Tahun 2023 tentang Etika Kecerdasan Artifisial.
// Inti yang dituntut dari penyelenggara layanan publik berbasis AI: pengguna HARUS
// tahu (a) bahwa ia berhadapan dengan sistem AI, (b) bagian mana yang otomatis dan
// bagian mana yang disusun model, (c) siapa yang bertanggung jawab bila keliru,
// (d) ke mana mengadu, dan (e) apa keterbatasannya.
//
// Modul ini adalah SATU-SATUNYA sumber teks keterbukaan: halaman publik
// `/keterbukaan`, endpoint mesin `/api/keterbukaan`, dan notis per jawaban
// (`teksNotis()` di `@/lib/umpan-balik`) semuanya membaca dari sini — sehingga
// tidak mungkin ada dua versi keterbukaan yang berbeda.
//
// ATURAN KEJUJURAN (diuji di `keterbukaan-ai.test.ts`, bukan sekadar niat):
//   1. Keadaan AI diambil dari STATUS NYATA yang diukur saat permintaan
//      (`getAiRuntimeStatus()`), bukan dari teks yang ditulis tangan. Bila
//      layanan mati, teks WAJIB menyatakan mati — dan sebaliknya.
//   2. Fakta yang tidak diketahui TIDAK dikarang: penyedia/model kosong ditulis
//      "tidak dicantumkan", bukan ditebak.
//   3. Klaim mutlak dilarang (`KLAIM_TERLARANG`): layanan ini tidak boleh
//      menjanjikan ketepatan yang tidak bisa dibuktikan.
//
// Modul ini murni (tanpa I/O, tanpa `process.env`) supaya dapat diuji tanpa
// merender halaman dan tanpa menyalakan server.

import { teksNotis } from '@/lib/umpan-balik';

/** Versi teks keterbukaan. Naikkan bila ada perubahan isi yang berarti. */
export const VERSI_KETERBUKAAN = '1.0.0';
/** Tanggal peninjauan terakhir (dokumen 10 §9 CMP-02). */
export const DITINJAU_PADA = '2026-09-24';
/** Tenggat peninjauan berikutnya — 6 bulan (keterbukaan mengikuti perubahan fitur). */
export const TINJAUAN_BERIKUTNYA = '2027-03-24';

/**
 * Kalimat yang TIDAK BOLEH muncul di teks keterbukaan mana pun: janji mutlak yang
 * tidak dapat dibuktikan, atau klaim otomatis-penuh yang menyesatkan.
 */
export const KLAIM_TERLARANG: readonly string[] = [
  '100% akurat',
  '100% benar',
  'selalu benar',
  'tidak pernah salah',
  'tanpa kesalahan',
  'dijamin benar',
  'sepenuhnya otomatis tanpa pemeriksaan',
  'tanpa campur tangan manusia',
];

export type KeadaanAi = 'aktif' | 'bayangan' | 'mati';

/** Ringkasan runtime yang dipakai keterbukaan — semua fakta, tanpa tebakan. */
export interface RingkasAiRuntime {
  keadaan: KeadaanAi;
  /** Id penyedia (mis. `custom`) atau `null` bila tidak dikonfigurasi. */
  penyedia: string | null;
  /** Nama model — TIDAK pernah dipilihkan diam-diam oleh aplikasi. */
  model: string | null;
  /** Nama hos penyedia (tanpa kunci) — supaya aliran data keluar dapat diperiksa. */
  hosPenyedia: string | null;
  /** Sebab bila layanan tidak menjawab (kuota/urutan/saklar). */
  alasan: string | null;
  /** Hasil panggilan nyata: `false` berarti penyedia gagal walau env terisi. */
  terjangkau: boolean | null;
  /**
   * Jumlah kegagalan panggilan BERTURUT (dari pemutus sirkuit). Satu kegagalan
   * bukan berarti penyedia mati (sistem memang mencoba lagi), tetapi pengguna
   * tetap berhak tahu bahwa jawaban terakhir disusun dari data.
   */
  gagalBerturut: number;
  /** Sebab kegagalan terakhir (`jaringan`, `timeout`, `auth`, …) bila ada. */
  sebabTerakhir: string | null;
  /** Saklar admin: AI dapat dimatikan operator tanpa mengubah kode. */
  saklarAi: boolean;
}

export interface BagianKeterbukaan {
  id: string;
  judul: string;
  isi: string[];
}

export interface Keterbukaan {
  versi: string;
  ditinjauPada: string;
  tinjauanBerikutnya: string;
  ringkas: RingkasAiRuntime;
  /** Kalimat tunggal yang menyatakan keadaan SEBENARNYA saat ini. */
  kalimatKeadaan: string;
  bagian: BagianKeterbukaan[];
  /**
   * Pemetaan metadata jawaban → keadaan notis per jawaban (FR-26). Dipakai uji
   * agar keterbukaan halaman dan notis per jawaban tidak mungkin berbeda.
   */
  pemetaanNotis: { digunakan: string; ditolakGerbang: string; tanpaAi: string; belumAda: string };
  /**
   * Teks notis per jawaban (FR-26) untuk SETIAP keadaan metadata, supaya kalimat
   * yang akan dilihat pengguna dapat diperiksa mesin — bukan hanya disimpulkan dari
   * nama keadaan. Uji memakai ini untuk membuktikan notis "AI menyusun" tidak
   * pernah muncul pada jawaban yang tidak disusun AI, dan sebaliknya.
   */
  notisPerJawaban: {
    digunakan: TeksNotisRingkas;
    ditolakGerbang: TeksNotisRingkas;
    tanpaAi: TeksNotisRingkas;
    belumAda: TeksNotisRingkas;
  };
}

/** Bentuk ringkas TeksNotis (tanpa impor tipe lintas-modul agar tetap murni). */
export interface TeksNotisRingkas {
  mode: string;
  judul: string;
  paragraf: string[];
}

/** Kalimat keadaan — dinyatakan apa adanya, termasuk saat layanan mati/gagal. */
export function kalimatKeadaan(r: RingkasAiRuntime): string {
  const dasar =
    r.keadaan === 'aktif'
      ? 'Saat ini layanan AI aktif: narasi jawaban disusun model bahasa, lalu diperiksa gerbang bukti sebelum ditampilkan.'
      : r.keadaan === 'bayangan'
        ? 'Saat ini layanan AI berjalan dalam mode bayangan: model tetap dipanggil untuk diukur, tetapi yang ditampilkan kepada pengguna selalu narasi otomatis dari data.'
        : 'Saat ini layanan AI TIDAK aktif: seluruh jawaban disusun otomatis dari data resmi (mode tanpa AI).';

  const sebab = r.sebabTerakhir ? ` (sebab: ${r.sebabTerakhir})` : '';
  const catatanGagal =
    r.terjangkau === false
      ? ` Penyedia model sedang tidak menjawab${sebab}, sehingga jawaban yang keluar saat ini berasal dari data, bukan dari model.`
      : r.gagalBerturut > 0
        ? ` Panggilan model terakhir gagal${sebab} (${r.gagalBerturut} kali berturut), sehingga jawaban pada saat itu disusun dari data; sistem mencoba lagi pada permintaan berikutnya.`
        : '';
  const catatanAlasan = r.keadaan !== 'aktif' && r.alasan ? ` Sebabnya: ${r.alasan}.` : '';
  const catatanSaklar = r.saklarAi
    ? ''
    : ' Operator juga dapat mematikan AI dari panel admin; saklar inilah yang menang atas setelan teknis.';
  return dasar + catatanGagal + catatanAlasan + catatanSaklar;
}

/** Penyedia & model: fakta bila ada, pernyataan jujur bila tidak ada. */
export function ringkasPenyedia(r: RingkasAiRuntime): string {
  const penyedia = r.penyedia ?? 'tidak dicantumkan';
  const model = r.model ?? 'tidak dicantumkan';
  const hos = r.hosPenyedia ? ` di hos ${r.hosPenyedia}` : '';
  return `Penyedia: ${penyedia}${hos} · Model: ${model}. Nama model tidak pernah dipilihkan diam-diam oleh aplikasi; bila kosong, berarti belum diatur operator.`;
}

/**
 * Susun keterbukaan lengkap. `null` diperlakukan sebagai "status tidak dapat
 * dibaca" — dan itu dinyatakan sebagai ketidakpastian, bukan diisi asumsi.
 */
export function pengungkapanAi(runtime: RingkasAiRuntime | null): Keterbukaan {
  const r: RingkasAiRuntime = runtime ?? {
    keadaan: 'mati',
    penyedia: null,
    model: null,
    hosPenyedia: null,
    alasan: 'status layanan AI tidak dapat dibaca saat ini',
    terjangkau: null,
    gagalBerturut: 0,
    sebabTerakhir: null,
    saklarAi: true,
  };

  const bagian: BagianKeterbukaan[] = [
    {
      id: 'peran-ai',
      judul: 'Apa yang dikerjakan AI, dan apa yang tidak',
      isi: [
        'Data disiapkan dan dicari tanpa AI: pertanyaan dipotong menjadi kata kunci, katalog indikator SPLP/SAPA dicocokkan secara leksikal, dan baris bukti disusun secara deterministik. Angka tidak pernah dipilih oleh model.',
        'AI dipakai untuk satu hal saja: menyusun kalimat narasi dari baris bukti yang sudah ditemukan, agar jawaban lebih mudah dibaca. Bentuk sajian (grafik/tabel/metrik), penyebab jawaban kosong, dan pemetaan istilah daerah juga dihitung tanpa model.',
        'Setiap narasi model melewati gerbang bukti: angka yang tidak ada pada baris bukti ditolak, angka yang tertukar antar entitas ditolak, dan usulan yang tidak menambah apa pun dibuang — sehingga yang tampil kembali sebagai narasi otomatis dari data.',
      ],
    },
    {
      id: 'keadaan-sekarang',
      judul: 'Keadaan layanan AI saat ini',
      isi: [kalimatKeadaan(r), ringkasPenyedia(r)],
    },
    {
      id: 'kendali-manusia',
      judul: 'Siapa yang bertanggung jawab',
      isi: [
        'Layanan ini dijalankan oleh pengelola portal data Pemerintah Kabupaten Aceh Tengah. Penanggung jawab isi jawaban adalah pengelola data (OPD penyedia data), bukan model bahasa: model hanya menyusun kalimat.',
        'Operator memiliki saklar AI di panel admin (`/admin/ai-toggle`) untuk mematikan AI atau seluruh mode jawaban tanpa mengubah kode; keadaan saklar itu ditampilkan pada jawaban, bukan disembunyikan.',
        'Laporan koreksi warga masuk daftar tinjauan manusia, bukan ditangani otomatis. Setiap laporan dapat ditelusuri kembali ke pertanyaan, bukti, dan sebab jawabannya.',
      ],
    },
    {
      id: 'data-dan-privasi',
      judul: 'Data apa yang meninggalkan server',
      isi: [
        'Yang mungkin dikirim ke penyedia model hanya: pertanyaan pengguna, dan baris katalog SPLP yang sudah dibersihkan dari penanda perintah serta dipotong panjangnya.',
        'Pertanyaan yang meminta data perorangan (mis. daftar nama, NIK, alamat orang) ditolak oleh pagar masuk sebelum ada panggilan model — data pribadi tidak pernah ikut ke penyedia AI.',
        'Kunci API hanya dipakai di sisi server. Jejak audit jawaban menyimpan pertanyaan, bukti, gerbang, dan sebab jawaban tanpa data pribadi (CMP-04).',
      ],
    },
    {
      id: 'keterbatasan',
      judul: 'Keterbatasan yang perlu Anda tahu',
      isi: [
        'Kelengkapan jawaban dibatasi ketersediaan data: bila indikator tidak ada di katalog SPLP, portal akan menyatakan tidak ditemukan alih-alih mengarang angka.',
        'Data resmi dapat tertinggal dari kondisi lapangan; tahun data dan waktu penarikan selalu dicantumkan pada bagian sumber jawaban.',
        'Model bahasa dapat menghasilkan kalimat yang lancar tetapi keliru. Karena itu narasinya tidak pernah menjadi sumber angka: setiap angka diuji terhadap bukti lebih dulu.',
      ],
    },
    {
      id: 'hak-dan-koreksi',
      judul: 'Hak Anda dan cara mengecek atau melapor',
      isi: [
        'Anda berhak tahu apakah jawaban yang Anda terima disusun AI atau tidak — status itu tertulis pada notis "Transparansi jawaban" di setiap jawaban, diambil dari metadata jawaban itu sendiri.',
        'Bila Anda menemukan angka, satuan, atau tahun yang keliru, laporkan lewat kanal "Lapor angka" (`POST /api/umpan-balik`) atau halaman admin tinjauan; laporan dicatat untuk tinjauan tim data.',
        'Sumber angka, tahun data, waktu penarikan, dan sidik versi korpus tersedia pada bagian asal-usul data di setiap jawaban, serta pada halaman status sistem.',
      ],
    },
    {
      id: 'riwayat-notis',
      judul: 'Versi dan riwayat',
      isi: [
        `Teks keterbukaan ini versi ${VERSI_KETERBUKAAN}, ditinjau ${DITINJAU_PADA}, dan dijadwalkan ditinjau ulang paling lambat ${TINJAUAN_BERIKUTNYA}.`,
        'Perubahan teks terjadi lewat perubahan kode yang tercatat (satu berkas sumber: `src/lib/keterbukaan-ai.ts`), sehingga versi lama dapat ditelusuri pada riwayat repositori.',
      ],
    },
  ];

  return {
    versi: VERSI_KETERBUKAAN,
    ditinjauPada: DITINJAU_PADA,
    tinjauanBerikutnya: TINJAUAN_BERIKUTNYA,
    ringkas: r,
    kalimatKeadaan: kalimatKeadaan(r),
    bagian,
    pemetaanNotis: {
      digunakan: teksNotis({ used: true }).mode,
      ditolakGerbang: teksNotis({ used: false, grounded: 'replaced' }).mode,
      tanpaAi: teksNotis({ used: false, grounded: 'skipped' }).mode,
      belumAda: teksNotis(null).mode,
    },
    notisPerJawaban: {
      digunakan: teksNotis({ used: true }),
      ditolakGerbang: teksNotis({ used: false, grounded: 'replaced' }),
      tanpaAi: teksNotis({ used: false, grounded: 'skipped' }),
      belumAda: teksNotis(null),
    },
  };
}

/**
 * Status tenggat peninjauan keterbukaan (dokumen 10 §9 CMP-02: teks wajib
 * ditinjau berkala). Dihitung dari tanggal, bukan dari niat penulisnya.
 */
export function statusTinjauan(hariIni: Date = new Date()): { lewatTenggat: boolean; hariTersisa: number } {
  const tenggat = new Date(`${TINJAUAN_BERIKUTNYA}T23:59:59Z`).getTime();
  const kini = hariIni.getTime();
  return {
    lewatTenggat: kini > tenggat,
    hariTersisa: Math.ceil((tenggat - kini) / (24 * 60 * 60 * 1000)),
  };
}

/** Semua teks keterbukaan sebagai satu daftar — untuk pemeriksaan anti-klaim. */
export function semuaTeks(k: Keterbukaan): string[] {
  return [k.kalimatKeadaan, ...k.bagian.flatMap((b) => [b.judul, ...b.isi])];
}

/** Klaim terlarang yang muncul di teks (harus kosong). */
export function klaimTerlarang(k: Keterbukaan): string[] {
  const teks = semuaTeks(k).join(' ').toLowerCase();
  return KLAIM_TERLARANG.filter((f) => teks.includes(f.toLowerCase()));
}
