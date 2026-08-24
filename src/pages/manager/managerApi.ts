const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api/v1'

const SERVER_UNREACHABLE =
  'Serveur injoignable — ouvrez http://localhost:8888 (`npm run netlify:dev`), pas le port Vite.'

function isNetworkFetchError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  return raw === 'Failed to fetch' || raw === 'Load failed' || /failed to fetch|networkerror|load failed/i.test(raw)
}

export async function authFetch(path: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      ...options,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        ...options?.headers,
      },
    })
  } catch (err) {
    if (isNetworkFetchError(err)) {
      throw new Error(SERVER_UNREACHABLE, { cause: err })
    }
    throw err
  }
}

export function fetchSupermarkets() {
  return authFetch(`/dashboard/supermarkets?_=${Date.now()}`)
}

export function setSupermarketActiveState(id: string, active: boolean) {
  return authFetch(`/dashboard/supermarkets/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, {
    method: 'POST',
  })
}

export async function authFetchBlob(path: string): Promise<Blob> {
  const res = await fetch(`${BASE}${path}`, { credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error('Fichier introuvable')
  return res.blob()
}

export async function openCertificateJson(receiptId: string): Promise<void> {
  const url = `${BASE}/certificates/${encodeURIComponent(receiptId)}?view=html`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export { BASE }
