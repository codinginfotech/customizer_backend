import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../config/logger';

/**
 * Admin action audit trail. Details must already be sanitized by callers —
 * never pass tokens, passwords, or raw customer design content.
 */
export async function audit(
  userId: number | undefined,
  action: string,
  entityType: string,
  entityId?: string | number,
  detail?: Record<string, unknown>,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action: action.slice(0, 80),
        entityType: entityType.slice(0, 60),
        entityId: entityId !== undefined ? String(entityId).slice(0, 60) : null,
        detail: detail ? (detail as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (err) {
    // Auditing must never break the action it records.
    logger.error('audit.write_failed', { action, message: (err as Error).message });
  }
}

export async function listAuditLogs(page: number, pageSize: number) {
  const [items, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count(),
  ]);
  return { items, total };
}
