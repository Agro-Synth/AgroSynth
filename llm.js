// ============================================================
// Provider abstraction — OpenRouter (free-first) + fallback
// Pattern inspire de l'architecture agentique Claude :
// le modele retourne une DECISION structuree, jamais du texte libre.
// ============================================================
import { CONFIG, getOpenRouterKey } from "../config.js";
import { fetchJSON } from "../utils/http.js";

function pickModel(intent) {
  switch (intent) {
    case "satellite": case "soil": case "irrigation":
      return CONFIG.MODELS.AGRONOMY;
    case "complex":
      return CONFIG.MODELS.REASONING;
    case "simple": default:
      return CONFIG.MODELS.FAST;
  }
}

export async function generate(env, { messages, intent = "simple", temperature = 0.2, maxTokens = 1600, json = false }) {
  const key = getOpenRouterKey(env);
  if (!key) throw new Error("cle OpenRouter manquante");

  const body = {
    model: pickModel(intent),
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: "json_object" };

  const data = await fetchJSON(CONFIG.OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://agriboot.unfo-adminsiteweb.workers.dev",
      "X-Title": CONFIG.APP_NAME,
    },
    body: JSON.stringify(body),
  }, 30_000);

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("reponse IA vide");
  return { content, model: data?.model || body.model };
}

// Extraction JSON robuste (certains modeles emballent dans ```json)
export function extractJSON(text) {
  if (typeof text !== "string") return null;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}
