import { prisma } from "../db";

/**
 * Creates an in-app notification for one faculty member. Fire-and-forget —
 * same reasoning as lib/audit.ts: a notification failing to write must never
 * fail the mutation it's describing (a claim submission, a scan commit).
 */
export function notify(recipientId: number, type: string, title: string, body?: string, link?: string): void {
  prisma.notification
    .create({ data: { recipientId, type, title, body, link } })
    .catch((err) => console.error("[notify] failed to write notification:", err));
}
