import { NextRequest, NextResponse } from 'next/server';
import { isAiToggleEnabled, readToggleState, writeToggleState } from '@/lib/ai/toggle';

const ADMIN_KEY = process.env.AI_ADMIN_KEY || '';

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || '';
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json(readToggleState());
}

export async function POST(req: NextRequest) {
  const key = req.headers.get('x-admin-key') || '';
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const aiEnabled = typeof body.aiEnabled === 'boolean' ? body.aiEnabled : true;
  
  writeToggleState({
    aiEnabled,
    updatedAt: new Date().toISOString(),
    updatedBy: 'admin',
  });
  return NextResponse.json(readToggleState());
}
