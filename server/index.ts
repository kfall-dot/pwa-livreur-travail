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

// ... code existant ...

// 🔧 Cloudflare Workers : import side-effect pour forcer la compilation de worker.ts
// dans tsconfig.server.json → outDir = dist-server/worker.js
void import('./worker.js')
