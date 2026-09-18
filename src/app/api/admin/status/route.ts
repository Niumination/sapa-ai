import { NextRequest, NextResponse } from 'next/server';
import { isAiToggleEnabled } from '@/lib/ai/toggle';

export async function GET(req: NextRequest) {
  // Public endpoint - no auth needed
  // Returns current AI toggle state for the admin panel
  const enabled = isAiToggleEnabled();
  return NextResponse.json({ aiEnabled: enabled });
}
