import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { authRouter } from "./modules/auth/routes";
import { ingestionRouter } from "./modules/ingestion/routes";
import { resultsRouter } from "./modules/results/routes";
import { activityPointsRouter } from "./modules/activityPoints/routes";
import { calendarRouter } from "./modules/calendar/routes";
import { facultyRouter } from "./modules/faculty/routes";
import { studentsRouter } from "./modules/students/routes";
import { reportsRouter } from "./modules/reports/routes";
import { scanRouter } from "./modules/scan/routes";
import { notificationsRouter } from "./modules/notifications/routes";
import { auditRouter } from "./modules/audit/routes";
import { attendanceRouter } from "./modules/attendance/routes";
import { accoladesRouter } from "./modules/accolades/routes";

export function createApp(options: { enforceHttps?: boolean } = {}) {
  const app = express();

  // Must run before anything else — cors/helmet/routes below would otherwise
  // process (and respond to) a plaintext request before this ever gets a
  // chance to redirect it, which defeats the point. Off by default (and for
  // every test) since it needs `trust proxy` set correctly first, which only
  // index.ts's production path does; /api/health is exempt so the container's
  // own HEALTHCHECK — a plain HTTP loopback call — doesn't start failing.
  if (options.enforceHttps) {
    app.use((req, res, next) => {
      if (req.path === "/api/health" || req.secure) return next();
      res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    });
  }

  // A real, verified CSP — not the permissive helmet default, and not
  // disabled either. Everything the built frontend actually needs is
  // same-origin: no CDN scripts/styles (fonts are self-hosted via
  // @fontsource, not Google Fonts), no inline <script>, and — after moving
  // the one inline style prop the app had into a Tailwind utility class —
  // no inline <style> either. That let this go all the way to script-src
  // 'self' and style-src 'self' with no 'unsafe-inline' escape hatch, which
  // is what actually stops an XSS payload from running even if one gets
  // injected some other way (e.g. a future bug in how uploaded/imported data
  // gets rendered) — confirmed by grepping the built dist/ output, not
  // assumed.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
    })
  );

  // In production the frontend is served from this same origin (see index.ts),
  // so no cross-origin requests are expected. In dev the Vite server runs on a
  // different port, so we allow just that one configured origin rather than "*".
  // credentials: true is required for the session cookie to be sent/set at all
  // — without it the browser silently drops Set-Cookie on cross-origin responses.
  app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // Per-e-mail throttling (auth/routes.ts) alone doesn't stop an attacker who
  // rotates through many different e-mail addresses from one IP; this catches
  // that. Generous enough not to interfere with normal use or the test suite
  // (~70 auth calls in a single run) — the point is capping automated abuse
  // by orders of magnitude, not rate-limiting real users.
  const authIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests from this address — try again later" },
  });
  const generalIpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests — try again later" },
  });

  const api = express.Router();
  api.use(generalIpLimiter);
  // Uploaded proof files are served by a route inside activityPointsRouter,
  // not a bare express.static mount — each request is checked against the
  // same per-claim RBAC as the rest of the API (own claim / own proctee's
  // claim / Admin), and the response is forced to download rather than
  // render inline, regardless of what content type sneaks past the upload
  // whitelist. A static mount here would let any authenticated user fetch
  // any other user's proof file just by knowing its (unguessable, but not
  // access-controlled) filename.
  api.get("/health", (_req, res) => res.json({ ok: true }));
  api.use("/auth", authIpLimiter, authRouter);
  api.use("/admin", ingestionRouter);
  api.use("/", resultsRouter);
  api.use("/", activityPointsRouter);
  api.use("/", calendarRouter);
  api.use("/", facultyRouter);
  api.use("/students", studentsRouter);
  api.use("/", reportsRouter);
  api.use("/", scanRouter);
  api.use("/", notificationsRouter);
  api.use("/", auditRouter);
  api.use("/", attendanceRouter);
  api.use("/", accoladesRouter);

  app.use("/api", api);

  return app;
}

/**
 * Must be attached AFTER every other app.use() call (including static/catch-all
 * routes added by the caller) — Express only walks forward through the stack
 * looking for an error handler, so one registered too early misses errors from
 * routes mounted later.
 */
export function attachErrorHandler(app: express.Express) {
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (err?.name === "MulterError" || err?.name === "InvalidFileTypeError") {
      return res.status(400).json({ error: `Upload rejected: ${err.message}` });
    }
    res.status(500).json({ error: "Internal server error" });
  });
}
