import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '../managerApi'
import { css } from './procurementUi'

type ManagerRow = { id: string; name: string; email: string; procurementRole: string | null }
type SiteRow = { id: string; name: string; managerId: string | null; supervisorManagerId: string | null }

/** Affectation chef de chantier / DT superviseur — visible DT & DAF (Suivi chantier). */
export function SiteAssignmentCard({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [managers, setManagers] = useState<ManagerRow[]>([])
  const [site, setSite] = useState<SiteRow | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [mgrRes, sitesRes] = await Promise.all([
      authFetch('/daily-reports/assignable-managers'),
      authFetch('/procurement/sites'),
    ])
    if (mgrRes.ok) setManagers(((await mgrRes.json()) as { managers?: ManagerRow[] }).managers ?? [])
    if (sitesRes.ok) {
      const rows = ((await sitesRes.json()) as { sites?: SiteRow[] }).sites ?? []
      setSite(rows.find((s) => s.id === siteId) ?? null)
    }
  }, [siteId])

  useEffect(() => {
    void load()
  }, [load])

  const assign = async (field: 'managerId' | 'supervisorManagerId', value: string) => {
    const res = await authFetch(`/procurement/sites/${siteId}/assignments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value || null }),
    })
    if (res.ok) {
      setMessage('Affectation enregistrée')
      window.setTimeout(() => setMessage(null), 3000)
      await load()
    } else {
      setMessage("Échec de l'affectation")
    }
  }

  // Toutes les gestionnaires sont proposés : l'affectation promeut automatiquement
  // le rôle côté serveur (chef → site_manager, DT superviseur → technical_director).
  const roleLabel = (r: string | null): string =>
    r === 'site_manager'
      ? ' — chef de chantier'
      : r === 'technical_director'
        ? ' — DT'
        : r
          ? ` — ${r}`
          : ''
  const selectStyle = { padding: '0.4rem', flex: 1 } as const

  return (
    <div style={css.card} data-testid="mgr-site-assignment">
      <h4 style={{ marginTop: 0 }}>👷 Affectation — {siteName}</h4>
      {!site ? (
        <p style={css.meta}>Chargement…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: 13 }}>
            <span style={{ minWidth: 140 }}>Chef de chantier :</span>
            <select value={site.managerId ?? ''} onChange={(e) => void assign('managerId', e.target.value)} style={selectStyle}>
              <option value="">— Non affecté —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{roleLabel(m.procurementRole)}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: 13 }}>
            <span style={{ minWidth: 140 }}>DT superviseur :</span>
            <select value={site.supervisorManagerId ?? ''} onChange={(e) => void assign('supervisorManagerId', e.target.value)} style={selectStyle}>
              <option value="">— Non affecté —</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}{roleLabel(m.procurementRole)}</option>
              ))}
            </select>
          </label>
          {managers.length === 0 && (
            <p style={{ ...css.meta, margin: 0 }}>
              Aucun gestionnaire — invitez d'abord la personne (Équipe → Inviter).
            </p>
          )}
          <p style={{ ...css.meta, margin: 0 }}>
            Astuce : affecter quelqu'un comme chef ou DT lui donne automatiquement le rôle correspondant.
          </p>
          {message && <p style={{ ...css.meta, margin: 0 }}>{message}</p>}
        </div>
      )}
    </div>
  )
}
