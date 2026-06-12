/*
 * middleware/rateLimiter.ts
 *
 * Simple in-memory rate limiter — 1,200 requests per IP per 60-second window.
 * Returns HTTP 429 Too Many Requests when the limit is exceeded.
 *
 * Implementation:
 *   - Tracks each client by IP address using a Map.
 *   - Each entry stores a request count and the timestamp when the window opened.
 *   - The window resets (sliding reset) if more than 60 seconds have elapsed
 *     since the first request in that window.
 *
 * Limitations:
 *   - State is held in process memory; restarting the server resets all counters.
 *   - Not suitable for multi-process / clustered deployments without a shared
 *     store (e.g. Redis). For a single-process dev/capstone server this is fine.
 */
/** Maximum number of requests a single IP may make in one 60-second window. */
const MAX_REQUESTS_PER_MINUTE = 1200;
/** Sliding-window state keyed by client IP. */
const requestCounts = new Map();
/**
 * Express middleware that enforces the rate limit.
 * Calls next() if the request is within quota, or sends 429 if exceeded.
 */
export function rateLimiter(req, res, next) {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const entry = requestCounts.get(ip);
    if (!entry || now - entry.windowStart > 60_000) {
        // First request, or window has expired — open a new window.
        requestCounts.set(ip, { count: 1, windowStart: now });
        next();
    }
    else if (entry.count < MAX_REQUESTS_PER_MINUTE) {
        // Within quota — increment and allow.
        entry.count++;
        next();
    }
    else {
        // Quota exhausted for this window.
        res.status(429).json({ error: "Too many requests. Please wait before retrying." });
    }
}
//# sourceMappingURL=rateLimiter.js.map