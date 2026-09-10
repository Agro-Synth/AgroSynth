// ============================================================
// SoilGrids (ISRIC) v2 REST — proprietes de sol estimees
// Toujours retourner "estimation regionale, pas analyse de laboratoire"
// ============================================================
import { CONFIG } from "../config.js";
import { fetchJSON } from "../utils/http.js";

const PROPERTIES = ["phh2o", "sand", "silt", "clay", "soc", "cec", "nitrogen"];

export async function soilAnalysis(lat, lng, depth = "0-5cm") {
  const props = PROPERTIES.join(",");
  const url =
    `${CONFIG.SOILGRIDS_URL}/properties/query?` +
    `lon=${lng}&lat=${lat}&property=${props}&depth=${depth}&value=mean`;

  const data = await fetchJSON(url, {}, 20_000);

  // SoilGrids retourne les valeurs avec facteurs d'echelle
  const SCALE = { phh2o: 10, soc: 10, cec: 10, nitrogen: 100 };
  const UNIT = { phh2o: "pH", soc: "g/kg", cec: "cmol(c)/kg", nitrogen: "g/kg", sand: "%", silt: "%", clay: "%" };

  const out = { type: "soil_estimate", depth, disclaimer: "Estimation regionale SoilGrids — pas une analyse de laboratoire du champ." };
  for (const layer of data?.properties?.layers || []) {
    const name = layer.name;
    const mean = layer?.depths?.[0]?.values?.mean;
    if (mean == null) continue;
    const factor = SCALE[name] || 1;
    out[name] = { value: Number((mean / factor).toFixed(2)), unit: UNIT[name] || "" };
  }
  return out;
}
