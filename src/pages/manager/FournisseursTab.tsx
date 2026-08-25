import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authFetch } from './managerApi'
import { toast } from '../../lib/toast'
import { CI_PHONE_INPUT_TITLE, CI_PHONE_PLACEHOLDER } from '../../lib/phone'
import { confirmDeletion } from '../../lib/confirmDeletion'
import { SUPPLIER_FAMILIES, supplierFamilyLabel } from '../../../shared/catalogEnums'
import {
  AlertBox,
  EmptyHint,
  Field,
  FilterSegmented,
  InitialsAvatar,
  ListHeading,
  ListSearchInput,
  LoadingHint,
  Row,
  StatusBadge,
  css,
} from './managerUi'

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
  const [supSearch, setSupSearch] = useState('')
  const [supFamilyFilter, setSupFamilyFilter] = useState<'all' | 'active' | string>('all')
  const [editId, setEditId] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const formSectionRef = useRef<HTMLElement | null>(null)

  const startEdit = (r: CatalogSupplier) => {
    setEditId(r.id)
    setForm({
      name: r.name,
      address: r.address ?? '',
      depotAddress: r.depotAddress ?? '',
      contactName: r.contactName ?? '',
      contactEmail: r.contactEmail ?? '',
      contactPhone: r.contactPhone ?? '',
      family: r.family ?? 'materiaux',
      notes: r.notes ?? '',
      active: r.active,
    })
    setError(null)
  }

  // Au passage en mode édition : faire défiler jusqu'au formulaire et focaliser le premier champ.
  useEffect(() => {
    if (!editId) return
    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const t = window.setTimeout(() => {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }, 120)
    return () => window.clearTimeout(t)
  }, [editId])

  const cancelEdit = () => {
    setEditId(null)
    setForm(emptyForm)
    setError(null)
  }

  const filteredRows = useMemo(() => {
    const q = supSearch.trim().toLowerCase()
    return rows.filter((r) => {
      if (supFamilyFilter === 'active' && !r.active) return false
      if (supFamilyFilter === 'suspended' && r.active) return false
      if (supFamilyFilter !== 'all' && supFamilyFilter !== 'active' && supFamilyFilter !== 'suspended' && r.family !== supFamilyFilter) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        (r.contactName ?? '').toLowerCase().includes(q) ||
        (r.contactPhone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        (r.contactEmail ?? '').toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      )
    })
  }, [rows, supSearch, supFamilyFilter])

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
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || undefined,
        depotAddress: form.depotAddress.trim() || undefined,
        contactName: form.contactName.trim() || undefined,
        contactEmail: form.contactEmail.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        family: form.family,
        notes: form.notes.trim() || undefined,
        active: form.active,
      }
      const res = await authFetch(
        editId ? `/dashboard/suppliers/${encodeURIComponent(editId)}` : '/dashboard/suppliers',
        { method: editId ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      )
      const data = await res.json() as { message?: string }
      if (!res.ok) throw new Error(data.message ?? (editId ? 'Modification impossible' : 'Création impossible'))
      if (editId) {
        toast.success('Fournisseur modifié.')
        cancelEdit()
      } else {
        setForm(emptyForm)
        toast.success('Fournisseur ajouté.')
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : (editId ? 'Modification impossible' : 'Création impossible'))
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
      <section ref={formSectionRef} style={{ ...css.section, ...(editId ? { borderColor: 'var(--action)', boxShadow: '0 0 0 2px rgba(232, 93, 4, 0.18)' } : {}) }}>
        <h2 style={css.sectionTitle}>{editId ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}</h2>
        {editId ? (
          <p style={{ fontSize: 13, color: 'var(--action)', margin: '0 0 1rem', fontWeight: 600 }}>
            ✏️ Modification en cours — {form.name}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1rem' }}>
            L’identifiant est attribué automatiquement. Les fournisseurs actifs apparaissent dans Achats (BC).
          </p>
        )}
        {error && <AlertBox>{error}</AlertBox>}
        <form onSubmit={(e) => void handleAdd(e)} data-testid="mgr-supplier-form">
          <Field label="ID fournisseur">
            <input
              type="text"
              value={editId ? `${editId.slice(0, 8)}…${editId.slice(-4)}` : 'Attribué automatiquement'}
              disabled
              className="mgr-input"
              data-testid="mgr-supplier-id"
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Raison sociale *">
            <input
              type="text"
              required
              value={form.name}
              className="mgr-input"
              data-testid="mgr-supplier-name"
              ref={nameInputRef}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Adresse complète (siège + dépôt)">
            <textarea
              value={form.address}
              rows={2}
              className="mgr-input" style={{ resize: 'vertical' }}
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
              className="mgr-input"
              data-testid="mgr-supplier-depot"
              onChange={(e) => setForm((p) => ({ ...p, depotAddress: e.target.value }))}
            />
          </Field>
          <div style={{ marginBottom: 8 }} />
          <Field label="Contact — nom">
            <input
              type="text"
              value={form.contactName}
              className="mgr-input"
              data-testid="mgr-supplier-contact-name"
              onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
            />
          </Field>
          <Row>
            <Field label="Contact — e-mail">
              <input
                type="email"
                value={form.contactEmail}
                className="mgr-input"
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
                className="mgr-input"
                data-testid="mgr-supplier-contact-phone"
                onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
              />
            </Field>
          </Row>
          <div style={{ marginBottom: 8 }} />
          <Field label="Famille">
            <select
              value={form.family}
              className="mgr-input"
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
              className="mgr-input"
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
              className="mgr-input" style={{ resize: 'vertical' }}
              data-testid="mgr-supplier-notes"
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" disabled={saving} className="mgr-btn mgr-btn--primary" data-testid="mgr-supplier-submit">
              {saving ? 'Enregistrement…' : (editId ? 'Enregistrer les modifications' : 'Ajouter le fournisseur')}
            </button>
            <button type="button" onClick={cancelEdit} className="mgr-btn mgr-btn--ghost">
              {editId ? 'Quitter la modification' : 'Annuler'}
            </button>
          </div>
        </form>
      </section>

      <section style={css.section}>
        <div className="mgr-toolbar">
          <ListSearchInput
            value={supSearch}
            onChange={setSupSearch}
            placeholder="Rechercher un fournisseur (nom, contact, e-mail)…"
          />
          <FilterSegmented
            options={[
              { label: 'Tous', value: 'all' },
              ...SUPPLIER_FAMILIES.filter((f) => rows.some((r) => r.family === f.value)).map((f) => ({ label: f.label, value: f.value })),
              { label: 'Suspendus', value: 'suspended' },
            ]}
            value={supFamilyFilter}
            onChange={setSupFamilyFilter}
          />
        </div>
        <ListHeading title="Fournisseurs enregistrés" count={filteredRows.length} suffix="fournisseur(s)" />
        {loading && <LoadingHint>Chargement des fournisseurs…</LoadingHint>}
        {!loading && error && (
          <AlertBox>{error} <button type="button" onClick={() => void load()} className="mgr-btn mgr-btn--outline" style={{ marginLeft: 8 }}>Réessayer</button></AlertBox>
        )}
        {!loading && !error && rows.length === 0 && <EmptyHint>Aucun fournisseur enregistré. Ajoutez-en un via le formulaire à gauche.</EmptyHint>}
        {!loading && !error && rows.length > 0 && filteredRows.length === 0 && (
          <EmptyHint>Aucun fournisseur ne correspond à la recherche ou au filtre.</EmptyHint>
        )}
        {!loading && !error && filteredRows.length > 0 && (
          <table className="mgr-table-pro" data-testid="mgr-supplier-table">
            <thead>
              <tr>
                {['Fournisseur', 'Famille', 'Contact', 'Statut'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="mgr-person">
                      <InitialsAvatar name={r.name} />
                      <div>
                        <div className="mgr-person-name">{r.name}</div>
                        <div className="mgr-person-sub">ID {r.id.slice(0, 8)}…{r.id.slice(-4)}</div>
                      </div>
                    </div>
                  </td>
                  <td>{supplierFamilyLabel(r.family)}</td>
                  <td style={{ fontSize: 12 }}>
                    {[r.contactName, r.contactPhone, r.contactEmail].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <StatusBadge active={r.active} okLabel="Actif" offLabel="Suspendu" />
                      <button
                        type="button"
                        onClick={() => void toggleActive(r)}
                        className="mgr-btn mgr-btn--outline"
                        data-testid={`mgr-supplier-status-${r.id}`}
                      >
                        {r.active ? 'Suspendre' : 'Réactiver'}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="mgr-icon-btn"
                        title={`Modifier ${r.name}`}
                        aria-label={`Modifier ${r.name}`}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                      </button>
                    </div>
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
