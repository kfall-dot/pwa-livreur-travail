import { useEffect, useState } from 'react'
import { authFetch, BASE } from '../managerApi'
import { apiErrorMessage } from '../../../lib/apiError'
import { CORRECTION_LABELS, type CorrectionKind } from '../../../../shared/procurementCorrectionPolicy'
import { fetchRequest } from './procurementApi'
import type { RequestDetailResponse } from './procurementTypes'
import { css, formatFcfa } from './procurementUi'

type CorrectionInfo = {
  canAsk: boolean; canEdit: boolean; canApprove: boolean; requiresPin: boolean;
  kinds: Array<{ kind: CorrectionKind; recommendedId: string | null; targets: Array<{ id: string; name: string; role: string }> }>;
  history: Array<{ id: string; kind: CorrectionKind; targetRole: string; reason: string; state: string; sourceVersion: number; createdAt: string; responseComment: string | null; targetName: string; requestedByName: string; documents: Array<{ id: string; reference: string }> }>;
}
type Line = { id: string; label: string; quantity: number; unit: string; unitPriceFcfa: number; supplierName: string; paymentMode: string; spendCategory: string; observation: string; attachmentBlobKey: string | null; attachmentFileName: string | null; attachmentContentType: string | null }

export function CorrectionWorkflowPanel({ detail, readOnly, onChanged }: { detail: RequestDetailResponse; readOnly: boolean; onChanged?: (detail: RequestDetailResponse) => void }) {
  const requestId = detail.request.id
  const [info, setInfo] = useState<CorrectionInfo | null>(null)
  const [kind, setKind] = useState<CorrectionKind>('documents')
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const path = `/procurement/requests/${encodeURIComponent(requestId)}/correction`
  useEffect(() => {
    let cancelled = false
    setInfo(null); setError(''); setPin(''); setReason(''); setComment('')
    setLines(detail.lines.map(l => ({ id: l.id, label: l.label, quantity: Number(l.quantity), unit: l.unit, unitPriceFcfa: Number(l.unitPriceFcfa ?? 0), supplierName: l.supplierName ?? '', paymentMode: l.paymentMode ?? '', spendCategory: l.spendCategory ?? 'autres_materiaux', observation: l.observation ?? '', attachmentBlobKey: l.attachmentBlobKey ?? null, attachmentFileName: l.attachmentFileName ?? null, attachmentContentType: l.attachmentContentType ?? null })))
    void authFetch(path).then(async res => {
      if (!res.ok) throw await apiErrorMessage(res, 'Chargement des corrections impossible')
      const next = await res.json() as CorrectionInfo
      if (!cancelled) { setInfo(next); const choice = next.kinds[0]; if (choice) { setKind(choice.kind); setTarget(choice.recommendedId ?? '') } }
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible') })
    return () => { cancelled = true }
    // Les saisies ne sont pas écrasées par la relecture périodique du statut financier.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, detail.request.version, detail.request.correctionTargetId, detail.request.correctionReviewRequired, path])
  const send = async (action: 'request' | 'resubmit' | 'approve') => {
    setBusy(true); setError('')
    try {
      const body = action === 'request' ? { kind, targetManagerId: target, reason, pin } : action === 'resubmit' ? { lines, comment, pin } : { pin }
      const res = await authFetch(`${path}/${action}`, { method: 'POST', body: JSON.stringify(body) })
      if (!res.ok) throw await apiErrorMessage(res, 'Traitement de la correction impossible')
      const next = await fetchRequest(requestId)
      onChanged?.(next)
      setPin(''); setReason(''); setComment('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Traitement impossible') }
    finally { setBusy(false) }
  }
  const upload = async (lineId: string, file: File) => {
    setBusy(true); setError('')
    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      let binary = ''; for (const value of buffer) binary += String.fromCharCode(value)
      const res = await authFetch(`${path}/attachments/${encodeURIComponent(lineId)}`, { method: 'POST', body: JSON.stringify({ data: btoa(binary), fileName: file.name, contentType: file.type }) })
      if (!res.ok) throw await apiErrorMessage(res, 'Pièce jointe refusée')
      const patch = await res.json() as Pick<Line, 'attachmentBlobKey' | 'attachmentFileName' | 'attachmentContentType'>
      setLines(current => current.map(l => l.id === lineId ? { ...l, ...patch } : l))
    } catch (err) { setError(err instanceof Error ? err.message : 'Pièce jointe refusée') }
    finally { setBusy(false) }
  }
  if (!info) return error ? <p role="alert">{error}</p> : null
  if (!info.canAsk && !info.canEdit && !info.canApprove && !info.history.length) return null
  const current = [...info.history].reverse().find(c => c.state === 'open' || c.state === 'head_review')
  const update = (id: string, patch: Partial<Line>) => setLines(current => current.map(l => l.id === id ? { ...l, ...patch } : l))
  const editable = info.canEdit && !readOnly
  const need = current?.kind === 'need'
  const commercial = current?.targetRole !== 'site_manager' && (need || current?.kind === 'commercial' || current?.kind === 'bc')
  return <section style={{ ...css.card, marginTop: 16 }} data-testid="mgr-eb-corrections">
    <h4>Corrections et retours de validation</h4>
    {current && <p role="status"><strong>{current.state === 'head_review' ? 'Correction en attente du chef SA' : `À corriger par ${current.targetName}`} :</strong> {current.reason}</p>}
    {(info.canAsk || info.canApprove || info.canEdit) && readOnly && <p style={css.meta}>Prenez en charge cette demande pour effectuer la correction ou la décision.</p>}
    {info.canAsk && <div style={css.actionRow}>
      <label>Nature du retour<select value={kind} style={css.input} onChange={e => { const choice = info.kinds.find(k => k.kind === e.target.value)!; setKind(choice.kind); setTarget(choice.recommendedId ?? '') }}>{info.kinds.map(k => <option key={k.kind} value={k.kind}>{CORRECTION_LABELS[k.kind]}</option>)}</select></label>
      <label>Destinataire<select value={target} style={css.input} onChange={e => setTarget(e.target.value)}><option value="">Choisir la personne responsable</option>{info.kinds.find(k => k.kind === kind)?.targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Motif obligatoire<textarea value={reason} style={css.input} onChange={e => setReason(e.target.value)} data-testid="mgr-correction-reason" /></label>
    </div>}
    {info.canEdit && <>
      <p style={css.meta}>Corrigez les lignes concernées. Les modifications de contenu relancent les validations ; les anciennes versions restent dans l’historique.</p>
      <div style={{ overflowX: 'auto' }}><table style={css.lineTable}><thead><tr><th>Désignation</th><th>Quantité / unité</th><th>Prix unitaire</th><th>Fournisseur / bénéficiaire</th><th>Paiement</th><th>Observation</th><th>Pièce</th></tr></thead>
        <tbody>{lines.map(l => <tr key={l.id}>
          <td><input value={l.label} disabled={!editable || !need} onChange={e => update(l.id, { label: e.target.value })} style={css.input} /></td>
          <td><input type="number" min="0" step="any" value={l.quantity} disabled={!editable || !need} onChange={e => update(l.id, { quantity: Number(e.target.value) })} style={css.input} /><input value={l.unit} disabled={!editable || !need} onChange={e => update(l.id, { unit: e.target.value })} style={css.input} /></td>
          <td><input type="number" min="0" step="any" value={l.unitPriceFcfa} disabled={!editable || !commercial} onChange={e => update(l.id, { unitPriceFcfa: Number(e.target.value) })} style={css.input} /></td>
          <td><input value={l.supplierName} disabled={!editable || !commercial} onChange={e => update(l.id, { supplierName: e.target.value })} style={css.input} list="correction-suppliers" /></td>
          <td><select value={l.paymentMode} disabled={!editable || !commercial} onChange={e => update(l.id, { paymentMode: e.target.value })} style={css.input}><option value="">Choisir</option>{['COMPTANT', 'CREDIT', 'CHEQUE', 'VIREMENT'].map(m => <option key={m}>{m}</option>)}</select></td>
          <td><input value={l.observation} disabled={!editable || current?.kind !== 'bc'} onChange={e => update(l.id, { observation: e.target.value })} style={css.input} /></td>
          <td>{l.attachmentFileName || 'Aucune pièce'}<input type="file" accept=".pdf,image/*,.xls,.xlsx" disabled={!editable || busy} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(l.id, file) }} /></td>
        </tr>)}</tbody></table></div>
      <datalist id="correction-suppliers">{detail.suppliers?.map(s => <option key={s.id} value={s.name} />)}</datalist>
      <p>Total corrigé : {formatFcfa(lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPriceFcfa), 0))} FCFA</p>
      <label>Corrections effectuées<textarea value={comment} onChange={e => setComment(e.target.value)} style={css.input} data-testid="mgr-correction-response" /></label>
    </>}
    {info.requiresPin && (info.canAsk || info.canEdit || info.canApprove) && <label>NIP de signature<input type="password" value={pin} autoComplete="one-time-code" data-lpignore="true" data-1p-ignore="true" onChange={e => setPin(e.target.value)} style={css.input} data-testid="mgr-correction-pin" /></label>}
    <div style={css.actionRow}>
      {info.canAsk && <button type="button" disabled={readOnly || busy || !reason.trim() || !target || info.requiresPin && !pin} onClick={() => void send('request')} style={css.btnOutline} data-testid="mgr-request-correction">Demander une correction</button>}
      {info.canEdit && <button type="button" disabled={!editable || busy || !comment.trim() || info.requiresPin && !pin} onClick={() => void send('resubmit')} style={css.btnGold} data-testid="mgr-resubmit-correction">Soumettre à nouveau</button>}
      {info.canApprove && <button type="button" disabled={readOnly || busy || !pin} onClick={() => void send('approve')} style={css.btnGold} data-testid="mgr-approve-correction">Valider la correction préparée</button>}
    </div>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {info.history.map(c => <details key={c.id} style={{ marginTop: 10 }}><summary>{new Date(c.createdAt).toLocaleDateString('fr-FR')} · {c.requestedByName} → {c.targetName} · version {c.sourceVersion}</summary>
      <p>{CORRECTION_LABELS[c.kind]} : {c.reason}</p>{c.responseComment && <p>Réponse : {c.responseComment}</p>}
      {c.documents.map(d => <p key={d.id}><a href={`${BASE}${path}/history/${encodeURIComponent(c.id)}/documents/${encodeURIComponent(d.id)}`} target="_blank" rel="noreferrer">Archive : {d.reference}</a></p>)}
    </details>)}
  </section>
}
