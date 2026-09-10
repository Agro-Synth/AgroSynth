// ============================================================
// NASA POWER — climat historique (30 derniers jours)
// ============================================================
import { CONFIG } from "../config.js";
import { fetchJSON } from "../utils/http.js";

export async function climateHistory(lat, lng, days = 30) {
  const today = new Date();
  const past = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10).replaceAll("-", "");

  const params = new URLSearchParams({
    parameters: "T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,WS10M,ALLSKY_SFC_SW_DWN",
    community: "AG",
    longitude: String(lng),
    latitude: String(lat),
    start: fmt(past),
    end: fmt(today),
    format: "JSON",
  });

  const data = await fetchJSON(`${CONFIG.NASA_POWER_URL}?${params.toString()}`, {}, 20_000);
  const p = data?.properties?.parameter || {};
  const avg = (arr) => {
    const vals = Object.values(arr || {}).map(Number).filter(Number.isFinite);
    return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null;
  };
  return {
    type: "climate_history",
    days,
    tavg_c: avg(p.T2M),
    tmax_avg_c: avg(p.T2M_MAX),
    tmin_avg_c: avg(p.T2M_MIN),
    rain_total_mm: (() => {
      const vals = Object.values(p.PRECTOTCORR || {}).map(Number).filter(Number.isFinite);
      return vals.length ? Number(vals.reduce((a, b) => a + b, 0).toFixed(1)) : null;
    })(),
    wind_avg_ms: avg(p.WS10M),
    solar_avg_wm2: avg(p.ALLSKY_SFC_SW_DWN),
  };
}

export async function sunriseSunset(lat, lng) {
  const data = await fetchJSON(`${CONFIG.SUN_URL}?lat=${lat}&lng=${lng}`, {}, 10_000);
  return data?.results || null;
}
