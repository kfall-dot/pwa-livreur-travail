import { Router } from 'express'
import { authenticateManager } from '../middleware/auth.js'
import {
  listUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../services/notificationService.js'

export const notificationRouter = Router()

// Liste les notifications non lues du manager connecté
notificationRouter.get('/', authenticateManager, async (req, res) => {
  try {
    const managerId = req.manager!.id
    const notifications = await listUnreadNotifications(managerId)
    res.json({ notifications })
  } catch (err) {
    console.error('[notifications] erreur liste:', err)
    res.status(500).json({ error: 'Erreur lors du chargement des notifications' })
  }
})

// Marque une notification comme lue
notificationRouter.patch('/:id/read', authenticateManager, async (req, res) => {
  try {
    await markNotificationRead(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] erreur mark read:', err)
    res.status(500).json({ error: 'Erreur lors de la mise à jour' })
  }
})

// Marque toutes les notifications comme lues
notificationRouter.post('/read-all', authenticateManager, async (req, res) => {
  try {
    await markAllNotificationsRead(req.manager!.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[notifications] erreur mark all read:', err)
    res.status(500).json({ error: 'Erreur lors de la mise à jour' })
  }
})
