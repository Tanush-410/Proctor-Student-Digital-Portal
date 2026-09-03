const BASE = "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * A 401 on a call into the app (not the login flow itself) means the session
 * cookie is missing/expired/revoked server-side mid-use. Bounce to login
 * rather than leaving the user staring at a page full of failed requests and
 * raw error text. Auth endpoints are excluded — a wrong OTP code is a normal
 * 401 the login form should display inline, not a reason to redirect away
 * from the login page it's already on.
 */
function handleSessionExpiry() {
  if (window.location.pathname === "/login") return;
  window.location.href = "/login?expired=1";
}

async function handle(path: string, res: Response) {
  if (res.status === 401 && !path.startsWith("/auth/")) {
    handleSessionExpiry();
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error ? (typeof body.error === "string" ? body.error : JSON.stringify(body.error)) : message;
    } catch {
      /* ignore body parse failure */
    }
    throw new ApiError(res.status, message);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return res.json();
  return res;
}

// The session lives in an httpOnly cookie now (not a token this JS can read
// or attach itself) — credentials: "include" is what makes the browser send
// it. See backend/src/middleware/session.ts for why.
export const api = {
  get: (path: string) => fetch(`${BASE}${path}`, { credentials: "include" }).then((r) => handle(path, r)),

  post: (path: string, body?: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).then((r) => handle(path, r)),

  patch: (path: string, body?: unknown) =>
    fetch(`${BASE}${path}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }).then((r) => handle(path, r)),

  delete: (path: string) => fetch(`${BASE}${path}`, { method: "DELETE", credentials: "include" }).then((r) => handle(path, r)),

  upload: (path: string, form: FormData) =>
    fetch(`${BASE}${path}`, { method: "POST", credentials: "include", body: form }).then((r) => handle(path, r)),

  fileUrl: (path: string) => `${BASE}${path}`,

  async downloadPdf(path: string): Promise<Blob> {
    const res = await fetch(`${BASE}${path}`, { credentials: "include" });
    if (res.status === 401) handleSessionExpiry();
    if (!res.ok) throw new ApiError(res.status, res.statusText);
    return res.blob();
  },
};
