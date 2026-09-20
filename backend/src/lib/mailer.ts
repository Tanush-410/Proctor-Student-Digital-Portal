import nodemailer, { Transporter } from "nodemailer";
import { APP_URL } from "./config";

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Two ways out of the box, picked in this order:
 *
 *  1. Brevo's HTTP API (BREVO_API_KEY) — plain HTTPS on :443. This is the one
 *     that works on a Render free web service, which blocks outbound traffic
 *     to SMTP ports 25/465/587 entirely (a connection there doesn't get
 *     refused, it hangs until the socket times out).
 *  2. Plain SMTP (SMTP_HOST/PORT/USER/PASS) — for local development, and for
 *     any host that doesn't block those ports.
 *
 * Both are optional: with neither configured, every send is a no-op that
 * returns false, exactly as before.
 */

// ── shared ────────────────────────────────────────────────────────────────

type Mail = { to: string; subject: string; text: string; html: string };

/** Splits `Proctor Diary <no-reply@example.com>` into its two halves. */
function parseFrom(raw: string | undefined): { name: string; email: string } | null {
  if (!raw) return null;
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, "") || "Proctor Diary", email: m[2] };
  return { name: "Proctor Diary", email: raw.trim() };
}

function sender(): { name: string; email: string } | null {
  const explicit = process.env.BREVO_SENDER_EMAIL?.trim();
  if (explicit) {
    return { name: process.env.BREVO_SENDER_NAME?.trim() || "Proctor Diary", email: explicit };
  }
  return parseFrom(process.env.SMTP_FROM || process.env.SMTP_USER);
}

// ── transport 1: Brevo HTTP API ───────────────────────────────────────────

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

async function sendViaBrevo(mail: Mail): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return false;

  const from = sender();
  if (!from) {
    console.error("[mailer] BREVO_API_KEY is set but no sender address — set BREVO_SENDER_EMAIL or SMTP_FROM.");
    return false;
  }

  try {
    // Without a timeout a stalled connection would hold the HTTP request open
    // for the caller (the login page sitting on "Sending…").
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: from,
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      // Brevo puts the useful part ({"code":"...","message":"..."}) in the body.
      const detail = await res.text().catch(() => "");
      console.error(`[mailer] Brevo rejected the send (HTTP ${res.status}): ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mailer] Brevo request failed:", err);
    return false;
  }
}

// ── transport 2: SMTP ─────────────────────────────────────────────────────

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
    // Fail fast rather than leaving the caller's request hanging when the
    // port is blocked (see the note at the top of this file).
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

async function sendViaSmtp(mail: Mail): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (err) {
    console.error("[mailer] SMTP send failed:", err);
    return false;
  }
}

/** Brevo first, SMTP as the fallback; false when neither is configured. */
async function send(mail: Mail): Promise<boolean> {
  if (process.env.BREVO_API_KEY?.trim()) {
    return sendViaBrevo(mail);
  }
  return sendViaSmtp(mail);
}

// ── public API (unchanged signatures) ─────────────────────────────────────

/**
 * Sends the OTP over real e-mail when a transport is configured.
 * Returns whether it actually sent — the caller uses this to decide whether
 * it's still safe to fall back to a console log (only ever in non-production;
 * see auth/routes.ts) rather than leaving the user with no way to sign in.
 */
export async function sendOtpEmail(email: string, code: string): Promise<boolean> {
  return send({
    to: email,
    subject: "Your Proctor Diary sign-in code",
    text: `Your one-time code is ${code}. It expires in 5 minutes. If you didn't request this, you can ignore this e-mail.`,
    html: `<p>Your one-time code is <strong style="font-size:18px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 5 minutes. If you didn't request this, you can ignore this e-mail.</p>`,
  });
}

/**
 * Sends an in-app notification's content over real e-mail too, for the
 * handful of notification types worth interrupting someone's inbox for (see
 * EMAIL_NOTIFY_TYPES in lib/notify.ts) — a no-op when no transport is
 * configured, same as sendOtpEmail. Never throws; a failed notification
 * e-mail must not break the mutation that triggered it.
 */
export async function sendNotificationEmail(email: string, title: string, body: string | undefined, link: string | undefined): Promise<boolean> {
  const url = link && APP_URL ? `${APP_URL}${link}` : null;
  const html = `
    <p style="font-size:16px;font-weight:600;margin:0 0 8px">${escapeHtml(title)}</p>
    ${body ? `<p style="margin:0 0 12px;color:#334155">${escapeHtml(body)}</p>` : ""}
    ${url ? `<p style="margin:16px 0 0"><a href="${url}" style="color:#00519c">Open in Proctor Diary</a></p>` : ""}
  `;
  const text = [title, body, url].filter(Boolean).join("\n\n");

  return send({ to: email, subject: `Proctor Diary — ${title}`, text, html });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
