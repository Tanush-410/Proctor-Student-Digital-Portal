import { z } from "zod";
import { prisma } from "../../db";
import { generateOtp, generateSessionToken } from "../../lib/tokens";
import { RateLimiter } from "../../lib/rateLimiter";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { isProduction, sendOtpEmail } from "../../lib/mailer";
import { SESSION_COOKIE } from "../../lib/config";
import { AuthedRequest, requireAuth } from "../../middleware/session";

export const authRouter = safeRouter();

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// httpOnly: JavaScript can't read this cookie even if an XSS bug lets an
// attacker run script in the page — the theft path a Bearer-in-localStorage
// token would otherwise leave open. secure is on in production (requires
// HTTPS, which is what's actually deployed there); sameSite: "lax" sends the
// cookie on top-level GET navigations (so a bookmarked /admin link still
// works) but withholds it from cross-site POST/PATCH/fetch — the standard,
// no-extra-token way to get CSRF protection on an API-plus-SPA app like this.
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
};

// Per-email throttling: at most 5 OTP requests, and 8 verify attempts
// (successful or not), in any 10-minute window. This is the only realistic
// brute-force defence for a 6-digit code — closing it stops both spamming a
// mailbox with codes and grinding through the ~1e6 code space.
const requestLimiter = new RateLimiter(5, 10 * 60 * 1000);
const verifyLimiter = new RateLimiter(8, 10 * 60 * 1000);

const requestSchema = z.object({ email: z.string().email() });

// POST /auth/otp/request — request a login OTP to the caller's college e-mail.
//
// SECURITY: the code must never be readable by anyone other than the account
// owner. It's sent over real e-mail when SMTP_* env vars are configured
// (see lib/mailer.ts); it is echoed back in the response body and logged to
// the console ONLY when NODE_ENV !== "production" — in production, with no
// mail transport configured, the code goes nowhere but the (unread) intended
// inbox, and login is correctly impossible rather than trivially bypassable.
// A previous version of this endpoint always returned the code in the
// response, which meant anyone who knew a valid e-mail address — no
// password, no mailbox access required — could log in as that person.
authRouter.post("/otp/request", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid college e-mail required" });

  const email = parsed.data.email.trim().toLowerCase();

  if (!requestLimiter.consume(email)) {
    return res.status(429).json({ error: "Too many OTP requests for this e-mail — try again in a few minutes" });
  }

  const [faculty, student] = await Promise.all([
    prisma.faculty.findUnique({ where: { email } }),
    prisma.student.findUnique({ where: { email } }),
  ]);
  if (!faculty && !student) {
    return res.status(404).json({ error: "No account found for this e-mail" });
  }

  const code = generateOtp();
  await prisma.otpRequest.create({
    data: { email, code, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  const emailed = await sendOtpEmail(email, code);

  if (isProduction) {
    console.log(`[auth] OTP issued for ${email} (${emailed ? "sent by e-mail" : "NO MAIL TRANSPORT CONFIGURED — set SMTP_* env vars"})`);
    return res.json({ ok: true });
  }

  console.log(`[dev-otp] ${email} -> ${code} (expires in 5 min)${emailed ? " — also e-mailed" : ""}`);
  res.json({ ok: true, devOtp: code });
});

const verifySchema = z.object({ email: z.string().email(), code: z.string().length(6) });

// POST /auth/otp/verify — verify OTP, issue a session bound to the caller's role and identity.
authRouter.post("/otp/verify", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "E-mail and 6-digit code required" });

  const email = parsed.data.email.trim().toLowerCase();
  const code = parsed.data.code;

  if (!verifyLimiter.consume(email)) {
    return res.status(429).json({ error: "Too many attempts for this e-mail — try again in a few minutes" });
  }

  const otp = await prisma.otpRequest.findFirst({
    where: { email, code, consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return res.status(401).json({ error: "Invalid or expired code" });

  await prisma.otpRequest.update({ where: { id: otp.id }, data: { consumed: true } });

  const [faculty, student] = await Promise.all([
    prisma.faculty.findUnique({ where: { email } }),
    prisma.student.findUnique({ where: { email } }),
  ]);

  let role: "ADMIN" | "PROCTOR" | "STUDENT";
  let facultyId: number | null = null;
  let usn: string | null = null;
  let profile: unknown;

  if (faculty) {
    role = faculty.role as "ADMIN" | "PROCTOR";
    facultyId = faculty.facultyId;
    profile = faculty;
  } else if (student) {
    role = "STUDENT";
    usn = student.usn;
    profile = student;
  } else {
    return res.status(404).json({ error: "No account found for this e-mail" });
  }

  verifyLimiter.reset(email);

  const token = generateSessionToken();
  await prisma.session.create({
    data: {
      token,
      email,
      role,
      facultyId,
      usn,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  res.cookie(SESSION_COOKIE, token, { ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_TTL_MS });
  res.json({ role, profile });
});

// GET /auth/me — the frontend calls this on load to find out whether the
// (httpOnly, JS-invisible) session cookie is still valid and who it belongs
// to. Fetches a fresh profile rather than trusting a cached one, since the
// cookie carries only a token, not a snapshot of the account.
authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const { role, facultyId, usn } = req.auth!;
  const profile = facultyId
    ? await prisma.faculty.findUnique({ where: { facultyId } })
    : await prisma.student.findUnique({ where: { usn: usn! } });
  if (!profile) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Account no longer exists" });
  }
  res.json({ role, profile });
});

authRouter.post("/logout", async (req: AuthedRequest, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { token } });
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});
