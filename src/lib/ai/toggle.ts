// ─── Toggle mode jawaban SAPA-AI (khusus admin) ───
//
// MASALAH YANG DIPERBAIKI (2026-09-19)
// Versi pertama menyimpan state di berkas /tmp. Di Vercel setiap instance
// serverless punya /tmp sendiri dan mati saat idle, sehingga:
//   • tulis dari panel admin tidak terlihat oleh instance yang melayani
//     /api/query → toggle tampak "tidak berefek" (jawaban tetap keluar)
// Solusi: pakai lapisan penyimpanan bersama `@/lib/store` (Upstash Redis bila
// dikonfigurasi, cadangan memori bila tidak). Bila cadangan memori yang
// terpakai, state TETAP per-instance — karena itu `toggleBackend()` diekspos
// agar panel admin bisa memperingatkan alih-alih diam-diam gagal.

import { cacheGet, cacheSet, activeBackend, type StoreBackend } from '@/lib/store';

const TOGGLE_KEY = 'sapa:ai:toggle:v1';
/** Umur state toggle. Cukup panjang; toggle bersifat operasional, bukan cache. */
const TOGGLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ToggleState {
  aiEnabled: boolean;
  detEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

const DEFAULT_STATE: ToggleState = {
  aiEnabled: true,
  detEnabled: true,
  updatedAt: new Date(0).toISOString(),
  updatedBy: 'default',
};

/** Baca state toggle. Mengembalikan default (keduanya aktif) bila belum pernah diubah. */
export async function readToggleState(): Promise<ToggleState> {
  const tersimpan = await cacheGet<Partial<ToggleState>>(TOGGLE_KEY);
  if (!tersimpan) return DEFAULT_STATE;
  return {
    aiEnabled: tersimpan.aiEnabled !== false,
    detEnabled: tersimpan.detEnabled !== false,
    updatedAt: tersimpan.updatedAt ?? DEFAULT_STATE.updatedAt,
    updatedBy: tersimpan.updatedBy ?? 'unknown',
  };
}

/** Simpan state toggle ke penyimpanan bersama. */
export async function writeToggleState(
  state: Pick<ToggleState, 'aiEnabled' | 'detEnabled'>,
  updatedBy = 'admin',
): Promise<ToggleState> {
  const lengkap: ToggleState = {
    ...state,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  await cacheSet(TOGGLE_KEY, lengkap, TOGGLE_TTL_MS);
  return lengkap;
}

/** Backend yang sedang dipakai. 'memory' berarti toggle per-instance (tidak andal). */
export function toggleBackend(): StoreBackend {
  return activeBackend();
}

/** Apakah narasi AI dipakai. Default: aktif. */
export async function isAiToggleEnabled(): Promise<boolean> {
  return (await readToggleState()).aiEnabled;
}

/** Apakah jawaban deterministik dipakai. Default: aktif. */
export async function isDetToggleEnabled(): Promise<boolean> {
  return (await readToggleState()).detEnabled;
}
