import { createApp } from './app.js'
import { describeEmailProvider } from './config/email.js'
import { describeSmsProvider } from './config/sms.js'
import { validateJwtSecretAtStartup } from './config/jwt.js'
import { validateProductionBypassAtStartup } from './config/production.js'
import { validateProductionSecurityAtStartup } from './config/productionAudit.js'
import { initSentry } from './lib/sentry.js'
import { testBypass } from './testBypass.js'

const PORT = Number(process.env.PORT ?? 3002)
initSentry()
validateJwtSecretAtStartup()
validateProductionBypassAtStartup()
validateProductionSecurityAtStartup()
const app = createApp()

app.listen(PORT, () => {
  console.log(`API Livreur → http://localhost:${PORT}/api`)
  console.log(`Health      → http://localhost:${PORT}/api/health`)
  console.log(`E-mail      → ${describeEmailProvider()}`)
  console.log(`SMS OTP     → ${describeSmsProvider()}`)
  if (testBypass.geofence) {
    console.log('GEOFENCE_BYPASS actif (tests)')
  }
})
