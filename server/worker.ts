/**
 * Point d'entrée Cloudflare Workers pour pwa-livreur-api.
 *
 * CONSTAT TECHNIQUE (validé sur workerd / nodejs_compat) : faire tourner
 * l'application Express complète (app.ts + routes + multer) sur ce runtime
 * n'est pas viable actuellement. Le shim node:http fourni par wrangler/unenv
 * implémente mal la réponse : res.setHeader/write s'appuient sur des champs
 * internes ("_headers", "_write") absents hors d'un vrai serveur http, ce qui
 * fait échouer toutes les requêtes en 500 (constat via wrangler dev et les
 * 3 approches testées : serverless-http, adaptateur stream, adaptateur
 * Writable).
 *
 * Conséquences assumées :
 *  - Le déploiement, les routes et le trigger cron fonctionnent parfaitement.
 *  - L'API HTTP réelle reste servie par Netlify (entrée d'origine
 *    server/index.ts), qui tourne sur un vrai Node avec toutes les dépendances.
 *  - Ce worker expose un heartbeat JSON minimal (fetch) + le cron no-op, pour
 *    garder une exposition "kfallou8502.workers.dev" qui répond proprement
 *    au lieu de planter sur le runtime.
 *
 * Pour faire tourner une vraie API critique sur Worker, la suite logique est
 * d'adosser Express à un adaptateur compatible Workers (type hono) ou de
 * router les endpoints directement. À discuter si on déplace définitivement
 * l'API.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health' || url.pathname === '/api/v1/health') {
      return Response.json({ ok: true, service: 'pwa-livreur-api', ts: Date.now() })
    }
    return Response.json(
      {
        ok: false,
        message: "L'API Express de pwa-livreur est hébergée sur Netlify, pas sur ce worker (voir server/index.ts).",
        path: url.pathname,
      },
      { status: 404 },
    )
  },
  scheduled(): Promise<void> {
    return Promise.resolve()
  },
}