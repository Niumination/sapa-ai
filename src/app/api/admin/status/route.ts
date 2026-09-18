import { NextRequest, NextResponse } from 'next/server';
import { isAiToggleEnabled, isDetToggleEnabled } from '@/lib/ai/toggle';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    aiEnabled: isAiToggleEnabled(),
    detEnabled: isDetToggleEnabled(),
  });
}
