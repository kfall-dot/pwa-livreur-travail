import type { Request, Response } from 'express'
import { getStopWithDriverContext, type StopWithDriverContext } from '../db/queries.js'
import { paramId } from '../utils/params.js'
import type { AuthPayload } from './auth.js'

type AuthedRequest = Request & { user: AuthPayload }

export async function loadStopForDriver(
  req: Request,
  res: Response
): Promise<StopWithDriverContext | null> {
  const user = (req as AuthedRequest).user
  const stop = await getStopWithDriverContext(paramId(req))
  if (!stop) {
    res.status(404).json({ message: 'Livraison introuvable' })
    return null
  }
  if (stop.driverId !== user.sub) {
    res.status(403).json({ message: 'Accès non autorisé à cette livraison' })
    return null
  }
  return stop
}

export async function assertDriverOwnsDelivery(
  driverId: string,
  deliveryId: string,
  res: Response
): Promise<StopWithDriverContext | null> {
  const stop = await getStopWithDriverContext(deliveryId)
  if (!stop) {
    res.status(404).json({ message: 'Livraison introuvable' })
    return null
  }
  if (stop.driverId !== driverId) {
    res.status(403).json({ message: 'Accès non autorisé à cette livraison' })
    return null
  }
  return stop
}
