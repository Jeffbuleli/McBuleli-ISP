/**
 * Simple in-memory fixed-window rate limiter for unauthenticated public routes.
 * For multi-instance production, place a reverse-proxy limiter or Redis in front.
 */

const buckets = new Map();

function getClientIp(req) {
  const trustProxy = process.env.TRUST_PROXY === "true";
  const xf = req.headers["x-forwarded-for"];
  if (trustProxy && xf) {
    const first = String(xf).split(",")[0].trim();
    if (first) return first;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function cleanupStale(now) {
  if (Math.random() > 0.02) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

/**
 * @param {string} name - logical limiter name (prefixes bucket key)
 * @param {{ windowMs: number; max: number }} opts
 */
export function createPublicRateLimiter(name, opts) {
  const windowMs = Math.max(1000, Number(opts.windowMs) || 60_000);
  const max = Math.max(1, Math.floor(Number(opts.max) || 60));

  return function publicRateLimit(req, res, next) {
    const ip = getClientIp(req);
    const key = `${name}:${ip}`;
    const now = Date.now();
    cleanupStale(now);

    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }

    if (b.count >= max) {
      const retrySec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
      res.set("Retry-After", String(retrySec));
      return res.status(429).json({
        message: "Too many requests from this network. Please wait and try again.",
        retryAfterSec: retrySec
      });
    }
    b.count += 1;
    return next();
  };
}
