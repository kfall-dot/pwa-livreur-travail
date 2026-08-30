import { useEffect, useState } from 'react'
import { authFetch } from '../managerApi'
import { css } from './procurementUi'

type DtSite = { id: string; name: string }
type DtReport = {
  id: string
  siteId: string
  reportDate: string
  status: 'draft' | 'submitted'
  globalProgressPct: string | null
  tasksDone: number
  tasksTotal: number
  usagesCount: number
  submissions: { at: string }[]
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

/** Panneau DT — dossiers du jour en direct + stock réel par chantier (sélecteur). */
export function DossiersPanel({ handleAuth }: { handleAuth: (status: number) => boolean }) {
  const [sites, setSites] = useState<DtSite[]>([])
  const [siteId, setSiteId] = useState<string | null>(null)
  const [reports, setReports] = useState<DtReport[]>([])
  const [stock, setStock] = useState<DtStockPayload | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      const res = await authFetch('/daily-reports/dt/reports')
      if (handleAuth(res.status)) return
      const body = (await res.json()) as { sites?: DtSite[]; reports?: DtReport[] }
      if (cancelled) return
      setSites(body.sites ?? [])
      setReports(body.reports ?? [])
      setSiteId((prev) => prev ?? body.sites?.[0]?.id ?? null)
      setLoaded(true)
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [handleAuth])

  useEffect(() => {
    if (!siteId) return
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
  }, [siteId, handleAuth, reports])

  if (!loaded) return <div style={css.card}>Chargement des dossiers…</div>
  if (sites.length === 0) return null

  const siteReports = reports.filter((r) => r.siteId === siteId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={css.card}>
        <h3 style={{ marginTop: 0 }}>📁 Dossiers du jour</h3>
        <select
          value={siteId ?? ''}
          onChange={(e) => setSiteId(e.target.value)}
          style={{ padding: '0.5rem', marginBottom: '0.75rem' }}
          aria-label="Sélectionner le chantier"
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {stock?.alert18h && (
          <div style={{ ...css.messageBox, background: '#fef2f2', borderColor: '#fecaca', marginBottom: '0.75rem' }}>
            ⚠️ Aucun dossier soumis aujourd'hui pour ce chantier (après 18h).
          </div>
        )}
        {stock && stock.negativeCount > 0 && (
          <div style={{ ...css.messageBox, background: '#fef2f2', borderColor: '#fecaca', marginBottom: '0.75rem' }}>
            🔴 {stock.negativeCount} produit(s) en stock négatif — consommation supérieure aux livraisons. À investiguer.
          </div>
        )}
        {siteReports.length === 0 ? (
          <p style={{ fontSize: 13 }}>Aucun dossier pour ce chantier.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {[...siteReports]
              .sort((a, b) => b.reportDate.localeCompare(a.reportDate))
              .slice(0, 14)
              .map((r) => (
                <li key={r.id} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <strong>{new Date(r.reportDate).toLocaleDateString('fr-FR')}</strong>{' '}
                  {r.status === 'submitted' ? '🟢 Soumis' : '🟡 En cours'}{' '}
                  {r.submissions.length > 1 && `· ${r.submissions.length} soumissions`}
                  {' · '}📋 {r.tasksDone}/{r.tasksTotal} tâches
                  {' · '}🔩 {r.usagesCount} consommation(s)
                  {r.globalProgressPct != null && ` · 📈 ${Number(r.globalProgressPct)}%`}
                </li>
              ))}
          </ul>
        )}
      </div>

      {stock && (
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
