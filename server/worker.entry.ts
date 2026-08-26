/**
 * Cloudflare Workers entry point.
 * This file exists solely to ensure `worker.ts` is compiled by tsc.
 * Without it, TypeScript tree-shakes the unused wrapper under "NodeNext".
 * Do not delete — referenced by tsconfig.server.json → include[].
 */
export { default } from './worker.js'
