import { Router } from 'express'
import { requireManager } from '../middleware/managerAuth.js'
import type { ManagerRequest } from '../middleware/managerAuth.js'
import {
  listUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationService.js'

export const notificationRouter = Router()

// Liste les notifications non lues du manager connecté
notificationRouter.get('/', requireManager, async (req, res) => {
  try {
    const managerId = (req as ManagerRequest).manager.sub
    const notifications = await listUnreadNotifications(managerId)
    res.json({ notifications })
  } catch (err) {
    console.error('[notifications] erreur liste:', err)
    res.status(500).json({ error: 'Erreur lors du chargement des notifications' })
  }
})

// Marque une notification comme lue
notificationRouter.patch('/:id/read', requireManager, async (req, res) => {
  try {
    await markNotificationRead(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] erreur mark read:', err)
    res.status(500).json({ error: 'Erreur lors de la mise à jour' })
  }
})

// Marque toutes les notifications comme lues
notificationRouter.post('/read-all', requireManager, async (req, res) => {
  try {
    const managerId = (req as ManagerRequest).manager.sub
    await markAllNotificationsRead(managerId)
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] erreur mark all read:', err)
    res.status(500).json({ error: 'Erreur lors de la mise à jour' })
  }
})
