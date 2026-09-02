/**
 * Fixed-window rate limiter, in-memory. Sufficient for a single-process app
 * like this one — it does not survive a restart and would not coordinate
 * across multiple instances, which is fine here but worth knowing if this
 * is ever scaled horizontally or put behind a process manager that runs
 * more than one worker.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();

  constructor(private max: number, private windowMs: number) {}

  /** Returns true if the action for `key` is allowed right now, and records the attempt. */
  consume(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart > this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count++;
    return true;
  }

  reset(key: string) {
    this.hits.delete(key);
  }
}
