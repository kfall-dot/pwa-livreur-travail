
/**
 * Cloudflare Workers entry point.
 *
 * Wraps the existing Express app so it runs unmodified on Cloudflare Workers
 * with the `nodejs_compat` compatibility flag enabled.
 *
 * No changes required to server/app.ts or any route/handler code.
 */

import serverless from 'serverless-http'
import { createApp } from './app.js'

/**
 * Cloudflare Workers entry point.
 *
 * The existing Express app is wrapped with `serverless-http` (already a
 * dependency) so it runs **unmodified** on Workers via the `nodejs_compat`
 * compatibility flag.
 *
 * - No changes required to server/app.ts, routes, or handlers.
 * - Sentinels in lib/sentry.ts ensure one-time initialization.
 */
export default serverless(createApp())
