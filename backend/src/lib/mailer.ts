import nodemailer, { Transporter } from "nodemailer";
import { APP_URL } from "./config";

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Three ways out of the box, picked in this order:
 *
 *  1. Mailjet's HTTP API (MAILJET_API_KEY + MAILJET_SECRET_KEY)
 *  2. Brevo's HTTP API   (BREVO_API_KEY)
 *  3. Plain SMTP         (SMTP_HOST/PORT/USER/PASS)
 *
 * The HTTP ones exist because a Render free web service blocks outbound
 * traffic to SMTP ports 25/465/587 entirely — a connection there isn't
 * refused, it hangs until the socket times out, which surfaces as a login
 * page stuck on "Sending…". Both APIs are ordinary HTTPS on :443.
 *
 * SMTP stays as the local-development path (and works on any host that
 * doesn't block those ports). All three are optional: with none configured
 * every send is a no-op returning false, exactly as before.
 *
 * The sender address must be one the provider has verified. On both Mailjet
 * and Brevo a single address can be verified on its own, without a domain.
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

/** The verified sender, however it happens to be configured. */
function sender(): { name: string; email: string } | null {
  const explicit =
    process.env.MAIL_SENDER_EMAIL?.trim() ||
    process.env.MAILJET_SENDER_EMAIL?.trim() ||
    process.env.BREVO_SENDER_EMAIL?.trim();
  if (explicit) {
    const name =
      process.env.MAIL_SENDER_NAME?.trim() ||
      process.env.MAILJET_SENDER_NAME?.trim() ||
      process.env.BREVO_SENDER_NAME?.trim() ||
      "Proctor Diary";
    return { name, email: explicit };
  }
  return parseFrom(process.env.SMTP_FROM || process.env.SMTP_USER);
}

/**
 * Without a timeout a stalled connection would hold the caller's HTTP request
 * open (the login page sitting on "Sending…").
 */
const HTTP_TIMEOUT_MS = 15_000;

// ── transport 1: Mailjet Send API v3.1 ────────────────────────────────────

const MAILJET_ENDPOINT = "https://api.mailjet.com/v3.1/send";

async function sendViaMailjet(mail: Mail): Promise<boolean> {
  const key = process.env.MAILJET_API_KEY?.trim();
  const secret = process.env.MAILJET_SECRET_KEY?.trim();
  if (!key || !secret) return false;

  const from = sender();
  if (!from) {
    console.error("[mailer] Mailjet keys are set but no sender address — set MAIL_SENDER_EMAIL.");
    return false;
  }

  try {
    const res = await fetch(MAILJET_ENDPOINT, {
      method: "POST",
      headers: {
        // Mailjet authenticates with HTTP Basic: public key as the user,
        // private key as the password.
        authorization: "Basic " + Buffer.from(`${key}:${secret}`).toString("base64"),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: from.email, Name: from.name },
            To: [{ Email: mail.to }],
            Subject: mail.subject,
            TextPart: mail.text,
            HTMLPart: mail.html,
          },
        ],
      }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    const bodyText = await res.text().catch(() => "");

    if (!res.ok) {
      console.error(`[mailer] Mailjet rejected the send (HTTP ${res.status}): ${bodyText}`);
      return false;
    }

    // v3.1 answers 200 even when an individual message failed — the per-message
    // Status is the thing that actually says whether it went out.
    try {
      const parsed = JSON.parse(bodyText) as { Messages?: Array<{ Status?: string }> };
      const status = parsed.Messages?.[0]?.Status;
      if (status && status !== "success") {
        console.error(`[mailer] Mailjet returned status "${status}": ${bodyText}`);
        return false;
      }
    } catch {
      // Unparseable body on a 200 — treat as sent rather than retrying blindly.
    }
    return true;
  } catch (err) {
    console.error("[mailer] Mailjet request failed:", err);
    return false;
  }
}

// ── transport 2: Brevo HTTP API ───────────────────────────────────────────

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

async function sendViaBrevo(mail: Mail): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return false;

  const from = sender();
  if (!from) {
    console.error("[mailer] BREVO_API_KEY is set but no sender address — set MAIL_SENDER_EMAIL.");
    return false;
  }

  try {
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
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });

    if (!res.ok) {
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

// ── transport 3: SMTP ─────────────────────────────────────────────────────

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

/** First configured transport wins; false when none is configured. */
async function send(mail: Mail): Promise<boolean> {
  if (process.env.MAILJET_API_KEY?.trim() && process.env.MAILJET_SECRET_KEY?.trim()) {
    return sendViaMailjet(mail);
  }
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
