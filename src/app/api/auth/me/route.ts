import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({ authenticated: true, admin: { username: 'Publik', role: 'public' } });
}
