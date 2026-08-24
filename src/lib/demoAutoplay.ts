import type { DemoRole } from './demoSession'

const AUTOPLAY_KEY = 'traceo.demoAutoplay'
const AUTOPLAY_TICK = 'traceo:demo-autoplay-tick'

export type DemoAutoplayAction =
  | 'delivery:start'
  | 'delivery:simulate-photo'
  | 'delivery:declare-full'
  | 'delivery:send-otp'
  | 'delivery:confirm-otp'
  | 'delivery:confirm'

export type DemoAutoplayStep = {
  path: string
  durationMs: number
  caption: string
  action?: DemoAutoplayAction
  /** Délai après l’action (ms) avant l’étape suivante. */
  waitMs?: number
}

export const DEMO_AUTOPLAY_EVENT = 'traceo:demo-autoplay'

export const DEMO_AUTOPLAY_STEPS: Record<DemoRole, DemoAutoplayStep[]> = {
  driver: [
    {
      path: '/',
      durationMs: 5000,
      caption: 'Tournée du jour — progression et prochain arrêt',
    },
    {
      path: '/map',
      durationMs: 5000,
      caption: 'Carte — dépôt et points de livraison',
    },
    {
      path: '/delivery/del-k1',
      durationMs: 4000,
      caption: 'Point de livraison — fiche et consignes',
    },
    {
      path: '/delivery/del-k1',
      durationMs: 800,
      caption: 'Démarrage — contrôle géolocalisation',
      action: 'delivery:start',
      waitMs: 2200,
    },
    {
      path: '/delivery/del-k1',
      durationMs: 1200,
      caption: 'Photos — preuve sur site',
      action: 'delivery:simulate-photo',
      waitMs: 2800,
    },
    {
      path: '/delivery/del-k1',
      durationMs: 1200,
      caption: 'Déclaration — quantités livrées',
      action: 'delivery:declare-full',
      waitMs: 3200,
    },
    {
      path: '/delivery/del-k1',
      durationMs: 1200,
      caption: 'OTP — code envoyé au responsable',
      action: 'delivery:send-otp',
      waitMs: 3500,
    },
    {
      path: '/delivery/del-k1',
      durationMs: 1200,
      caption: 'Saisie du code de validation',
      action: 'delivery:confirm-otp',
      waitMs: 1200,
    },
    {
      path: '/delivery/del-k1',
      durationMs: 1200,
      caption: 'Confirmation — certificat de livraison',
      action: 'delivery:confirm',
      waitMs: 4500,
    },
    {
      path: '/',
      durationMs: 5000,
      caption: 'Retour tournée — livraison enregistrée',
    },
  ],
  manager: [
    {
      path: '/manager?tab=suivi',
      durationMs: 6500,
      caption: 'Suivi — statuts et détail des livraisons',
    },
    {
      path: '/manager?tab=planifier',
      durationMs: 6500,
      caption: 'Planifier — créer ou modifier une tournée',
    },
    {
      path: '/manager?tab=taches',
      durationMs: 5500,
      caption: 'Tâches — confirmations et anomalies',
    },
  ],
}

type AutoplayState = {
  role: DemoRole
  index: number
  active: boolean
}

let autoplayRevision = 0
let cachedRaw: string | null | undefined
let cachedState: AutoplayState | null = null

function readState(): AutoplayState | null {
  try {
    const raw = sessionStorage.getItem(AUTOPLAY_KEY)
    if (raw === cachedRaw) return cachedState
    cachedRaw = raw
    if (!raw) {
      cachedState = null
      return null
    }
    const parsed = JSON.parse(raw) as AutoplayState
    if (!parsed.active || (parsed.role !== 'driver' && parsed.role !== 'manager')) {
      cachedState = null
      return null
    }
    cachedState = parsed
    return parsed
  } catch {
    cachedRaw = null
    cachedState = null
    return null
  }
}

function writeState(state: AutoplayState | null): void {
  try {
    if (!state) {
      sessionStorage.removeItem(AUTOPLAY_KEY)
      cachedRaw = null
      cachedState = null
    } else {
      const raw = JSON.stringify(state)
      sessionStorage.setItem(AUTOPLAY_KEY, raw)
      cachedRaw = raw
      cachedState = state
    }
    autoplayRevision += 1
    window.dispatchEvent(new Event(AUTOPLAY_TICK))
  } catch {
    /* ignore */
  }
}

export function subscribeDemoAutoplay(onStoreChange: () => void): () => void {
  window.addEventListener(AUTOPLAY_TICK, onStoreChange)
  return () => window.removeEventListener(AUTOPLAY_TICK, onStoreChange)
}

export function getDemoAutoplaySnapshot(): number {
  return autoplayRevision
}

/** État courant — à lire après un changement de snapshot (révision). */
export function getDemoAutoplayState(): AutoplayState | null {
  return readState()
}

export function beginDemoAutoplay(role: DemoRole): void {
  writeState({ role, index: 0, active: true })
}

export function stopDemoAutoplay(): void {
  writeState(null)
}

export function skipDemoAutoplayStep(): AutoplayState | null {
  const state = readState()
  if (!state) return null
  const steps = DEMO_AUTOPLAY_STEPS[state.role]
  const nextIndex = state.index + 1
  if (nextIndex >= steps.length) {
    writeState(null)
    return null
  }
  const next = { ...state, index: nextIndex }
  writeState(next)
  return next
}

export function getDemoAutoplayStep(state: AutoplayState): DemoAutoplayStep | null {
  return DEMO_AUTOPLAY_STEPS[state.role][state.index] ?? null
}

export function advanceDemoAutoplay(): DemoAutoplayStep | null {
  const state = readState()
  if (!state) return null
  const steps = DEMO_AUTOPLAY_STEPS[state.role]
  const nextIndex = state.index + 1
  if (nextIndex >= steps.length) {
    writeState(null)
    return null
  }
  writeState({ ...state, index: nextIndex })
  return steps[nextIndex] ?? null
}

/** Compare route + query (ex. /manager?tab=suivi). */
export function demoPathMatches(
  pathname: string,
  search: string,
  stepPath: string,
): boolean {
  const [path, query] = stepPath.split('?')
  if (pathname !== path) return false
  if (!query) return true
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const part of query.split('&')) {
    const [key, value] = part.split('=')
    if (params.get(key) !== value) return false
  }
  return true
}

export function dispatchDemoAutoplayAction(action: DemoAutoplayAction): void {
  window.dispatchEvent(new CustomEvent(DEMO_AUTOPLAY_EVENT, { detail: { action } }))
}
