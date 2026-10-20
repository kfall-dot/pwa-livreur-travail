/**
 * Rejoue uniquement le seed de l'entreprise pilote BTP (sans le reste du seed
 * démo). Utile pour valider l'idempotence du seed (upsert par email) et pour
 * réparer un compte de rôle créé hors seed (invitation admin, ID UUID) resté
 * rattaché à la mauvaise entreprise — le seed le rattache sans toucher au
 * mot de passe.
 * Usage : npx tsx --env-file=.env.development scripts/seed-pilot.ts
 */
import { seedBtpPilotData } from '../server/db/seedBtpPilot.js'

const res = await seedBtpPilotData()
console.log(`seedBtpPilotData OK : ${JSON.stringify(res)}`)
process.exit(0)
