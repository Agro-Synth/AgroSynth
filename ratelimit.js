// ============================================================
// Rate limiting — par IP, en memoire (Workers isolates).
// Pour la production multi-isolate, brancher KV ou Durable Object.
// ============================================================
import { CONFIG } from "../config.js";

const buckets = new Map();

export function rateLimit(ip) {
  const now = Date.now();
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;
  let hits = buckets.get(ip) || [];
  hits = hits.filter((t) => t > windowStart);
  if (hits.length >= CONFIG.RATE_LIMIT_MAX) {
    buckets.set(ip, hits);
    return false;
  }
  hits.push(now);
  buckets.set(ip, hits);
  return true;
}

// Nettoyage periodique pour limiter la memoire
export function cleanupBuckets() {
  const cutoff = Date.now() - CONFIG.RATE_LIMIT_WINDOW_MS * 2;
  for (const [ip, hits] of buckets) {
    const kept = hits.filter((t) => t > cutoff);
    if (kept.length) buckets.set(ip, kept);
    else buckets.delete(ip);
  }
}
