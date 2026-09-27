// ─── P4: pagar kuota — pemakaian & sisa, bukan hanya batas yang tertulis ─────
//
// MASALAH YANG DIPERBAIKI
//
//   Batas sudah ada dan sudah bekerja: `AI_DAILY_CALL_LIMIT` (bawaan 2000
//   panggilan/hari) menghentikan panggilan model, dan pembatas laju 30
//   permintaan/menit per IP menahan penyalahgunaan. Yang TIDAK ada: satu tempat
//   yang menjawab pertanyaan operator "hari ini sudah terpakai berapa, sisanya
//   berapa, dan apakah ada yang mendekati batas?" — sebelum batasnya tercapai.
//   Batas yang baru terlihat setelah terlampaui bukan pagar; itu alarm kebakaran
//   yang dipasang di reruntuhan.
//
// YANG DIUKUR (dan yang TIDAK — disebut terus terang)
//
//   Diukur, karena kita memang memiliki penghitungnya:
//     1. `ai-harian`       — panggilan model hari ini (kunci `ai:llm:<tanggal>`,
//                            penghitung yang SAMA dengan yang dipakai penegak
//                            batas; tidak ada penghitung kedua yang bisa berbeda);
//     2. `teguran-laju`    — berapa kali pembatas laju menolak permintaan hari
//                            ini (kunci `rl:teguran:<tanggal>`). Angka ini
//                            memberi tahu operator bahwa ada yang menabrak 30
//                            permintaan/menit — bisa klien yang salah, bisa
//                            penyalahgunaan.
//
//   TIDAK diukur, dan karena itu dinyatakan di keluaran (bukan dibuat-buat):
//     · kuota perintah penyimpanan (mis. Upstash 500 ribu/bulan) — tidak ada
//       API-nya dari dalam aplikasi; yang bisa dilakukan operator adalah melihat
//       dasbor penyedia;
//     · pemakaian penyedia model (token/dolar) — milik penyedia, bukan kita.
//
// ATURAN TINGKAT (dipakai bersama, bukan angka yang ditulis ulang di UI)
//   < 80 %  `aman` · 80–100 % `perhatian` · > 100 % `kritis`
//   `kritis` juga muncul saat dipakai == batas (bukan hanya saat melewatinya),
//   karena pada titik itu jawaban berikutnya TIDAK lagi memakai model.

import { peekCounter } from '@/lib/store';
import { getAiConfig } from '@/lib/ai/env';

export type TingkatKuota = 'aman' | 'perhatian' | 'kritis' | 'tak-diatur';

export interface EntriKuota {
  nama: string;
  keterangan: string;
  dipakai: number;
  batas: number | null;
  sisa: number | null;
  persen: number | null;
  tingkat: TingkatKuota;
  /** Kalimat siap tampil untuk operator; kosong bila `aman`. */
  pesan: string;
}

export interface RingkasKuota {
  tanggal: string;
  entri: EntriKuota[];
  adaPerhatian: boolean;
  /** Hal yang sengaja TIDAK diukur — supaya "semua aman" tidak dibaca melebihi fakta. */
  takTerukur: string[];
  dihitungPada: string;
}

export const AMBANG_PERHATIAN = 0.8;
export const AMBANG_KRITIS = 1;

/** Kunci penghitung teguran pembatas laju per hari (dinaikkan saat 429 terjadi). */
export const KUNCI_TEGURAN_LAJU = (tanggal: string) => `rl:teguran:${tanggal}`;
/** Kunci penghitung panggilan model per hari — SAMA dengan yang dipakai penegak batas. */
export const KUNCI_PANGGILAN_MODEL = (tanggal: string) => `ai:llm:${tanggal}`;
/** Batas teguran laju/hari sebelum dianggap perlu ditindaklanjuti. */
export const BATAS_TEGURAN_LAJU = 200;

export function tanggalHariIni(sekarangMs: number = Date.now()): string {
  return new Date(sekarangMs).toISOString().slice(0, 10);
}

/**
 * Tingkat dari rasio pemakaian. Fungsi murni — dipakai UI, endpoint, dan uji
 * yang sama, sehingga tidak mungkin ada dua aturan berbeda.
 */
export function tingkatKuota(dipakai: number, batas: number | null): TingkatKuota {
  if (batas === null || batas <= 0) return 'tak-diatur';
  const rasio = dipakai / batas;
  if (rasio >= AMBANG_KRITIS) return 'kritis';
  if (rasio >= AMBANG_PERHATIAN) return 'perhatian';
  return 'aman';
}

function buatEntri(
  nama: string,
  keterangan: string,
  dipakai: number,
  batas: number | null,
  satuan: string,
): EntriKuota {
  const tingkat = tingkatKuota(dipakai, batas);
  const persen = batas && batas > 0 ? Math.round((dipakai / batas) * 1000) / 10 : null;
  const sisa = batas && batas > 0 ? Math.max(0, batas - dipakai) : null;
  let pesan = '';
  if (tingkat === 'kritis') {
    pesan =
      batas !== null && dipakai >= batas
        ? `Batas ${nama} TERCAPAI (${dipakai}/${batas} ${satuan}). Jawaban berikutnya memakai jalur deterministik — layanan tetap menjawab, panggilan model berhenti.`
        : `Pemakaian ${nama} melewati batas (${dipakai}/${batas} ${satuan}).`;
  } else if (tingkat === 'perhatian') {
    pesan = `Pemakaian ${nama} sudah ${persen}% dari batas (${dipakai}/${batas} ${satuan}) — sisa ${sisa}.`;
  }
  return { nama, keterangan, dipakai, batas, sisa, persen, tingkat, pesan };
}

export interface OpsiKuota {
  sekarangMs?: number;
  /** Untuk uji: nilai yang dianggap sudah terpakai (tanpa menyentuh penyimpanan). */
  baca?: (kunci: string) => Promise<number>;
}

/**
 * Ringkasan kuota hari ini. Membaca (peek), TIDAK menambah — sama seperti
 * `dailyUsed` di /api/status: memantau tidak boleh menggerogoti kuota.
 */
export async function ringkasKuota(opsi: OpsiKuota = {}): Promise<RingkasKuota> {
  const tanggal = tanggalHariIni(opsi.sekarangMs);
  const baca = opsi.baca ?? ((kunci: string) => peekCounter(kunci));
  const cfg = getAiConfig();
  const batasModel = cfg.dailyCallLimit || null;

  const [dipakaiModel, teguran] = await Promise.all([
    baca(KUNCI_PANGGILAN_MODEL(tanggal)),
    baca(KUNCI_TEGURAN_LAJU(tanggal)),
  ]);

  const entri: EntriKuota[] = [
    buatEntri(
      'ai-harian',
      'Panggilan model hari ini (penghitung yang sama dengan penegak batas AI_DAILY_CALL_LIMIT)',
      dipakaiModel,
      batasModel,
      'panggilan',
    ),
    buatEntri(
      'teguran-laju',
      'Permintaan yang ditolak pembatas laju (30 permintaan/menit per IP)',
      teguran,
      BATAS_TEGURAN_LAJU,
      'permintaan',
    ),
  ];

  return {
    tanggal,
    entri,
    adaPerhatian: entri.some((e) => e.tingkat === 'perhatian' || e.tingkat === 'kritis'),
    takTerukur: [
      'kuota perintah penyimpanan (mis. Upstash per bulan) — tidak tersedia dari dalam aplikasi; periksa dasbor penyedia',
      'pemakaian token/biaya penyedia model — milik penyedia, bukan penghitung kita',
    ],
    dihitungPada: new Date(opsi.sekarangMs ?? Date.now()).toISOString(),
  };
}
