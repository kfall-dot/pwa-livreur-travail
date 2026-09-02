import { useEffect, useState } from 'react'
import { StatusBadge } from '../../../components/StatusBadge'
import type { DeliveryStatus } from '../../../types'
import { authFetch, authFetchBlob, openCertificateJson } from '../managerApi'
import {
  DeclarationTable,
  deliveredProductsDisplay,
  expectedProductsDisplay,
  deliveredQuantityEmptyLabel,
  parseDeclarationTableLines,
  ProductQuantityList,
} from '../productHelpers'
import { toast } from '../../../lib/toast'
import { css as sharedCss, EmptyHint, LoadingHint } from '../managerUi'

export interface DeliveryDetail {
  deliveryId: string
  deliveryName: string
  deliveryAddress: string
  instructions?: string | null
  status: string
  units: number
  unitType: string
  weightKg: string
  orderRef: string
  contactPhone?: string | null
  timeWindowStart?: string | null
  timeWindowEnd?: string | null
  requiredPhotos: number
  tourId: string
  tourDate: string
  driverId: string
  driverName: string
  driverPhone: string
  depotName: string
  declarationOutcome?: string | null
  declarationLines?: unknown
  declaredAt?: string | null
  photoCount: number
  receiptId?: string | null
  products?: { label: string; qty: number; unit: string }[] | null
  otpAssistTrail?: Array<{
    id: string
    action: string
    at: string
    managerEmail: string | null
    managerName: string | null
    summary: string
  }>
}

interface ManagerPhoto {
  photoId: string
  url: string
  dataUrl?: string
  paletteNumber?: string
}

const css = {
  btnGold: sharedCss.btnGold,
  btnGhost: sharedCss.btnGhost,
}

function DlRow({ dt, dd, style }: { dt: string; dd: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <dt style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>{dt}</dt>
      <dd style={{ margin: 0, fontSize: 13, color: '#111827' }}>{dd}</dd>
    </div>
  )
}

function PhotoGallery({ deliveryId, photoCount }: { deliveryId: string; photoCount: number }) {
  const [photos, setPhotos] = useState<ManagerPhoto[]>([])
  const [imageSrcs, setImageSrcs] = useState<string[]>([])
  const [blobsEnabled, setBlobsEnabled] = useState(true)
  const [hint, setHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const objectUrls: string[] = []
    setLoading(true)
    void authFetch(`/dashboard/deliveries/${deliveryId}/photos`)
      .then(async (r) => r.json() as Promise<{ photos: ManagerPhoto[]; blobsEnabled?: boolean; message?: string }>)
      .then(async (data) => {
        if (cancelled) return
        const list = data.photos ?? []
        setPhotos(list)
        setBlobsEnabled(data.blobsEnabled !== false)
        setHint(data.message ?? null)
        const srcs: string[] = []
        for (const p of list) {
          if (p.dataUrl) {
            srcs.push(p.dataUrl)
            continue
          }
          if (!p.url) {
            srcs.push('')
            continue
          }
          try {
            const blob = await authFetchBlob(p.url)
            const url = URL.createObjectURL(blob)
            objectUrls.push(url)
            srcs.push(url)
          } catch {
            srcs.push('')
          }
        }
        if (!cancelled) setImageSrcs(srcs)
      })
      .catch(() => {
        if (!cancelled) setHint('Impossible de charger les photos.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      objectUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [deliveryId])

  const visibleCount = imageSrcs.filter(Boolean).length

  return (
    <section className="manager-proof-panel" aria-label="Preuves photos">
      <h4 className="manager-proof-panel__title">Preuves — photos livreur</h4>
      {loading && <LoadingHint />}
      {!loading && !blobsEnabled && (
        <p style={{ fontSize: 13, color: '#b45309', background: '#fffbeb', padding: '8px 10px', borderRadius: 6, margin: 0 }}>
          {hint ?? `${photoCount} photo(s) comptabilisée(s) — fichiers non disponibles sans Netlify Blobs (netlify dev).`}
        </p>
      )}
      {!loading && blobsEnabled && visibleCount === 0 && photoCount > 0 && (
        <p style={{ fontSize: 13, color: '#b45309', background: '#fffbeb', padding: '8px 10px', borderRadius: 6, margin: 0 }}>
          {photoCount} photo(s) comptabilisée(s) mais le fichier n’a pas pu être récupéré. Demandez au livreur de reprendre une photo.
        </p>
      )}
      {!loading && photoCount === 0 && photos.length === 0 && (
        <EmptyHint>Aucune photo enregistrée.</EmptyHint>
      )}
      {!loading && visibleCount > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {photos.map((p, i) => imageSrcs[i] ? (
            <figure key={p.photoId} style={{ margin: 0 }}>
              <img
                src={imageSrcs[i]}
                alt={p.paletteNumber ? `Photo ${p.paletteNumber}` : `Photo ${i + 1}`}
                style={{ width: 112, height: 112, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
              />
              {p.paletteNumber && (
                <figcaption style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{p.paletteNumber}</figcaption>
              )}
            </figure>
          ) : null)}
        </div>
      )}
    </section>
  )
}

interface OtpStatusResponse {
  ok?: boolean
  hasOtp: boolean
  expiresAt: string | null
  expired: boolean
}

interface ResendOtpResponse {
  ok: true
  otpCode: string
  smsTo: string
  sent: boolean
  smsWarning?: string
  smsNotice?: string
  expiresAt: string
}

function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function OtpAssistPanel({
  detail,
  onConfirmed,
  canModify = false,
}: {
  detail: DeliveryDetail
  onConfirmed: () => void
  canModify?: boolean
}) {
  const [otpStatus, setOtpStatus] = useState<OtpStatusResponse | null>(null)
  const [lastResend, setLastResend] = useState<ResendOtpResponse | null>(null)
  const [resending, setResending] = useState(false)
  const [manualReason, setManualReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finished = detail.status === 'delivered' || detail.status === 'failed'
  const tourPast = detail.tourDate < todayIsoDate()
  const hasDeclaration = Boolean(detail.declarationOutcome)
  const photosOk = detail.photoCount >= detail.requiredPhotos
  const statusOk = detail.status === 'in_progress' || detail.status === 'otp_sent'
  const canAssist = !finished && !tourPast && statusOk && hasDeclaration && photosOk

  useEffect(() => {
    if (!canAssist) return
    let cancelled = false
    void authFetch(`/dashboard/deliveries/${detail.deliveryId}/otp-status`)
      .then(async (r) => {
        const data = (await r.json()) as OtpStatusResponse & { message?: string }
        if (!r.ok) throw new Error(data.message || 'Statut OTP indisponible')
        return data
      })
      .then((data) => {
        if (!cancelled) setOtpStatus(data)
      })
      .catch(() => {
        if (!cancelled) setOtpStatus(null)
      })
    return () => {
      cancelled = true
    }
  }, [canAssist, detail.deliveryId])

  const handleResend = async () => {
    setError(null)
    setResending(true)
    try {
      const res = await authFetch(`/dashboard/deliveries/${detail.deliveryId}/resend-otp`, { method: 'POST' })
      const data = (await res.json()) as ResendOtpResponse & { message?: string }
      if (!res.ok) throw new Error(data.message || 'Échec du renvoi SMS')
      setLastResend(data)
      setOtpStatus({ hasOtp: true, expiresAt: data.expiresAt, expired: false })
      toast.success(data.sent
        ? 'SMS renvoyé — le magasin peut aussi recevoir le code par téléphone.'
        : 'SMS non transmis — dictez le code au responsable magasin.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setResending(false)
    }
  }

  const handleManualConfirm = async () => {
    setError(null)
    const note = manualReason.trim()
    if (note.length < 15) {
      setError('Motif obligatoire (15 caractères min.) — ex. validation téléphonique magasin, SMS indisponible.')
      return
    }
    if (!window.confirm('Valider cette livraison sans OTP SMS ? Cette action est tracée et irréversible.')) return
    setConfirming(true)
    try {
      const res = await authFetch(`/dashboard/deliveries/${detail.deliveryId}/confirm-manual`, {
        method: 'POST',
        body: JSON.stringify({ reason: note }),
      })
      const data = (await res.json()) as { ok?: boolean; message?: string; receiptId?: string }
      if (!res.ok) throw new Error(data.message || 'Validation impossible')
      toast.success(data.receiptId
        ? `Livraison validée — certificat ${data.receiptId}.`
        : (data.message ?? 'Livraison validée.'))
      onConfirmed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setConfirming(false)
    }
  }

  if (finished) return null

  const blockers: string[] = []
  if (tourPast) blockers.push('tournée passée')
  if (!statusOk) blockers.push('le livreur doit avoir démarré la livraison (statut en cours ou OTP envoyé)')
  if (!hasDeclaration) blockers.push('déclaration produit manquante')
  if (!photosOk) blockers.push(`photos insuffisantes (${detail.photoCount}/${detail.requiredPhotos})`)

  return (
    <section
      data-testid="otp-assist-panel"
      className="manager-assist-panel"
      style={{
        marginBottom: '1.25rem',
        padding: '1rem',
        borderRadius: 10,
      }}
    >
      <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 700, color: 'var(--brand)' }}>
        Assistance OTP (gestionnaire)
      </h4>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--brand-deep)', lineHeight: 1.45 }}>
        Si le SMS OTP ne part pas ou n’arrive pas, renvoyez le code ou validez manuellement après accord téléphonique avec le magasin — le livreur n’a pas à attendre la réparation du système.
      </p>

      {blockers.length > 0 && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '8px 10px', borderRadius: 6 }}>
          Actions indisponibles : {blockers.join(' ; ')}.
        </p>
      )}

      {canAssist && otpStatus?.hasOtp && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#374151' }}>
          OTP actif
          {otpStatus.expiresAt && (
            <> — expire {otpStatus.expired ? '(expiré)' : `à ${new Date(otpStatus.expiresAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}</>
          )}
        </p>
      )}

      {lastResend && (
        <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fff', borderRadius: 8, border: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, color: '#374151' }}>
            Code pour le magasin ({lastResend.smsTo}) :
          </p>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: 6, fontFamily: 'monospace', color: 'var(--brand)' }} data-testid="mgr-otp-code">
            {lastResend.otpCode}
          </p>
          {lastResend.smsWarning && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#b45309' }}>{lastResend.smsWarning}</p>
          )}
          {lastResend.smsNotice && (
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#6b7280' }}>{lastResend.smsNotice}</p>
          )}
        </div>
      )}

      {error && (
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#b91c1c' }} role="alert">{error}</p>
      )}
      {canModify && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: canAssist ? 12 : 0 }}>
          <button
            type="button"
            data-testid="mgr-resend-otp"
            disabled={!canAssist || resending}
            onClick={() => void handleResend()}
            style={{ ...css.btnGold, opacity: !canAssist ? 0.5 : 1 }}
          >
            {resending ? 'Envoi…' : 'Renvoyer SMS / afficher code'}
          </button>
        </div>
      )}
      {canModify && canAssist && (
        <div style={{ borderTop: '1px solid #c5d9cc', paddingTop: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>
            Alternative — validation sans SMS
          </p>
          <textarea
            data-testid="mgr-manual-reason"
            value={manualReason}
            onChange={(e) => setManualReason(e.target.value)}
            placeholder="Motif obligatoire — ex. Responsable magasin a confirmé la réception par téléphone, SMS Textbee indisponible."
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: 8, fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            type="button"
            data-testid="mgr-confirm-manual"
            disabled={confirming || manualReason.trim().length < 15}
            onClick={() => void handleManualConfirm()}
            style={{ ...css.btnGhost, borderColor: '#f59e0b', color: '#b45309', opacity: manualReason.trim().length < 15 ? 0.5 : 1 }}
          >
            {confirming ? 'Validation…' : 'Valider la livraison sans OTP'}
          </button>
        </div>
      )}
    </section>
  )
}

export function DeliveryDetailModal({
  deliveryId,
  onClose,
  onEditTour,
  canModify = false,
}: {
  deliveryId: string
  onClose: () => void
  onEditTour: (tourId: string, tourDate: string) => void
  canModify?: boolean
}) {
  const [detail, setDetail] = useState<DeliveryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadDetail = () => {
    setLoading(true)
    setDetail(null)
    setLoadError(null)

    const fetchDetail = async (attempt: number): Promise<DeliveryDetail> => {
      const r = await authFetch(`/dashboard/deliveries/${deliveryId}`)
      const text = await r.text()
      let data: DeliveryDetail & { message?: string } = {} as DeliveryDetail & { message?: string }
      if (text.trim()) {
        try {
          data = JSON.parse(text) as DeliveryDetail & { message?: string }
        } catch {
          throw new Error(r.ok ? 'Réponse serveur invalide' : `Erreur serveur (${r.status})`)
        }
      }
      if (!r.ok) {
        if (r.status >= 500 && attempt < 1) {
          await new Promise((resolve) => { setTimeout(resolve, 1500) })
          return fetchDetail(attempt + 1)
        }
        throw new Error(data.message || 'Livraison introuvable')
      }
      return data
    }

    return fetchDetail(0)
      .then((d) => {
        setDetail({
          ...d,
          units: Number(d.units) || 0,
          unitType: d.unitType || 'palette',
          requiredPhotos: Number(d.requiredPhotos) || 0,
          photoCount: Number(d.photoCount) || 0,
          products: Array.isArray(d.products) ? d.products : null,
        })
      })
      .catch((err: unknown) => {
        setDetail(null)
        setLoadError(err instanceof Error ? err.message : 'Impossible de charger le détail de cette livraison.')
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    void loadDetail()
  }, [deliveryId])

  const outcomeLabel: Record<string, string> = {
    full: 'Livraison complète', partial: 'Livraison partielle', rejected: 'Refusée',
  }
  const outcomeColor: Record<string, string> = {
    full: '#16a34a', partial: '#f59e0b', rejected: '#dc2626',
  }

  const expectedProducts = detail
    ? expectedProductsDisplay(detail.products, detail.units, detail.unitType)
    : []
  const deliveredProducts = detail
    ? deliveredProductsDisplay(
        expectedProducts,
        detail.declarationLines,
        detail.status,
        detail.declarationOutcome,
      )
    : []
  const declarationTableLines = detail?.declarationLines
    ? parseDeclarationTableLines(detail.declarationLines)
    : []

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, padding: '1.75rem', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{loading ? 'Chargement…' : (detail?.deliveryName ?? '—')}</h2>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
        </div>

        {loading && <LoadingHint />}

        {!loading && !detail && (
          <div>
            <p style={{ color: '#b91c1c', margin: '0 0 12px' }}>
              {loadError ?? 'Impossible de charger le détail de cette livraison.'}
            </p>
            <button type="button" onClick={() => void loadDetail()} style={css.btnGhost}>
              Réessayer
            </button>
          </div>
        )}

        {!loading && detail && (
          <>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 32px', margin: 0, marginBottom: '1.5rem' }}>
              <DlRow dt="ID" dd={<span style={{ fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all' }}>{detail.deliveryId}</span>} />
              <DlRow dt="Commande" dd={detail.orderRef} />
              <DlRow dt="Livreur" dd={detail.driverName} />
              <DlRow dt="Statut" dd={<StatusBadge status={detail.status as DeliveryStatus} declarationOutcome={detail.declarationOutcome} />} />
              <DlRow
                dt="Quantité attendue"
                dd={<ProductQuantityList lines={expectedProducts} empty="—" />}
                style={{ gridColumn: '1 / -1' }}
              />
              <DlRow
                dt="Quantité livrée"
                dd={
                  detail.status === 'delivered' || detail.status === 'failed'
                    ? (
                      <div data-testid="mgr-delivered-quantity">
                        <ProductQuantityList
                          lines={deliveredProducts}
                          empty={deliveredQuantityEmptyLabel(detail.status, detail.declarationOutcome)}
                        />
                      </div>
                    )
                    : '—'
                }
                style={{ gridColumn: '1 / -1' }}
              />
              <DlRow dt="Validée le" dd={detail.declaredAt ? new Date(detail.declaredAt).toLocaleDateString('fr-FR') : '—'} />
              {detail.timeWindowStart && (
                <DlRow dt="Fenêtre horaire" dd={`${detail.timeWindowStart} – ${detail.timeWindowEnd ?? '?'}`} />
              )}
              {detail.contactPhone && (
                <DlRow dt="Tél. contact" dd={detail.contactPhone} />
              )}
              {detail.instructions && (
                <DlRow dt="Instructions" dd={detail.instructions} style={{ gridColumn: '1 / -1' }} />
              )}
              <DlRow dt="Dépôt" dd={detail.depotName} />
              <DlRow
                dt="Photos requises / prises"
                dd={`${Number(detail.requiredPhotos) || 0} / ${Number(detail.photoCount) || 0}`}
              />
            </dl>

            <PhotoGallery deliveryId={detail.deliveryId} photoCount={detail.photoCount} />

            {detail.receiptId && (
              <div className="manager-proof-panel" style={{ marginTop: '-0.35rem' }}>
                <h4 className="manager-proof-panel__title">Certificat de livraison</h4>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                  Preuve consultable — référence{' '}
                  <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text)' }}>{detail.receiptId}</span>
                </p>
                <button
                  type="button"
                  className="manager-proof-panel__cert"
                  aria-label={`Ouvrir le certificat ${detail.receiptId}`}
                  onClick={() =>
                    void openCertificateJson(detail.receiptId!).catch((e) =>
                      alert(e instanceof Error ? e.message : 'Erreur'),
                    )
                  }
                >
                  Ouvrir le certificat
                </button>
              </div>
            )}

            <DeclarationTable lines={declarationTableLines} />

            <OtpAssistPanel detail={detail} canModify={canModify} onConfirmed={() => void loadDetail()} />

            {Array.isArray(detail.otpAssistTrail) && detail.otpAssistTrail.length > 0 && (
              <section
                data-testid="otp-assist-trail"
                style={{
                  marginBottom: '1.25rem',
                  padding: '1rem',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--color-bg-secondary, #f8faf8)',
                }}
              >
                <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: 'var(--brand)' }}>
                  Trace assistance OTP
                </h4>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.otpAssistTrail.map((ev) => (
                    <li key={ev.id} style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text)' }}>
                      <time dateTime={ev.at} style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                        {new Date(ev.at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      {' — '}
                      {ev.summary}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
              {detail.declarationOutcome ? (
                <p style={{ margin: 0, fontSize: 14 }}>
                  <span style={{ fontWeight: 700, color: outcomeColor[detail.declarationOutcome] ?? '#374151' }}>
                    {outcomeLabel[detail.declarationOutcome] ?? detail.declarationOutcome}
                  </span>
                  {detail.declaredAt && (
                    <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 8 }}>
                      — le {new Date(detail.declaredAt).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                </p>
              ) : (
                <EmptyHint>Aucune déclaration produit enregistrée pour cette livraison.</EmptyHint>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {/* Modifier une tournée : réservé au Service Achats (SA). */}
              {canModify && (
                <button type="button" onClick={() => onEditTour(detail.tourId, detail.tourDate)} style={css.btnGold}>Modifier la tournée</button>
              )}
              <button type="button" onClick={onClose} style={css.btnGhost}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
