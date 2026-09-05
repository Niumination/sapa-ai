// ─── Parser angka Indonesia — SATU sumber kebenaran ───
//
// Sebelum reviu 2026-09-04 modul ini punya parser sendiri yang BERBEDA hasilnya
// dengan parseNilaiSapa (format-singkat.ts) dan parseNumericId (opd-drilldown.ts):
//
//   "33.16 %"  → parseNumericId (lama) = 3316   ← salah 100× lipat
//              → parseNilaiSapa         = 33.16 ← benar
//
// Tiga parser untuk satu aplikasi = dua jalur memberi angka berbeda untuk record
// yang sama. Kini parseNumericId mendelegasikan ke parseNilaiSapa, dengan satu
// pengaman tambahan: string yang mengandung huruf ("12a", "n/a") ditolak lebih
// dulu, karena parseNilaiSapa membuang huruf dan akan membacanya sebagai angka.

import { parseNilaiSapa } from './format-singkat';

export function parseNumericId(value: string): number | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  // Ambil token pertama yang mengandung angka — membuang awalan satuan/mata uang
  // ("Rp 1.250.000" → "1.250.000") dan sisipan satuan di belakang ("730 Orang" → "730").
  const token = s.split(/\s+/).find((t) => /\d/.test(t));
  if (!token) return null;
  // Tolak token yang masih mengandung huruf ("12a", "n/a") — bukan angka murni.
  if (/[A-Za-z]/.test(token)) return null;
  return parseNilaiSapa(token);
}

export function parseNumericIdOrFallback(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const r = parseNumericId(String(value));
  return r ?? fallback;
}

/**
 * Rapikan nilai mentah SAPA SATU kali, sebelum dipakai di mana pun.
 *
 * Katalog SAPA memuat artefak pengetikan Excel: desimal bertanda apostrof
 * ("73'5" untuk 73,5 persen; "85'71" untuk 85,71). Bila dibiarkan, parser
 * angka membuang apostrof dan membacanya sebagai 735 — salah 10x lipat — dan
 * pemeriksa grounding menolak nilai yang sah karena mengira "73" karangan.
 *
 * Sengaja ditempatkan bersebelahan dengan parser angka: keduanya adalah satu
 * pintu yang sama untuk membaca nilai SAPA.
 */
export function normalisasiNilai(nilai: unknown): string {
  const s = String(nilai ?? '').trim();
  if (!s) return s;
  // Desimal ber-apostrof hanya bila diikuti 1-2 digit ("73'5"), bukan pemisah ribuan.
  return s.replace(/(\d)'(\d{1,2})(?!\d)/g, '$1,$2');
}
