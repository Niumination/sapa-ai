// ─── Celah pengetahuan: pertanyaan yang belum bisa dijawab sistem (FR-27) ─────
//
// MENGAPA ADA
// Selama ini pertanyaan yang tidak terjawab (tanpa bukti) atau yang jawaban AI-nya
// ditolak gerbang mutu hanya terlihat di log yang retensinya 1 jam (Vercel Hobby).
// Akibatnya tidak ada daftar kerja yang bisa dikerjakan: sinonim apa yang kurang,
// indikator apa yang belum tersedia, OPD mana yang perlu dimintai data.
//
// Modul ini mencatatnya sebagai RINGKASAN MINGGUAN yang bisa dibaca operator pada
// dasbor `/admin/celah-pengetahuan` — tanpa menyimpan apa pun yang bersifat pribadi.
//
// ATURAN PRIVASI (UU 27/2022) — dipatuhi secara struktural, bukan sekadar niat:
//   1. Angka DIBUANG seluruhnya dari pertanyaan tersimpan. Angka pada pertanyaan
//      warga sering berupa NIK (16 digit), nomor telepon, NIK/NIS, atau koordinat —
//      menghapus semua angka jauh lebih aman daripada mencoba mengenali polanya.
//   2. Alamat surel, tautan, dan nomor telepon dibuang.
//   3. Panjang dibatasi 140 karakter; hanya huruf, angka-yang-sudah-dibuang, dan
//      spasi/tanda dasar yang disimpan.
//   4. Tidak ada IP, tidak ada id pengguna, tidak ada waktu-per-permintaan —
//      hanya jumlah dan waktu terakhir per pertanyaan.
//
// ATURAN BIAYA: penulisan hanya terjadi untuk pertanyaan yang MEMANG gagal
// dilayani (tanpa bukti atau jawaban AI ditolak). Pertanyaan yang berhasil tidak
// menulis apa pun — jadi biaya penyimpanan sebanding dengan keluhan, bukan trafik.

import { cacheGet, cacheSet, activeBackend, type StoreBackend } from '@/lib/store';
import type { SebabGagal } from '@/services/sebab-kegagalan';

/**
 * Sebab sebuah pertanyaan dicatat sebagai celah.
 *
 * FR-20 (22 Sep 2026): nilai sebab menjadi lebih terperinci — `tanpa-bukti` kini
 * dipecah (`retrieval:tanpa-bukti`, `retrieval:konsep-asing`,
 * `retrieval:granularitas-per-desa`, `retrieval:makna-lemah`) dan `ai-ditolak`
 * dipisah (`generasi:grounding`, `generasi:nilai-tambah`, `generasi:penyedia`),
 * ditambah sebab lapis masukan. Nilai LAMA tetap dikenali saat dibaca
 * (`labelSebab` menangani keduanya), jadi data tersimpan tidak kehilangan makna.
 */
export type SebabCelah = SebabGagal;

export interface EntriCelah {
  /** Pertanyaan yang sudah dibersihkan (tanpa angka/identitas). */
  pertanyaan: string;
  /** Berapa kali muncul pada minggu itu. */
  jumlah: number;
  /** Sebab terakhir yang tercatat. */
  sebab: SebabCelah;
  /** ISO — kapan terakhir muncul. */
  terakhir: string;
}

interface PetaCelahMingguan {
  minggu: string;
  entri: Record<string, EntriCelah>;
}

/** Jumlah entri maksimum per minggu — pengaman agar penyimpanan tidak tumbuh liar. */
export const MAKS_ENTRI_PER_MINGGU = 300;
/** Lama simpan (8 minggu) — cukup untuk melihat pola, tidak menyimpan selamanya. */
export const TTL_MS = 8 * 7 * 24 * 60 * 60 * 1000;
/** Batas panjang pertanyaan tersimpan. */
export const MAKS_PANJANG = 140;

/**
 * Bersihkan pertanyaan sebelum disimpan.
 *
 * Sengaja membuang SELURUH digit (bukan hanya pola NIK): pada pertanyaan warga,
 * rangkaian angka hampir selalu identitas (NIK, NKK, nomor telepon, nomor surat)
 * atau setidaknya penanda unik yang bisa dipakai menelusuri orang. Untuk keperluan
 * dasbor ("pertanyaan apa yang sering tak terjawab"), angkanya tidak diperlukan.
 */
export function bersihkanPertanyaan(teks: string): string {
  let t = String(teks ?? '').toLowerCase();
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ' '); // surel
  t = t.replace(/https?:\/\/\S+|www\.\S+/g, ' '); // tautan
  t = t.replace(/\+?\d[\d\s().-]{6,}\d/g, ' '); // nomor telepon/NIK bertanda pemisah
  t = t.replace(/\d+/g, ' '); // SEMUA digit
  t = t.replace(/[^\p{L}\s?.!,%-]/gu, ' '); // sisakan huruf & tanda dasar
  t = t.replace(/\s+/g, ' ').trim();
  // Sisa spasi sebelum tanda baca (akibat digit yang dibuang) dirapatkan supaya
  // daftar celah enak dibaca: "hub ?" → "hub?".
  t = t.replace(/\s+([?.!,;:])/g, '$1');
  t = t.replace(/^[?.!,%-]+/, '').trim();
  return t.slice(0, MAKS_PANJANG).trim();
}

/** Kunci minggu ISO (`2026-W39`) — dasar pengelompokan mingguan. */
export function kunciMinggu(tanggal: Date = new Date()): string {
  const d = new Date(Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth(), tanggal.getUTCDate()));
  const hari = d.getUTCDay() || 7; // Senin = 1 … Minggu = 7
  d.setUTCDate(d.getUTCDate() + 4 - hari); // ke Kamis minggu itu
  const awalTahun = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const minggu = Math.ceil(((d.getTime() - awalTahun.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(minggu).padStart(2, '0')}`;
}

function kunciSimpan(minggu: string): string {
  return `celah:pengetahuan:${minggu}`;
}

/**
 * Catat satu pertanyaan yang gagal dilayani.
 *
 * Baca-ubah-tulis sederhana. Pada trafik bersamaan ada kemungkinan satu hitungan
 * hilang — dapat diterima untuk dasbor pola (bukan untuk penagihan), dan jauh
 * lebih murah daripada transaksi terkunci. Bila penyimpanan gagal, fungsi ini
 * mengembalikan false dan TIDAK pernah melempar: jawaban pengguna tidak boleh
 * rusak karena fitur laporan.
 */
export async function catatCelah(query: string, sebab: SebabCelah): Promise<boolean> {
  const bersih = bersihkanPertanyaan(query);
  if (!bersih || bersih.length < 3) return false;

  const minggu = kunciMinggu();
  const kunci = kunciSimpan(minggu);
  try {
    const ada = (await cacheGet<PetaCelahMingguan>(kunci)) ?? { minggu, entri: {} };
    const entri = { ...ada.entri };
    const sekarang = new Date().toISOString();
    const lama = entri[bersih];
    entri[bersih] = {
      pertanyaan: bersih,
      jumlah: (lama?.jumlah ?? 0) + 1,
      sebab,
      terakhir: sekarang,
    };

    // Bila sudah penuh, buang entri dengan jumlah terkecil lalu yang paling lama.
    const daftar = Object.values(entri);
    if (daftar.length > MAKS_ENTRI_PER_MINGGU) {
      daftar
        .sort((a, b) => a.jumlah - b.jumlah || a.terakhir.localeCompare(b.terakhir))
        .slice(0, daftar.length - MAKS_ENTRI_PER_MINGGU)
        .forEach((e) => delete entri[e.pertanyaan]);
    }

    await cacheSet(kunci, { minggu, entri }, TTL_MS);
    return true;
  } catch {
    return false;
  }
}

export interface RingkasanCelah {
  minggu: string;
  total: number;
  /** Entri terurut: paling sering dulu, lalu paling baru. */
  item: EntriCelah[];
  backend: StoreBackend;
}

/** Ambil ringkasan celah untuk satu minggu (bawaan: minggu berjalan). */
export async function ambilCelah(minggu: string = kunciMinggu()): Promise<RingkasanCelah> {
  const data = await cacheGet<PetaCelahMingguan>(kunciSimpan(minggu)).catch(() => null);
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

/**
 * Pilihan minggu yang mungkin punya data (mis. 8 minggu terakhir), untuk pemilih
 * minggu di dasbor. Dihitung, bukan disimpan.
 */
export function pilihanMinggu(jumlah = 8, dari: Date = new Date()): string[] {
  const keluar: string[] = [];
  for (let i = 0; i < jumlah; i++) {
    const d = new Date(dari.getTime() - i * 7 * 86_400_000);
    const k = kunciMinggu(d);
    if (!keluar.includes(k)) keluar.push(k);
  }
  return keluar;
}
