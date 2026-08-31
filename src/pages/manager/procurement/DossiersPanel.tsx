import { useEffect, useState } from 'react'
import { authFetch } from '../managerApi'
import { css } from './procurementUi'

type DtReport = {
  id: string
  siteId: string
  reportDate: string
  status: 'draft' | 'submitted'
  globalProgressPct: string | null
  tasksDone: number
  tasksTotal: number
  usagesCount: number
  submissionsCount: number
}
type DtStockRow = {
  productLabel: string
  unit: string
  onHand: number
  consumed: number
  available: number
  onOrder: number
  alert: 'negative' | 'low' | 'ok'
}
type DtStockPayload = {
  stock: DtStockRow[]
  todayReport: DtReport | null
  alert18h: boolean
  negativeCount: number
}

/** Panneau DT/CdG — alertes du jour + stock réel du chantier sélectionné (dropdown de page). */
export function DossiersPanel({
  handleAuth,
  siteId,
  showDossiersAlerts = true,
  showStock = true,
}: {
  handleAuth: (status: number) => boolean
  siteId: string | null
  showDossiersAlerts?: boolean
  showStock?: boolean
}) {
  const [reports, setReports] = useState<DtReport[]>([])
  const [stock, setStock] = useState<DtStockPayload | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      const res = await authFetch('/daily-reports/dt/reports')
      if (handleAuth(res.status)) return
      const body = (await res.json()) as { reports?: DtReport[] }
      if (cancelled) return
      setReports(body.reports ?? [])
      setLoaded(true)
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [handleAuth])

  useEffect(() => {
    if (!siteId || !showStock) return
    let cancelled = false
    const loadStock = async () => {
      const res = await authFetch(`/daily-reports/dt/stock?siteId=${encodeURIComponent(siteId)}`)
      if (handleAuth(res.status)) return
      if (!res.ok) return
      const body = (await res.json()) as DtStockPayload
      if (!cancelled) setStock(body)
    }
    void loadStock()
    return () => {
      cancelled = true
    }
  }, [siteId, handleAuth, showStock])

  if (!loaded) return null
  if (!siteId) return null

  const todayStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const hasTodayReport = reports.some((r) => r.siteId === siteId && r.reportDate === todayStr)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {showDossiersAlerts && (
        <div style={css.card} data-testid="mgr-dossiers-alertes">
          <h3 style={{ marginTop: 0 }}>📁 Dossiers du jour</h3>
          {stock?.alert18h && !hasTodayReport && (
            <div style={{ ...css.messageBox, background: '#fef2f2', borderColor: '#fecaca', marginBottom: '0.75rem' }}>
              ⚠️ Aucun dossier soumis aujourd'hui pour ce chantier (après 18h).
            </div>
          )}
          {stock && stock.negativeCount > 0 && (
            <div style={{ ...css.messageBox, background: '#fef2f2', borderColor: '#fecaca', marginBottom: 0 }}>
              🔴 {stock.negativeCount} produit(s) en stock négatif — consommation supérieure aux livraisons. À investiguer.
            </div>
          )}
          {stock?.alert18h && hasTodayReport && stock.negativeCount === 0 && (
            <p style={{ ...css.meta, marginBottom: 0 }}>Dossier du jour reçu ✅</p>
          )}
        </div>
      )}

      {showStock && stock && (
        <div style={css.card}>
          <h4 style={{ marginTop: 0 }}>📦 Stock réel (livré − consommé)</h4>
          {stock.stock.length === 0 ? (
            <p style={{ fontSize: 13 }}>Aucun stock enregistré sur ce chantier.</p>
          ) : (
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '0.35rem' }}>Produit</th>
                  <th style={{ padding: '0.35rem' }}>Livré</th>
                  <th style={{ padding: '0.35rem' }}>Consommé</th>
                  <th style={{ padding: '0.35rem' }}>Disponible</th>
                </tr>
              </thead>
              <tbody>
                {stock.stock.map((r) => (
                  <tr
                    key={`${r.productLabel}|${r.unit}`}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: r.alert === 'negative' ? '#fef2f2' : r.alert === 'low' ? '#fffbeb' : undefined,
                    }}
                  >
                    <td style={{ padding: '0.35rem' }}>
                      {r.alert === 'negative' ? '🔴 ' : r.alert === 'low' ? '🟠 ' : ''}
                      {r.productLabel}
                    </td>
                    <td style={{ padding: '0.35rem' }}>{r.onHand} {r.unit}</td>
                    <td style={{ padding: '0.35rem' }}>−{r.consumed} {r.unit}</td>
                    <td style={{ padding: '0.35rem', fontWeight: r.alert !== 'ok' ? 700 : 400 }}>
                      {r.available} {r.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
