import { NextResponse } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export interface SystemStatus {
  sapa: { state: 'active' | 'down'; records: number };
  ai: { state: 'active' | 'inactive'; provider: string | null; model: string | null };
}

/**
 * Status sistem jujur untuk sidebar.
 * - SAPA: active bila SPLP bisa diambil (memakai LRU server yang sama dengan /api/query).
 * - AI: active hanya bila env AI_MODEL diisi DAN ada jalur kode yang memakainya
 *   (AI_WIRED). sapa-ai saat ini 100% deterministik tanpa LLM, jadi default =
 *   inactive walau env model terisi (mis. sisa export shell dari proyek lain).
 *   Saat wiring LLM mendarat, set AI_WIRED=true — status ikut berubah otomatis.
 */
const AI_WIRED = false;

export async function GET() {
  const model = process.env.AI_MODEL?.trim() || null;
  const wired = AI_WIRED && !!model;
  const status: SystemStatus = {
    sapa: { state: 'down', records: 0 },
    ai: {
      state: wired ? 'active' : 'inactive',
      provider: process.env.AI_PROVIDER?.trim() || null,
      model,
    },
  };
  try {
    const { records } = await fetchSapaData();
    status.sapa = { state: 'active', records: records.length };
  } catch {
    status.sapa = { state: 'down', records: 0 };
  }
  return NextResponse.json(status);
}
