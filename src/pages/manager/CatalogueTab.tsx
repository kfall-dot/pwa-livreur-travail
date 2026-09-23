import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { authFetch, fetchSupermarkets } from './managerApi'
import { normalizeSupermarkets, type Supermarket } from './managerTypes'
import { EditSupermarketModal } from './modals/EditSupermarketModal'
import { SiteDetailModal } from './modals/SiteDetailModal'
import { SUPPLIER_FAMILIES, isSupplierFamily, siteTypeLabel, supplierFamilyLabel } from '../../../shared/catalogEnums'
import { toast } from '../../lib/toast'

type ProductRow = { id: string; label: string; unit: string; category?: string; active: boolean; displayOrder?: number }
type UnitRow = { id: string; code: string; label: string; active: boolean; displayOrder?: number }
type SupplierRow = {
  id: string
  name: string
  contactEmail?: string | null
  contactPhone?: string | null
  /** Famille fournisseur (I56) : materiaux | services | sous_traitance */
  family?: string | null
  notes?: string | null
  active: boolean
}
type BcRegRow = { supplierName: string; amountFcfa: number | string; siteName: string; date: string }
type Chip = 'produits' | 'fournisseurs' | 'unites' | 'chantiers'
type SiteRow = { id: string; name: string; status: string; siteType?: string | null }

/** Chantier achats (`sites`) tel que renvoyé par GET /procurement/sites. */
type ProcurementSiteRow = { id: string; name: string; supermarketId?: string | null }

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

/** Date registre BC « jj/mm/aaaa » → `Date` locale (`null` si non exploitable). */
function parseFrDate(value: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? '').trim())
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}

const CAT_CSS = `
.ctg{font-family:'Inter',sans-serif}
.ctg .topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:6px}
.ctg h1{font-size:22px;font-weight:800;color:var(--navy,#1e3a5f)}
.ctg .sub{color:var(--muted,#64748b);font-size:13px;margin-top:4px}
.ctg .btn{border:1px solid var(--border,#e2e8f0);background:#fff;border-radius:8px;padding:8px 14px;font-family:inherit;font-size:13px;font-weight:600;color:var(--navy,#1e3a5f);cursor:pointer}
.ctg .btn-primary{background:var(--navy,#1e3a5f);border-color:var(--navy,#1e3a5f);color:#fff}
.ctg .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.ctg .kpi{background:#fff;border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:14px 16px}
.ctg .kpi .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted,#64748b);margin-bottom:6px}
.ctg .kpi .val{font-size:22px;font-weight:800;color:var(--navy,#1e3a5f)}
.ctg .kpi .det{font-size:11px;color:var(--muted,#64748b);margin-top:4px}
.ctg .kpi.warn .val{color:var(--amber,#b45309)}
.ctg .pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700}
.ctg .pill-green{background:var(--green-bg,#ecfdf5);color:var(--green,#047857)}
.ctg .pill-amber{background:var(--amber-bg,#fffbeb);color:var(--amber,#b45309)}
.ctg .pill-red{background:var(--red-bg,#fef2f2);color:var(--red,#b91c1c)}
.ctg .pill-gray{background:#f1f5f9;color:var(--muted,#64748b)}
.ctg .tabs{display:flex;gap:8px;margin-bottom:12px}
.ctg .chip{border:1px solid var(--border,#e2e8f0);background:#fff;border-radius:8px;padding:7px 14px;font-family:inherit;font-size:13px;font-weight:600;color:var(--navy,#1e3a5f);cursor:pointer}
.ctg .chip.active{background:#fdf3e0;border-color:#ecd9b0;color:var(--gold,#b7791f)}
.ctg .card{background:#fff;border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:16px;margin-bottom:16px}
.ctg .filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;align-items:flex-end}
.ctg .filters label{font-size:11px;color:var(--muted,#64748b);display:flex;flex-direction:column;gap:4px}
.ctg .filters select,.ctg .filters input{font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--border,#e2e8f0);border-radius:8px;background:#fff;color:#1e293b}
.ctg .filters input{min-width:200px}
.ctg .cnt{font-size:12px;color:var(--muted,#64748b);margin-left:auto}
.ctg table{width:100%;border-collapse:collapse;font-size:12.5px}
.ctg th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted,#64748b);padding:8px 10px;border-bottom:1px solid var(--border,#e2e8f0)}
.ctg td{padding:9px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.ctg tr:last-child td{border-bottom:none}
.ctg .mono{font-variant-numeric:tabular-nums;font-weight:600}
.ctg .edit{border:1px solid var(--border,#e2e8f0);border-radius:6px;padding:4px 8px;font-family:inherit;font-size:12px;background:#fff;color:var(--navy,#1e3a5f);cursor:pointer}
.ctg-modal{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:60}
.ctg-modal .ctg-modal-box{background:#fff;border-radius:12px;padding:20px;width:400px;max-width:92vw;max-height:88vh;overflow-y:auto}
.ctg-modal h3{font-size:15px;font-weight:800;color:var(--navy,#1e3a5f);margin:0 0 12px}
.ctg-modal label{display:block;font-size:12px;color:var(--muted,#64748b);margin-bottom:10px}
.ctg-modal input,.ctg-modal select{display:block;width:100%;margin-top:4px;font-family:inherit;font-size:13px;padding:7px 10px;border:1px solid var(--border,#e2e8f0);border-radius:8px}
.ctg-modal .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.ctg .legend{font-size:11.5px;color:var(--muted,#64748b);margin-top:4px}
`

const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/\u202F/g, ' ')

export function CatalogueTab({ initialChip = 'produits' }: { initialChip?: Chip }) {
  const [chip, setChip] = useState<Chip>(initialChip)
  useEffect(() => { setChip(initialChip) }, [initialChip])
  const [sites, setSites] = useState<SiteRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])
  const [units, setUnits] = useState<UnitRow[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [bcRows, setBcRows] = useState<BcRegRow[]>([])
  const [loading, setLoading] = useState(true)
  const [qP, setQP] = useState('')
  const [stP, setStP] = useState<'all' | 'active' | 'inactive'>('all')
  const [stS, setStS] = useState<'all' | 'active' | 'inactive'>('all')
  const [qS, setQS] = useState('')
  const [qU, setQU] = useState('')
  const [stU, setStU] = useState<'all' | 'active' | 'inactive'>('all')
  const [modal, setModal] = useState<null | 'product' | 'unit' | 'edit-unit' | 'site' | 'edit-product' | 'edit-supplier' | 'supplier'>(null)
  const [form, setForm] = useState({ label: '', unit: '', code: '', category: '' })
  const [siteForm, setSiteForm] = useState({ name: '', siteType: 'prive', email: '', otpContact: '', phone: '', addrSiege: '', addrDepot: '', status: 'active' })
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null)
  const [editingUnit, setEditingUnit] = useState<UnitRow | null>(null)
  const [editSiteId, setEditSiteId] = useState<string | null>(null)
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null)
  const [editSitePoints, setEditSitePoints] = useState<Supermarket[]>([])
  const [supForm, setSupForm] = useState({ name: '', contactName: '', contactEmail: '', contactPhone: '', address: '', family: 'materiaux', notes: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const importProducts = async (file: File) => {
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) { toast.error('Fichier vide ou illisible'); return }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      const pick = (r: Record<string, unknown>, keys: string[]) => {
        for (const k of Object.keys(r)) {
          const norm = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          if (keys.includes(norm)) return String(r[k] ?? '').trim()
        }
        return ''
      }
      let created = 0
      let skipped = 0
      for (const r of rows) {
        const label = pick(r, ['designation', 'produit', 'libelle', 'label', 'nom', 'name'])
        if (!label) { skipped += 1; continue }
        if (products.some(p => p.label.toLowerCase() === label.toLowerCase())) { skipped += 1; continue }
        const cat = pick(r, ['categorie', 'category', 'famille'])
        const unitRaw = pick(r, ['unite', 'unit', 'unite_mesure']).toLowerCase()
        const unitMatch = units.find(u =>
          u.code.toLowerCase() === unitRaw || u.label.toLowerCase() === unitRaw || u.label.toLowerCase().includes(unitRaw)
        )
        const res = await authFetch('/dashboard/products', {
          method: 'POST',
          body: JSON.stringify({ label, unit: unitMatch?.id ?? units[0]?.id ?? '', category: cat || undefined }),
        })
        if (res.ok) created += 1
        else skipped += 1
      }
      toast.success(`Import terminé : ${created} produit(s) créé(s), ${skipped} ignoré(s) (doublon ou colonne vide)`)
      void load()
    } catch {
      toast.error('Impossible de lire le fichier xlsx')
    } finally {
      setImporting(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rp, ru, rs, rsi, rps] = await Promise.all([
        authFetch('/dashboard/products'),
        authFetch('/dashboard/units'),
        authFetch('/dashboard/suppliers'),
        authFetch('/dashboard/supermarkets'),
        authFetch('/procurement/sites'),
      ])
      if (rp.ok) setProducts(((await rp.json()) as { products?: ProductRow[] }).products ?? [])
      if (ru.ok) setUnits(((await ru.json()) as { units?: UnitRow[] }).units ?? [])
      if (rs.ok) setSuppliers(((await rs.json()) as { suppliers?: SupplierRow[] }).suppliers ?? [])
      if (rps.ok) {
        const pdata = await rps.json() as { sites?: ProcurementSiteRow[] }
        const linked = new Map<string, string>()
        for (const st of pdata.sites ?? []) {
          if (st.supermarketId) linked.set(st.supermarketId, st.name)
        }
        setSiteNameBySmId(linked)
      }
      if (rsi.ok) {
        const data = await rsi.json() as { supermarkets?: { id: string; name: string; active: boolean; siteType?: string }[] }
        setSites((data.supermarkets ?? []).map((s) => ({ id: s.id, name: s.name, status: s.active ? 'active' : 'inactive', siteType: s.siteType ?? null })))
      }
      const rb = await authFetch('/procurement/bc-register')
      if (rb.ok) {
        const reg = await rb.json() as { rows?: BcRegRow[] }
        const rows = reg.rows ?? []
        setBcRows(rows)
        // Fenêtre glissante de 30 jours : comptage par chantier, calculé au
        // chargement (jamais pendant le rendu : `Date.now` est impur).
        const threshold = Date.now() - THIRTY_DAYS_MS
        const counts = new Map<string, number>()
        for (const row of rows) {
          const key = (row.siteName ?? '').trim().toLowerCase()
          if (key === '') continue
          const d = parseFrDate(row.date ?? '')
          if (d == null || d.getTime() < threshold) continue
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        setDeliveries30BySite(counts)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggleProduct = async (p: ProductRow) => {
    const res = await authFetch(`/dashboard/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) })
    if (res.ok) setProducts(prev => prev.map(x => (x.id === p.id ? { ...x, active: !x.active } : x)))
    else toast.error('')
  }
  const toggleUnit = async (u: UnitRow) => {
    const res = await authFetch(`/dashboard/units/${u.id}`, { method: 'PATCH', body: JSON.stringify({ active: !u.active }) })
    if (res.ok) setUnits(prev => prev.map(x => (x.id === u.id ? { ...x, active: !x.active } : x)))
    else toast.error('')
  }
  const toggleSite = async (s: SiteRow) => {
    const res = await authFetch(`/dashboard/supermarkets/${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: s.status !== 'active' }) })
    if (res.ok) setSites(prev => prev.map(x => (x.id === s.id ? { ...x, status: x.status === 'active' ? 'inactive' : 'active' } : x)))
    else toast.error('')
  }

  /**
   * Ouvre la modale « Modifier » d'un chantier. On recharge d'abord les points
   * de livraison complets (type, adresse, contacts, GPS) pour pré-remplir le
   * formulaire, puis on monte la modale.
   */
  const openEditSite = async (id: string) => {
    try {
      const res = await fetchSupermarkets()
      if (res.ok) {
        const data = await res.json() as { supermarkets?: Supermarket[] }
        setEditSitePoints(normalizeSupermarkets(data.supermarkets ?? []))
      }
    } catch {
      // Liste indisponible : la modale s'ouvrira avec les champs vides.
      setEditSitePoints([])
    }
    setEditSiteId(id)
  }

  const handleCreateSupplier = async () => {
    if (!supForm.name.trim()) { toast.error(''); return }
    const res = await authFetch('/dashboard/suppliers', {
      method: 'POST',
      body: JSON.stringify({
        name: supForm.name.trim(),
        contactName: supForm.contactName.trim() || null,
        contactEmail: supForm.contactEmail.trim() || null,
        contactPhone: supForm.contactPhone.trim() || null,
        address: supForm.address.trim() || null,
        family: supForm.family,
        notes: supForm.notes.trim() || null,
      }),
    })
    if (res.ok) { toast.success(''); setModal(null); void load() }
    else toast.error('')
  }

  const submit = async () => {
    if (modal === 'product') {
      if (!form.label.trim() || !form.unit) { toast.error(''); return }
      const res = await authFetch('/dashboard/products', { method: 'POST', body: JSON.stringify({ label: form.label.trim(), unit: form.unit, category: form.category.trim() || undefined }) })
      if (res.ok) { toast.success(''); setModal(null); setForm(f => ({ ...f, label: '', category: '' })); void load() }
      else toast.error('')
    } else if (modal === 'unit') {
      if (!form.code.trim() || !form.label.trim()) { toast.error(''); return }
      const res = await authFetch('/dashboard/units', { method: 'POST', body: JSON.stringify({ code: form.code.trim(), label: form.label.trim() }) })
      if (res.ok) { toast.success(''); setModal(null); setForm(f => ({ ...f, code: '', label: '' })); void load() }
      else toast.error('')
    }
  }

  const fProducts = useMemo(() => products.filter(p =>
    (stP === 'all' || (stP === 'active' ? p.active : !p.active)) &&
    (qP.trim() === '' || p.label.toLowerCase().includes(qP.trim().toLowerCase()))
  ), [products, qP, stP])
  const filteredSites = useMemo(() => sites.filter(s =>
    (stS === 'all' || (stS === 'active' ? s.status === 'active' : s.status !== 'active')) &&
    (qS.trim() === '' || s.name.toLowerCase().includes(qS.trim().toLowerCase()))
  ), [sites, qS, stS])
  const fUnits = useMemo(() => units.filter(u =>
    (stU === 'all' || (stU === 'active' ? u.active : !u.active)) &&
    (qU.trim() === '' || u.code.toLowerCase().includes(qU.trim().toLowerCase()) || u.label.toLowerCase().includes(qU.trim().toLowerCase()))
  ), [units, qU, stU])

  const nbActiveProducts = products.filter(p => p.active).length
  const nbActiveSuppliers = suppliers.filter(s => s.active).length
  const nbInactiveProducts = products.length - nbActiveProducts

  const bcBySupplier = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>()
    for (const row of bcRows) {
      if (!row.supplierName) continue
      const cur = m.get(row.supplierName) ?? { count: 0, total: 0 }
      cur.count += 1
      cur.total += Number(row.amountFcfa ?? 0) || 0
      m.set(row.supplierName, cur)
    }
    return m
  }, [bcRows])

  /**
   * Livraisons des 30 derniers jours par chantier : une ligne du registre BC
   * = un BC livré, rattaché au chantier par son nom (même règle que la fiche
   * détaillée), date au format « jj/mm/aaaa » dans la fenêtre glissante.
   * Calculé au chargement (jamais pendant le rendu : `Date.now` est impur).
   */
  const [deliveries30BySite, setDeliveries30BySite] = useState<Map<string, number>>(() => new Map())
  /** Lien point de livraison → nom du chantier achats relié (même règle que la fiche détaillée). */
  const [siteNameBySmId, setSiteNameBySmId] = useState<Map<string, string>>(() => new Map())

  const deliveries30For = (site: SiteRow): number => {
    // Comme la fiche détaillée : on compte par le nom du chantier achats relié
    // au point (repli sur le nom du point quand il n'est pas rattaché).
    const name = siteNameBySmId.get(site.id) ?? site.name
    return deliveries30BySite.get((name ?? '').trim().toLowerCase()) ?? 0
  }

  return (
    <div className="ctg">
      <style>{CAT_CSS}</style>
      <div className="topbar">
        <div>
          <h1>Catalogue</h1>
          <p className="sub">Produits, fournisseurs et unités — données partagées par tous les modules (BC, achats, chantiers)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={importing} onClick={() => fileRef.current?.click()}>{importing ? 'Import en cours…' : 'Importer (xlsx)'}</button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importProducts(f); e.target.value = '' }}
          />
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><div className="lbl">Produits référencés</div><div className="val">{fmt(products.length)}</div><div className="det">{nbActiveProducts} actifs</div></div>
        <div className="kpi"><div className="lbl">Fournisseurs actifs</div><div className="val">{fmt(nbActiveSuppliers)}</div><div className="det">sur {suppliers.length} référencés</div></div>
        <div className="kpi"><div className="lbl">Unités de mesure</div><div className="val">{fmt(units.filter(u => u.active).length)}</div><div className="det">sur {units.length} définies</div></div>
        <div className="kpi warn"><div className="lbl">Produits inactifs</div><div className="val">{fmt(nbInactiveProducts)}</div><div className="det">conservés pour l'historique</div></div>
      </div>

      <div className="tabs">
        <button className={chip === 'produits' ? 'chip active' : 'chip'} onClick={() => setChip('produits')}>Produits</button>
        <button className={chip === 'fournisseurs' ? 'chip active' : 'chip'} onClick={() => setChip('fournisseurs')}>Fournisseurs</button>
        <button className={chip === 'unites' ? 'chip active' : 'chip'} onClick={() => setChip('unites')}>Catégories &amp; unités</button>
        <button className={chip === 'chantiers' ? 'chip active' : 'chip'} onClick={() => setChip('chantiers')}>Chantiers</button>
      </div>

      {loading ? (
        <div className="card">Chargement du catalogue…</div>
      ) : chip === 'produits' ? (
        <div className="card">
          <div className="topbar" style={{ marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 15 }}>Produits</h1>
              <p className="sub" style={{ fontSize: 12 }}>Référentiel partagé — BC, achats et chantiers</p>
            </div>
            <button className="btn btn-primary" onClick={() => { setForm(f => ({ ...f, label: '', unit: units[0]?.id ?? '' })); setModal('product') }}>+ Nouveau produit</button>
          </div>
          <div className="filters">
            <label>Statut
              <select value={stP} onChange={e => setStP(e.target.value as typeof stP)}>
                <option value="all">Tous</option><option value="active">Actifs</option><option value="inactive">Inactifs</option>
              </select>
            </label>
            <label>Recherche
              <input placeholder="Nom du produit…" value={qP} onChange={e => setQP(e.target.value)} />
            </label>
            <span className="cnt">{fProducts.length} produit{fProducts.length > 1 ? 's' : ''}</span>
          </div>
          <table>
            <thead><tr><th>Produit</th><th>Catégorie</th><th>Unité</th><th>Statut</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {fProducts.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: 'var(--navy,#1e3a5f)' }}>{p.label}</td>
                  <td>{p.category || '—'}</td>
                  <td>{units.find(u => u.id === p.unit)?.code ?? p.unit}</td>
                  <td>{p.active ? <span className="pill pill-green">Actif</span> : <span className="pill pill-gray">Inactif</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="edit" onClick={() => { setEditingProduct(p); setModal('edit-product'); }} style={{ marginRight: 4 }}>Modifier</button>
                    <button className="edit" onClick={() => void toggleProduct(p)}>{p.active ? 'Désactiver' : 'Activer'}</button>
                  </td>
                </tr>
              ))}
              {fProducts.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted,#64748b)' }}>Aucun produit ne correspond aux filtres.</td></tr>}
            </tbody>
          </table>
          <p className="legend">● Actif : proposé dans les nouveaux BC · ● Inactif : conservé pour l'historique, retiré des nouveaux BC</p>
        </div>
      ) : chip === 'fournisseurs' ? (
        <>
          <div className="card">
            <div className="topbar" style={{ marginBottom: 10 }}>
              <div>
                <h1 style={{ fontSize: 15 }}>Fournisseurs</h1>
                <p className="sub" style={{ fontSize: 12 }}>Points fournisseurs du référentiel — historique BC rattaché</p>
              </div>
              <button className="btn btn-primary" onClick={() => { setSupForm({ name: '', contactName: '', contactEmail: '', contactPhone: '', address: '', family: 'materiaux', notes: '' }); setModal('supplier') }}>+ Nouveau fournisseur</button>
            </div>
            <table>
              <thead><tr>
                <th>Fournisseur</th><th>Famille</th><th>Contact</th><th>Téléphone</th><th>Produits liés</th>
                <th>BC du mois</th><th>Montant engagé (XOF)</th><th>Statut</th><th aria-hidden="true"></th>
              </tr></thead>
              <tbody>
                {suppliers.map(s => {
                  const stat = bcBySupplier.get(s.name)
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.name}</strong></td>
                      <td>{supplierFamilyLabel(s.family)}</td>
                      <td>{s.contactEmail || '—'}</td>
                      <td className="mono">{s.contactPhone || '—'}</td>
                      <td className="mono">—</td>
                      <td className="mono">{stat ? stat.count : 0}</td>
                      <td className="mono">{stat ? fmt(stat.total) : '0'}</td>
                      <td>{s.active ? <span className="pill pill-green">Actif</span> : <span className="pill pill-red">Inactif</span>}</td>
                      <td style={{ textAlign: 'right' }}><button className="edit" onClick={() => { setEditingSupplier(s); setModal('edit-supplier'); }}>Modifier</button></td>
                    </tr>
                  )
                })}
                {suppliers.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--muted,#64748b)' }}>Aucun fournisseur dans le référentiel.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      ) : chip === 'chantiers' ? (
        <div className="card">
          <div className="filters">
            <label>Statut
              <select value={stS} onChange={e => setStS(e.target.value as typeof stS)}>
                <option value="all">Tous</option><option value="active">Actifs</option><option value="inactive">Inactifs</option>
              </select>
            </label>
            <label>Recherche
              <input placeholder="Nom du chantier…" value={qS} onChange={e => setQS(e.target.value)} />
            </label>
            <span className="cnt">{filteredSites.length} chantier{filteredSites.length > 1 ? 's' : ''}</span>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setModal('site')}>+ Nouveau chantier</button>
          </div>
          <table>
            <thead><tr><th>Chantier</th><th>Type</th><th>Livraisons 30 j</th><th>Statut</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {filteredSites.map(s => (
                <tr
                  key={s.id}
                  data-testid={`mgr-chantier-row-${s.id}`}
                  title="Cliquer pour ouvrir la fiche détaillée du chantier"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDetailSiteId(s.id)}
                >
                  <td style={{ fontWeight: 600, color: 'var(--navy,#1e3a5f)' }}>{s.name}</td>
                  <td><span className={s.siteType === 'public' ? 'pill pill-amber' : 'pill pill-gray'}>{siteTypeLabel(s.siteType)}</span></td>
                  <td className="mono" data-testid={`mgr-chantier-d30-${s.id}`}>{deliveries30For(s)}</td>
                  <td>{s.status === 'active' ? <span className="pill pill-green">Actif</span> : <span className="pill pill-gray">Inactif</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="edit" style={{ marginRight: 4 }} onClick={(e) => { e.stopPropagation(); void openEditSite(s.id) }}>Modifier</button>
                    <button className="edit" onClick={(e) => { e.stopPropagation(); void toggleSite(s) }}>{s.status === 'active' ? 'Désactiver' : 'Activer'}</button>
                  </td>
                </tr>
              ))}
              {filteredSites.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--muted,#64748b)' }}>Aucun chantier dans le référentiel.</td></tr>}
            </tbody>
          </table>
          <p className="legend">● Les chantiers sont créés par le SA/CdG et assignés aux DT et livreurs pour les livraisons. ● Cliquez un chantier pour ouvrir sa fiche détaillée (contacts, encadrement, budget, livraisons).</p>
        </div>
      ) : (
        <div className="card">
          <div className="filters">
            <label>Statut
              <select value={stU} onChange={e => setStU(e.target.value as typeof stU)}>
                <option value="all">Toutes</option><option value="active">Actives</option><option value="inactive">Inactives</option>
              </select>
            </label>
            <label>Recherche
              <input placeholder="Code ou libellé…" value={qU} onChange={e => setQU(e.target.value)} />
            </label>
            <span className="cnt">{fUnits.length} unité{fUnits.length > 1 ? 's' : ''}</span>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setForm(f => ({ ...f, code: '', label: '' })); setModal('unit') }}>+ Nouvelle unité</button>
          </div>
          <table>
            <thead><tr><th>Code</th><th>Libellé</th><th>Statut</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
            <tbody>
              {fUnits.map(u => (
                <tr key={u.id}>
                  <td className="mono">{u.code}</td>
                  <td>{u.label}</td>
                  <td>{u.active ? <span className="pill pill-green">Active</span> : <span className="pill pill-gray">Inactive</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="edit" style={{ marginRight: 4 }} onClick={() => { setEditingUnit(u); setModal('edit-unit') }}>Modifier</button>
                    <button className="edit" onClick={() => void toggleUnit(u)}>{u.active ? 'Désactiver' : 'Activer'}</button>
                  </td>
                </tr>
              ))}
              {fUnits.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted,#64748b)' }}>Aucune unité ne correspond aux filtres.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modal !== null && (
        <div className="ctg-modal" onClick={() => setModal(null)}>
          <div className="ctg-modal-box" onClick={e => e.stopPropagation()}>
            {modal === 'product' && (
              <>
                <h3>Nouveau produit</h3>
                <label>Désignation
                  <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex. Ciment CPJ 35" />
                </label>
                <label>Catégorie
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Ex. Matériaux, Quincaillerie…" />
                </label>
                <label>Unité
                  <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                    <option value="">— Choisir —</option>
                    {units.filter(u => u.active).map(u => <option key={u.id} value={u.code}>{u.code} — {u.label}</option>)}
                  </select>
                </label>
                <div className="ctg-modal-actions">
                  <button className="btn" onClick={() => setModal(null)}>Annuler</button>
                  <button className="btn btn-primary" onClick={() => void submit()}>Créer</button>
                </div>
              </>
            )}
            {modal === 'unit' && (
              <>
                <h3>Nouvelle unité</h3>
                <label>Code
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="Ex. sac" />
                </label>
                <label>Libellé
                  <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex. Sac de 50 kg" />
                </label>
                <div className="ctg-modal-actions">
                  <button className="btn" onClick={() => setModal(null)}>Annuler</button>
                  <button className="btn btn-primary" onClick={() => void submit()}>Créer</button>
                </div>
              </>
            )}
            {modal === 'edit-unit' && editingUnit && (
              <>
                <h3>Modifier l'unité</h3>
                <label>Code (non modifiable)
                  <input value={editingUnit.code} disabled style={{ background: '#f1f5f9', color: 'var(--muted,#64748b)' }} />
                </label>
                <label>Libellé *
                  <input value={editingUnit.label} onChange={e => setEditingUnit({ ...editingUnit, label: e.target.value })} placeholder="Ex. Sac de 50 kg" />
                </label>
                <label>Statut
                  <select value={editingUnit.active ? 'active' : 'inactive'} onChange={e => setEditingUnit({ ...editingUnit, active: e.target.value === 'active' })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <div className="ctg-modal-actions">
                  <button className="btn" onClick={() => { setModal(null); setEditingUnit(null) }}>Annuler</button>
                  <button className="btn btn-primary" onClick={async () => {
                    if (!editingUnit.label.trim()) { toast.error('Le libellé est requis'); return }
                    const res = await authFetch(`/dashboard/units/${editingUnit.id}`, { method: 'PATCH', body: JSON.stringify({
                      label: editingUnit.label.trim(),
                      active: editingUnit.active,
                    }) })
                    if (res.ok) { toast.success('Unité modifiée'); setModal(null); setEditingUnit(null); void load() }
                    else toast.error('Échec de la modification de l\'unité')
                  }}>Enregistrer</button>
                </div>
              </>
            )}
            {modal === 'site' && (
              <>
                <h3>Nouveau chantier</h3>
                <label>Nom du chantier *
                  <input value={siteForm.name} onChange={e => setSiteForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex. Résidence Cocody Tour A" />
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <label style={{ flex: 1 }}>Type *
                    <select value={siteForm.siteType} onChange={e => setSiteForm(f => ({ ...f, siteType: e.target.value }))}>
                      <option value="prive">Privé</option>
                      <option value="public">Public</option>
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>Statut
                    <select value={siteForm.status} onChange={e => setSiteForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="active">Actif</option>
                      <option value="inactive">Inactif</option>
                    </select>
                  </label>
                </div>
                <label>Contact OTP (nom, prénom)
                  <input value={siteForm.otpContact} onChange={e => setSiteForm(f => ({ ...f, otpContact: e.target.value }))} placeholder="Ex. Konan Yao Serge" />
                </label>
                <label>Téléphone * (format +225 + 10 chiffres)
                  <input value={siteForm.phone} onChange={e => setSiteForm(f => ({ ...f, phone: e.target.value }))} placeholder="+2250700000000" />
                </label>
                <label>eMail
                  <input type="email" value={siteForm.email} onChange={e => setSiteForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@chantier.ci (optionnel)" />
                </label>
                <label>Adresse du siège *
                  <input value={siteForm.addrSiege} onChange={e => setSiteForm(f => ({ ...f, addrSiege: e.target.value }))} placeholder="Ex. Cocody, Rue des Jardins, Abidjan" />
                </label>
                <label>Adresse du dépôt
                  <input value={siteForm.addrDepot} onChange={e => setSiteForm(f => ({ ...f, addrDepot: e.target.value }))} placeholder="Si différent du siège (optionnel)" />
                </label>
                <div className="ctg-modal-actions">
                  <button className="btn" onClick={() => setModal(null)}>Annuler</button>
                  <button className="btn btn-primary" onClick={async () => {
                    if (!siteForm.name.trim() || !siteForm.addrSiege.trim() || !siteForm.phone.trim()) { toast.error(''); return }
                    const address = siteForm.addrDepot.trim() ? `${siteForm.addrSiege.trim()} — Dépôt : ${siteForm.addrDepot.trim()}` : siteForm.addrSiege.trim()
                    const res = await authFetch('/dashboard/supermarkets', { method: 'POST', body: JSON.stringify({
                      name: siteForm.name.trim(),
                      address,
                      contactPhone: siteForm.phone.trim(),
                      contactName: siteForm.otpContact.trim() || undefined,
                      contactEmail: siteForm.email.trim() || undefined,
                      siteType: siteForm.siteType,
                    }) })
                    if (res.ok) {
                      const created = await res.json() as { supermarket?: { id: string } }
                      if (siteForm.status === 'inactive' && created.supermarket?.id) {
                        await authFetch(`/dashboard/supermarkets/${created.supermarket.id}/deactivate`, { method: 'POST' })
                      }
                      toast.success(''); setModal(null); setSiteForm({ name: '', siteType: 'prive', email: '', otpContact: '', phone: '', addrSiege: '', addrDepot: '', status: 'active' }); void load()
                    } else {
                      toast.error('')
                    }
                  }}>Créer</button>
                </div>
              </>
            )}
            {modal === 'edit-product' && editingProduct && (
              <>
                <h3>Modifier le produit</h3>
                <label>Désignation
                  <input value={editingProduct.label} onChange={e => setEditingProduct({ ...editingProduct, label: e.target.value })} />
                </label>
                <label>Catégorie
                  <input value={editingProduct.category ?? ''} onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })} placeholder="Ex. Matériaux, Quincaillerie…" />
                </label>
                <label>Unité
                  <select value={editingProduct.unit} onChange={e => setEditingProduct({ ...editingProduct, unit: e.target.value })}>
                    {units.filter(u => u.active).map(u => <option key={u.id} value={u.code}>{u.code} — {u.label}</option>)}
                  </select>
                </label>
                <label>Statut
                  <select value={editingProduct.active ? 'active' : 'inactive'} onChange={e => setEditingProduct({ ...editingProduct, active: e.target.value === 'active' })}>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </label>
                <div className="ctg-modal-actions">
                  <button className="btn" onClick={() => setModal(null)}>Annuler</button>
                  <button className="btn btn-primary" onClick={async () => {
                    if (!editingProduct.label.trim() || !editingProduct.unit) { toast.error(''); return }
                    const res = await authFetch(`/dashboard/products/${editingProduct.id}`, { method: 'PATCH', body: JSON.stringify({
                      label: editingProduct.label.trim(),
                      unit: editingProduct.unit,
                      category: editingProduct.category?.trim() || null,
                      active: editingProduct.active,
                    }) })
                    if (res.ok) { toast.success(''); setModal(null); setEditingProduct(null); void load() }
                    else toast.error('')
                  }}>Enregistrer</button>
                </div>
              </>
            )}
            {modal === 'edit-supplier' && editingSupplier && (
              <>
                <h3>Modifier le fournisseur</h3>
                <label>Nom
                  <input value={editingSupplier.name} onChange={e => setEditingSupplier({ ...editingSupplier, name: e.target.value })} />
                </label>
                <label>eMail
                  <input type="email" value={editingSupplier.contactEmail ?? ''} onChange={e => setEditingSupplier({ ...editingSupplier, contactEmail: e.target.value })} placeholder="contact@fournisseur.ci (optionnel)" />
                </label>
                <label>Téléphone
                  <input value={editingSupplier.contactPhone ?? ''} onChange={e => setEditingSupplier({ ...editingSupplier, contactPhone: e.target.value })} placeholder="+2250700000000 (optionnel)" />
                </label>
                <label>Famille
                  <select
                    value={isSupplierFamily(editingSupplier.family) ? editingSupplier.family : 'materiaux'}
                    data-testid="mgr-supplier-family-edit"
                    onChange={e => setEditingSupplier({ ...editingSupplier, family: isSupplierFamily(e.target.value) ? e.target.value : 'materiaux' })}
                  >
                    {SUPPLIER_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </label>
                <label>Note
                  <input
                    value={editingSupplier.notes ?? ''}
                    data-testid="mgr-supplier-notes-edit"
                    onChange={e => setEditingSupplier({ ...editingSupplier, notes: e.target.value })}
                    placeholder="Note interne (optionnel)"
                  />
                </label>
                <label>Statut
                  <select value={editingSupplier.active ? 'active' : 'inactive'} onChange={e => setEditingSupplier({ ...editingSupplier, active: e.target.value === 'active' })}>
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </label>
                <div className="ctg-modal-actions">
                  <button className="btn" onClick={() => setModal(null)}>Annuler</button>
                  <button className="btn btn-primary" onClick={async () => {
                    if (!editingSupplier.name.trim()) { toast.error(''); return }
                    const res = await authFetch(`/dashboard/suppliers/${editingSupplier.id}`, { method: 'PATCH', body: JSON.stringify({
                      name: editingSupplier.name.trim(),
                      contactEmail: editingSupplier.contactEmail?.trim() || null,
                      contactPhone: editingSupplier.contactPhone?.trim() || null,
                      family: editingSupplier.family ?? null,
                      notes: editingSupplier.notes?.trim() || null,
                      active: editingSupplier.active,
                    }) })
                    if (res.ok) { toast.success(''); setModal(null); setEditingSupplier(null); void load() }
                    else toast.error('')
                  }}>Enregistrer</button>
                </div>
              </>
            )}
            {modal === 'supplier' && (
              <>
                <h3>Nouveau fournisseur</h3>
                <form data-testid="mgr-supplier-modal-form" onSubmit={(e) => { e.preventDefault(); void handleCreateSupplier() }}>
                  <label>Nom (raison sociale) *
                    <input value={supForm.name} onChange={e => setSupForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex. SOCIETE ACTION SOCIAM" required />
                  </label>
                  <label>Contact (nom & prénom)
                    <input value={supForm.contactName} onChange={e => setSupForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Ex. Konan Yao" />
                  </label>
                  <label>eMail
                    <input type="email" value={supForm.contactEmail} onChange={e => setSupForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="contact@fournisseur.ci (optionnel)" />
                  </label>
                  <label>Téléphone
                    <input value={supForm.contactPhone} onChange={e => setSupForm(f => ({ ...f, contactPhone: e.target.value }))} placeholder="+225 07 00 00 00 00 (optionnel)" />
                  </label>
                  <label>Adresse
                    <input value={supForm.address} onChange={e => setSupForm(f => ({ ...f, address: e.target.value }))} placeholder="Adresse du fournisseur (optionnel)" />
                  </label>
                  <label>Famille
                    <select
                      value={supForm.family}
                      data-testid="mgr-supplier-modal-family"
                      onChange={e => setSupForm(f => ({ ...f, family: isSupplierFamily(e.target.value) ? e.target.value : 'materiaux' }))}
                    >
                      {SUPPLIER_FAMILIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                  <label>Note
                    <input
                      value={supForm.notes}
                      data-testid="mgr-supplier-modal-notes"
                      onChange={e => setSupForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Note interne (optionnel)"
                    />
                  </label>
                  <div className="ctg-modal-actions">
                    <button type="button" className="btn" onClick={() => setModal(null)}>Annuler</button>
                    <button type="submit" className="btn btn-primary">Créer</button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {editSiteId && (
        <EditSupermarketModal
          id={editSiteId}
          points={editSitePoints}
          onClose={() => { setEditSiteId(null); void load() }}
        />
      )}

      {detailSiteId && (
        <SiteDetailModal siteId={detailSiteId} onClose={() => setDetailSiteId(null)} />
      )}

      <p className="legend">Catalogue partagé : les produits, unités et fournisseurs alimentent les demandes d'achat, les BC et le suivi fournisseurs.</p>
    </div>
  )
}
