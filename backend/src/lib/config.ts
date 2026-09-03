import path from "path";

/**
 * Defaults to backend/uploads (matching local dev). In production this
 * should point into a mounted volume — an absolute path via UPLOADS_DIR
 * (e.g. /data/uploads) — so uploaded proof files survive a container
 * redeploy instead of living in the ephemeral image filesystem.
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "..", "..", "uploads");

/** Name of the httpOnly session cookie. Shared between auth/routes.ts (sets it) and middleware/session.ts (reads it). */
export const SESSION_COOKIE = "pd_session";

/**
 * Public base URL of the deployed app (e.g. https://proctor-diary.onrender.com),
 * used only to build a clickable link in a notification e-mail — the app
 * itself never needs this, since the frontend calls the API same-origin
 * (prod) or via Vite's proxy (dev). Unset in dev; notification e-mails just
 * omit the link rather than send a broken relative one.
 */
export const APP_URL = (process.env.APP_URL || "").replace(/\/$/, "");
