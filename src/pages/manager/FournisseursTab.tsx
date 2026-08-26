import { useCallback, useEffect, useState } from 'react'
import { authFetch } from './managerApi'
import { toast } from '../../lib/toast'
import { CI_PHONE_INPUT_TITLE, CI_PHONE_PLACEHOLDER } from '../../lib/phone'
import { confirmDeletion } from '../../lib/confirmDeletion'
import { SUPPLIER_FAMILIES, supplierFamilyLabel } from '../../../shared/catalogEnums'
import { AlertBox, EmptyHint, Field, LoadingHint, Row, css } from './managerUi'

export type CatalogSupplier = {
  id: string
  name: string
  contactName?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  address?: string | null
  depotAddress?: string | null
  family?: string | null
  notes?: string | null
  active: boolean
}

const emptyForm = {
  name: '',
  address: '',
  depotAddress: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  family: 'materiaux',
  notes: '',
  active: true,
}

export function FournisseursTab({ handleAuth }: { handleAuth: (s: number) => boolean }) {
  const [rows, setRows] = useState<CatalogSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch('/dashboard/suppliers')
      if (handleAuth(res.status)) return
      const data = await res.json() as { suppliers?: CatalogSupplier[]; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Impossible de charger les fournisseurs.')
      setRows(data.suppliers ?? [])
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Impossible de charger les fournisseurs.')
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => { void load() }, [load])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const res = await authFetch('/dashboard/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          address: form.address.trim() || undefined,
          depotAddress: form.depotAddress.trim() || undefined,
          contactName: form.contactName.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
          family: form.family,
          notes: form.notes.trim() || undefined,
          active: form.active,
        }),
      })
      const data = await res.json() as { message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Création impossible')
      setForm(emptyForm)
      toast.success('Fournisseur ajouté.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (row: CatalogSupplier) => {
    if (row.active && !confirmDeletion(`Suspendre le fournisseur « ${row.name} » ?`)) return
    try {
      const res = await authFetch(`/dashboard/suppliers/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !row.active }),
      })
      if (handleAuth(res.status)) return
      if (!res.ok) throw new Error('Statut non modifié')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Statut non modifié')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 400px) 1fr', gap: '2rem', alignItems: 'start' }}>
      <section style={css.section}>
        <h2 style={css.sectionTitle}>Ajouter un fournisseur</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          L’identifiant est attribué automatiquement. Les fournisseurs actifs apparaissent dans Achats (BC).
        </p>
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleAdd(e)} data-testid="mgr-supplier-form">
          <Field label="ID fournisseur">
            <input type="text" value="Attribué automatiquement" disabled style={css.input} data-testid="mgr-supplier-id" />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Raison sociale *">
            <input
              type="text"
              required
              value={form.name}
              style={css.input}
              data-testid="mgr-supplier-name"
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Adresse complète (siège + dépôt)">
            <textarea
              value={form.address}
              rows={2}
              style={{ ...css.input, resize: 'vertical' }}
              data-testid="mgr-supplier-address"
              placeholder="Siège"
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Adresse dépôt (si distincte)">
            <input
              type="text"
              value={form.depotAddress}
              style={css.input}
              data-testid="mgr-supplier-depot"
              onChange={(e) => setForm((p) => ({ ...p, depotAddress: e.target.value }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Contact — nom">
            <input
              type="text"
              value={form.contactName}
              style={css.input}
              data-testid="mgr-supplier-contact-name"
              onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
            />
          </Field>
          <Row>
            <Field label="Contact — e-mail">
              <input
                type="email"
                value={form.contactEmail}
                style={css.input}
                data-testid="mgr-supplier-contact-email"
                onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
              />
            </Field>
            <Field label="Contact — téléphone">
              <input
                type="tel"
                value={form.contactPhone}
                placeholder={CI_PHONE_PLACEHOLDER}
                title={CI_PHONE_INPUT_TITLE}
                style={css.input}
                data-testid="mgr-supplier-contact-phone"
                onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
              />
            </Field>
          </Row>
          <div style={{ marginBottom: 8 }} />
          <Field label="Famille">
            <select
              value={form.family}
              style={css.input}
              data-testid="mgr-supplier-family"
              onChange={(e) => setForm((p) => ({ ...p, family: e.target.value }))}
            >
              {SUPPLIER_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Statut">
            <select
              value={form.active ? 'actif' : 'suspendu'}
              style={css.input}
              data-testid="mgr-supplier-status"
              onChange={(e) => setForm((p) => ({ ...p, active: e.target.value === 'actif' }))}
            >
              <option value="actif">Actif</option>
              <option value="suspendu">Suspendu</option>
            </select>
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Note / commentaire">
            <textarea
              value={form.notes}
              rows={2}
              style={{ ...css.input, resize: 'vertical' }}
              data-testid="mgr-supplier-notes"
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} style={css.btnGold} data-testid="mgr-supplier-submit">
              {saving ? 'Ajout…' : 'Ajouter le fournisseur'}
            </button>
            <button type="button" onClick={() => setForm(emptyForm)} style={css.btnGhost}>Annuler</button>
          </div>
        </form>
      </section>

      <section style={css.section}>
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 1rem' }}>Fournisseurs enregistrés</h3>
        {loading && <LoadingHint>Chargement des fournisseurs…</LoadingHint>}
        {!loading && error && (
          <AlertBox>{error} <button type="button" onClick={() => void load()} style={{ ...css.btnOutline, marginLeft: 8 }}>Réessayer</button></AlertBox>
        )}
        {!loading && !error && rows.length === 0 && <EmptyHint>Aucun fournisseur enregistré.</EmptyHint>}
        {!loading && !error && rows.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} data-testid="mgr-supplier-table">
            <thead>
              <tr style={{ background: '#f5f0e8' }}>
                {['ID', 'Raison sociale', 'Famille', 'Contact', 'Statut'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#faf8f5', opacity: r.active ? 1 : 0.72 }}>
                  <td style={{ ...css.td, fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>{r.id}</td>
                  <td style={css.td}>{r.name}</td>
                  <td style={css.td}>{supplierFamilyLabel(r.family)}</td>
                  <td style={{ ...css.td, fontSize: 12 }}>
                    {[r.contactName, r.contactPhone, r.contactEmail].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td style={css.td}>
                    <button
                      type="button"
                      onClick={() => void toggleActive(r)}
                      style={css.btnOutline}
                      data-testid={`mgr-supplier-status-${r.id}`}
                    >
                      {r.active ? 'Actif' : 'Suspendu'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
