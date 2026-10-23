import { Router } from 'express'
import { z } from 'zod'
import { getManagerById } from '../db/queries.js'
import type { ManagerRequest } from '../middleware/managerAuth.js'
import { correctionContext, requestCorrection, resubmitCorrection, registerCorrectionUpload, archivedCorrectionDocument, approveCorrection, CorrectionError } from '../services/procurementCorrections.js'
import { verifySignaturePin, clientIpFromReq } from '../services/ebSignature.js'
import { notifyManagersByProcurementRole } from '../services/procurementNotifications.js'
import { parseJsonAttachment } from '../lib/jsonAttachment.js'
import { putLineAttachment, deleteLineAttachment } from '../lib/lineAttachmentStore.js'
import { resolveLineAttachmentMime, LINE_ATTACHMENT_MAX_BYTES } from '../lib/uploadMime.js'

const askSchema = z.object({ kind: z.enum(['need', 'commercial', 'documents', 'bc']), reason: z.string().trim().min(1).max(4000), targetManagerId: z.string().min(1), pin: z.string().optional() })
const lineSchema = z.object({ id: z.string(), label: z.string().min(1), quantity: z.number().positive().finite(), unit: z.string().min(1), unitPriceFcfa: z.number().nonnegative().finite(), supplierName: z.string().nullable().optional(), paymentMode: z.string().nullable().optional(), spendCategory: z.string(), observation: z.string().nullable().optional(), attachmentBlobKey: z.string().nullable().optional(), attachmentFileName: z.string().nullable().optional(), attachmentContentType: z.string().nullable().optional() })
const submitSchema = z.object({ lines: z.array(lineSchema).min(1).max(500), comment: z.string().trim().min(1).max(4000), pin: z.string().optional() })
const router = Router({ mergeParams: true })
async function actor(req: import('express').Request) {
  const { manager } = req as ManagerRequest
  const result = await getManagerById(manager.sub)
  if (!result || result.companyId !== manager.companyId || !result.procurementRole) throw new CorrectionError('Compte métier requis', 403)
  return result
}
async function signature(person: Awaited<ReturnType<typeof actor>>, pin?: string) {
  if (person.procurementRole === 'treasury' || person.procurementRole === 'site_manager' || person.procurementRole === 'purchasing' && Boolean(person.saSupervisorId)) return false
  if (!pin || !await verifySignaturePin({ managerId: person.id, passwordHash: person.passwordHash, pin })) throw new CorrectionError('NIP de signature incorrect ou manquant', 401)
  return true
}
function error(res: import('express').Response, err: unknown) {
  if (err instanceof CorrectionError) res.status(err.statusCode).json({ message: err.message })
  else { console.error('[corrections]', err); res.status(500).json({ message: 'Traitement de correction impossible' }) }
}
router.get('/', async (req, res) => {
  try { const person = await actor(req); res.json(await correctionContext(person.companyId, String((req.params as Record<string, string>).id), person)) }
  catch (err) { error(res, err) }
})
router.post('/request', async (req, res) => {
  const parsed = askSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: 'Nature, destinataire et motif de correction obligatoires' }); return }
  try {
    const person = await actor(req)
    const result = await requestCorrection({ ...parsed.data, actor: person, companyId: person.companyId, requestId: String((req.params as Record<string, string>).id), pinVerified: await signature(person, parsed.data.pin), ip: clientIpFromReq(req) })
    const target = await getManagerById(result.targetManagerId)
    if (target?.procurementRole) await notifyManagersByProcurementRole(person.companyId, [target.procurementRole], 'EB à corriger', result.reason, { managerIds: [target.id], refType: 'purchase_request', refId: result.requestId, notificationType: 'task_assigned' }).catch(err => console.error('[correction notify]', err))
    res.status(201).json(result)
  } catch (err) { error(res, err) }
})
router.post('/resubmit', async (req, res) => {
  const parsed = submitSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ message: 'Lignes valides et description des corrections requises' }); return }
  try {
    const person = await actor(req)
    const result = await resubmitCorrection({ ...parsed.data, actor: person, companyId: person.companyId, requestId: String((req.params as Record<string, string>).id), pinVerified: await signature(person, parsed.data.pin), ip: clientIpFromReq(req) })
    const role = result.nextStatus === 'dt_review' ? 'technical_director' : result.nextStatus === 'correction_head_review' || result.nextStatus === 'submitted' || result.nextStatus === 'sa_head_review' || result.nextStatus === 'bc_head_review' || result.nextStatus === 'sa_review' ? 'purchasing' : result.nextStatus === 'cdg_review' ? 'controle_gestion' : result.nextStatus === 'pdg_review' ? 'pdg' : result.nextStatus === 'bt_ready' || result.nextStatus === 'delivered' || result.nextStatus === 'po_ready' ? 'treasury' : 'daf'
    await notifyManagersByProcurementRole(person.companyId, [role], `Correction soumise — ${result.request.reference}`, parsed.data.comment, { ...(result.returningToId ? { managerIds: [result.returningToId] } : {}), refType: 'purchase_request', refId: result.request.id, notificationType: 'task_assigned' }).catch(err => console.error('[correction notify]', err))
    res.json(result)
  } catch (err) { error(res, err) }
})
router.post('/approve', async (req, res) => {
  try {
    const person = await actor(req)
    await signature(person, typeof req.body?.pin === 'string' ? req.body.pin : '')
    const result = await approveCorrection(person.companyId, String((req.params as Record<string, string>).id), person, clientIpFromReq(req))
    const target = await getManagerById(result.notifyId)
    if (target?.procurementRole) await notifyManagersByProcurementRole(person.companyId, [target.procurementRole], 'Correction validée par le chef SA', result.request.reference, { managerIds: [target.id], refType: 'purchase_request', refId: result.request.id, notificationType: 'task_assigned' }).catch(err => console.error('[correction notify]', err))
    res.json(result)
  } catch (err) { error(res, err) }
})
router.post('/attachments/:lineId', async (req, res) => {
  let key: string | null = null
  try {
    const person = await actor(req)
    const file = parseJsonAttachment(req.body)
    if ('error' in file || !file.buffer.length || file.buffer.length > LINE_ATTACHMENT_MAX_BYTES) throw new CorrectionError('Pièce PDF ou image requise, maximum 5 Mo')
    const contentType = resolveLineAttachmentMime(file.originalname, file.mimetype)
    if (!contentType) throw new CorrectionError('Type de fichier non autorisé')
    key = `corrections/${String((req.params as Record<string, string>).id)}/${crypto.randomUUID()}`
    await putLineAttachment(key, file.buffer, { contentType, fileName: file.originalname })
    await registerCorrectionUpload(person.companyId, String((req.params as Record<string, string>).id), person.id, String(req.params.lineId), key)
    res.json({ attachmentBlobKey: key, attachmentFileName: file.originalname, attachmentContentType: contentType })
  } catch (err) { if (key) await deleteLineAttachment(key).catch(() => {}); error(res, err) }
})
router.get('/history/:correctionId/documents/:documentId', async (req, res) => {
  try { const person = await actor(req); res.type('html').send(await archivedCorrectionDocument(person.companyId, String((req.params as Record<string, string>).id), String(req.params.correctionId), String(req.params.documentId))) }
  catch (err) { error(res, err) }
})
export { router as procurementCorrectionsRouter }
