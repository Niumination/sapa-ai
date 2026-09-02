import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ ok: true, message: 'KPI tidak tersedia di mode publik SAPA-only.' });
}
