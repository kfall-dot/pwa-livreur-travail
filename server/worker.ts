/**
 * Point d'entrée Cloudflare Workers.
 *
 * On conserve `serverless-http` (déjà une dépendance) comme couche de
 * traduction req/res pour Express, mais il produit un handler « événement
 * Lambda », pas un module Worker : CF exige des handlers `fetch` / `scheduled`
 * sur l'export par défaut (sinon erreur 10068 « no registered event handlers »).
 *
 * → on traduit nous-mêmes la requête Cloudflare en événement Lambda v1
 *   (format nativement compris par serverless-http), puis la réponse Lambda
 *   en `Response` Workers. Aucun changement requis dans app.ts / routes.
 */

import serverless from 'serverless-http'
import { createApp } from './app.js'

interface LambdaResult {
  readonly statusCode: number
  readonly headers?: Record<string, string | undefined>
  readonly isBase64Encoded?: boolean
  readonly body?: string | null
}

/** Handler Express transformé en consommateur d'événements Lambda v1. */
const lambdaHandler = serverless(createApp()) as unknown as (
  event: Record<string, unknown>,
  context: Record<string, unknown>,
) => Promise<LambdaResult>

function lambdaEventFromRequest(request: Request): Record<string, unknown> {
  const url = new URL(request.url)
  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })
  return {
    httpMethod: request.method.toUpperCase(),
    path: url.pathname,
    headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    requestContext: {
      path: url.pathname,
      identity: { sourceIp: request.headers.get('cf-connecting-ip') ?? '0.0.0.0' },
    },
    isBase64Encoded: false,
    body: null,
  }
}

async function handleFetch(request: Request): Promise<Response> {
  const event = lambdaEventFromRequest(request)

  if (!['GET', 'HEAD'].includes(String(event.httpMethod))) {
    const bytes = new Uint8Array(await request.arrayBuffer())
    let binary = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    event.body = btoa(binary)
    event.isBase64Encoded = true
  }

  const result = await lambdaHandler(event, {})

  const responseHeaders = new Headers()
  Object.entries(result.headers ?? {}).forEach(([key, value]) => {
    if (typeof value === 'string') responseHeaders.set(key, value)
  })

  if (result.body == null || result.body === '') {
    return new Response(null, { status: result.statusCode, headers: responseHeaders })
  }
  if (result.isBase64Encoded) {
    const raw = Uint8Array.from(atob(result.body), (ch) => ch.charCodeAt(0))
    return new Response(raw, { status: result.statusCode, headers: responseHeaders })
  }
  return new Response(result.body, { status: result.statusCode, headers: responseHeaders })
}

export default {
  /** Requêtes HTTP (routes livreur.cf-ops.net/api/*). */
  fetch: (request: Request): Promise<Response> => handleFetch(request),
  /** Cron toutes les 5 minutes déclaré dans wrangler.jsonc — rien à faire aujourd'hui. */
  scheduled: (): Promise<void> => Promise.resolve(),
}

