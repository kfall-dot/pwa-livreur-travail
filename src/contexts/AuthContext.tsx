import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../lib/api'
import { clearAllData, getStoredDriver, getTokens } from '../lib/db'
import type { DriverProfile } from '../types'

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  driver: DriverProfile | null
  login: (phone: string, pin: string) => Promise<void>
  establishDriver: (driver: DriverProfile) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [driver, setDriver] = useState<DriverProfile | null>(null)

  useEffect(() => {
    void (async () => {
      const tokens = await getTokens()
      if (tokens && tokens.expiresAt > Date.now()) {
        const stored = await getStoredDriver()
        if (stored) setDriver(stored)
        else if (!api.isMock) {
          try {
            const me = await api.getDriverProfile()
            setDriver(me)
          } catch {
            /* session expirée ou invalide */
          }
        }
      }
      setIsLoading(false)
    })()
  }, [])

  const login = useCallback(async (phone: string, pin: string) => {
    const result = await api.login(phone, pin)
    setDriver(result.driver)
  }, [])

  const establishDriver = useCallback((profile: DriverProfile) => {
    setDriver(profile)
  }, [])

  const logout = useCallback(async () => {
    await clearAllData()
    setDriver(null)
  }, [])

  const value = useMemo(
    () => ({
      isAuthenticated: driver != null,
      isLoading,
      driver,
      login,
      establishDriver,
      logout,
    }),
    [driver, isLoading, login, establishDriver, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
