// ============================================================
// FLA7I AI 5.0 — Configuration centrale
// ============================================================

export const CONFIG = {
  APP_NAME: "فلاحي AI",
  VERSION: "5.0.0",

  OPENROUTER_URL: "https://openrouter.ai/api/v1/chat/completions",

  // Free-first routing — noms a jour depuis le routage IA
  MODELS: {
    FAST: "openrouter/free",
    REASONING: "openrouter/free",
    AGRONOMY: "openrouter/free",
    FALLBACK: "openrouter/free",
  },

  COPERNICUS_TOKEN_URL:
    "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token",
  COPERNICUS_CATALOG_URL:
    "https://sh.dataspace.copernicus.eu/catalog/v1",
  COPERNICUS_STATS_URL:
    "https://sh.dataspace.copernicus.eu/statistics/v1",
  COPERNICUS_PROCESS_URL:
    "https://sh.dataspace.copernicus.eu/process/v1",
  COPERNICUS_WMS_URL:
    "https://sh.dataspace.copernicus.eu/ogc/wms",

  OPEN_METEO_URL: "https://api.open-meteo.com/v1/forecast",
  OPEN_METEO_GEOCODING: "https://geocoding-api.open-meteo.com/v1/search",
  NASA_POWER_URL: "https://power.larc.nasa.gov/api/temporal/daily/point",
  SOILGRIDS_URL: "https://rest.isric.org/soilgrids/v2.0",
  SUN_URL: "https://api.sunrisesunset.io/json",
  PERENUAL_URL: "https://perenual.com/api/v2",

  REQUEST_TIMEOUT: 30000,
  MAX_MESSAGE_LENGTH: 12000,
  MAX_HISTORY_MESSAGES: 16,
  MAX_POLYGON_POINTS: 100,
  MAX_CLOUD_COVER: 35,
  SATELLITE_MAX_DAYS: 30,

  // Agent loop — anti boucle infinie
  MAX_AGENT_STEPS: 8,
  AGENT_TIMEOUT_MS: 55000,
  TOOL_RETRY: 2,

  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 30,
};

export function getOpenRouterKey(env) {
  return env.OPENROUTER_API_KEY || env.openrouter_API_KEY || "";
}

export function getCDSECredentials(env) {
  return {
    id: env.CDSE_CLIENT_ID || "",
    secret: env.CDSE_CLIENT_SECRET || "",
  };
}
