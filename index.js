// ============================================================
// FLA7I AI 5.0 — Worker principal
// Architecture agentique : Planner -> Executor -> Reasoner
// ============================================================
import { CONFIG, getOpenRouterKey, getCDSECredentials } from "./config.js";
import { corsHeaders, json, errorResponse, num } from "./utils/http.js";
import { rateLimit, cleanupBuckets } from "./utils/ratelimit.js";
import { validatePolygon, polygonBBox, polygonAreaHa } from "./utils/validate.js";
import { runAgent } from "./agent/core.js";
import { listTools } from "./agent/registry.js";
import { getWeather, summarizeWeather } from "./services/openmeteo.js";
import { soilAnalysis } from "./services/soilgrids.js";
import { frontend } from "./frontend/index.js";

const startTime = Date.now();
setInterval(cleanupBuckets, 5 * 60_000).unref?.();

async function health(env) {
  const { id, secret } = getCDSECredentials(env);
  return json({
    success: true, app: CONFIG.APP_NAME, version: CONFIG.VERSION, status: "online",
    uptime_s: Math.round((Date.now() - startTime) / 1000),
    services: {
      worker: true,
      ai: Boolean(getOpenRouterKey(env)),
      copernicus: Boolean(id && secret),
      weather: true, soilgrids: true, nasa_power: true,
      d1_plants: Boolean(env.DB),
    },
    tools_count: listTools().length,
    timestamp: new Date().toISOString(),
  });
}

// POST /api/chat — entree agentique
async function handleChat(request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse("JSON invalide", 400); }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return errorResponse("Message vide", 400);
  if (message.length > CONFIG.MAX_MESSAGE_LENGTH) return errorResponse("Message trop long", 413);

  const history = Array.isArray(body?.messages)
    ? body.messages.filter((m) => m && ["user", "assistant"].includes(m.role) && typeof m.content === "string")
        .slice(-CONFIG.MAX_HISTORY_MESSAGES)
    : [];

  try {
    const result = await runAgent(env, { message, body, history });
    return json(result);
  } catch (e) {
    return errorResponse("Erreur interne de l'agent", 500, e.message);
  }
}

// GET /api/satellite/analyze?from&to + geometry en POST
async function handleSatelliteDirect(request, env) {
  if (request.method !== "POST") return errorResponse("POST requis", 405);
  let body;
  try { body = await request.json(); } catch { return errorResponse("JSON invalide", 400); }
  if (!body?.geometry) return errorResponse("geometry requis (Polygon GeoJSON)", 400);

  try {
    validatePolygon(body.geometry);
    const result = await runAgent(env, {
      message: "Analyse satellite NDVI de ce champ (synthese courte)",
      body: { geometry: body.geometry },
      history: [],
    });
    return json(result);
  } catch (e) {
    return errorResponse("Echec analyse satellite", 502, e.message);
  }
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      const url = new URL(request.url);
      const ip = request.headers.get("cf-connecting-ip") || "unknown";

      // Rate limiting global
      if (!rateLimit(ip)) {
        return errorResponse("Trop de requetes — patientez une minute.", 429);
      }

      // ---- FRONTEND ----
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        return frontend(env);
      }

      // ---- HEALTH ----
      if (request.method === "GET" && url.pathname === "/api/health") return health(env);

      // ---- AGENT ----
      if (request.method === "POST" && url.pathname === "/api/chat") return handleChat(request, env);
      if (request.method === "POST" && url.pathname === "/api/agent") return handleChat(request, env);
      if (request.method === "GET" && url.pathname === "/api/tools") {
        return json({ success: true, tools: listTools() });
      }

      // ---- SATELLITE DIRECT ----
      if (url.pathname === "/api/satellite/analyze") return handleSatelliteDirect(request, env);

      // ---- WEATHER DIRECT ----
      if (request.method === "GET" && url.pathname === "/api/weather") {
        const lat = num(url.searchParams.get("lat"));
        const lng = num(url.searchParams.get("lng"));
        if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return errorResponse("lat/lng invalides", 400);
        }
        try {
          const data = await getWeather(lat, lng);
          return json({ success: true, source: "open-meteo", location: { lat, lng }, data: summarizeWeather(data) });
        } catch (e) { return errorResponse("Meteo indisponible", 502, e.message); }
      }

      // ---- SOIL DIRECT ----
      if (request.method === "GET" && url.pathname === "/api/soil") {
        const lat = num(url.searchParams.get("lat"));
        const lng = num(url.searchParams.get("lng"));
        if (lat === null || lng === null) return errorResponse("lat/lng requis", 400);
        try {
          return json({ success: true, ...(await soilAnalysis(lat, lng)) });
        } catch (e) { return errorResponse("SoilGrids indisponible", 502, e.message); }
      }

      return errorResponse("Route introuvable", 404);
    } catch (error) {
      return errorResponse("Erreur interne Worker", 500, error?.message);
    }
  },
};
