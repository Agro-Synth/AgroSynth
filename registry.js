// ============================================================
// TOOL REGISTRY central — chaque outil: name, description,
// inputSchema (JSON Schema), execute(args, context).
// L'agent ne connait PAS les implementations.
// ============================================================
import { satelliteTools } from "../tools/satellite.js";
import { weatherTools, geocodingTools } from "../tools/weather.js";
import { soilTools } from "../tools/soil.js";
import { irrigationTools, agricultureTools } from "../tools/irrigation.js";
import { plantTools } from "../tools/plants.js";

const ALL = {
  ...satelliteTools,
  ...weatherTools,
  ...soilTools,
  ...irrigationTools,
  ...agricultureTools,
  ...geocodingTools,
  ...plantTools,
};

export function getTool(name) {
  return ALL[name] || null;
}

export function listTools() {
  return Object.entries(ALL).map(([name, t]) => ({
    name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

// Validation minimale JSON Schema (properties required + type primitif)
export function validateArgs(tool, args) {
  const schema = tool.inputSchema || {};
  for (const req of schema.required || []) {
    if (args[req] === undefined || args[req] === null) {
      throw new Error(`Argument requis manquant: '${req}'`);
    }
  }
  for (const [key, def] of Object.entries(schema.properties || {})) {
    if (args[key] === undefined) continue;
    if (def.type === "number" && !Number.isFinite(Number(args[key]))) {
      throw new Error(`Argument '${key}' doit etre un nombre`);
    }
    if (def.type === "string" && typeof args[key] !== "string") {
      throw new Error(`Argument '${key}' doit etre une chaine`);
    }
  }
  return true;
}
