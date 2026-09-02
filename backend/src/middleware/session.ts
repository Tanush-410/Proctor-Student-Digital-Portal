import { Request, Response, NextFunction } from "express";
import { prisma } from "../db";
import { SESSION_COOKIE } from "../lib/config";

export type SessionRole = "ADMIN" | "PROCTOR" | "STUDENT";

export interface AuthedRequest extends Request {
  auth?: {
    token: string;
    email: string;
    role: SessionRole;
    facultyId: number | null;
    usn: string | null;
  };
}

/**
 * Resolves identity strictly from the session cookie — never from a
 * client-supplied id in the URL/body, and never from a token the page's own
 * JavaScript can read (the cookie is httpOnly). This is the single choke
 * point every downstream route relies on for "whose data am I allowed to
 * touch". Session tokens used to live in localStorage and travel as a
 * Bearer header; that meant any XSS anywhere in the app — including via an
 * uploaded file served back with the wrong content type, a real bug fixed
 * alongside this one — could read the token straight out of JS and steal
 * the session. An httpOnly cookie can't be read by JavaScript at all, so
 * that theft path is closed even if a future XSS bug slips through.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return res.status(401).json({ error: "Not signed in" });
  }

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) {
    res.clearCookie(SESSION_COOKIE);
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  req.auth = {
    token,
    email: session.email,
    role: session.role as SessionRole,
    facultyId: session.facultyId,
    usn: session.usn,
  };
  next();
}

export function requireRole(...roles: SessionRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "Not authorized for this resource" });
    }
    next();
  };
}
