import { NextRequest } from 'next/server';
import { fetchSapaData } from '@/lib/sapa-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query || query.length < 3) {
      return Response.json({ error: 'Query tidak valid' }, { status: 400 });
    }

    const { records } = await fetchSapaData();
    const answer = `Data SAPA Aceh Tengah berhasil dimuat: ${records.length} indikator.`;
    return Response.json({ answer, source: 'SAPA SPLP', count: records.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Gagal memproses query' }, { status: 500 });
  }
}
