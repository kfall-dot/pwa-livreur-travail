import { useCallback, useEffect, useState } from 'react'
import { confirmDeletion } from '../../../lib/confirmDeletion'
import { toast } from '../../../lib/toast'
import { CI_PHONE_INPUT_TITLE, CI_PHONE_PLACEHOLDER } from '../../../lib/phone'
import { isValidContactEmail, normalizeContactEmail } from '../../../../shared/email'
import { authFetch, fetchSupermarkets, setSupermarketActiveState } from '../managerApi'
import { SITE_TYPES, isSiteType } from '../../../../shared/catalogEnums'
import { type Supermarket, normalizeSupermarkets, normalizeSupermarket, isSupermarketActive } from '../managerTypes'
import { AlertBox, css, EmptyHint, Field, LoadingHint, Row, Toggle } from '../managerUi'
import { EditSupermarketModal } from '../modals/EditSupermarketModal'

// ─── Tab: Chantiers (extrait de ManagerDashboardPage) ────────────────────────
export function PointsTab({
  handleAuth,
  onPointsChanged,
}: {
  handleAuth: (s: number) => boolean
  onPointsChanged?: () => void
}) {
  const [points, setPoints] = useState<Supermarket[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    address: '',
    contactPhone: '',
    contactName: '',
    contactEmail: '',
    lat: '',
    lng: '',
    siteType: 'prive',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)

  const emptyChantierForm = {
    name: '',
    address: '',
    contactPhone: '',
    contactName: '',
    contactEmail: '',
    lat: '',
    lng: '',
    siteType: 'prive',
  }

  const fetchPoints = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchSupermarkets()
      if (handleAuth(res.status)) return
      const data = await res.json() as { supermarkets?: Supermarket[]; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Impossible de charger les chantiers.')
      setPoints(normalizeSupermarkets(data.supermarkets ?? []))
    } catch (err) {
      setPoints([])
      setError(err instanceof Error ? err.message : 'Impossible de charger les chantiers.')
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void fetchPoints()
  }, [fetchPoints])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSaving(true)
    try {
      const email = form.contactEmail.trim()
      if (!email) throw new Error('E-mail responsable obligatoire.')
      if (!isValidContactEmail(email)) throw new Error('E-mail responsable invalide.')
      const payload = {
        name: form.name.trim(),
        address: form.address.trim(),
        contactPhone: form.contactPhone.trim(),
        contactName: form.contactName.trim() || undefined,
        contactEmail: normalizeContactEmail(email),
        lat: form.lat.trim() || undefined,
        lng: form.lng.trim() || undefined,
        siteType: isSiteType(form.siteType) ? form.siteType : 'prive',
      }
      const res = await authFetch('/dashboard/supermarkets', { method: 'POST', body: JSON.stringify(payload) })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setForm(emptyChantierForm)
      toast.success('Chantier ajouté avec succès.')
      await fetchPoints()
      onPointsChanged?.()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erreur') }
    finally { setSaving(false) }
  }

  const toggleActive = async (p: Supermarket) => {
    const currentlyActive = isSupermarketActive(p.active)
    const nextActive = !currentlyActive
    if (currentlyActive && !confirmDeletion(`Désactiver le chantier « ${p.name} » ?`)) return
    setError(null)
    setPoints((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: nextActive } : x)))
    try {
      const res = await setSupermarketActiveState(p.id, nextActive)
      if (handleAuth(res.status)) return
      const body = await res.json() as { message?: string; supermarket?: Supermarket }
      if (!res.ok) throw new Error(body.message ?? 'Impossible de modifier le statut du chantier.')
      if (body.supermarket) {
        setPoints((prev) => prev.map((x) => (x.id === p.id ? normalizeSupermarket(body.supermarket!) : x)))
      }
      onPointsChanged?.()
    } catch (err) {
      setPoints((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: currentlyActive } : x)))
      setError(err instanceof Error ? err.message : 'Impossible de modifier le statut du chantier.')
    }
  }

  const changeSiteType = async (p: Supermarket, siteType: string) => {
    if (!isSiteType(siteType)) return
    const previous = isSiteType(p.siteType) ? p.siteType : 'prive'
    setPoints((prev) => prev.map((x) => (x.id === p.id ? { ...x, siteType } : x)))
    try {
      const res = await authFetch(`/dashboard/supermarkets/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ siteType }),
      })
      if (handleAuth(res.status)) return
      const body = await res.json() as { message?: string; supermarket?: Supermarket }
      if (!res.ok) throw new Error(body.message ?? 'Impossible de modifier le type.')
      if (body.supermarket) {
        setPoints((prev) => prev.map((x) => (x.id === p.id ? normalizeSupermarket(body.supermarket!) : x)))
      }
    } catch (err) {
      setPoints((prev) => prev.map((x) => (x.id === p.id ? { ...x, siteType: previous } : x)))
      setError(err instanceof Error ? err.message : 'Impossible de modifier le type.')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: '2rem', alignItems: 'start' }}>
      <section style={css.section}>
        <h2 style={css.sectionTitle}>Ajouter un chantier</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Enregistrez un chantier (adresse, contact OTP, type Privé ou Public). Les coordonnées GPS pour le géofencing sont <strong>déduites automatiquement de l&apos;adresse</strong> ; vous pouvez les ajuster manuellement si besoin.
        </p>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleAdd(e)}>
          <h3 style={{ fontSize: 14, margin: '0 0 0.75rem' }}>Nouveau chantier</h3>
          <Field label="Nom *"><input type="text" value={form.name} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Type">
            <select
              value={form.siteType}
              style={css.input}
              data-testid="mgr-chantier-type-new"
              onChange={(e) => setForm((p) => ({ ...p, siteType: e.target.value }))}
            >
              {SITE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Adresse *"><input type="text" value={form.address} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></Field>
          <p style={{ fontSize: 11, color: '#999', margin: '2px 0 8px' }}>Ville et pays recommandés pour un géocodage fiable (ex. « 123 rue Example, Abidjan, Côte d&apos;Ivoire »).</p>
          <Row>
            <Field label="Tél. responsable (OTP) *">
              <input
                type="tel"
                value={form.contactPhone}
                required
                placeholder={CI_PHONE_PLACEHOLDER}
                title={CI_PHONE_INPUT_TITLE}
                style={css.input}
                onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
              />
            </Field>
            <Field label="Nom responsable"><input type="text" value={form.contactName} style={css.input} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} /></Field>
          </Row>
          <div style={{ marginBottom: 8 }} />
          <Field label="E-mail responsable *"><input type="email" required value={form.contactEmail} style={css.input} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} /></Field>
          <div style={{ marginBottom: 10 }} />
          <button type="button" disabled style={{ ...css.btnOutline, opacity: 0.5, marginBottom: 8 }}>Prévisualiser le GPS depuis l&apos;adresse</button>
          <Row>
            <Field label="Latitude (optionnel)"><input type="text" value={form.lat} placeholder="auto" style={css.input} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} /></Field>
            <Field label="Longitude (optionnel)"><input type="text" value={form.lng} placeholder="auto" style={css.input} onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))} /></Field>
          </Row>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold}>{saving ? 'Ajout…' : 'Ajouter le chantier'}</button>
            <button type="button" onClick={() => setForm(emptyChantierForm)} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
      </section>

      <section style={css.section}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1rem' }}>Chantiers enregistrés</h3>
        {loading && <LoadingHint>Chargement des chantiers…</LoadingHint>}
        {!loading && error && <AlertBox>{error} <button type="button" onClick={() => void fetchPoints()} style={{ ...css.btnOutline, marginLeft: 8 }}>Réessayer</button></AlertBox>}
        {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f5f0e8' }}>
            {['Nom', 'Type', 'Adresse', 'GPS', 'Statut', ''].map((h) => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>)}
          </tr></thead>
          <tbody>{points.map((p, i) => {
            const active = isSupermarketActive(p.active)
            const siteType = isSiteType(p.siteType) ? p.siteType : 'prive'
            return (
            <tr key={p.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#faf8f5', opacity: active ? 1 : 0.72 }}>
              <td style={css.td}>{p.name}</td>
              <td style={css.td}>
                <select
                  value={siteType}
                  style={{ ...css.input, minWidth: 110, padding: '4px 8px' }}
                  data-testid={`mgr-chantier-type-${p.id}`}
                  onChange={(e) => void changeSiteType(p, e.target.value)}
                >
                  {SITE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </td>
              <td style={{ ...css.td, maxWidth: 200, fontSize: 12 }}>{p.address}</td>
              <td style={css.td}>{p.lat && p.lng ? `${p.lat}, ${p.lng}` : '—'}</td>
              <td style={css.td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Toggle active={active} onChange={() => void toggleActive(p)} />
                  <span data-testid={`mgr-point-status-${p.id}`} style={{ fontSize: 12, fontWeight: 600, color: active ? '#0b4a2c' : '#9ca3af' }}>
                    {active ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </td>
              <td style={css.td}><button type="button" onClick={() => setEditId(p.id)} style={css.btnOutline}>Modifier</button></td>
            </tr>
          )})}</tbody>
        </table>
        )}
        {editId && (
          <EditSupermarketModal
            id={editId}
            points={points}
            onClose={() => { setEditId(null); void fetchPoints() }}
          />
        )}
        {!loading && !error && points.length === 0 && <EmptyHint>Aucun chantier enregistré.</EmptyHint>}
      </section>
    </div>
  )
}
