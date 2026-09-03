import { prisma } from "../db";
import { AuthedRequest } from "../middleware/session";

/**
 * Records one compliance-trail entry: who (actor), did what (action), to
 * which record (targetType/targetId). Called from the routes that read or
 * mutate one specific student/faculty record — see schema.prisma's AuditLog
 * doc comment for why this isn't wired into every list/search endpoint.
 * Fire-and-forget: a logging failure must never fail the request it's
 * describing, so callers don't await this on the response path.
 */
export function logAudit(
  req: AuthedRequest,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>
): void {
  prisma.auditLog
    .create({
      data: {
        actorId: req.auth?.facultyId ?? null,
        actorRole: req.auth?.role ?? "UNKNOWN",
        action,
        targetType,
        targetId,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })
    .catch((err) => console.error("[audit] failed to write log entry:", err));
}
