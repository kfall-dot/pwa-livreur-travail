import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim()
const sentryOrg = process.env.SENTRY_ORG?.trim()
// Vite ne charge PAS les .env* dans process.env (il ne les injecte que dans
// import.meta.env du bundle client). Sans loadEnv, VITE_API_PROXY_TARGET du
// .env.development était ignoré et le proxy /api retombait sur le fallback
// hérité de netlify:dev (:8888) — d'où les ECONNREFUSED en dev:local.
const devEnv = loadEnv('development', process.cwd())
const sentryProject = process.env.SENTRY_PROJECT?.trim()

export default defineConfig({
  build: {
    sourcemap: sentryAuthToken ? 'hidden' : false,
  },
  plugins: [
    react(),
    ...(sentryAuthToken && sentryOrg && sentryProject
      ? [
          sentryVitePlugin({
            org: sentryOrg,
            project: sentryProject,
            authToken: sentryAuthToken,
            silent: !process.env.CI,
          }),
        ]
      : []),
    VitePWA({
      // E2E (build de prod servi par Express) : SW désactivé pour garder la
      // parité avec l'ancien netlify dev (devOptions.enabled=false) — sans ça,
      // le precache Workbox fige les assets entre les specs Playwright.
      disable: process.env.VITE_E2E === 'true' || process.env.VITE_DISABLE_PWA === 'true',
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon.png',
        'icons/*.png',
        'brand/traceo-*.svg',
        'brand/traceo-*.png',
        'brand/apple-splash-*.png',
      ],
      manifest: {
        name: 'TraceO®',
        short_name: 'TraceO',
        description: 'La plateforme de traçabilité des opérations terrain',
        theme_color: '#0b4a2c',
        background_color: '#0b4a2c',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: [
          '**/brand/login-screen-mock.png',
          '**/brand/login-hero-*.png',
          '**/brand/login-hero-*.jpg',
          '**/brand/emoji-truck*',
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/demo\//],
        cleanupOutdatedCaches: true,
        cacheId: `traceo-${new Date().toISOString().slice(0, 10)}`,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      // Le Service Worker est désactivé en dev pour éviter le cache stale
      // (les env vars Vite comme VITE_GEOFENCE_BYPASS ne seraient pas appliquées sur les assets cachés).
      // En production, le SW reste actif via le build normal.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    // Polling partout : fs.watch (kqueue) sature macOS (EMFILE) avec BTP/ + docs + functions.
    watch: {
      usePolling: true,
      interval: 2000,
      ignored: [
        '**/playwright-report/**',
        '**/test-results/**',
        '**/blob-report/**',
        '**/.netlify/**',
        '**/BTP/**',
        '**/docs/**',
        '**/dist/**',
        '**/dist-server/**',
        '**/e2e/**',
      ],
    },
    proxy: {
      '/api': {
        // netlify:dev → :8888 (via process.env.NETLIFY_DEV du CLI) ;
        // sinon VITE_API_PROXY_TARGET lu depuis .env.development (défaut :3002 pour `npm run dev:local`)
        target: process.env.NETLIFY_DEV
          ? 'http://127.0.0.1:8888'
          : (devEnv.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3002'),
        changeOrigin: true,
      },
    },
  },
})
