import { useState } from 'react'
import { authFetch } from '../managerApi'
import { Field } from '../managerUi'
import type { ManagerRow } from '../managerTypes'

export function EditManagerModal({
  id,
  managers,
  onClose,
}: {
  id: string
  managers: ManagerRow[]
  onClose: () => void
}) {
  const row = managers.find((m) => m.id === id)
  const [form, setForm] = useState({
    name: row?.name ?? '',
    email: row?.email ?? '',
    password: '',
    role: (row?.role ?? 'manager') as 'admin' | 'manager',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (form.name.trim()) body.name = form.name.trim()
      if (form.email.trim()) body.email = form.email.trim()
      if (form.password) body.password = form.password
      body.role = form.role
      const res = await authFetch(`/dashboard/managers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { ok?: boolean; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur de sauvegarde')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', width: 360 }}>
        <h3 style={{ margin: '0 0 1rem' }}>Modifier {row?.name}</h3>
        <form onSubmit={(e) => void handleSave(e)}>
          <Field label="Nom">
            <input value={form.name} required className="mgr-input" onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="E-mail">
            <input
              type="email"
              value={form.email}
              required
              autoComplete="off"
              className="mgr-input"
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Rôle">
            <select
              value={form.role}
              className="mgr-input"
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as 'admin' | 'manager' }))}
            >
              <option value="manager">Gestionnaire</option>
              <option value="admin">Administrateur</option>
            </select>
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Mot de passe (laisser vide pour ne pas changer)">
            <input
              type="password"
              name="edit-manager-password"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              className="mgr-input"
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            />
          </Field>
          {error && (
            <p style={{ margin: '8px 0 0', color: '#b91c1c', fontSize: 13 }} role="alert">
              {error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} className="mgr-btn mgr-btn--primary">{saving ? 'Sauvegarde…' : 'Sauvegarder'}</button>
            <button type="button" onClick={onClose} className="mgr-btn mgr-btn--ghost">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}
