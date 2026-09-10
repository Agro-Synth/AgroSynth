import { soilAnalysis } from "../services/soilgrids.js";

export const soilTools = {
  soil_analysis: {
    description: "Proprietes du sol estimees (pH, texture, CEC, COT, N) via SoilGrids/ISRIC.",
    inputSchema: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" }, depth: { type: "string" } }, required: ["lat", "lng"] },
    execute: async (args) => {
      const data = await soilAnalysis(args.lat, args.lng, args.depth || "0-5cm");
      return { success: true, source: "soilgrids-isric", quality: "regional_estimate", data };
    },
  },
};
