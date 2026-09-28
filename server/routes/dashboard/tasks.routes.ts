// Taches gestionnaire — liste + resolution
// Extrait de routes/dashboard.ts lors de son decoupage en modules — aucun
// changement de comportement (memes chemins, memes middlewares).
import { Router } from 'express'
import { canReplanManagerTask, getManagerTasks, getPendingManagerTasks, resolveManagerTask, syncOverdueDeliveryTasks } from '../../db/queries.js'
import { requireManager, type ManagerRequest } from '../../middleware/managerAuth.js'

export const tasksRoutes = Router()

// ── Manager tasks ─────────────────────────────────────────────────────────────

// Le tableau de bord interroge fréquemment cette route ; on limite le scan global
// des livraisons en retard (qui écrit aussi) à une fois par minute par process,
// et on ne laisse jamais son échec casser la liste des tâches.
let lastOverdueSyncAt = 0
const OVERDUE_SYNC_THROTTLE_MS = 60_000

tasksRoutes.get('/dashboard/manager-tasks', requireManager, async (req, res) => {
  try {
    const now = Date.now()
    if (now - lastOverdueSyncAt >= OVERDUE_SYNC_THROTTLE_MS) {
      lastOverdueSyncAt = now
      try {
        await syncOverdueDeliveryTasks()
      } catch (syncErr) {
        console.error('[dashboard] sync livraisons en retard échoué', syncErr)
      }
    }
    const { manager } = req as ManagerRequest
    const status = String(req.query.status ?? 'pending')
    const resolved = status === 'resolved'
    const tasks = resolved
      ? await getManagerTasks(manager.companyId, { resolved: true, limit: 100 })
      : await getPendingManagerTasks(manager.companyId)
    const enriched = await Promise.all(
      tasks.map(async (task) => ({
        ...task,
        canReplan: task.resolved ? false : await canReplanManagerTask(task),
      })),
    )
    res.json({ tasks: enriched, count: enriched.length, status: resolved ? 'resolved' : 'pending' })
  } catch (err) {
    console.error('[dashboard] tasks error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

tasksRoutes.post('/dashboard/manager-tasks/:id/resolve', requireManager, async (req, res) => {
  const { manager } = req as ManagerRequest
  try {
    const resolved = await resolveManagerTask(String(req.params.id), manager.companyId)
    if (!resolved) {
      res.status(404).json({ message: 'Tâche introuvable' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[dashboard] resolve task error', err)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})