import { useState } from 'react'
import { authFetch } from '../managerApi'
import {
  CI_PHONE_INPUT_TITLE,
  CI_PHONE_PLACEHOLDER,
  formatPhoneInput,
  isValidDriverPhone,
  normalizeDriverPhone,
  PHONE_FORMAT_HINT,
} from '../../../lib/phone'
import { Field } from '../managerUi'
import type { DriverRow } from '../managerTypes'

export function EditDriverModal({ id, drivers, onClose }: { id: string; drivers: DriverRow[]; onClose: () => void }) {
  const driver = drivers.find((d) => d.id === id)
  const [form, setForm] = useState({ name: driver?.name ?? '', phone: driver?.phone ?? '', pin: '' })
  const [saving, setSaving] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unlockMsg, setUnlockMsg] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (form.name.trim()) body.name = form.name.trim()
      if (form.phone.trim()) {
        const phone = normalizeDriverPhone(form.phone)
        if (!isValidDriverPhone(phone)) {
          throw new Error(`Téléphone invalide — ${PHONE_FORMAT_HINT}`)
        }
        body.phone = phone
      }
      if (form.pin) body.pin = form.pin
      const res = await authFetch(`/dashboard/drivers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { ok?: boolean; message?: string; driver?: DriverRow }
      if (!res.ok) throw new Error(data.message ?? 'Erreur de sauvegarde')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleUnlockLogin = async () => {
    setError(null)
    setUnlockMsg(null)
    if (!window.confirm('Réinitialiser le verrouillage login de ce livreur (tentatives PIN / rate-limit) ?')) return
    setUnlocking(true)
    try {
      const res = await authFetch(`/dashboard/drivers/${id}/clear-login-lock`, { method: 'POST' })
      const data = (await res.json()) as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Échec du déverrouillage')
      setUnlockMsg(data.message ?? 'Verrouillage réinitialisé.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', width: 340 }}>
        <h3 style={{ margin: '0 0 1rem' }}>Modifier {driver?.name}</h3>
        <form onSubmit={(e) => void handleSave(e)}>
          <Field label="Nom"><input value={form.name} className="mgr-input" onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Téléphone">
            <input
              type="tel"
              value={form.phone}
              placeholder={CI_PHONE_PLACEHOLDER}
              title={CI_PHONE_INPUT_TITLE}
              className="mgr-input"
              onChange={(e) => setForm((p) => ({ ...p, phone: formatPhoneInput(e.target.value) }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="PIN (laisser vide pour ne pas changer)">
            <input
              type="password"
              name="edit-driver-pin"
              autoComplete="new-password"
              value={form.pin}
              className="mgr-input"
              onChange={(e) => setForm((p) => ({ ...p, pin: e.target.value }))}
            />
          </Field>
          {error && (
            <p style={{ margin: '8px 0 0', color: '#b91c1c', fontSize: 13 }} role="alert">
              {error}
            </p>
          )}
          {unlockMsg && (
            <p style={{ margin: '8px 0 0', color: '#15803d', fontSize: 13 }}>{unlockMsg}</p>
          )}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6b7280' }}>
              Après 5 mauvais PIN, le login est bloqué 30 min. Débloquez ici si le livreur est bloqué sur le terrain.
            </p>
            <button
              type="button"
              data-testid="mgr-clear-login-lock"
              disabled={unlocking}
              onClick={() => void handleUnlockLogin()}
              className="mgr-btn mgr-btn--ghost"
            >
              {unlocking ? 'Déverrouillage…' : 'Réinitialiser verrouillage login'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} className="mgr-btn mgr-btn--primary">{saving ? 'Sauvegarde…' : 'Sauvegarder'}</button>
            <button type="button" onClick={onClose} className="mgr-btn mgr-btn--ghost">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}
