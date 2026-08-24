import { useState } from 'react'
import { authFetch } from '../managerApi'
import { CI_PHONE_INPUT_TITLE, CI_PHONE_PLACEHOLDER } from '../../../lib/phone'
import { isValidContactEmail, normalizeContactEmail } from '../../../../shared/email'
import { SITE_TYPES, isSiteType } from '../../../../shared/catalogEnums'
import { AlertBox, Field, css } from '../managerUi'
import type { Supermarket } from '../managerTypes'

export function EditSupermarketModal({
  id,
  points,
  onClose,
}: {
  id: string
  points: Supermarket[]
  onClose: () => void
}) {
  const point = points.find((p) => p.id === id)
  const [form, setForm] = useState({
    name: point?.name ?? '',
    address: point?.address ?? '',
    contactPhone: point?.contactPhone ?? '',
    contactName: point?.contactName ?? '',
    contactEmail: point?.contactEmail ?? '',
    lat: point?.lat ?? '',
    lng: point?.lng ?? '',
    siteType: point && isSiteType(point.siteType) ? point.siteType : 'prive',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const email = form.contactEmail.trim()
      if (!email) throw new Error('E-mail responsable obligatoire.')
      if (!isValidContactEmail(email)) throw new Error('E-mail responsable invalide.')
      const res = await authFetch(`/dashboard/supermarkets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim(),
          contactPhone: form.contactPhone.trim(),
          contactName: form.contactName.trim() || undefined,
          contactEmail: normalizeContactEmail(email),
          lat: form.lat.trim() || null,
          lng: form.lng.trim() || null,
          siteType: form.siteType,
        }),
      })
      const data = await res.json() as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', width: 420, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ margin: '0 0 1rem' }}>Modifier {point?.name ?? 'chantier'}</h3>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleSave(e)}>
          <Field label="Nom *">
            <input type="text" value={form.name} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <Field label="Type">
            <select
              value={form.siteType}
              style={css.input}
              data-testid="mgr-chantier-type-edit"
              onChange={(e) => setForm((p) => ({ ...p, siteType: isSiteType(e.target.value) ? e.target.value : 'prive' }))}
            >
              {SITE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Adresse *">
            <input type="text" value={form.address} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          </Field>
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
          <Field label="Nom responsable">
            <input type="text" value={form.contactName} style={css.input} onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))} />
          </Field>
          <Field label="E-mail responsable *">
            <input type="email" required value={form.contactEmail} style={css.input} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} />
          </Field>
          <div style={{ display: 'flex', gap: 8 }}>
            <Field label="Latitude">
              <input type="text" value={form.lat} style={css.input} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} />
            </Field>
            <Field label="Longitude">
              <input type="text" value={form.lng} style={css.input} onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</button>
            <button type="button" onClick={onClose} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}
