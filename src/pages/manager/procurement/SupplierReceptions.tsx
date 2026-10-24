import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../managerApi'
import { css } from './procurementUi'
import { apiErrorMessage } from '../../../lib/apiError'

type ReceptionProduct = { label: string; qty: number; unit: string }
type Reception = {
  id: string
  supplierName: string
  siteName: string
  tourDate: string
  requiredPhotos: number
  units: number
  unitType: string
  products: ReceptionProduct[] | null
}

type LineDraft = { accepted: string; refused: string; justification: string }

const outcomeLabels: Record<'full' | 'partial' | 'rejected', string> = {
  full: 'Acceptée',
  partial: 'Partielle',
  rejected: 'Refusée',
}
const receptionProducts = (r: Reception): ReceptionProduct[] => r.products?.length ? r.products : [{ label: 'Produit commandé', qty: r.units, unit: r.unitType }]

/**
 * Réceptions fournisseur à confirmer par le chef de chantier.
 * Affiche les livraisons directes fournisseur en attente et permet de
 * saisir quantités + photos (matériel + bon de livraison) puis de confirmer.
 */
export function SupplierReceptions({ handleAuth }: { handleAuth: (status: number) => boolean }) {
  const [receptions, setReceptions] = useState<Reception[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'full' | 'partial' | 'rejected'>('full')
  const [lines, setLines] = useState<Record<string, LineDraft>>({})
  const [photos, setPhotos] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploaded, setUploaded] = useState(new Set<File>())
  const [uploadedCount, setUploadedCount] = useState(0)
  const [receipt, setReceipt] = useState<{ receiptId: string; certificateUrl: string } | null>(null)

  const flash = (m: string) => {
    setMessage(m)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/dashboard/supplier-receptions')
      if (handleAuth(res.status)) return
      if (!res.ok) throw await apiErrorMessage(res, 'Chargement des réceptions impossible')
      const body = (await res.json()) as { receptions?: Reception[] }
      setReceptions(body.receptions ?? [])
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chargement des réceptions impossible')
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void load()
  }, [load])

  const open = (r: Reception) => {
    if (expanded === r.id || submitting) return
    setExpanded(r.id)
    setOutcome('full')
    setPhotos([])
    setUploaded(new Set<File>())
    setUploadedCount(0)
    setMessage(null)
    setReceipt(null)
    const init: Record<string, LineDraft> = {}
    for (const p of receptionProducts(r)) {
      init[`${p.label}|${p.unit}`] = { accepted: String(p.qty ?? 0), refused: '0', justification: '' }
    }
    setLines(init)
  }

  const setLine = (key: string, patch: Partial<LineDraft>, fallback: LineDraft) => {
    setLines((prev) => {
      const cur = prev[key] ?? fallback
      return { ...prev, [key]: { ...cur, ...patch } }
    })
  }

  const confirm = async (r: Reception) => {
    setSubmitting(true)
    setMessage(null)
    try {
      for (const f of photos) {
        if (uploaded.has(f)) continue
        const fd = new FormData()
        fd.append('photo', f)
        const res = await authFetch(`/dashboard/deliveries/${encodeURIComponent(r.id)}/chef-photo`, { method: 'POST', body: fd })
        if (handleAuth(res.status)) return
        if (!res.ok) throw await apiErrorMessage(res, `Enregistrement de la photo « ${f.name} » impossible`)
        const saved = await res.json() as { photosCount: number }
        setUploaded(current => new Set([...current, f]))
        setUploadedCount(saved.photosCount)
      }
      const payloadLines = receptionProducts(r).map((p) => {
        const key = `${p.label}|${p.unit}`
        const v = lines[key] ?? { accepted: String(p.qty ?? 0), refused: '0', justification: '' }
        return {
          productLabel: p.label,
          unit: p.unit,
          quantityAccepted: Number(v.accepted) || 0,
          quantityRefused: Number(v.refused) || 0,
          justification: v.justification,
        }
      })
      const res = await authFetch(`/dashboard/deliveries/${encodeURIComponent(r.id)}/chef-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, lines: payloadLines }),
      })
      if (handleAuth(res.status)) return
      if (!res.ok) throw await apiErrorMessage(res, 'La réception n’a pas pu être confirmée')
      const result = await res.json() as { receiptId: string; certificateUrl: string }
      setReceipt(result)
      flash(`Réception confirmée — bon ${result.receiptId}`)
      setExpanded(null)
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  if (!loading && receptions.length === 0 && !message) return null

  return (
    <div style={css.card} data-testid="mgr-supplier-receptions" aria-busy={submitting}>
      <h3 style={{ marginTop: 0 }}>🚚 Réceptions fournisseur</h3>
      {message && <div style={css.messageBox} role={receipt ? 'status' : 'alert'} data-testid="mgr-supplier-reception-message">{message}</div>}
      {receipt && <p><a href={receipt.certificateUrl} target="_blank" rel="noreferrer">Voir le bon de réception {receipt.receiptId}</a></p>}
      {loading && <p>Chargement des réceptions…</p>}
      {receptions.map((r) => (
        <div key={r.id} style={{ borderTop: '1px solid var(--border, #e2e8f0)', padding: '0.75rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <div>
              <strong>{r.supplierName}</strong>
              <div style={{ fontSize: 12, color: '#667' }}>
                {r.siteName} · {new Date(r.tourDate + 'T12:00:00').toLocaleDateString('fr-FR')}
              </div>
            </div>
            <button type="button" disabled={submitting || expanded === r.id} onClick={() => open(r)}>{expanded === r.id ? 'Réception ouverte' : 'Ouvrir la réception'}</button>
          </div>
          {expanded === r.id && (
            <div style={{ marginTop: '0.75rem' }}>
              <p>Renseignez les quantités, ajoutez les photos du matériel et du BL, puis cliquez sur « Valider la réception » pour enregistrer la réception et mettre à jour les matériaux du chantier.</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                {(['full', 'partial', 'rejected'] as const).map((o) => (
                  <label key={o} style={{ fontSize: 13 }}>
                    <input type="radio" name={`outcome-${r.id}`} checked={outcome === o} onChange={() => setOutcome(o)} /> {outcomeLabels[o]}
                  </label>
                ))}
              </div>
              {receptionProducts(r).map((p) => {
                const key = `${p.label}|${p.unit}`
                const v = lines[key] ?? { accepted: String(p.qty ?? 0), refused: '0', justification: '' }
                return (
                  <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ minWidth: 140, fontSize: 13 }}>
                      {p.label} ({p.qty} {p.unit})
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={v.accepted}
                      placeholder="Accepté"
                      style={{ width: 70, padding: '0.3rem' }}
                      onChange={(e) => setLine(key, { accepted: e.target.value }, { accepted: String(p.qty ?? 0), refused: '0', justification: '' })}
                    />
                    <input
                      type="number"
                      min={0}
                      value={v.refused}
                      placeholder="Refusé"
                      style={{ width: 70, padding: '0.3rem' }}
                      onChange={(e) => setLine(key, { refused: e.target.value }, { accepted: String(p.qty ?? 0), refused: '0', justification: '' })}
                    />
                    <input
                      type="text"
                      value={v.justification}
                      placeholder="Motif (si refus/partiel)"
                      style={{ flex: 1, minWidth: 120, padding: '0.3rem' }}
                      onChange={(e) => setLine(key, { justification: e.target.value }, { accepted: String(p.qty ?? 0), refused: '0', justification: '' })}
                    />
                  </div>
                )
              })}
              <div style={{ marginTop: 8 }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  disabled={submitting}
                  onChange={(e) => {
                    const selected = Array.from(e.target.files ?? [])
                    setPhotos(previous => [...previous, ...selected.filter(file => !previous.some(old => old.name === file.name && old.size === file.size && old.lastModified === file.lastModified))])
                    e.target.value = ''
                  }}
                />
                <button type="button" disabled={submitting} onClick={() => fileRef.current?.click()}>
                  📷 Ajouter les photos ({r.requiredPhotos} requises : matériel + BL)
                </button>
                {photos.length > 0 && <span style={{ fontSize: 12, marginLeft: 8 }}>{photos.length} photo(s)</span>}
                {uploadedCount > 0 && <span role="status" style={{ fontSize: 12, marginLeft: 8 }}>{uploadedCount} photo(s) enregistrée(s)</span>}
                <ul>{photos.map((file, index) => <li key={`${file.name}-${index}`}>{file.name} {uploaded.has(file) ? '— enregistrée' : <button type="button" disabled={submitting} onClick={() => setPhotos(current => current.filter(f => f !== file))}>Retirer de la sélection</button>}</li>)}</ul>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void confirm(r)}
                style={{ marginTop: 8, padding: '0.5rem 0.75rem' }}
              >
                {submitting ? 'Confirmation…' : '✅ Valider la réception'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
