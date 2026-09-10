// ============================================================
// Outils satellite — garde anti "sampleCount = 1" de la V1
// ============================================================
import { CONFIG } from "../config.js";
import { validatePolygon, polygonBBox, polygonAreaHa, centroid } from "../utils/validate.js";
import { catalogSearch, ndviStatistics, summarizeNDVI, wmsUrl } from "../services/copernicus.js";

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getTime() - CONFIG.SATELLITE_MAX_DAYS * 864e5).toISOString();
  return { from, to: now.toISOString() };
}

export const satelliteTools = {
  satellite_search: {
    description: "Rechercher les acquisitions Sentinel-2 disponibles sur une zone (dates, nuages).",
    inputSchema: { type: "object", properties: { geometry: { type: "object" } }, required: ["geometry"] },
    execute: async (args, ctx) => {
      validatePolygon(args.geometry);
      const bbox = polygonBBox(args.geometry);
      const { from, to } = args.from && args.to ? { from: args.from, to: args.to } : defaultRange();
      const acquisitions = await catalogSearch(ctx.env, bbox, from, to);
      return { success: true, source: "copernicus-catalog", acquisitions, count: acquisitions.length };
    },
  },

  ndvi_analysis: {
    description: "NDVI Sentinel-2 L2A (SCL + dataMask) sur un Polygon, avec statistiques validees.",
    inputSchema: { type: "object", properties: { geometry: { type: "object" }, from: { type: "string" }, to: { type: "string" } }, required: ["geometry"] },
    execute: async (args, ctx) => {
      validatePolygon(args.geometry);
      const { from, to } = args.from && args.to ? { from: args.from, to: args.to } : defaultRange();
      const raw = await ndviStatistics(ctx.env, args.geometry, from, to, args.interval || "P5D");
      const summary = summarizeNDVI(raw);
      const bbox = polygonBBox(args.geometry);
      return {
        success: true,
        source: "copernicus-statistics",
        satellite: "Sentinel-2 L2A",
        index: "NDVI",
        resolution_m: 10,
        period: { from, to },
        area_ha: Number(polygonAreaHa(args.geometry).toFixed(2)),
        bbox,
        quality: summary.quality,
        summary,
        map_url: summary.available ? wmsUrl(ctx.env, bbox, from, to, "NDVI") : null,
        warnings: summary.available
          ? (summary.samples < 1000 ? ["Faible nombre de pixels valides — interpreter avec prudence."] : [])
          : [summary.message],
      };
    },
  },

  ndvi_timeseries: {
    description: "Serie temporelle NDVI (tendance, stress, reprise).",
    inputSchema: { type: "object", properties: { geometry: { type: "object" }, days: { type: "number" } }, required: ["geometry"] },
    execute: async (args, ctx) => {
      validatePolygon(args.geometry);
      const days = Math.min(Number(args.days) || 60, 180);
      const to = new Date().toISOString();
      const from = new Date(Date.now() - days * 864e5).toISOString();
      const raw = await ndviStatistics(ctx.env, args.geometry, from, to, "P10D");
      const summary = summarizeNDVI(raw);
      return {
        success: true, source: "copernicus-statistics", satellite: "Sentinel-2 L2A",
        index: "NDVI", interval: "P10D", period: { from, to }, quality: summary.quality, summary,
        warnings: summary.available ? [] : [summary.message],
      };
    },
  },
};
