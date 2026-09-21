"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audit = audit;
exports.listAuditLogs = listAuditLogs;
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../config/logger");
/**
 * Admin action audit trail. Details must already be sanitized by callers —
 * never pass tokens, passwords, or raw customer design content.
 */
async function audit(userId, action, entityType, entityId, detail) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                userId: userId ?? null,
                action: action.slice(0, 80),
                entityType: entityType.slice(0, 60),
                entityId: entityId !== undefined ? String(entityId).slice(0, 60) : null,
                detail: detail ? detail : undefined,
            },
        });
    }
    catch (err) {
        // Auditing must never break the action it records.
        logger_1.logger.error('audit.write_failed', { action, message: err.message });
    }
}
async function listAuditLogs(page, pageSize) {
    const [items, total] = await prisma_1.prisma.$transaction([
        prisma_1.prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma_1.prisma.auditLog.count(),
    ]);
    return { items, total };
}
//# sourceMappingURL=audit.service.js.map