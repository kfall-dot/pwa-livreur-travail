import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../managerApi'

type LockView = { canClaim: boolean; ownedByMe: boolean; ownerName: string | null; expiresAt: string | null }
const EMPTY_LOCK: LockView = { canClaim: false, ownedByMe: false, ownerName: null, expiresAt: null }

export function useProcurementEditLock(kind: 'drafts' | 'requests', id: string | null, revision: string, autoAcquire = false) {
  const url = id ? `/procurement/${kind}/${encodeURIComponent(id)}/lock` : null
  const [snapshot, setSnapshot] = useState<{ url: string | null; view: LockView }>({ url: null, view: EMPTY_LOCK })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const currentUrl = useRef(url)
  const owner = useRef(false)
  const previousRevision = useRef({ url, revision })
  const view = snapshot.url === url ? snapshot.view : EMPTY_LOCK

  const send = useCallback(async (method: string, renew = false) => {
    if (!url) return
    const res = await authFetch(`${url}${renew ? '/renew' : ''}`, { method, ...(method === 'POST' ? { body: '{}' } : {}) })
    const data = await res.json() as LockView & { message?: string }
    if (currentUrl.current !== url) {
      if (res.ok && data.ownedByMe && method === 'POST') void authFetch(url, { method: 'DELETE', keepalive: true }).catch(() => {})
      return
    }
    if (!res.ok) {
      if (res.status === 409) { owner.current = false; setSnapshot({ url, view: EMPTY_LOCK }) }
      if (res.status === 423 && data.ownerName) {
        owner.current = false
        setSnapshot({ url, view: { ...data, ownedByMe: false } })
      }
      throw new Error(data.message || 'Prise en charge indisponible')
    }
    owner.current = data.ownedByMe
    setSnapshot({ url, view: data })
    setError('')
  }, [url])

  const refresh = useCallback(() => { void send('GET').catch((err: Error) => setError(err.message)) }, [send])
  useEffect(() => {
    currentUrl.current = url
    owner.current = false
    setError('')
    if (!url) return
    // Le créateur prend immédiatement en charge son nouveau brouillon.
    // Le serveur reste arbitre : une prise en charge concurrente renvoie 423.
    void send(autoAcquire ? 'POST' : 'GET').catch((err: Error) => setError(err.message))
    const timer = window.setInterval(() => {
      void send(owner.current ? 'POST' : 'GET', owner.current).catch((err: Error) => setError(err.message))
    }, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      currentUrl.current = null
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      if (owner.current) void authFetch(url, { method: 'DELETE', keepalive: true }).catch(() => {})
      owner.current = false
    }
  }, [url, send, refresh, autoAcquire])
  useEffect(() => {
    const previous = previousRevision.current
    previousRevision.current = { url, revision }
    // Éviter un GET concurrent de la prise en charge initiale.
    if (url && previous.url === url && previous.revision !== revision) refresh()
  }, [revision, refresh, url])

  const act = async (method: 'POST' | 'DELETE') => {
    setBusy(true)
    try { await send(method) } catch (err) { setError(err instanceof Error ? err.message : 'Prise en charge impossible'); refresh() }
    finally { setBusy(false) }
  }
  return { ...view, busy, error, refresh, acquire: () => act('POST'), release: () => act('DELETE') }
}
