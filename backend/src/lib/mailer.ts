import nodemailer, { Transporter } from "nodemailer";
import { APP_URL } from "./config";

export const isProduction = process.env.NODE_ENV === "production";

let transporter: Transporter | null = null;
let configured = false;

function getTransporter(): Transporter | null {
  if (configured) return transporter;
  configured = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT, 10),
    secure: parseInt(SMTP_PORT, 10) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/**
 * Sends the OTP over real e-mail when SMTP_* env vars are configured.
 * Returns whether it actually sent — the caller uses this to decide whether
 * it's still safe to fall back to a console log (only ever in non-production;
 * see auth/routes.ts) rather than leaving the user with no way to sign in.
 */
export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Your Proctor Diary sign-in code",
      text: `Your one-time code is ${code}. It expires in 5 minutes. If you didn't request this, you can ignore this e-mail.`,
      html: `<p>Your one-time code is <strong style="font-size:18px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 5 minutes. If you didn't request this, you can ignore this e-mail.</p>`,
    });
    return true;
  } catch (err) {
    console.error("[mailer] failed to send OTP e-mail:", err);
    return false;
  }
}

/**
 * Sends an in-app notification's content over real e-mail too, for the
 * handful of notification types worth interrupting someone's inbox for (see
 * EMAIL_NOTIFY_TYPES in lib/notify.ts) — a no-op when SMTP isn't configured,
 * same as sendOtpEmail. Never throws; a failed notification e-mail must not
 * break the mutation that triggered it.
 */
export async function sendNotificationEmail(email: string, title: string, body: string | undefined, link: string | undefined): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  const url = link && APP_URL ? `${APP_URL}${link}` : null;
  const html = `
    <p style="font-size:16px;font-weight:600;margin:0 0 8px">${escapeHtml(title)}</p>
    ${body ? `<p style="margin:0 0 12px;color:#334155">${escapeHtml(body)}</p>` : ""}
    ${url ? `<p style="margin:16px 0 0"><a href="${url}" style="color:#00519c">Open in Proctor Diary</a></p>` : ""}
  `;
  const text = [title, body, url].filter(Boolean).join("\n\n");

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: `Proctor Diary — ${title}`,
      text,
      html,
    });
    return true;
  } catch (err) {
    console.error("[mailer] failed to send notification e-mail:", err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
