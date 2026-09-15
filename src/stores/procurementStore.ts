import { create } from 'zustand'
import { authFetch } from '../pages/manager/managerApi'
import type { BcRegisterMonth, BcRegisterRecapGroup, BcRegisterRow } from '../pages/manager/procurement/procurementTypes'

/** Callback 401/403 propagé par le shell (identique à la prop `handleAuth` des onglets). */
export type HandleAuth = (status: number) => boolean

/**
 * Store partagé du registre BC (Zustand).
 *
 * Périmètre volontairement étroit (cf. docs/PLAN-ZUSTAND.md) : un seul domaine —
 * le registre BC — consommé par SuiviBcTab (SA) et ComptabiliteTab (CMPT).
 * Un état unique garantit que les tuiles et listes des deux onglets restent
 * cohérentes après chaque mutation (patch followup, upload facture, transmission),
 * sans refetch global ni remount destructeur.
 *
 * Règle de mise à jour : jamais optimiste — une row n'est modifiée qu'après
 * confirmation du serveur (`applyRow`) ou par un patch local explicite (`patchRow`).
 */
interface ProcurementState {
  rows: BcRegisterRow[]
  recap: BcRegisterRecapGroup[]
  months: BcRegisterMonth[]
  month: string | null
  loading: boolean
  error: string | null
  /** Charge le registre (mois par défaut du serveur, ou mois explicite). */
  load: (handleAuth: HandleAuth, selectedMonth?: string | null) => Promise<void>
  /** Remplace une row après confirmation serveur (patch followup, transmission…). */
  applyRow: (updated: BcRegisterRow) => void
  /** Patch local d'une row (ex. après upload de facture). */
  patchRow: (purchaseOrderId: string, patch: Partial<BcRegisterRow>) => void
}

export const useProcurementStore = create<ProcurementState>((set) => ({
  rows: [],
  recap: [],
  months: [],
  month: null,
  loading: true,
  error: null,

  load: async (handleAuth, selectedMonth) => {
    set({ loading: true, error: null })
    try {
      const q = selectedMonth ? `?month=${encodeURIComponent(selectedMonth)}` : ''
      const res = await authFetch(`/procurement/bc-register${q}`)
      if (handleAuth(res.status)) return
      if (!res.ok) throw new Error('Registre BC indisponible')
      const data = (await res.json()) as {
        rows?: BcRegisterRow[]
        recap?: BcRegisterRecapGroup[]
        months?: BcRegisterMonth[]
        month?: string | null
      }
      set({
        rows: data.rows ?? [],
        recap: data.recap ?? [],
        months: data.months ?? [],
        month: data.month ?? null,
      })
    } catch (err) {
      set({
        rows: [],
        recap: [],
        error: err instanceof Error ? err.message : 'Registre indisponible',
      })
    } finally {
      set({ loading: false })
    }
  },

  applyRow: (updated) =>
    set((s) => ({ rows: s.rows.map((r) => (r.purchaseOrderId === updated.purchaseOrderId ? updated : r)) })),

  patchRow: (purchaseOrderId, patch) =>
    set((s) => ({ rows: s.rows.map((r) => (r.purchaseOrderId === purchaseOrderId ? { ...r, ...patch } : r)) })),
}))
