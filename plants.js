// ============================================================
// Plants — adapteur D1 existant (NE JAMAIS recreer la base).
// Si la table n'existe pas ou binding absent -> fallback explicite.
// ============================================================

export const plantTools = {
  plant_search: {
    description: "Rechercher une plante/culture dans la base de connaissances.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    execute: async (args, ctx) => {
      if (!ctx.env.DB) {
        return { success: false, source: "local-db", unavailable: true,
                 message: "Base D1 non connectee (binding 'DB'). Verifier wrangler.toml." };
      }
      const q = `%${String(args.query).slice(0, 60)}%`;
      try {
        const { results } = await ctx.env.DB.prepare(
          `SELECT * FROM plants
           WHERE name_ar LIKE ? OR name_fr LIKE ? OR name_en LIKE ? OR name_scientific LIKE ?
           LIMIT 10`
        ).bind(q, q, q, q).all();
        return { success: true, source: "local-db", count: results.length, plants: results };
      } catch (e) {
        return { success: false, source: "local-db", unavailable: true,
                 message: `Table 'plants' introuvable ou schema different: ${e.message}` };
      }
    },
  },
};
