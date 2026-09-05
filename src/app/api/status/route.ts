import { NextResponse } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';
import { getAiRuntimeStatus } from '@/services/answer-compose';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export interface SystemStatus {
  sapa: { state: 'active' | 'down'; records: number };
  ai: {
    /** active = narasi AI dikirim ke pengguna; shadow = dievaluasi saja; inactive = deterministik. */
    state: 'active' | 'shadow' | 'inactive';
    provider: string | null;
    model: string | null;
    reason: string | null;
    dailyUsed: number;
  };
}

/**
 * Status sistem jujur untuk sidebar & halaman status.
 * - SAPA: active bila SPLP bisa diambil (memakai LRU yang sama dengan /api/query).
 * - AI: state dihitung dari env yang nyata (bukan konstanta hardcode), plus alasan
 *   bila nonaktif — supaya operator tahu persis apa yang kurang.
 */
export async function GET() {
  const status: SystemStatus = {
    sapa: { state: 'down', records: 0 },
    ai: { state: 'inactive', provider: null, model: null, reason: null, dailyUsed: 0 },
  };

  const [sapa, ai] = await Promise.all([
    fetchSapaData()
      .then(({ records }) => ({ state: 'active' as const, records: records.length }))
      .catch(() => ({ state: 'down' as const, records: 0 })),
    getAiRuntimeStatus().catch(() => null),
  ]);

  status.sapa = sapa;
  if (ai) status.ai = ai;
  return NextResponse.json(status);
}
