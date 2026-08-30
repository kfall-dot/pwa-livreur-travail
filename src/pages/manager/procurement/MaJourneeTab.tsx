import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '../managerApi'
import { css } from './procurementUi'

type SiteOption = { id: string; name: string; address: string }
type TaskRow = {
  id: string
  label: string
  done: boolean
  usages: { id: string; productLabel: string; unit: string; quantity: number; sourceSiteId: string | null }[]
}
type PhotoRow = { id: string; photoId: string; url: string }
type ReportPayload = {
  report: {
    id: string
    siteId: string
    reportDate: string
    status: 'draft' | 'submitted'
    globalProgressPct: string | null
    comment: string | null
    submittedAt: string | null
    submissions: { at: string; byManagerId: string }[]
  }
  tasks: TaskRow[]
  photos?: PhotoRow[]
}

/** Page « Ma journée » — chef de chantier (mobile-first). */
export function MaJourneeTab({ handleAuth }: { handleAuth: (status: number) => boolean }) {
  const [sites, setSites] = useState<SiteOption[]>([])
  const [siteId, setSiteId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [taskLabel, setTaskLabel] = useState('')
  const [usage, setUsage] = useState({ taskId: '', productLabel: '', unit: '', quantity: '', sourceSiteId: '' })
  const [progress, setProgress] = useState('')
  const [comment, setComment] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const loadSites = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch('/daily-reports/my-sites')
      if (handleAuth(res.status)) return
      const body = (await res.json()) as { sites?: SiteOption[] }
      setSites(body.sites ?? [])
      setSiteId((prev) => prev ?? body.sites?.[0]?.id ?? null)
    } finally {
      setLoading(false)
    }
  }, [handleAuth])

  const loadReport = useCallback(async () => {
    if (!siteId) return
    setLoading(true)
    try {
      const res = await authFetch('/daily-reports/today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      })
      if (handleAuth(res.status)) return
      const body = (await res.json()) as ReportPayload
      setDetail(body)
      setProgress(body.report.globalProgressPct != null ? String(Number(body.report.globalProgressPct)) : '')
      setComment(body.report.comment ?? '')
      const photoRes = await authFetch(`/daily-reports/reports/${body.report.id}/photos`)
      if (photoRes.ok && !handleAuth(photoRes.status)) {
        const photoBody = (await photoRes.json()) as { photos?: PhotoRow[] }
        setDetail((prev) => (prev ? { ...prev, photos: photoBody.photos ?? [] } : prev))
      }
    } finally {
      setLoading(false)
    }
  }, [siteId, handleAuth])

  useEffect(() => {
    void loadSites()
  }, [loadSites])
  useEffect(() => {
    if (siteId) void loadReport()
  }, [siteId, loadReport])

  const reportId = detail?.report.id ?? null
  const isDraft = detail?.report.status === 'draft'

  const flash = (m: string) => {
    setMessage(m)
    window.setTimeout(() => setMessage(null), 4000)
  }

  const addTask = async () => {
    if (!reportId || !taskLabel.trim()) return
    const res = await authFetch(`/daily-reports/reports/${reportId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: taskLabel }),
    })
    if (handleAuth(res.status)) return
    setTaskLabel('')
    await loadReport()
  }

  const toggleTask = async (taskId: string, done: boolean) => {
    if (!isDraft) return
    await authFetch(`/daily-reports/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    })
    await loadReport()
  }

  const addUsage = async () => {
    if (!reportId || !usage.taskId || !usage.productLabel.trim() || !usage.unit.trim() || !Number(usage.quantity)) {
      flash('Tâche, produit, unité et quantité requis')
      return
    }
    const res = await authFetch(`/daily-reports/reports/${reportId}/usages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: usage.taskId,
        productLabel: usage.productLabel,
        unit: usage.unit,
        quantity: Number(usage.quantity),
        sourceSiteId: usage.sourceSiteId || null,
      }),
    })
    if (handleAuth(res.status)) return
    if (!res.ok) {
      const body = (await res.json()) as { message?: string }
      flash(body.message ?? 'Erreur')
      return
    }
    setUsage({ taskId: '', productLabel: '', unit: '', quantity: '', sourceSiteId: '' })
    await loadReport()
    flash('Consommation enregistrée')
  }

  const deleteUsage = async (usageId: string) => {
    if (!isDraft) return
    await authFetch(`/daily-reports/usages/${usageId}`, { method: 'DELETE' })
    await loadReport()
  }

  const saveProgress = async () => {
    if (!reportId) return
    const res = await authFetch(`/daily-reports/reports/${reportId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ globalProgressPct: Number(progress || 0), comment }),
    })
    if (handleAuth(res.status)) return
    flash(res.ok ? 'Avancement enregistré' : "Erreur d'enregistrement")
  }

  const submit = async () => {
    if (!reportId) return
    const res = await authFetch(`/daily-reports/reports/${reportId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (handleAuth(res.status)) return
    if (res.ok) flash('Dossier soumis ✅')
    await loadReport()
  }

  const reopen = async () => {
    if (!reportId) return
    await authFetch(`/daily-reports/reports/${reportId}/reopen`, { method: 'POST' })
    await loadReport()
    flash('Dossier rouvert — vous pouvez compléter')
  }

  const uploadPhoto = async (file: File) => {
    if (!reportId) return
    const fd = new FormData()
    fd.append('photo', file)
    const res = await authFetch(`/daily-reports/reports/${reportId}/photos`, { method: 'POST', body: fd })
    if (handleAuth(res.status)) return
    if (res.ok) await loadReport()
    else flash('Photo non enregistrée')
  }

  if (loading && !detail) return <p style={css.card}>Chargement…</p>

  if (sites.length === 0) {
    return (
      <div style={css.card}>
        <p>Aucun chantier ne vous est assigné. Contactez votre administrateur.</p>
      </div>
    )
  }

  const statusBadge = !detail ? null : detail.report.status === 'submitted' ? '🟢 Soumis' : '🟡 En cours'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 720 }}>
      {message && <div style={css.messageBox}>{message}</div>}

      <div style={css.card}>
        <h3 style={{ marginTop: 0 }}>📁 Ma journée</h3>
        {sites.length > 1 && (
          <select
            value={siteId ?? ''}
            onChange={(e) => setSiteId(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        {detail && (
          <p style={{ margin: 0, fontSize: 13 }}>
            Chantier <strong>{sites.find((s) => s.id === detail.report.siteId)?.name}</strong> —{' '}
            {new Date(detail.report.reportDate).toLocaleDateString('fr-FR')} · {statusBadge}
            {detail.report.submissions.length > 0 && ` · ${detail.report.submissions.length} soumission(s)`}
          </p>
        )}
      </div>

      {detail && (
        <>
          <div style={css.card}>
            <h4 style={{ marginTop: 0 }}>📋 Tâches du jour</h4>
            {detail.tasks.length === 0 && <p style={{ fontSize: 13 }}>Aucune tâche inscrite.</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem' }}>
              {detail.tasks.map((t) => (
                <li
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border)' }}
                >
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={!isDraft}
                    onChange={(e) => void toggleTask(t.id, e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1 }}>
                    <span style={t.done ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>{t.label}</span>
                    {t.usages.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--muted, #667)' }}>
                        {t.usages.map((u) => (
                          <div key={u.id}>
                            🔩 {u.quantity} {u.unit} — {u.productLabel}
                            {u.sourceSiteId && ` (apport externe)`}
                            {isDraft && (
                              <button
                                type="button"
                                onClick={() => void deleteUsage(u.id)}
                                aria-label="Supprimer la consommation"
                                style={{ marginLeft: 6, fontSize: 11, padding: '0 6px' }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {isDraft && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  value={taskLabel}
                  onChange={(e) => setTaskLabel(e.target.value)}
                  placeholder="Nouvelle tâche…"
                  onKeyDown={(e) => e.key === 'Enter' && void addTask()}
                  style={{ flex: 1, padding: '0.5rem' }}
                />
                <button type="button" onClick={() => void addTask()}>Ajouter</button>
              </div>
            )}
          </div>

          <div style={css.card}>
            <h4 style={{ marginTop: 0 }}>🔩 Matériau consommé</h4>
            {isDraft ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <select
                  value={usage.taskId}
                  onChange={(e) => setUsage((u) => ({ ...u, taskId: e.target.value }))}
                  style={{ padding: '0.5rem' }}
                >
                  <option value="">Tâche concernée…</option>
                  {detail.tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    value={usage.productLabel}
                    onChange={(e) => setUsage((u) => ({ ...u, productLabel: e.target.value }))}
                    placeholder="Produit (ex. Ciment 50kg)"
                    style={{ flex: 2, padding: '0.5rem' }}
                  />
                  <input
                    value={usage.quantity}
                    onChange={(e) => setUsage((u) => ({ ...u, quantity: e.target.value }))}
                    placeholder="Qté"
                    inputMode="decimal"
                    style={{ flex: 1, padding: '0.5rem' }}
                  />
                  <input
                    value={usage.unit}
                    onChange={(e) => setUsage((u) => ({ ...u, unit: e.target.value }))}
                    placeholder="Unité"
                    style={{ flex: 1, padding: '0.5rem' }}
                  />
                </div>
                <select
                  value={usage.sourceSiteId}
                  onChange={(e) => setUsage((u) => ({ ...u, sourceSiteId: e.target.value }))}
                  style={{ padding: '0.5rem' }}
                >
                  <option value="">Provenance : stock de ce chantier</option>
                  {sites
                    .filter((s) => s.id !== detail.report.siteId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>Venant de : {s.name}</option>
                    ))}
                </select>
                <button type="button" onClick={() => void addUsage()}>+ Enregistrer la consommation</button>
              </div>
            ) : (
              <p style={{ fontSize: 13 }}>Dossier soumis — ré-ouvrez-le pour compléter.</p>
            )}
          </div>

          <div style={css.card}>
            <h4 style={{ marginTop: 0 }}>📈 Avancement</h4>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                placeholder="% avancement"
                inputMode="decimal"
                style={{ flex: 1, padding: '0.5rem' }}
              />
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Commentaire"
                style={{ flex: 2, padding: '0.5rem' }}
              />
              {isDraft && <button type="button" onClick={() => void saveProgress()}>OK</button>}
            </div>
            <h4>📷 Photos du jour</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {(detail.photos ?? []).map((p) => (
                <img key={p.id} src={p.url} alt="Photo chantier" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
              ))}
            </div>
            {isDraft && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => e.target.files?.[0] && void uploadPhoto(e.target.files[0])}
                />
                <button type="button" onClick={() => fileRef.current?.click()}>📷 Ajouter une photo</button>
              </>
            )}
          </div>

          <div style={css.card}>
            {isDraft ? (
              <button
                type="button"
                onClick={() => void submit()}
                style={{ width: '100%', padding: '0.75rem', fontSize: 16 }}
              >
                ✅ Soumettre le dossier
              </button>
            ) : (
              <button type="button" onClick={() => void reopen()} style={{ width: '100%', padding: '0.75rem' }}>
                🔓 Rouvrir pour complément
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
