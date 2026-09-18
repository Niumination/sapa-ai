import { NextRequest, NextResponse } from 'next/server';
import { readToggleState, writeToggleState, toggleBackend } from '@/lib/ai/toggle';

const ADMIN_KEY = process.env.AI_ADMIN_KEY || '';

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || '';
  if (!ADMIN_KEY || key !== ADMIN_KEY) return unauthorized();
  const state = await readToggleState();
  return NextResponse.json({ ...state, backend: toggleBackend() });
}

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || '';
  if (!ADMIN_KEY || key !== ADMIN_KEY) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const current = await readToggleState();

  const aiEnabled = typeof body.aiEnabled === 'boolean' ? body.aiEnabled : current.aiEnabled;
  const detEnabled = typeof body.detEnabled === 'boolean' ? body.detEnabled : current.detEnabled;

  const state = await writeToggleState({ aiEnabled, detEnabled });
  return NextResponse.json({ ...state, backend: toggleBackend() });
}
