import { useState } from 'react'
import { authFetch } from '../managerApi'
import { AlertBox, css, Field } from '../managerUi'
import type { ProductRow, UnitRow } from '../managerTypes'

export function EditProductModal({
  id,
  products,
  units,
  onClose,
}: {
  id: string
  products: ProductRow[]
  units: UnitRow[]
  onClose: () => void
}) {
  const product = products.find((p) => p.id === id)
  const [form, setForm] = useState({
    label: product?.label ?? '',
    unit: product?.unit ?? 'palette',
    displayOrder: String(product?.displayOrder ?? 0),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await authFetch(`/dashboard/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          label: form.label,
          unit: form.unit,
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '1.5rem', width: 360 }}>
        <h3 style={{ margin: '0 0 1rem' }}>Modifier {product?.label ?? 'produit'}</h3>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleSave(e)}>
          <Field label="Libellé *">
            <input type="text" value={form.label} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Unité *">
            <select value={form.unit} required style={css.input} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}>
              {units.map((u) => <option key={u.id} value={u.code}>{u.label}</option>)}
              {form.unit && !units.some((u) => u.code === form.unit) && (
                <option value={form.unit}>{form.unit}</option>
              )}
            </select>
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
