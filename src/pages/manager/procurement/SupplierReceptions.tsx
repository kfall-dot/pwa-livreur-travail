import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../managerApi'
import { css } from './procurementUi'

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

  const flash = (m: string) => {
    setMessage(m)
    window.setTimeout(() => setMessage(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/dashboard/supplier-receptions')
      if (handleAuth(res.status)) return
      if (res.ok) {
        const body = (await res.json()) as { receptions?: Reception[] }
        setReceptions(body.receptions ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  useEffect(() => {
    void load()
  }, [load])

  const open = (r: Reception) => {
    setExpanded(r.id)
    setOutcome('full')
    setPhotos([])
    const init: Record<string, LineDraft> = {}
    for (const p of r.products ?? []) {
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
    try {
      for (const f of photos) {
        const fd = new FormData()
        fd.append('photo', f)
        const res = await authFetch(`/dashboard/deliveries/${encodeURIComponent(r.id)}/chef-photo`, { method: 'POST', body: fd })
        if (handleAuth(res.status)) return
        if (!res.ok) {
          const b = (await res.json()) as { message?: string }
          throw new Error(b.message ?? 'Photo refusée')
        }
      }
      const payloadLines = (r.products ?? []).map((p) => {
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
      const b = (await res.json()) as { message?: string }
      if (!res.ok) {
        flash(b.message ?? 'Erreur')
        return
      }
      flash('Réception confirmée ✅')
      setExpanded(null)
      await load()
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || receptions.length === 0) return null

  return (
    <div style={css.card}>
      <h3 style={{ marginTop: 0 }}>🚚 Réceptions fournisseur</h3>
      {message && <div style={css.messageBox}>{message}</div>}
      {receptions.map((r) => (
        <div key={r.id} style={{ borderTop: '1px solid var(--border, #e2e8f0)', padding: '0.75rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <div>
              <strong>{r.supplierName}</strong>
              <div style={{ fontSize: 12, color: '#667' }}>
                {r.siteName} · {new Date(r.tourDate + 'T12:00:00').toLocaleDateString('fr-FR')}
              </div>
            </div>
            <button type="button" onClick={() => open(r)}>Confirmer la réception</button>
          </div>
          {expanded === r.id && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                {(['full', 'partial', 'rejected'] as const).map((o) => (
                  <label key={o} style={{ fontSize: 13 }}>
                    <input type="radio" name={`outcome-${r.id}`} checked={outcome === o} onChange={() => setOutcome(o)} /> {outcomeLabels[o]}
                  </label>
                ))}
              </div>
              {(r.products ?? []).map((p) => {
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
                  onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
                />
                <button type="button" onClick={() => fileRef.current?.click()}>
                  📷 Ajouter les photos ({r.requiredPhotos} requises : matériel + BL)
                </button>
                {photos.length > 0 && <span style={{ fontSize: 12, marginLeft: 8 }}>{photos.length} photo(s)</span>}
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
