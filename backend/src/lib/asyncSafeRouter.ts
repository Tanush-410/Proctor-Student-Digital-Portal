import { Router, RequestHandler } from "express";

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * Express 4 does not catch a rejected promise thrown by an async route
 * handler — it just hangs the request, and on Node 15+ an unhandled
 * rejection anywhere in the process brings the whole server down. Every
 * route in this app is async (Prisma calls throughout), so instead of
 * wrapping each handler individually, this decorates the router's
 * registration methods once: any handler that is itself an async function
 * (including middleware like requireAuth) gets its rejection forwarded to
 * next(err), where attachErrorHandler (src/app.ts) turns it into a JSON 500.
 */
export function safeRouter(): Router {
  const router = Router();
  for (const method of METHODS) {
    const original = router[method].bind(router);
    (router as any)[method] = (path: string, ...handlers: RequestHandler[]) => {
      const wrapped = handlers.map((h) =>
        (h as any).constructor?.name === "AsyncFunction"
          ? (req: any, res: any, next: any) => Promise.resolve(h(req, res, next)).catch(next)
          : h
      );
      return (original as any)(path, ...wrapped);
    };
  }
  return router;
}
