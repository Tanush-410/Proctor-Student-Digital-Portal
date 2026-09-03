import { prisma } from "../db";
import { sendNotificationEmail } from "./mailer";

// The notification types worth also sending as real e-mail — the ones that
// need a timely response from someone who might not be watching the bell
// icon (Section: "highest-value events"). Everything else (e.g. a proctee
// reassignment) stays in-app only; e-mailing every notification type would
// just make people tune the e-mails out.
const EMAIL_NOTIFY_TYPES = new Set(["CLAIM_SUBMITTED", "AT_RISK"]);

/**
 * Creates an in-app notification for one faculty member, and — for the types
 * in EMAIL_NOTIFY_TYPES — also sends it by e-mail (a no-op if SMTP isn't
 * configured; see lib/mailer.ts). Fire-and-forget — same reasoning as
 * lib/audit.ts: a notification failing to write/send must never fail the
 * mutation it's describing (a claim submission, a scan commit).
 */
export function notify(recipientId: number, type: string, title: string, body?: string, link?: string): void {
  prisma.notification
    .create({ data: { recipientId, type, title, body, link } })
    .catch((err) => console.error("[notify] failed to write notification:", err));

  if (EMAIL_NOTIFY_TYPES.has(type)) {
    prisma.faculty
      .findUnique({ where: { facultyId: recipientId }, select: { email: true } })
      .then((f) => {
        if (f) return sendNotificationEmail(f.email, title, body, link);
      })
      .catch((err) => console.error("[notify] failed to e-mail notification:", err));
  }
}
