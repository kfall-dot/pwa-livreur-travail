import { useEffect } from 'react'
import { useProcurementStore, type HandleAuth } from '../../../stores/procurementStore'

/** Relecture du même statut serveur dans les vues SA et Comptabilité. */
export function useBcRegisterLiveUpdates(handleAuth: HandleAuth) {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '')) return
      const state = useProcurementStore.getState()
      if (!state.loading) void state.load(handleAuth, state.month, true)
    }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('procurement-payment-changed', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('procurement-payment-changed', refresh)
    }
  }, [handleAuth])
}
