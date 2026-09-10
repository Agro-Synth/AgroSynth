// ============================================================
// Outils irrigation & calculs agronomiques — moteur deterministe
// ============================================================
import { etc, irrigationVolumeMm, volumeM3, plantsPerHa, nitrogenNeed, kcFor } from "../calculations/irrigation.js";
import { getWeather, summarizeWeather } from "../services/openmeteo.js";
import { soilAnalysis } from "../services/soilgrids.js";

export const irrigationTools = {
  irrigation_analysis: {
    description: "Analyse d'irrigation complete : ET0 previsionnel, ETc cultural, pluie efficace, volume m3.",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number" }, lng: { type: "number" },
        crop: { type: "string" }, stage: { type: "string" },
        area_ha: { type: "number" },
      },
      required: ["lat", "lng"],
    },
    execute: async (args) => {
      const crop = args.crop || "generic";
      const stage = args.stage || "mid";
      const weather = await getWeather(args.lat, args.lng, 3);
      const w = summarizeWeather(weather);
      const soil = await soilAnalysis(args.lat, args.lng).catch(() => null);

      const et0 = w.today.et0_mm ?? 5;
      const etcMm = etc(et0, crop, stage);
      const rainNext3d = w.next7d.slice(0, 3).reduce((a, d) => a + (d.rain_mm || 0), 0);
      const netMm = irrigationVolumeMm(etcMm, rainNext3d);
      const totalM3 = args.area_ha ? volumeM3(netMm * 3, args.area_ha) : null; // besoin 3 jours

      return {
        success: true,
        sources: ["open-meteo", soil ? "soilgrids-isric" : null].filter(Boolean),
        calculation: {
          formula: "ETc = ET0 x Kc ; Volume(m3) = net_mm x area_ha x 10",
          crop, stage, kc: kcFor(crop, stage),
          et0_today_mm: et0, etc_mm_day: etcMm,
          rain_next_3d_mm: Number(rainNext3d.toFixed(1)),
          net_irrigation_mm_day: netMm,
          volume_3days_m3: totalM3,
          soil_texture: soil ? { sand: soil.sand?.value, clay: soil.clay?.value } : null,
          weather_today: w.today,
        },
        warnings: etcMm === 0 ? ["ET0 indisponible — calcul sur valeur par defaut, a verifier."] : [],
      };
    },
  },
};

export const agricultureTools = {
  planting_calculation: {
    description: "Densite de plantation (plants/ha) selon espacements.",
    inputSchema: { type: "object", properties: { spacing_m: { type: "number" }, row_spacing_m: { type: "number" } }, required: ["spacing_m", "row_spacing_m"] },
    execute: async (args) => ({
      success: true, source: "calculation-engine",
      data: { plants_per_ha: plantsPerHa(args.spacing_m, args.row_spacing_m) },
    }),
  },

  fertilizer_calculation: {
    description: "Besoin azote (kg N/ha) selon culture et objectif de rendement.",
    inputSchema: { type: "object", properties: { crop: { type: "string" }, target_yield_tons: { type: "number" } }, required: ["crop"] },
    execute: async (args) => ({
      success: true, source: "calculation-engine",
      data: { nitrogen_kg_ha: nitrogenNeed(args.crop, args.target_yield_tons || 5) },
      warnings: ["Estimation indicative — ajuster selon analyse de sol reelle."],
    }),
  },

  water_requirement: {
    description: "Besoin en eau journalier (ETc mm/jour) pour une culture donnee.",
    inputSchema: { type: "object", properties: { crop: { type: "string" }, stage: { type: "string" }, et0_mm: { type: "number" } }, required: ["crop", "et0_mm"] },
    execute: async (args) => ({
      success: true, source: "calculation-engine",
      data: { crop: args.crop, stage: args.stage || "mid", et0_mm: args.et0_mm, etc_mm_day: etc(args.et0_mm, args.crop, args.stage || "mid") },
    }),
  },
};
