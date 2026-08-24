const DEMO_SESSION_KEY = 'traceo.demoSession'
const DEMO_ROLE_KEY = 'traceo.demoRole'

export type DemoRole = 'driver' | 'manager'

export function markDemoSession(role: DemoRole): void {
  try {
    sessionStorage.setItem(DEMO_SESSION_KEY, '1')
    sessionStorage.setItem(DEMO_ROLE_KEY, role)
  } catch {
    /* ignore */
  }
}

export function clearDemoSession(): void {
  try {
    sessionStorage.removeItem(DEMO_SESSION_KEY)
    sessionStorage.removeItem(DEMO_ROLE_KEY)
  } catch {
    /* ignore */
  }
}

export function isDemoSession(): boolean {
  try {
    return sessionStorage.getItem(DEMO_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

export function getDemoRole(): DemoRole | null {
  try {
    const role = sessionStorage.getItem(DEMO_ROLE_KEY)
    return role === 'driver' || role === 'manager' ? role : null
  } catch {
    return null
  }
}
