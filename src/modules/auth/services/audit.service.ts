import { AuditLog } from '@prisma/client';
import prisma from '../../../infrastructure/database/prisma-client';

export interface AuditPayload {
  userId?: string;
  action: string;
  module: string;
  ipAddress?: string;
  userAgent?: string;
  payload?: Record<string, unknown>;
}

/**
 * AuditService — Centralized, immutable audit trail for all sensitive operations.
 *
 * Audit logs are WRITE-ONCE (append-only). They should NEVER be updated or deleted.
 * In production, audit_logs should have a PostgreSQL ROW LEVEL SECURITY policy
 * preventing DELETE/UPDATE even for the application role.
 *
 * All calls to this service are fire-and-forget (non-blocking) from the
 * business layer perspective. Failures here should NOT fail the business operation.
 */
export class AuditService {

  async log(data: AuditPayload): Promise<AuditLog> {
    return prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        module: data.module,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        payload: data.payload as Prisma.InputJsonValue,
      },
    });
  }

  async logSecurityEvent(data: {
    userId?: string;
    eventType: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    ipAddress?: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.securityEvent.create({
      data: {
        userId: data.userId,
        eventType: data.eventType,
        severity: data.severity,
        description: data.description,
        ipAddress: data.ipAddress,
        payload: data.payload as Prisma.InputJsonValue,
      },
    });
  }

  async logFieldChange(data: {
    tableName: string;
    recordId: string;
    fieldName: string;
    oldValue?: string;
    newValue?: string;
    changedBy: string;
  }): Promise<void> {
    await prisma.fieldChangeLog.create({ data });
  }

  async getAuditTrail(
    userId: string,
    options: { skip?: number; take?: number } = {}
  ): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: options.skip ?? 0,
      take: options.take ?? 50,
    });
  }
}

// Import Prisma namespace for InputJsonValue
import { Prisma } from '@prisma/client';

export default AuditService;
