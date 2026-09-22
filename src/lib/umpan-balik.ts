// ─── Umpan balik warga: kanal koreksi "lapor angka" (FR-26) ───────────────────
//
// MENGAPA ADA
// FR-25 sudah membuat setiap jawaban jujur soal asal-usulnya (data ditarik kapan,
// tahun berapa, versi korpus mana). FR-27 sudah mencatat pertanyaan yang TIDAK
// terlayani. Yang belum ada: jalan bagi pembaca untuk MENGOREKSI angka yang
// salah — dan tanpa itu, satu angka keliru bisa beredar tanpa pernah diperbaiki,
// sementara pemilik data (OPD) tidak pernah tahu.
//
// Modul ini menyimpan laporan koreksi sebagai RINGKASAN MINGGUAN yang dapat
// ditinjau operator lewat `/api/admin/umpan-balik`, dengan aturan privasi yang
// SAMA seperti celah pengetahuan — sengaja memakai ulang `bersihkanPertanyaan()`
// supaya hanya ada SATU tempat aturan sanitasi di seluruh sistem.
//
// ATURAN PRIVASI (UU 27/2022):
//   1. Seluruh digit dibuang dari pertanyaan MAUPUN catatan. Konsekuensinya jujur:
//      pengguna tidak bisa menuliskan angka pengganti. Karena itu borangnya
//      menyediakan pilihan JENIS yang terstruktur (angka salah, satuan salah,
//      tahun salah, …) — inti keluhan tetap tersampaikan tanpa menyimpan angka.
//      Ini pilihan sadar: menyimpan angka bebas dari warga berarti menyimpan
//      NIK/nomor telepon yang mungkin terselip, dan itu tidak sepadan.
//   2. Alamat surel, tautan, dan nomor telepon dibuang.
//   3. Panjang dibatasi 140 karakter per bidang.
//   4. Tidak ada IP, tidak ada id pengguna, tidak ada cookie. Yang tersimpan hanya
//      jenis, teks bersih, jumlah, dan waktu terakhir per kombinasi.
//
// ATURAN BIAYA: kuota HARIAN GLOBAL (bukan per-pengguna — supaya tidak perlu
// menyimpan apa pun tentang pengguna) mencegah penyalahgunaan mengisi penyimpanan.

import { cacheGet, cacheSet, activeBackend, incrementCounter, type StoreBackend } from '@/lib/store';
import { bersihkanPertanyaan, kunciMinggu, pilihanMinggu, TTL_MS, MAKS_PANJANG } from '@/lib/insight-celah';

/** Jenis koreksi yang dapat dilaporkan. Terstruktur supaya angka tak perlu disimpan. */
export type JenisUmpan =
  | 'angka-salah'
  | 'satuan-salah'
  | 'tahun-salah'
  | 'indikator-hilang'
  | 'pertanyaan-salah-paham'
  | 'lainnya';

export const JENIS_UMPAN: JenisUmpan[] = [
  'angka-salah',
  'satuan-salah',
  'tahun-salah',
  'indikator-hilang',
  'pertanyaan-salah-paham',
  'lainnya',
];

/** Label manusiawi — dipakai borang pengguna DAN dasbor admin (satu sumber). */
export const LABEL_JENIS: Record<JenisUmpan, string> = {
  'angka-salah': 'Angka yang ditampilkan keliru',
  'satuan-salah': 'Satuan salah (mis. Orang vs Keluarga)',
  'tahun-salah': 'Tahun data salah atau tidak sesuai',
  'indikator-hilang': 'Indikator yang saya cari belum ada',
  'pertanyaan-salah-paham': 'Pertanyaan saya dipahami keliru',
  lainnya: 'Lain-lain',
};

export interface EntriUmpan {
  jenis: JenisUmpan;
  /** Catatan pengguna yang sudah dibersihkan (tanpa angka/identitas). */
  catatan: string;
  /** Pertanyaan yang mendasari laporan, sudah dibersihkan (boleh kosong). */
  pertanyaan: string;
  jumlah: number;
  terakhir: string;
}

interface PetaUmpanMingguan {
  minggu: string;
  entri: Record<string, EntriUmpan>;
}

/** Maksimum entri berbeda per minggu. */
export const MAKS_ENTRI_PER_MINGGU = 300;
/** Maksimum laporan masuk per hari (global, bukan per-pengguna). */
export const MAKS_HARIAN = 200;

function kunciSimpan(minggu: string): string {
  return `umpan:balik:${minggu}`;
}

function kunciKuota(hari: string): string {
  return `umpan:kuota:${hari}`;
}

/** Kunci hari UTC — cukup untuk kuota harian, tanpa perlu zona waktu pengguna. */
function kunciHari(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Benar bila jenis termasuk yang dikenal. Dipakai rute untuk menolak masukan liar. */
export function jenisSah(nilai: unknown): nilai is JenisUmpan {
  return typeof nilai === 'string' && (JENIS_UMPAN as string[]).includes(nilai);
}

export interface HasilCatat {
  tersimpan: boolean;
  /** Alasan bila tidak tersimpan — dipakai rute untuk memilih kode HTTP. */
  alasan?: 'kosong' | 'kuota';
  minggu: string;
  jumlahHariIni: number;
}

/**
 * Catat satu laporan koreksi.
 *
 * Tidak pernah melempar: kegagalan penyimpanan tidak boleh merusak pengalaman
 * pengguna. Bila kuota harian terlampaui, laporan ditolak dengan `alasan:'kuota'`.
 */
export async function catatUmpan(masukan: {
  jenis: JenisUmpan;
  catatan?: string;
  pertanyaan?: string;
}): Promise<HasilCatat> {
  const minggu = kunciMinggu();
  const catatan = bersihkanPertanyaan(masukan.catatan ?? '').slice(0, MAKS_PANJANG);
  const pertanyaan = bersihkanPertanyaan(masukan.pertanyaan ?? '').slice(0, MAKS_PANJANG);

  // Tanpa isi apa pun, tidak ada yang layak disimpan — dan itu bukan kegagalan sistem.
  if (!catatan && !pertanyaan) return { tersimpan: false, alasan: 'kosong', minggu, jumlahHariIni: 0 };

  let jumlahHariIni = 0;
  try {
    const kuota = await incrementCounter(kunciKuota(kunciHari()), 24 * 60 * 60 * 1000);
    jumlahHariIni = kuota.count;
    if (kuota.count > MAKS_HARIAN) return { tersimpan: false, alasan: 'kuota', minggu, jumlahHariIni };
  } catch {
    // Kegagalan penghitung tidak boleh menutup kanal koreksi publik.
  }

  try {
    const kunci = kunciSimpan(minggu);
    const ada = (await cacheGet<PetaUmpanMingguan>(kunci)) ?? { minggu, entri: {} };
    const entri = { ...ada.entri };
    const kunciEntri = `${masukan.jenis}\u001f${catatan}\u001f${pertanyaan}`;
    const lama = entri[kunciEntri];
    entri[kunciEntri] = {
      jenis: masukan.jenis,
      catatan,
      pertanyaan,
      jumlah: (lama?.jumlah ?? 0) + 1,
      terakhir: new Date().toISOString(),
    };

    const daftar = Object.values(entri);
    if (daftar.length > MAKS_ENTRI_PER_MINGGU) {
      daftar
        .sort((a, b) => a.jumlah - b.jumlah || a.terakhir.localeCompare(b.terakhir))
        .slice(0, daftar.length - MAKS_ENTRI_PER_MINGGU)
        .forEach((e) => {
          const k = Object.keys(entri).find((kk) => entri[kk] === e);
          if (k) delete entri[k];
        });
    }

    await cacheSet(kunci, { minggu, entri }, TTL_MS);
    return { tersimpan: true, minggu, jumlahHariIni };
  } catch {
    return { tersimpan: false, minggu, jumlahHariIni };
  }
}

export interface RingkasanUmpan {
  minggu: string;
  total: number;
  /** Terurut: paling sering dilaporkan lebih dahulu, lalu paling baru. */
  item: EntriUmpan[];
  backend: StoreBackend;
}

/** Ambil ringkasan umpan balik satu minggu (bawaan: minggu berjalan). */
export async function ambilUmpan(minggu: string = kunciMinggu()): Promise<RingkasanUmpan> {
  const data = await cacheGet<PetaUmpanMingguan>(kunciSimpan(minggu)).catch(() => null);
  const item = Object.values(data?.entri ?? {}).sort(
    (a, b) => b.jumlah - a.jumlah || b.terakhir.localeCompare(a.terakhir),
  );
  return {
    minggu,
    total: item.reduce((n, e) => n + e.jumlah, 0),
    item,
    backend: activeBackend(),
  };
}

/** Pilihan minggu untuk pemilih di dasbor admin (memakai aturan yang sama). */
export { pilihanMinggu };

// ─── Notis transparansi (teks) ────────────────────────────────────────────────
//
// Teks sengaja dipisah sebagai fungsi murni supaya (a) bisa diuji tanpa merender
// React, dan (b) tidak mungkin berbeda antara tampilan dan salinan teks.

export interface TeksNotis {
  judul: string;
  /** Paragraf yang ditampilkan berurutan. */
  paragraf: string[];
  /**
   * Keadaan yang dijelaskan notis:
   *  - `'ai'`       : jawaban terakhir disusun model AI (dengan gerbang bukti);
   *  - `'template'` : jawaban terakhir disusun otomatis dari data resmi;
   *  - `'umum'`     : belum ada jawaban (mis. beranda) — notis menjelaskan cara
   *                   kerja secara umum dan TIDAK mengklaim apa pun tentang
   *                   jawaban yang belum ada.
   */
  mode: 'ai' | 'template' | 'umum';
}

/**
 * Susun teks notis transparansi.
 *
 * Kejujuran yang dijaga di sini: bila AI TIDAK dipakai (langganan habis, gangguan,
 * atau gerbang mutu menolak), notis TIDAK boleh mengaku jawaban disusun AI — dan
 * sebaliknya. Karena itu modenya ditentukan dari metadata jawaban yang sebenarnya,
 * bukan dari setelan konfigurasi.
 */
export function teksNotis(ai?: { used?: boolean; grounded?: string } | null): TeksNotis {
  const adaJawaban = ai != null;
  const modeAi = Boolean(ai?.used);
  const ditolak = ai?.grounded === 'replaced';
  const paragrafPertama = !adaJawaban
    ? 'Cara kerja jawaban di portal ini: setiap angka diambil dari data resmi dan tidak boleh muncul bila tidak ada pada bukti. Bila layanan AI aktif, narasi disusun model bahasa dengan gerbang bukti; bila tidak aktif, narasi disusun otomatis dari data. Status jawaban yang Anda terima dinyatakan pada bagian sumber.'
    : modeAi
      ? 'Narasi jawaban ini disusun oleh model bahasa AI, dengan gerbang bukti: hanya angka yang ada pada data resmi yang boleh dipakai, dan angka di luar bukti otomatis ditolak.'
      : ditolak
        ? 'Narasi jawaban ini disusun otomatis dari data resmi. Usulan dari model AI ditolak gerbang bukti, sehingga yang Anda baca berasal langsung dari data.'
        : 'Narasi jawaban ini disusun otomatis dari data resmi (mode tanpa AI).';
  return {
    mode: !adaJawaban ? 'umum' : modeAi ? 'ai' : 'template',
    judul: 'Transparansi jawaban',
    paragraf: [
      paragrafPertama,
      'Sumber angka adalah SPLP/SAPA Pemerintah Kabupaten Aceh Tengah. Tahun data, waktu penarikan data, dan sidik versi korpus tertera pada bagian sumber jawaban.',
      'Data resmi dapat tertinggal dari kondisi lapangan. Bila Anda menemukan angka, satuan, atau tahun yang keliru, laporkan lewat kanal di bawah — laporan Anda masuk daftar tinjauan tim data.',
    ],
  };
}
