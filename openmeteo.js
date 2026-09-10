// ============================================================
// Open-Meteo — meteo agricole (ET0 FAO, humidite sol, previsions)
// ============================================================
import { CONFIG } from "../config.js";
import { fetchJSON } from "../utils/http.js";

export async function getWeather(lat, lng, forecastDays = 7) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m",
    hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,soil_moisture_0_to_1cm,soil_temperature_0cm,et0_fao_evapotranspiration",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,sunrise,sunset",
    forecast_days: String(forecastDays),
    timezone: "Africa/Casablanca",
  });
  return fetchJSON(`${CONFIG.OPEN_METEO_URL}?${params.toString()}`, {}, 15_000);
}

// Synthese agricole condensee pour le reasoner
export function summarizeWeather(data) {
  const cur = data?.current || {};
  const daily = data?.daily || {};
  const idx = 0;
  return {
    temperature_c: cur.temperature_2m ?? null,
    humidity_pct: cur.relative_humidity_2m ?? null,
    wind_kmh: cur.wind_speed_10m ?? null,
    today: {
      tmax: daily.temperature_2m_max?.[idx] ?? null,
      tmin: daily.temperature_2m_min?.[idx] ?? null,
      rain_mm: daily.precipitation_sum?.[idx] ?? 0,
      rain_prob_pct: daily.precipitation_probability_max?.[idx] ?? null,
      et0_mm: daily.et0_fao_evapotranspiration?.[idx] ?? null,
    },
    next7d: (daily.time || []).slice(0, 7).map((t, i) => ({
      date: t,
      rain_mm: daily.precipitation_sum?.[i] ?? 0,
      rain_prob_pct: daily.precipitation_probability_max?.[i] ?? null,
      et0_mm: daily.et0_fao_evapotranspiration?.[i] ?? null,
      tmax: daily.temperature_2m_max?.[i] ?? null,
    })),
  };
}

export async function geocode(name) {
  const params = new URLSearchParams({ name, count: "5", language: "ar", format: "json" });
  return fetchJSON(`${CONFIG.OPEN_METEO_GEOCODING}?${params.toString()}`, {}, 10_000);
}
