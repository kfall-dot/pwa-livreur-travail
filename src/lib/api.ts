import type {
  AdjustmentLine,
  AuthTokens,
  ConfirmResult,
  DeclarationOutcome,
  DeliveryDetailResponse,
  DeliveryPhotosResponse,
  DriverProfile,
  ScheduleDay,
  Tour,
} from '../types'
import { getTokens, prepareDriverStorage, primeDriverSession, saveTokens } from './db'
import { adaptLivraisonToday, isLivraisonBackend, normalizeApiBase } from './livraisonAdapter'
import {
  emptyTourForDate,
  getMockTour,
  mockConfirm,
  mockDriver,
  mockLogin,
  mockScheduleDays,
  updateMockStop,
} from './mockData'

const BASE = normalizeApiBase(import.meta.env.VITE_API_URL ?? '')
/** Jamais de mock en build production — sinon tout login affiche le livreur démo. */
const USE_MOCK = !BASE && !import.meta.env.PROD
const LIVRAISON = !USE_MOCK && isLivraisonBackend(BASE)

export class ApiError extends Error {
  status: number
  data?: unknown

  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) {
    throw new ApiError(
      res.ok
        ? 'Réponse serveur vide'
        : 'Serveur injoignable — lancez `npm run netlify:dev` et ouvrez http://localhost:8888',
      res.status || 502,
    )
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    const isHtml = /^\s*</.test(text)
    let message = 'Réponse serveur invalide (JSON)'
    if (isHtml && res.status === 404) {
      message =
        'Démo indisponible — ouvrez la démo visuelle : /demo/livreur (diaporama de captures d’écran, sans connexion au système).'
    } else if (isHtml) {
      message = `Le serveur a renvoyé une page HTML (${res.status}) au lieu de JSON.`
    }
    throw new ApiError(message, res.status || 502)
  }
}

function parseErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const o = data as { message?: string; error?: string }
    if (o.message) return o.message
    if (o.error && o.error !== 'Internal Server Error') return o.error
  }
  return fallback
}

function extractTokens(data: Record<string, unknown>, fallbackRefresh?: string): AuthTokens {
  if (LIVRAISON && data.tokens && typeof data.tokens === 'object') {
    const t = data.tokens as { accessToken: string; refreshToken: string }
    return {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAt: Date.now() + 55 * 60_000,
    }
  }
  return {
    accessToken: String(data.accessToken),
    refreshToken: String(data.refreshToken ?? fallbackRefresh),
    expiresAt: Date.now() + Number(data.expiresIn ?? 3600) * 1000,
  }
}

let refreshPromise: Promise<AuthTokens> | null = null

async function refreshTokens(): Promise<AuthTokens> {
  if (refreshPromise) return refreshPromise
  const current = await getTokens()
  if (!current?.refreshToken) throw new ApiError('Session expirée', 401)

  refreshPromise = (async () => {
    if (USE_MOCK) {
      const tokens: AuthTokens = {
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        expiresAt: Date.now() + 3600_000,
      }
      await saveTokens(tokens)
      return tokens
    }
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    })
    if (!res.ok) throw new ApiError('Refresh échoué', res.status)
    const data = await parseJsonResponse(res)
    const tokens = extractTokens(data, current.refreshToken)
    await saveTokens(tokens)
    return tokens
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

async function getAuthHeader(): Promise<Record<string, string>> {
  let tokens = await getTokens()
  if (!tokens) return {}
  if (tokens.expiresAt < Date.now() + 60_000) {
    tokens = await refreshTokens()
  }
  return { Authorization: `Bearer ${tokens.accessToken}` }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = 0
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    ...(await getAuthHeader()),
  }

  const hasBody = options.body != null && options.body !== ''

  if (hasBody && !(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) {
    if (retry < 1 && !USE_MOCK) {
      await refreshTokens()
      return request(path, options, retry + 1)
    }
    throw new ApiError('Non autorisé', 401)
  }

  if (res.status === 429 && retry < 4) {
    const delay = Math.min(1000 * 2 ** retry, 30_000)
    await new Promise((r) => setTimeout(r, delay))
    return request(path, options, retry + 1)
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new ApiError(parseErrorMessage(data, res.statusText), res.status, data)
  }

  return data as T
}

export const api = {
  isMock: USE_MOCK,
  isLivraison: LIVRAISON,

  async login(phone: string, pin: string): Promise<AuthTokens & { driver: typeof mockDriver }> {
    if (USE_MOCK) {
      if (!mockLogin(phone, pin)) throw new ApiError('Téléphone ou PIN incorrect', 401)
      const tokens: AuthTokens = {
        accessToken: 'mock-access',
        refreshToken: 'mock-refresh',
        expiresAt: Date.now() + 8 * 3600_000,
      }
      await saveTokens(tokens, mockDriver)
      return { ...tokens, driver: mockDriver }
    }

    const res = await fetch(`${BASE}/auth/login-driver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pin }),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok) {
      throw new ApiError(parseErrorMessage(data, 'Échec de connexion'), res.status, data)
    }

    const tokens = extractTokens(data)
    const user = (data.user ?? data.driver) as { id?: string; name?: string; phone?: string } | undefined
    const driver = {
      id: user?.id ?? 'unknown',
      phone: user?.phone ?? phone,
      name: user?.name ?? 'Livreur',
    }
    await prepareDriverStorage()
    await saveTokens(tokens, driver)
    return { ...tokens, driver }
  },

  async enterDemoDriver(
    persona: 'abidjan' | 'paris' = 'abidjan',
  ): Promise<{ redirect: string; driver: DriverProfile }> {
    if (USE_MOCK) {
      await saveTokens(
        {
          accessToken: 'mock-access',
          refreshToken: 'mock-refresh',
          expiresAt: Date.now() + 8 * 3600_000,
        },
        mockDriver,
      )
      return { redirect: '/', driver: mockDriver }
    }

    const res = await fetch(`${BASE}/demo/enter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'driver', persona }),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok) {
      throw new ApiError(parseErrorMessage(data, 'Démo livreur indisponible'), res.status, data)
    }

    const tokens = extractTokens(data)
    const user = (data.user ?? data.driver) as { id?: string; name?: string; phone?: string } | undefined
    const driver: DriverProfile = {
      id: user?.id ?? 'unknown',
      phone: user?.phone ?? '',
      name: user?.name ?? 'Livreur',
    }
    primeDriverSession(tokens, driver)
    void prepareDriverStorage()
      .then(() => saveTokens(tokens, driver))
      .catch(() => {
        /* fallback sessionStorage déjà posé */
      })
    const redirect = typeof data.redirect === 'string' ? data.redirect : '/'
    return { redirect, driver }
  },

  async enterDemoManager(): Promise<{ redirect: string }> {
    if (USE_MOCK) {
      return { redirect: '/manager?tab=suivi' }
    }

    const res = await fetch(`${BASE}/demo/enter`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'manager' }),
    })
    const data = await parseJsonResponse(res)
    if (!res.ok) {
      throw new ApiError(parseErrorMessage(data, 'Démo gestionnaire indisponible'), res.status, data)
    }
    const redirect = typeof data.redirect === 'string' ? data.redirect : '/manager?tab=suivi'
    return { redirect }
  },

  async getDriverProfile(): Promise<DriverProfile> {
    if (USE_MOCK) return mockDriver
    const data = await request<{ driver: DriverProfile }>('/auth/driver/me')
    const driver = data.driver
    const tokens = await getTokens()
    if (tokens) await saveTokens(tokens, driver)
    return driver
  },

  async getTodayTour(): Promise<Tour> {
    if (USE_MOCK) return getMockTour()
    const data = await request<Record<string, unknown>>('/tours/today')
    if (LIVRAISON && Array.isArray(data.deliveries)) {
      return adaptLivraisonToday(data as unknown as Parameters<typeof adaptLivraisonToday>[0])
    }
    return data as unknown as Tour
  },

  async getTourByDate(date: string): Promise<Tour> {
    if (USE_MOCK) {
      const tour = getMockTour()
      return tour.date === date ? tour : emptyTourForDate(date)
    }
    const data = await request<Record<string, unknown>>(`/tours/by-date/${date}`)
    if (Array.isArray(data.deliveries)) {
      return adaptLivraisonToday(data as unknown as Parameters<typeof adaptLivraisonToday>[0])
    }
    return data as unknown as Tour
  },

  async fetchSchedule(from: string, to: string): Promise<{ days: ScheduleDay[] }> {
    if (USE_MOCK) {
      return { days: mockScheduleDays(from, to) }
    }
    const q = new URLSearchParams({ from, to })
    return request<{ days: ScheduleDay[] }>(`/tours/schedule?${q}`)
  },

  async reroute(tourId: string, position: { lat: number; lng: number }): Promise<Tour> {
    if (USE_MOCK) return getMockTour()
    return request<Tour>(`/tours/${tourId}/reroute`, {
      method: 'POST',
      body: JSON.stringify(position),
    })
  },

  async startDelivery(
    deliveryId: string,
    position: { lat: number; lng: number }
  ): Promise<void> {
    if (USE_MOCK) {
      updateMockStop(deliveryId, { status: 'in_progress' })
      return
    }
    await request(`/deliveries/${deliveryId}/start`, {
      method: 'POST',
      body: JSON.stringify(position),
    })
  },

  async uploadPhoto(
    deliveryId: string,
    file: Blob,
    meta: { lat: number; lng: number; hash: string; paletteNumber?: string }
  ): Promise<void> {
    if (USE_MOCK) return
    const form = new FormData()
    form.append('photo', file, 'delivery.jpg')
    form.append('lat', String(meta.lat))
    form.append('lng', String(meta.lng))
    if (meta.paletteNumber) form.append('paletteNumber', meta.paletteNumber)
    if (meta.hash) form.append('hash', meta.hash)
    await request(`/deliveries/${deliveryId}/photo`, { method: 'POST', body: form })
  },

  async getDelivery(deliveryId: string): Promise<DeliveryDetailResponse> {
    if (USE_MOCK) {
      const tour = getMockTour()
      const stop = tour.stops.find((s) => s.id === deliveryId)
      return {
        delivery: {
          id: deliveryId,
          status: stop?.status ?? 'pending',
          expected_palettes: stop?.units ?? 1,
          supermarket_name: stop?.name,
          supermarket_address: stop?.address,
        },
        photos: [],
        declared: false,
        adjustmentLines: [
          {
            productLabel: 'Produit commandé',
            unit: 'palette',
            quantityExpected: stop?.units ?? 1,
            justification: '',
          },
        ],
      }
    }
    return request<DeliveryDetailResponse>(`/deliveries/${deliveryId}`)
  },

  async declareDelivery(
    deliveryId: string,
    body: { outcome: DeclarationOutcome; lines: AdjustmentLine[] }
  ): Promise<{ requiredPhotos?: number; lines: AdjustmentLine[] }> {
    if (USE_MOCK) {
      updateMockStop(deliveryId, { status: 'in_progress', declarationOutcome: body.outcome })
      return { requiredPhotos: 1, lines: body.lines }
    }
    return request(`/deliveries/${deliveryId}/declare`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async cancelDelivery(deliveryId: string): Promise<void> {
    if (USE_MOCK) {
      updateMockStop(deliveryId, { status: 'pending' })
      return
    }
    await request(`/deliveries/${deliveryId}/cancel`, { method: 'POST' })
  },

  async sendOtp(deliveryId: string): Promise<{
    devOtpCode?: string
    sent?: boolean
    smsTo?: string
    smsWarning?: string
    smsNotice?: string
  }> {
    if (USE_MOCK) {
      updateMockStop(deliveryId, { status: 'otp_sent' })
      return { devOtpCode: '123456', sent: true, smsTo: '+2250000000000' }
    }
    return request(`/deliveries/${deliveryId}/send-otp`, { method: 'POST' })
  },

  async confirmDelivery(
    deliveryId: string,
    body: { otp: string; lat: number; lng: number }
  ): Promise<ConfirmResult> {
    if (USE_MOCK) {
      if (body.otp !== '123456') throw new ApiError('Code OTP invalide', 400)
      const result = mockConfirm()
      const stop = getMockTour().stops.find((s) => s.id === deliveryId)
      const outcome = stop?.declarationOutcome ?? 'full'
      updateMockStop(deliveryId, {
        status: 'delivered',
        receiptId: result.receiptId,
        certificateUrl: result.certificateUrl,
        declarationOutcome: outcome,
      })
      return {
        ...result,
        declarationOutcome: outcome,
        isPartial: outcome === 'partial',
        isRejected: outcome === 'rejected',
      }
    }
    return request<ConfirmResult & { certificateUrl?: string }>(`/deliveries/${deliveryId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((result) => ({
      receiptId: result.receiptId,
      certificateUrl:
        result.certificateUrl ??
        (LIVRAISON ? `/api/v1/certificates/${result.receiptId}` : `/api/certificates/${result.receiptId}`),
      fraudScore: result.fraudScore ?? 12,
      fraudLevel: (result.fraudLevel as ConfirmResult['fraudLevel']) ?? 'low',
      fraudDetails: result.fraudDetails,
      isPartial: result.isPartial,
      isRejected: result.isRejected,
      acceptedPalettes: result.acceptedPalettes,
      declarationOutcome: result.declarationOutcome,
    }))
  },

  async getCertificate(receiptId: string): Promise<{ valid: boolean; url: string }> {
    if (USE_MOCK) return { valid: true, url: `https://cert.example.com/${receiptId}` }
    return request(`/certificates/${receiptId}`)
  },

  async getDeliveryPhotos(deliveryId: string): Promise<DeliveryPhotosResponse> {
    if (USE_MOCK) {
      return { deliveryId, photos: [], blobsEnabled: false }
    }
    return request<DeliveryPhotosResponse>(`/deliveries/${deliveryId}/photos`)
  },
}
