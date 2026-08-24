/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_E2E: string
  readonly VITE_E2E_DB_WARNING: string
  readonly VITE_GEOFENCE_BYPASS: string
  readonly VITE_PHOTOS_BYPASS: string
  readonly VITE_SENTRY_DSN: string
  readonly VITE_SENTRY_ENV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
