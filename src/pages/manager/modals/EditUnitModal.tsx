import { useState } from 'react'
import { authFetch } from '../managerApi'
import { AlertBox, css, Field } from '../managerUi'
import type { UnitRow } from '../managerTypes'

export function EditUnitModal({
  id,
  units,
  onClose,
}: {
  id: string
  units: UnitRow[]
  onClose: () => void
}) {
  const unit = units.find((u) => u.id === id)
  const [form, setForm] = useState({
    label: unit?.label ?? '',
    displayOrder: String(unit?.displayOrder ?? 0),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await authFetch(`/dashboard/units/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: form.label.trim(),
          displayOrder: Number(form.displayOrder) || 0,
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
      <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', width: 360 }}>
        <h3 style={{ margin: '0 0 1rem' }}>Modifier {unit?.label ?? 'unité'}</h3>
        <p style={{ margin: '0 0 1rem', fontSize: 12, color: '#64748b' }}>
          Code technique : <strong>{unit?.code}</strong> (non modifiable)
        </p>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleSave(e)}>
          <Field label="Libellé affiché *">
            <input type="text" value={form.label} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Ordre d'affichage">
            <input type="number" min="0" value={form.displayOrder} style={css.input} onChange={(e) => setForm((p) => ({ ...p, displayOrder: e.target.value }))} />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold}>{saving ? 'Sauvegarde…' : 'Sauvegarder'}</button>
            <button type="button" onClick={onClose} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
      </div>
    </div>
  )
}
