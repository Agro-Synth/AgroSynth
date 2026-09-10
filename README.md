# FLA7I AI 5.0 — Agent Agronomique Autonome

Architecture agentique inspiree du pattern **Claude (Anthropic)** :
boucle LLM -> Tool Call -> Observation -> Reasoning -> reponse finale.

## Structure

```
src/
├── index.js               # Entree Worker : routing, rate-limit, CORS
├── config.js              # Config + secrets names
├── frontend/index.js      # UI RTL (chat, carte, tool progress)
├── agent/
│   ├── core.js            # BOUCLE AGENT : plan -> execute -> reason
│   ├── registry.js        # Tool Registry central + validation JSON Schema
│   ├── llm.js             # Provider abstraction (OpenRouter free-first)
│   └── prompts.js         # Cerveau agronomique (system/planner/reasoner)
├── tools/                 # satellite, weather, soil, irrigation, plants, geocoding
├── services/              # copernicus (OAuth+Stats), openmeteo, soilgrids, nasa
├── calculations/          # Moteur agronomique DETERMINISTE (ETc=ET0*Kc)
└── utils/                 # http, validate (GeoJSON), ratelimit
```

## Ce qui change par rapport a la V4 (monolithe)

| V4 | V5 |
|---|---|
| `detectIntent` par regex + if/else geants | Planner LLM qui CHOISIT les outils (function calling declaratif) |
| Un seul appel API par requete | Boucle multi-outils avec observations |
| `sampleCount=1` accepte | Validation stricte : rejette acquisitions < 100 pixels |
| Le LLM "faisait" les calculs | Moteur de calcul deterministe (le LLM n'interprete que) |
| Pas de rate-limit | Rate-limit IP + validation GeoJSON + timeouts |
| Erreurs = crash | Retry + fallback explicite, jamais de donnees inventees |

## Installation

```bash
npm install -g wrangler   # si besoin
# 1. Deployer (remplace le code du Worker existant "agriboot")
wrangler deploy

# 2. Secrets (deja existants cote Cloudflare — ne pas supprimer)
wrangler secret put CDSE_CLIENT_ID
wrangler secret put CDSE_CLIENT_SECRET
wrangler secret put openrouter_API_KEY
# optionnel: wrangler secret put PERENUAL_API_KEY

# 3. Tester
curl https://agriboot.unfo-adminsiteweb.workers.dev/api/health
curl -X POST https://agriboot.unfo-adminsiteweb.workers.dev/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"واش خاصني نسقي الطماطم اليوم؟","lat":31.6,"lng":-8.0,"crop":"tomato"}'
```

## API

| Endpoint | Description |
|---|---|
| `GET /` | Interface RTL complete |
| `GET /api/health` | Etat des services (sans secrets) |
| `POST /api/chat` | **Boucle agentique complete** |
| `POST /api/satellite/analyze` | NDVI direct sur un Polygon |
| `GET /api/weather?lat=&lng=` | Meteo agricole condensee |
| `GET /api/soil?lat=&lng=` | Sol SoilGrids (estimation) |
| `GET /api/tools` | Liste des outils + schemas |

## Checklist production

- [ ] Brancher D1 binding `DB` existant (decommenter wrangler.toml)
- [ ] Activer Durable Objects pour la memoire de session
- [ ] Ajouter KV cache (meteo 10min, sol 24h)
- [ ] Remplacer le rate-limit memoire par KV/DO (multi-isolate)
- [ ] Brancher un AI Gateway pour logs/tokens/cout
- [ ] Ajouter authentification utilisateur si multi-tenant

## Limites connues

- `openrouter/free` : la qualite du planner depend des modeles gratuits
  disponibles; le fallback JSON + reponse generale assure la robustesse.
- SoilGrids = estimation regionale 250m, jamais une analyse de laboratoire.
- Area polygon = approximation equirectangulaire (UI), pas cadastrale.
