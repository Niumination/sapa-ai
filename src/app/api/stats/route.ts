import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Stats tidak tersedia di mode publik SAPA-only.' });
}
