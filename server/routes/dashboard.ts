// Router du tableau de bord gestionnaire — desormais une simple composition des
// modules de server/routes/dashboard/ (l'ex-monolithe de ~2 400 lignes a ete
// decoupe par theme ; aucun changement de comportement : memes chemins, memes
// middlewares, ordre de montage d'origine). Montage inchange cote app.ts :
// app.use(prefix, dashboardRouter).
import { Router } from 'express'
import { authRoutes } from './dashboard/auth.routes.js'
import { toursRoutes } from './dashboard/tours.routes.js'
import { deliveriesRoutes } from './dashboard/deliveries.routes.js'
import { driversRoutes } from './dashboard/drivers.routes.js'
import { managersRoutes } from './dashboard/managers.routes.js'
import { supermarketsRoutes } from './dashboard/supermarkets.routes.js'
import { suppliersRoutes } from './dashboard/suppliers.routes.js'
import { catalogRoutes } from './dashboard/catalog.routes.js'
import { tasksRoutes } from './dashboard/tasks.routes.js'

export const dashboardRouter = Router()

dashboardRouter.use(authRoutes)
dashboardRouter.use(toursRoutes)
dashboardRouter.use(deliveriesRoutes)
dashboardRouter.use(driversRoutes)
dashboardRouter.use(managersRoutes)
dashboardRouter.use(supermarketsRoutes)
dashboardRouter.use(suppliersRoutes)
dashboardRouter.use(catalogRoutes)
dashboardRouter.use(tasksRoutes)
