// ─── Audit Log — Catat semua query + error ───

import { prisma } from '@/lib/prisma';

export interface AuditEntry {
  userId?: string;
  action: 'query' | 'sync' | 'api_call' | 'error';
  resource: string;
  detail?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry) {
  try {
    if (entry.action === 'query') {
      await prisma.chatSession.create({
        data: {
          userId: entry.userId,
          query: entry.detail ?? '',
          intent: entry.resource,
          metadata: entry.metadata as any ?? {},
        },
      });
    }
  } catch (err) {
    // Audit failure should never crash the main flow
    console.error('[Audit] Failed to log:', err);
  }
}

export async function logError(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] ${message}`);

  // In production, send to error tracking (Sentry, etc.)
  // For now, just console
}
