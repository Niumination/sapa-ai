import { NextResponse } from 'next/server';
import { readToggleState, toggleBackend } from '@/lib/ai/toggle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Status toggle publik (tanpa rahasia) — dipakai panel admin untuk menampilkan
 * keadaan nyata. Tidak membocorkan kunci apa pun.
 */
export async function GET() {
  const state = await readToggleState();
  return NextResponse.json({
    aiEnabled: state.aiEnabled,
    detEnabled: state.detEnabled,
    backend: toggleBackend(),
    updatedAt: state.updatedAt,
  });
}
