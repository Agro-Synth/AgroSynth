// ============================================================
// HTTP helpers — timeouts, reponses, CORS
// ============================================================
import { CONFIG } from "../config.js";

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  };
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json; charset=utf-8" },
  });
}

export function errorResponse(message, status = 500, details = null) {
  return json({ success: false, error: message, ...(details ? { details } : {}) }, status);
}

export async function fetchTimeout(url, options = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJSON(url, options = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
  const res = await fetchTimeout(url, options, timeout);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.reason || data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
