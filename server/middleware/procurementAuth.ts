import type { Request, Response, NextFunction } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { managers, type ProcurementRole } from '../db/schema.js'
import { requireManager, type ManagerRequest } from './managerAuth.js'

export type ProcurementManagerRequest = ManagerRequest & {
  procurementRole: ProcurementRole | null
}

async function attachProcurementRole(req: Request): Promise<ProcurementRole | null> {
  const { manager } = req as ManagerRequest
  const [row] = await db
    .select({ procurementRole: managers.procurementRole })
    .from(managers)
    .where(eq(managers.id, manager.sub))
    .limit(1)
  return row?.procurementRole ?? null
}

/** Charge procurementRole sur la requête (requireManager doit être appliqué avant). */
export async function loadProcurementRole(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const procurementRole = await attachProcurementRole(req)
    ;(req as ProcurementManagerRequest).procurementRole = procurementRole
    next()
  } catch (err) {
    next(err)
  }
}

export function requireProcurementRole(...roles: ProcurementRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireManager(req, res, async () => {
      const procurementRole = await attachProcurementRole(req)
      const { manager } = req as ManagerRequest
      ;(req as ProcurementManagerRequest).procurementRole = procurementRole

      if (manager.managerRole === 'admin') {
        next()
        return
      }

      if (!procurementRole || !roles.includes(procurementRole)) {
        res.status(403).json({
          message: `Accès réservé aux rôles achats : ${roles.join(', ')}`,
        })
        return
      }

      next()
    })
  }
}

/** F01 : le DT pilote est admin — le gel / avenant ignore ce bypass. */
export function requireExactProcurementRole(...roles: ProcurementRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireManager(req, res, async () => {
      const procurementRole = await attachProcurementRole(req)
      ;(req as ProcurementManagerRequest).procurementRole = procurementRole

      if (!procurementRole || !roles.includes(procurementRole)) {
        res.status(403).json({
          message: `Accès réservé aux rôles : ${roles.join(', ')}`,
        })
        return
      }

      next()
    })
  }
}
