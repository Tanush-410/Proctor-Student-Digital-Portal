import express from "express";
import path from "path";
import fs from "fs";
import { createApp, attachErrorHandler } from "./app";
import { prisma } from "./db";

const isProduction = process.env.NODE_ENV === "production";
const app = createApp({ enforceHttps: isProduction });

// Deployed behind a reverse proxy/load balancer (Docker, Fly.io, Render, nginx,
// ...) almost everywhere in production — this makes req.ip/req.secure reflect
// the original client via X-Forwarded-*, instead of the proxy's own address.
app.set("trust proxy", 1);

// Production: this same process serves the built frontend, so the browser
// never needs a separate origin/proxy. Dev keeps using the Vite dev server
// with its own proxy to /api (see frontend/vite.config.ts).
const frontendDist = path.join(__dirname, "..", "..", "frontend", "dist");
if (isProduction && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

attachErrorHandler(app);

const SESSION_SWEEP_INTERVAL_MS = 30 * 60 * 1000;
async function sweepExpiredAuth() {
  const now = new Date();
  const [sessions, otps] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.otpRequest.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  if (sessions.count || otps.count) {
    console.log(`[cleanup] removed ${sessions.count} expired session(s), ${otps.count} expired OTP request(s)`);
  }
}
setInterval(() => sweepExpiredAuth().catch((e) => console.error("[cleanup] failed", e)), SESSION_SWEEP_INTERVAL_MS);

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => console.log(`Proctor Diary API listening on :${PORT}`));

// Containers stop with SIGTERM, not Ctrl-C — without this, in-flight requests
// (a large sheet upload, a PDF being streamed) get killed mid-response instead
// of finishing, and the SQLite connection never closes cleanly.
function shutdown(signal: string) {
  console.log(`[shutdown] received ${signal}, closing server...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => {
    console.error("[shutdown] forced exit after 10s timeout");
    process.exit(1);
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
