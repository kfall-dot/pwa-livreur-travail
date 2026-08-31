import './instrument'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { reactErrorHandler } from '@sentry/react'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import './index.css'

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  // Évite le cache SW stale (ex. ancien login « pixel ») en local / Chrome.
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister()
  })
  if ('caches' in window) {
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key)
    })
  }
} else {
  registerSW({ immediate: true })
}

/** Log systématique en console avant l'envoi Sentry (sinon erreur invisible en prod à cause de la CSP). */
const logThenReport = (label: string) => (error: unknown, info?: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[traceo:${label}]`, error, info)
  reactErrorHandler()(error as Error, info as never)
}

createRoot(document.getElementById('root')!, {
  onUncaughtError: logThenReport('uncaught'),
  onCaughtError: logThenReport('caught'),
  onRecoverableError: logThenReport('recoverable'),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

requestAnimationFrame(() => {
  const boot = document.getElementById('traceo-boot')
  if (!boot) return
  boot.classList.add('is-done')
  window.setTimeout(() => boot.remove(), 400)
})
