import type { Request, Response, NextFunction } from 'express'
import { resolveDatabaseUrl } from '../db/index.js'
import { Pool } from '@neondatabase/serverless'
import { getDraftById, getPurchaseRequestById } from '../db/procurementQueries.js'
import { getManagerById } from '../db/queries.js'
import type { ManagerRequest } from './managerAuth.js'
import { canTakeProcurementEditLock, PROCUREMENT_LOCK_TTL_SECONDS } from '../../shared/procurementEditLock.js'

type Kind = 'drafts' | 'requests'
type Lease = { manager_id: string; owner_name: string; expires_at: Date }
const READ_LEASE = `SELECT l.manager_id, m.name AS owner_name, l.expires_at
  FROM procurement_edit_locks l JOIN managers m ON m.id=l.manager_id
  WHERE l.company_id=$1 AND l.document_kind=$2 AND l.document_id=$3 AND l.expires_at > now()`
type DocumentState = { status: string; saReviewerId?: string | null; purchaseRequestId?: string | null }
let lockPool: Pool | undefined
function getLockPool() {
  if (!lockPool) {
    lockPool = new Pool({ connectionString: resolveDatabaseUrl(), max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 })
    lockPool.on('error', (err: Error) => console.error('[edit-lock] connexion de verrou interrompue', err.message))
  }
  return lockPool
}

export function procurementEditLock(kind: Kind, idFromRequest = (req: Request) => String(req.params.id), dependencies: {
  pool?: Pool
  loadDocument?: (companyId: string, id: string) => Promise<DocumentState | null>
} = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const documentId = idFromRequest(req)
    if (!documentId || (kind === 'drafts' && ['blank', 'from-paste'].includes(documentId))) return next()
    const path = req.path
    const lockOperation = path === '/lock' || path === '/lock/renew'
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    if (!lockOperation && !mutation) return next()
    const { manager } = req as ManagerRequest
    const document: DocumentState | null = dependencies.loadDocument ? await dependencies.loadDocument(manager.companyId, documentId) : kind === 'drafts'
      ? await getDraftById(manager.companyId, documentId)
      : await getPurchaseRequestById(manager.companyId, documentId)
    if (!document) { res.status(404).json({ message: 'Document introuvable' }); return }
    const actor = await getManagerById(manager.sub)
    if (!actor || actor.companyId !== manager.companyId) { res.status(403).json({ message: 'Compte introuvable' }); return }
    const canClaim = canTakeProcurementEditLock({ kind, status: document.status, role: actor.procurementRole, managerId: actor.id,
      reviewerId: 'saReviewerId' in document ? document.saReviewerId : null, supervisorId: actor.saSupervisorId,
      linkedRequestId: 'purchaseRequestId' in document ? document.purchaseRequestId : null })
    const view = (current: Lease | undefined) => ({ canClaim, ownedByMe: current?.manager_id === actor.id, ownerName: current?.owner_name ?? null, expiresAt: current?.expires_at ?? null })
    if (lockOperation && req.method === 'GET') {
      const leases = await (dependencies.pool ?? getLockPool()).query<Lease>(READ_LEASE, [manager.companyId, kind, documentId])
      res.json(view(leases.rows[0]))
      return
    }
    const client = await (dependencies.pool ?? getLockPool()).connect()
    let finished = false
    const finish = async (releaseLease: boolean) => {
      if (finished) return
      finished = true
      try {
        if (releaseLease) await client.query('DELETE FROM procurement_edit_locks WHERE company_id=$1 AND document_kind=$2 AND document_id=$3 AND manager_id=$4', [manager.companyId, kind, documentId, actor.id])
        await client.query('COMMIT')
      } catch {
        await client.query('ROLLBACK').catch(() => {})
      } finally { client.release() }
    }
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '5min'")
      // Le verrou transactionnel protège également les opérations déjà en cours,
      // même si le bail expire ou si le navigateur se ferme pendant un envoi.
      const mutex = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired', [`${manager.companyId}:${kind}:${documentId}`])
      if (!mutex.rows[0]?.acquired) {
        res.status(423).json({ message: 'Une modification de cette demande est en cours. Réessayez dans quelques instants.' })
        await finish(false)
        return
      }
      const leases = await client.query<Lease>(READ_LEASE, [manager.companyId, kind, documentId])
      const lease = leases.rows[0]
      const ownedByMe = lease?.manager_id === actor.id
      if (lockOperation && req.method === 'DELETE') {
        if (lease && !ownedByMe) { res.status(423).json({ message: `Demande prise en charge par ${lease.owner_name}.` }); await finish(false); return }
        await finish(true); res.json(view(undefined)); return
      }
      if (!canClaim) { res.status(403).json({ message: 'Cette étape est en lecture seule pour votre profil.' }); await finish(false); return }
      if (lease && !ownedByMe) { res.status(423).json({ message: `Demande prise en charge par ${lease.owner_name}. Vous pouvez la consulter en lecture seule.`, ...view(lease) }); await finish(false); return }
      if (path === '/lock/renew' && !ownedByMe) { res.status(409).json({ message: 'Votre prise en charge a expiré. Reprenez la demande avant de modifier.' }); await finish(false); return }
      const result = await client.query<{ expires_at: Date }>(`INSERT INTO procurement_edit_locks(company_id,document_kind,document_id,manager_id,expires_at)
        VALUES($1,$2,$3,$4,now()+make_interval(secs=>$5))
        ON CONFLICT(company_id,document_kind,document_id) DO UPDATE SET manager_id=EXCLUDED.manager_id,expires_at=EXCLUDED.expires_at
        RETURNING expires_at`, [manager.companyId, kind, documentId, actor.id, PROCUREMENT_LOCK_TTL_SECONDS])
      if (lockOperation) {
        await finish(false)
        res.json(view({ manager_id: actor.id, owner_name: actor.name, expires_at: result.rows[0]!.expires_at }))
        return
      }
      // Bail visible par les lecteurs ; le mutex reste acquis jusqu'à la fin
      // de l'écriture. Les données métier utilisent leurs connexions habituelles.
      const complete = () => finish(res.statusCode < 400 && (path === '/dashboard/tours' || req.method === 'DELETE' && path === '/' || /\/(submit|submit-finance|approve|approve-sa-bc|reject|revise-quantities|create-bt|create-po|schedule-delivery)$/.test(path)))
      // Une déconnexion du navigateur ne doit pas libérer le mutex avant que
      // le traitement métier ait terminé. end() est également appelé lorsque
      // la réponse ne peut plus être transmise au client déconnecté.
      const originalEnd = res.end
      res.end = function (this: Response, ...args: Parameters<Response['end']>) {
        void complete().then(() => originalEnd.apply(this, args)).catch(next)
        return this
      } as Response['end']
      next()
    } catch (err) {
      await finish(false)
      next(err)
    }
  }
}
