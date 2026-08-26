import { createApp } from './app.js'
import { describeEmailProvider } from './config/email.js'
import { describeSmsProvider } from './config/sms.js'
import { validateJwtSecretAtStartup } from './config/jwt.js'
import { validateProductionBypassAtStartup } from './config/production.js'
import { validateProductionSecurityAtStartup } from './config/productionAudit.js'
import { initSentry } from './lib/sentry.js'
import { testBypass } from './testBypass.js'

initSentry()
validateJwtSecretAtStartup()
validateProductionBypassAtStartup()
validateProductionSecurityAtStartup()

export const app = createApp()

// Sur Cloudflare Workers, c'est le module worker.ts qui monte l'application :
// pas d'app.listen ni de port. La compilation de worker.ts est déjà assurée
// par server/worker.entry.ts dans tsconfig.server.json.
const runningInWorkers = 'WebSocketPair' in globalThis
if (!runningInWorkers) {
  const PORT = Number(process.env.PORT ?? 3002)
  app.listen(PORT, () => {
    console.log(`API Livreur → http://localhost:${PORT}/api`)
    console.log(`Health      → http://localhost:${PORT}/api/health`)
    console.log(`E-mail      → ${describeEmailProvider()}`)
    console.log(`SMS OTP     → ${describeSmsProvider()}`)
    if (testBypass.geofence) {
      console.log('GEOFENCE_BYPASS actif (tests)')
    }
  })
}
