// ============================================================
// AGENT CORE — la boucle agentique (inspiree de l'architecture Claude) :
//
//   User -> PLANNER (choisit les outils) -> EXECUTOR (execute +
//   valide) -> OBSERVATION -> REASONER (synthese) -> reponse finale
//
// Avec: MAX_STEPS, TIMEOUT, RETRY, validation, detection de boucle,
// recuperation d'erreur. Aucune donnee inventee.
// ============================================================
import { CONFIG } from "../config.js";
import { generate, extractJSON } from "./llm.js";
import { getTool, listTools, validateArgs } from "./registry.js";
import { plannerPrompt, reasonerPrompt } from "./prompts.js";

export function detectLanguage(text) {
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u00C0-\u024F]/.test(text)) return "fr";
  return "en";
}

// Extraction d'entites simples (geo + culture) depuis la requete
export function extractContext(body, text) {
  const ctx = {};
  if (body?.geometry) ctx.geometry = body.geometry;
  if (body?.lat != null && body?.lng != null) {
    ctx.lat = Number(body.lat); ctx.lng = Number(body.lng);
  }
  const cropMatch = String(text).match(/(طماطم|tomato|بطاطس|potato|قمح|wheat|زيتون|olive|ذرة|maize|فلفل|pepper|بصل|onion|حمضيات|citrus)/i);
  if (cropMatch) ctx.crop = cropMatch[1].toLowerCase();
  const haMatch = String(text).match(/(\d+(?:\.\d+)?)\s*(هكتار|ha|هكتارات)/i);
  if (haMatch) ctx.area_ha = Number(haMatch[1]);
  return ctx;
}

// Enrichit les arguments d'outils avec le contexte utilisateur
function fillArgs(toolName, args, ctx) {
  const a = { ...(args || {}) };
  if (["ndvi_analysis", "ndvi_timeseries", "satellite_search"].includes(toolName) && !a.geometry && ctx.geometry) {
    a.geometry = ctx.geometry;
  }
  if (["weather_agriculture", "soil_analysis", "climate_history", "irrigation_analysis", "sunrise_sunset"].includes(toolName)) {
    if (a.lat == null && ctx.lat != null) { a.lat = ctx.lat; a.lng = ctx.lng; }
    if (toolName === "irrigation_analysis") {
      if (!a.crop && ctx.crop) a.crop = ctx.crop;
      if (a.area_ha == null && ctx.area_ha != null) a.area_ha = ctx.area_ha;
    }
  }
  return a;
}

async function callTool(name, args, ctx) {
  const tool = getTool(name);
  if (!tool) return { success: false, error: `Outil inconnu: ${name}` };
  try {
    validateArgs(tool, args);
  } catch (e) {
    return { success: false, error: e.message };
  }
  // Retry limite avec backoff
  for (let attempt = 0; attempt <= CONFIG.TOOL_RETRY; attempt++) {
    try {
      const result = await tool.execute(args, ctx);
      return { success: true, tool: name, result };
    } catch (e) {
      if (attempt === CONFIG.TOOL_RETRY) {
        return { success: false, tool: name, error: e.message, attempts: attempt + 1 };
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

// -------- 1. PLANNER --------
export async function plan(env, message, language, history) {
  const tools = listTools();
  const schemaBlock = JSON.stringify(tools, null, 1);
  const res = await generate(env, {
    intent: "complex",
    json: true,
    messages: [
      { role: "system", content: plannerPrompt(language) },
      { role: "system", content: `SCHEMAS DES OUTILS:\n${schemaBlock}` },
      ...history.slice(-6),
      { role: "user", content: message },
    ],
  });
  const plan = extractJSON(res.content);
  if (!plan || typeof plan !== "object") {
    // Fallback intentionnel : pas d'invention, on bascule en reponse generale
    return { intent: "general", confidence: 0.3, tools: [], followup_question: null, planner_fallback: true };
  }
  return plan;
}

// -------- 2. EXECUTOR (boucle avec observations) --------
export async function executePlan(plan, ctx) {
  const observations = [];
  const toolsUsed = [];
  const warnings = [];
  let steps = 0;

  for (const call of plan.tools || []) {
    if (steps >= CONFIG.MAX_AGENT_STEPS) {
      warnings.push("Limite d'etapes agent atteinte — certains outils non executes.");
      break;
    }
    const args = fillArgs(call.name, call.arguments, ctx);
    const obs = await callTool(call.name, args, ctx);
    observations.push({ tool: call.name, ...obs });
    toolsUsed.push(call.name);
    steps++;
  }
  return { observations, toolsUsed, warnings };
}

// -------- 3. REASONER --------
export async function reason(env, message, plan, observations, language, history) {
  const payload = {
    user_request: message,
    plan_intent: plan.intent,
    tools_executed: observations.filter((o) => o.success).map((o) => o.tool),
    tools_failed: observations.filter((o) => !o.success).map((o) => ({ tool: o.tool, error: o.error })),
    observations: observations.map((o) => ({ tool: o.tool, success: o.success, result: o.result || o.error })),
  };

  const res = await generate(env, {
    intent: plan.intent === "general" ? "simple" : "complex",
    messages: [
      { role: "system", content: reasonerPrompt(language) },
      ...history.slice(-6),
      { role: "user", content: `DEMANDE: ${message}\n\nRESULTATS DES OUTILS (JSON):\n${JSON.stringify(payload, null, 1)}\n\nProduis la synthese finale.` },
    ],
  });
  return res.content;
}

// -------- BOUCLE AGENT COMPLETE --------
export async function runAgent(env, { message, body, history = [] }) {
  const language = detectLanguage(message);
  const ctx = {
    env,
    language,
    // memoire de session : contexte extrait + historique
    context: extractContext(body, message),
    history,
  };

  const started = Date.now();

  // PLAN
  const plan = await plan(env, message, language, history);

  // Si le planner demande une info minimale -> on demande
  if (plan.followup_question && !(plan.tools || []).length) {
    return {
      success: true, intent: plan.intent, confidence: plan.confidence,
      answer: plan.followup_question, tools_used: [], data: {}, ui: { type: "question" },
      warnings: [],
    };
  }

  // Si besoin de geometrie/localisation non fournie -> UI le demande visuellement
  const needsGeometry = plan.needs_geometry && !ctx.context.geometry;
  const geoTools = (plan.tools || []).some((t) => ["ndvi_analysis", "ndvi_timeseries", "satellite_search"].includes(t.name));
  const needsLocation = plan.needs_location || (geoTools && ctx.context.lat == null);

  if ((needsGeometry || needsLocation) && !plan.planner_fallback) {
    return {
      success: true, intent: plan.intent, confidence: plan.confidence,
      answer: language === "ar"
        ? "باش نحلل، خاصني أولاً تحديد الضيعة على الخريطة. 👇"
        : "Pour analyser, je dois d'abord localiser votre parcelle sur la carte. 👇",
      tools_used: [], data: {},
      ui: { type: needsGeometry ? "draw_field" : "pick_location" },
      warnings: [],
    };
  }

  // EXECUTE (skip si planner a echoue -> reponse generale directe)
  let execResult = { observations: [], toolsUsed: [], warnings: [] };
  if ((plan.tools || []).length) {
    execResult = await executePlan(plan, ctx);
  }

  // REASON
  let answer;
  try {
    answer = await reason(env, message, plan, execResult.observations, language, history);
  } catch (e) {
    // Fallback: reponse brute des outils, sans inventer
    const ok = execResult.observations.filter((o) => o.success);
    answer = ok.length
      ? `Resultats bruts (synthese IA indisponible):\n\n\`\`\`json\n${JSON.stringify(ok.map((o) => o.result), null, 1)}\n\`\`\``
      : "Desole, je n'ai pas pu obtenir de donnees fiables pour votre demande. Veuillez reessayer.";
  }

  const sources = [...new Set(
    execResult.observations.filter((o) => o.success && o.result?.source).map((o) => o.result.source)
  )];

  return {
    success: true,
    answer,
    intent: plan.intent,
    confidence: plan.confidence ?? null,
    sources: sources.map((s) => ({ type: "api", provider: s })),
    tools_used: execResult.toolsUsed,
    data: { observations: execResult.observations.map((o) => ({ tool: o.tool, success: o.success, result: o.result })) },
    ui: { type: plan.intent === "satellite_analysis" ? "satellite_result" : "answer" },
    warnings: [...(plan.warnings || []), ...execResult.warnings],
    latency_ms: Date.now() - started,
  };
}
