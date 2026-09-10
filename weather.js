import { getWeather, summarizeWeather, geocode } from "../services/openmeteo.js";
import { climateHistory, sunriseSunset } from "../services/nasa.js";

export const weatherTools = {
  weather_agriculture: {
    description: "Meteo agricole : temperature, humidite, pluie, vent, ET0 FAO, humidite du sol.",
    inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } }, required: ["lat", "lng"] },
    execute: async (args) => {
      const raw = await getWeather(args.lat, args.lng, args.days || 7);
      return {
        success: true, source: "open-meteo", provider: "Open-Meteo",
        location: { lat: args.lat, lng: args.lng }, data: summarizeWeather(raw),
        raw_available: true,
      };
    },
  },

  climate_history: {
    description: "Historique climatique 30 jours (NASA POWER) : T moy, pluie cumulee, vent, rayonnement.",
    inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, days: { type: "number" } }, required: ["lat", "lng"] },
    execute: async (args) => {
      const data = await climateHistory(args.lat, args.lng, Math.min(args.days || 30, 365));
      return { success: true, source: "nasa-power", data };
    },
  },

  sunrise_sunset: {
    description: "Heures lever/coucher du soleil.",
    inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } }, required: ["lat", "lng"] },
    execute: async (args) => {
      const data = await sunriseSunset(args.lat, args.lng);
      return { success: true, source: "sunrisesunset.io", data };
    },
  },
};

export const geocodingTools = {
  geocode_location: {
    description: "Geocoder un nom de ville/region (Open-Meteo Geocoding).",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    execute: async (args) => {
      const data = await geocode(String(args.name).slice(0, 100));
      return { success: true, source: "open-meteo-geocoding", results: data?.results || [] };
    },
  },
};
