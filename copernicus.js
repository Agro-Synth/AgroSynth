// ============================================================
// Copernicus Data Space — OAuth 2.0 + Catalog / Statistics / Process
// Token cache en memoire d'isolate (pas de token neuf a chaque requete)
// ============================================================
import { CONFIG, getCDSECredentials } from "../config.js";
import { fetchTimeout } from "../utils/http.js";

let cachedToken = null;
let cachedExpiry = 0;

export async function getCDSEToken(env) {
  const { id, secret } = getCDSECredentials(env);
  if (!id || !secret) throw new Error("CDSE_CLIENT_ID / CDSE_CLIENT_SECRET manquants");

  const now = Date.now();
  if (cachedToken && now < cachedExpiry - 60_000) return cachedToken;

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", id);
  body.set("client_secret", secret);

  const res = await fetchTimeout(CONFIG.COPERNICUS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  }, 20_000);

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description || "Authentification Copernicus echouee");

  cachedToken = data.access_token;
  cachedExpiry = now + Number(data.expires_in || 3600) * 1000;
  return cachedToken;
}

// Recherche de tuiles disponibles (Catalog API) — garde-fou anti "1 pixel"
export async function catalogSearch(env, bbox, from, to, maxCloud = CONFIG.MAX_CLOUD_COVER) {
  const token = await getCDSEToken(env);
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const url =
    `${CONFIG.COPERNICUS_CATALOG_URL}/search?` +
    `collections=sentinel-2-l2a&` +
    `bbox=${minLng},${minLat},${maxLng},${maxLat}&` +
    `datetime=${from}/${to}&` +
    `filter=eo:cloud_cover%3C${maxCloud}&` +
    `limit=10&sortby=-datetime`;

  const res = await fetchTimeout(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }, 20_000);

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Catalog HTTP ${res.status}`);
  return (data?.features || []).map((f) => ({
    date: f?.properties?.datetime,
    cloud: f?.properties?.["eo:cloud_cover"],
    id: f?.id,
  }));
}

const EVALSCRIPT = {
  // NDVI Sentinel-2 L2A avec filtrage SCL + dataMask
  ndvi: `
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04","B08","SCL","dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(sample) {
  const bad = sample.dataMask === 0 || [0,1,3,8,9,10,11].includes(sample.SCL);
  if (bad) return { ndvi: [0], dataMask: [0] };
  const d = sample.B08 + sample.B04;
  if (d === 0) return { ndvi: [0], dataMask: [0] };
  return { ndvi: [(sample.B08 - sample.B04) / d], dataMask: [1] };
}`,
};

// Statistical API — NDVI mean/min/max/stDev/sampleCount par intervalle
export async function ndviStatistics(env, geometry, from, to, interval = "P5D") {
  const token = await getCDSEToken(env);
  const payload = {
    input: {
      bounds: {
        geometry,
        properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
      },
      data: [{
        type: "sentinel-2-l2a",
        dataFilter: {
          maxCloudCoverage: CONFIG.MAX_CLOUD_COVER,
          mosaickingOrder: "leastCC",
        },
      }],
    },
    aggregation: {
      timeRange: { from, to },
      aggregationInterval: { of: interval },
      evalscript: EVALSCRIPT.ndvi,
      resx: 10,
      resy: 10,
    },
  };

  const res = await fetchTimeout(CONFIG.COPERNICUS_STATS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  }, 30_000);

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || data?.error || `Statistics HTTP ${res.status}`);
  return data;
}

// Validation stricte : un champ ~2.5 ha a 10m = ~2500 pixels valides minimum
export function summarizeNDVI(data, minValidSamples = 100) {
  const rows = Array.isArray(data?.data) ? data.data : [];
  const days = [];
  let samples = 0;

  for (const row of rows) {
    const stats = row?.outputs?.ndvi?.bands?.B0?.stats;
    if (!stats || !Number.isFinite(Number(stats.mean))) continue;
    const sc = Number(stats.sampleCount || 0);
    if (sc < minValidSamples) continue; // rejette les acquisitions quasi vides
    days.push({
      date: row.interval?.from || null,
      mean: Number(stats.mean),
      min: Number(stats.min),
      max: Number(stats.max),
      stDev: Number(stats.stDev),
      sampleCount: sc,
    });
    samples += sc;
  }

  if (!days.length) {
    return {
      available: false,
      quality: "insufficient",
      message: "Aucune acquisition Sentinel-2 valide dans la fenetre (nuages / hors AOI).",
      days: [],
    };
  }

  const means = days.map((d) => d.mean);
  const overallMean = means.reduce((a, b) => a + b, 0) / means.length;
  // Tendance simple : pente entre premier et dernier
  const trend = Number((means[means.length - 1] - means[0]).toFixed(4));

  return {
    available: true,
    quality: samples >= 1000 ? "good" : "low",
    overallMean: Number(overallMean.toFixed(4)),
    min: Number(Math.min(...days.map((d) => d.min)).toFixed(4)),
    max: Number(Math.max(...days.map((d) => d.max)).toFixed(4)),
    observations: days.length,
    samples,
    trend,
    days,
  };
}

// URL WMS publique (instance = configuration, pas un secret)
export function wmsUrl(env, bbox, from, to, layer = "NDVI") {
  const instance = env.COPERNICUS_INSTANCE_ID || "";
  if (!instance) return null;
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const params = new URLSearchParams({
    SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.3.0",
    LAYERS: layer, CRS: "EPSG:4326",
    BBOX: `${minLat},${minLng},${maxLat},${maxLng}`,
    WIDTH: "900", HEIGHT: "700",
    FORMAT: "image/png", TRANSPARENT: "true",
    SHOWLOGO: "false",
    MAXCC: String(CONFIG.MAX_CLOUD_COVER),
    TIME: `${from}/${to}`,
  });
  return `${CONFIG.COPERNICUS_WMS_URL}/${encodeURIComponent(instance)}?${params.toString()}`;
}
