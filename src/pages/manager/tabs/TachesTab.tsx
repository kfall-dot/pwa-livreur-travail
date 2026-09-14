import { useCallback, useEffect, useState } from 'react'
import { authFetch } from '../managerApi'
import { type TaskPayload, type TaskRow } from '../managerTypes'
import { AlertBox, EmptyHint, LoadingHint } from '../managerUi'
import { formatPartialTaskLine } from '../productHelpers'

// ─── Tab: Tâches (extrait de ManagerDashboardPage) ───────────────────────────
export function TachesTab({
  handleAuth,
  onOpenDelivery,
  onOpenTour,
  // REPLAN DÉSACTIVÉ — bouton retiré ; prop conservée pour compatibilité.
  onReplanTour: _onReplanTour,
  onTasksChanged,
}: {
  handleAuth: (s: number) => boolean
  onOpenDelivery?: (deliveryId: string, tourDate?: string) => void
  onOpenTour?: (tourId: string, tourDate?: string) => void
  onReplanTour?: (tourId: string, deliveryId?: string) => void
  onTasksChanged?: () => void
}) {
  const [view, setView] = useState<'pending' | 'resolved'>('pending')
  const [filter, setFilter] = useState('all')
  const [pendingTasks, setPendingTasks] = useState<TaskRow[]>([])
  const [resolvedTasks, setResolvedTasks] = useState<TaskRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async (status: 'pending' | 'resolved') => {
    const query = status === 'resolved' ? '?status=resolved' : ''
    const res = await authFetch(`/dashboard/manager-tasks${query}`)
    if (handleAuth(res.status)) return
    const data = await res.json() as { tasks: TaskRow[]; count: number }
    if (status === 'resolved') setResolvedTasks(data.tasks ?? [])
    else setPendingTasks(data.tasks ?? [])
  }, [handleAuth])

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    await Promise.all([fetchStatus('pending'), fetchStatus('resolved')])
    setLoading(false)
  }, [fetchStatus])

  useEffect(() => { void fetchTasks() }, [fetchTasks])

  const resolve = async (id: string) => {
    setLoading(true)
    try {
      await authFetch(`/dashboard/manager-tasks/${id}/resolve`, { method: 'POST' })
      await fetchTasks()
      onTasksChanged?.()
    } catch {
      setError('Erreur lors de la clôture de la tâche')
    } finally {
      setLoading(false)
    }
  }

  const taskType = (t: TaskRow) => t.type === 'delivery_partial' ? 'partial_delivery' : t.type === 'delivery_failed' ? 'missed_delivery' : t.type

  const formatWhen = (value?: string | null) => {
    if (!value) return null
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
  }
  const resolvedLabel = (t: TaskRow) => formatWhen(t.resolvedAt)
  const createdLabel = (t: TaskRow) => formatWhen(t.createdAt) ?? ''

  const isToday = (value?: string | null) => {
    if (!value) return false
    const d = new Date(value)
    return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString()
  }

  const tasks = view === 'resolved' ? resolvedTasks : pendingTasks
  const visibleTasks = filter === 'all' ? tasks : tasks.filter((t) => taskType(t) === filter)

  const pendingCount = pendingTasks.length
  const resolvedToday = resolvedTasks.filter((t) => isToday(t.resolvedAt)).length
  const urgentCount = pendingTasks.filter((t) => taskType(t) === 'missed_delivery').length
  const resolveRate = pendingCount + resolvedToday > 0 ? Math.round((resolvedToday / (pendingCount + resolvedToday)) * 100) : 0

  const typeCounts = pendingTasks.reduce((acc, t) => {
    const k = taskType(t)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const KPIS = [
    { label: 'En attente', value: pendingCount, detail: `${urgentCount} urgence(s) à traiter`, icon: '🕐' },
    { label: "Traitées aujourd'hui", value: resolvedToday, detail: 'clôturées depuis minuit', icon: '✅' },
    { label: 'Taux de traitement', value: `${resolveRate}%`, detail: `${resolvedToday} traitées · ${pendingCount} restantes`, icon: '📈', bar: true },
    { label: 'Urgentes', value: urgentCount, detail: 'non effectuée(s)', icon: '⚠️', tone: '#dc2626' },
  ]

  const TASK_META: Record<string, { label: string; tagBg: string; tagColor: string; iconBg: string; iconColor: string; icon: string }> = {
    partial_delivery: { label: 'Livraison partielle', tagBg: '#fef3c7', tagColor: '#b45309', iconBg: '#fef3c7', iconColor: '#b45309', icon: '📦' },
    missed_delivery: { label: 'Non effectuée', tagBg: '#fee2e2', tagColor: '#b91c1c', iconBg: '#fee2e2', iconColor: '#dc2626', icon: '🚚' },
    reassign_tour: { label: 'Réaffectation', tagBg: '#dbeafe', tagColor: '#1e40af', iconBg: '#dbeafe', iconColor: '#2563eb', icon: '🔁' },
    otp_manager_assist: { label: 'OTP requise', tagBg: '#ede9fe', tagColor: '#6b21a8', iconBg: '#ede9fe', iconColor: '#7c3aed', icon: '🛡️' },
    delivery_cancelled: { label: 'Annulée', tagBg: '#f1f5f9', tagColor: '#475569', iconBg: '#e5e7eb', iconColor: '#4b5563', icon: '⛔' },
    delivery_confirmed: { label: 'Livraison confirmée', tagBg: '#dcfce7', tagColor: '#166534', iconBg: '#dcfce7', iconColor: '#16a34a', icon: '✅' },
  }
  const DEFAULT_META = { label: 'Tâche', tagBg: '#f1f5f9', tagColor: '#475569', iconBg: '#e5e7eb', iconColor: '#4b5563', icon: '📋' }
  const FILTER_CHIPS = [
    { key: 'all', label: 'Toutes' },
    { key: 'partial_delivery', label: 'Partielle' },
    { key: 'missed_delivery', label: 'Non effectuée' },
    { key: 'delivery_cancelled', label: 'Annulée' },
    { key: 'reassign_tour', label: 'Réaffectation' },
    { key: 'otp_manager_assist', label: 'OTP' },
  ]
  const FILTER_COLORS: Record<string, string> = {
    all: '#1e3a5f',
    partial_delivery: '#b45309',
    missed_delivery: '#dc2626',
    delivery_cancelled: '#6b7280',
    reassign_tour: '#2563eb',
    otp_manager_assist: '#7c3aed',
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 6 }}>
        TraceO / Gestion / <span style={{ color: '#1a1a2e', fontWeight: 600 }}>Tâches</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
        Tâches gestionnaire
        {pendingCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10.5,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.3,
              padding: '2px 9px',
              borderRadius: 99,
              background: '#fee2e2',
              color: '#b91c1c',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#b91c1c' }} />
            {pendingCount} en attente
          </span>
        )}
      </h1>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
        Actions générées automatiquement à partir des livraisons : partielle, non effectuée, annulée, réaffectation de tournée, OTP de confirmation.
      </div>

      {/* Rangée KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 18 }}>
        {KPIS.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12 }}>{k.icon}</span> {k.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: k.tone ?? '#1a1a2e' }}>{k.value}</div>
            {k.bar ? (
              <span style={{ display: 'block', height: 6, background: '#e5e7eb', borderRadius: 99, marginTop: 10 }}>
                <span style={{ display: 'block', height: 6, width: `${resolveRate}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)', borderRadius: 99 }} />
              </span>
            ) : (
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{k.detail}</div>
            )}
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div style={{ display: 'inline-flex', gap: 6, marginTop: 20, background: '#eef1f5', borderRadius: 10, padding: 4 }}>
        <button
          type="button"
          data-testid="mgr-tasks-pending"
          onClick={() => { setView('pending'); setFilter('all') }}
          style={{
            border: 0,
            background: view === 'pending' ? '#1e3a5f' : 'transparent',
            padding: '8px 18px',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            color: view === 'pending' ? '#fff' : '#4b5563',
            fontFamily: 'inherit',
          }}
        >
          En attente
        </button>
        <button
          type="button"
          data-testid="mgr-tasks-resolved"
          onClick={() => { setView('resolved'); setFilter('all') }}
          style={{
            border: 0,
            background: view === 'resolved' ? '#1e3a5f' : 'transparent',
            padding: '8px 18px',
            borderRadius: 7,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            color: view === 'resolved' ? '#fff' : '#4b5563',
            fontFamily: 'inherit',
          }}
        >
          Traitées
        </button>
      </div>

      {/* Filtres par type (vue en attente uniquement) */}
      {view === 'pending' && pendingCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {FILTER_CHIPS.map((chip) => {
            const count = chip.key === 'all' ? pendingCount : (typeCounts[chip.key] ?? 0)
            const active = filter === chip.key
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setFilter(chip.key)}
                style={{
                  border: `1px solid ${active ? '#1e3a5f' : '#e5e7eb'}`,
                  background: active ? '#eef6ff' : '#fff',
                  borderRadius: 99,
                  padding: '5px 12px',
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  color: active ? '#1e3a5f' : '#4b5563',
                  fontFamily: 'inherit',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {chip.label}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                    height: 18,
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#fff',
                    borderRadius: 99,
                    background: active ? '#1e3a5f' : (FILTER_COLORS[chip.key] ?? '#1e3a5f'),
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {error && <AlertBox>{error}</AlertBox>}
      {loading && visibleTasks.length === 0 && <LoadingHint />}
      {!loading && visibleTasks.length === 0 && (
        <EmptyHint>
          {view === 'pending' ? 'Aucune tâche en attente.' : 'Aucune tâche traitée pour le moment.'}
        </EmptyHint>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        {visibleTasks.map((t) => {
          const type = taskType(t)
          const meta = TASK_META[type] ?? DEFAULT_META
          const payload = (t.payload ?? {}) as TaskPayload
          const deliveryId = payload.deliveryId ?? t.deliveryId ?? undefined
          const tourDate = payload.tourDate ?? t.deliveryDate
          const refusedPreview =
            type === 'partial_delivery' && payload.refusedLines?.length
              ? payload.refusedLines.map((l) => `• ${formatPartialTaskLine(l)}`).join('\n')
              : null
          const resAt = resolvedLabel(t)

          const showDeliveryBtn =
            (type === 'partial_delivery' ||
              type === 'missed_delivery' ||
              type === 'delivery_confirmed' ||
              type === 'delivery_cancelled' ||
              type === 'otp_manager_assist') &&
            deliveryId &&
            onOpenDelivery

          const showTourBtn =
            (type === 'reassign_tour' || type === 'missed_delivery' || type === 'delivery_cancelled') &&
            t.relatedTourId &&
            onOpenTour

          return (
            <div
              key={t.id}
              data-testid={`mgr-task-${t.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr auto',
                gap: 16,
                alignItems: 'start',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderLeft: '4px solid transparent',
                borderRadius: 12,
                padding: '16px 18px',
                boxShadow: '0 1px 3px rgba(0,0,0,.04)',
              }}
            >
              {/* Icône du type */}
              <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: meta.iconBg, color: meta.iconColor }}>
                {meta.icon}
              </div>
              {/* Corps */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 0.3,
                      padding: '2px 9px',
                      borderRadius: 99,
                      background: meta.tagBg,
                      color: meta.tagColor,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: 99, background: meta.tagColor }} />
                    {view === 'resolved' ? 'Traitée' : meta.label}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>{t.title || t.description}</span>
                </div>
                {t.description && t.title && (
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>{t.description}</div>
                )}
                {refusedPreview && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 12px', fontSize: 12, color: '#92400e', fontWeight: 500, marginTop: 8 }}>
                    ⚠️ Lignes refusées
                    <span style={{ whiteSpace: 'pre-wrap' }}>{refusedPreview}</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                  {t.driverName && <span style={{ fontWeight: 600, color: '#374151' }}>🚚 {t.driverName}</span>}
                  {(t.deliveryName ?? t.relatedTourId) && (
                    <span>📍 {t.deliveryName ?? `Tournée ${t.relatedTourId}`}</span>
                  )}
                  <span>🕐 {createdLabel(t)}</span>
                </div>
              </div>
              {/* Actions / date de traitement */}
              <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                {view === 'resolved' ? (
                  resAt && <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>✓ Traitée le {resAt}</div>
                ) : (
                  <>
                    {showDeliveryBtn && (
                      <button
                        type="button"
                        onClick={() => onOpenDelivery!(deliveryId!, tourDate)}
                        style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        👁️ Voir la livraison
                      </button>
                    )}
                    {showTourBtn && (
                      <button
                        type="button"
                        onClick={() => onOpenTour!(t.relatedTourId!, tourDate)}
                        style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        🗺️ Ouvrir la tournée
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void resolve(t.id)}
                      style={{ border: '1px dashed #d1d5db', background: 'transparent', color: '#6b7280', padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      ✓ Marquer traitée
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
