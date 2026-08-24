import { Router } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getProcurementConfig } from '../config/procurement.js'
import {
  createDraftFromParse,
  createEbParseRun,
  createWhatsappMessage,
  getSiteByWhatsappGroup,
  listSites,
  markWhatsappMessageProcessed,
} from '../db/procurementQueries.js'
import { BTP_PILOT_COMPANY_ID } from '../db/schema.js'
import { getProcurementMediaStore, isBlobsEnabled } from '../lib/blobs.js'
import { parseBody } from '../lib/validation.js'
import { parseEbFromText, matchSiteFromDestination } from '../services/ebParser.js'
import { notifyDraftReadyForReview } from '../services/procurementNotifications.js'

export const whatsappWebhookRouter = Router()

const simulateSchema = z.object({
  companyId: z.string().min(1).default(BTP_PILOT_COMPANY_ID),
  fromPhone: z.string().min(3),
  fromName: z.string().optional(),
  bodyText: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  groupId: z.string().optional(),
  siteId: z.string().optional(),
}).refine((d) => Boolean(d.bodyText?.trim() || d.text?.trim()), { message: 'text ou bodyText requis' })

type IncomingMessage = {
  id?: string
  from: string
  type?: string
  text?: { body?: string }
  audio?: { id?: string }
  image?: { id?: string; caption?: string }
  document?: { id?: string; caption?: string }
}

async function resolveCompanyAndSite(companyId: string, groupId?: string | null, siteId?: string | null) {
  if (siteId) {
    const sites = await listSites(companyId)
    return sites.find((s) => s.id === siteId) ?? sites[0] ?? null
  }
  if (groupId) {
    const byGroup = await getSiteByWhatsappGroup(companyId, groupId)
    if (byGroup) return byGroup
  }
  const sites = await listSites(companyId)
  return sites[0] ?? null
}

async function ingestTextMessage(input: {
  companyId: string
  externalId?: string
  fromPhone: string
  fromName?: string
  bodyText: string
  groupId?: string
  siteId?: string
  rawPayload?: unknown
}) {
  let site = await resolveCompanyAndSite(input.companyId, input.groupId, input.siteId)

  const message = await createWhatsappMessage({
    companyId: input.companyId,
    externalId: input.externalId ?? null,
    fromPhone: input.fromPhone,
    fromName: input.fromName ?? null,
    messageType: 'text',
    bodyText: input.bodyText,
    groupId: input.groupId ?? null,
    rawPayload: input.rawPayload ?? null,
  })

  const parsed = await parseEbFromText(input.bodyText, {
    siteName: site?.name,
    fromPhone: input.fromPhone,
    fromName: input.fromName,
  })
  if (!input.siteId && !input.groupId) {
    const sites = await listSites(input.companyId)
    site = matchSiteFromDestination(sites, parsed.destination) ?? site
  }

  const draft = await createDraftFromParse({
    companyId: input.companyId,
    siteId: site?.id ?? null,
    sourceMessageIds: [message.id],
    parsedLines: parsed.lines,
    parsedUrgency: parsed.urgency,
    confidenceScore: parsed.confidenceScore,
    needsReview: true,
  })

  await createEbParseRun({
    draftId: draft.id,
    promptVersion: parsed.promptVersion ?? 'rule-v1',
    inputSummary: input.bodyText.slice(0, 500),
    extractedJson: parsed.rawExtracted ?? { lines: parsed.lines, urgency: parsed.urgency },
    confidenceScore: parsed.confidenceScore,
  })

  await markWhatsappMessageProcessed(message.id)

  if (site?.name) {
    await notifyDraftReadyForReview(input.companyId, draft.id, site.name)
  }

  return { message, draft, parsed }
}

// Meta webhook verification
whatsappWebhookRouter.get('/', (req, res) => {
  const config = getProcurementConfig()
  const mode = String(req.query['hub.mode'] ?? '')
  const token = String(req.query['hub.verify_token'] ?? '')
  const challenge = String(req.query['hub.challenge'] ?? '')

  if (mode === 'subscribe' && token === config.whatsappVerifyToken) {
    res.status(200).send(challenge)
    return
  }
  res.status(403).json({ message: 'Vérification webhook échouée' })
})

whatsappWebhookRouter.post('/', async (req, res) => {
  const config = getProcurementConfig()

  if (config.whatsappMock) {
    res.json({ ok: true, mock: true, message: 'WHATSAPP_MOCK actif — utilisez POST /simulate' })
    return
  }

  try {
    const body = req.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: IncomingMessage[]
            metadata?: { phone_number_id?: string }
          }
        }>
      }>
    }

    const companyId = process.env.WHATSAPP_DEFAULT_COMPANY_ID?.trim() || BTP_PILOT_COMPANY_ID
    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages ?? []
    const results = []

    for (const msg of messages) {
      const text = msg.text?.body ?? msg.image?.caption ?? msg.document?.caption ?? ''
      if (!text.trim()) continue
      const result = await ingestTextMessage({
        companyId,
        externalId: msg.id,
        fromPhone: msg.from,
        bodyText: text,
        rawPayload: msg,
      })
      results.push({ draftId: result.draft.id, lines: result.parsed.lines.length })
    }

    res.json({ ok: true, processed: results.length, results })
  } catch (err) {
    console.error('[whatsapp] webhook error', err)
    res.status(500).json({ message: 'Erreur traitement webhook WhatsApp' })
  }
})

/** E2E : simule un message WhatsApp entrant (ALLOW_SEED requis). */
whatsappWebhookRouter.post('/simulate', async (req, res) => {
  if (process.env.ALLOW_SEED !== 'true') {
    res.status(403).json({ message: 'Simulation désactivée (ALLOW_SEED requis)' })
    return
  }

  const body = parseBody(simulateSchema, req.body, res)
  if (!body) return

  try {
    const result = await ingestTextMessage({
      companyId: body.companyId,
      externalId: `sim-${randomUUID()}`,
      fromPhone: body.fromPhone,
      fromName: body.fromName,
      bodyText: body.bodyText ?? body.text ?? '',
      groupId: body.groupId,
      siteId: body.siteId,
      rawPayload: { simulated: true },
    })
    res.status(201).json({
      ok: true,
      messageId: result.message.id,
      draftId: result.draft.id,
      lines: result.parsed.lines,
      confidenceScore: result.parsed.confidenceScore,
    })
  } catch (err) {
    console.error('[whatsapp] simulate error', err)
    res.status(500).json({ message: 'Erreur simulation WhatsApp' })
  }
})

/** Télécharge un média mock vers Blobs (dev). */
whatsappWebhookRouter.post('/media', async (req, res) => {
  if (!isBlobsEnabled()) {
    res.status(503).json({ message: 'Blobs non disponibles' })
    return
  }
  const key = String(req.body?.key ?? `media-${randomUUID()}`)
  const data = req.body?.data
  if (!data) {
    res.status(400).json({ message: 'data requis (base64)' })
    return
  }
  const buf = Buffer.from(String(data), 'base64')
  const store = getProcurementMediaStore()
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  await store.set(key, arrayBuffer, { metadata: { contentType: req.body?.contentType ?? 'application/octet-stream' } })
  res.json({ ok: true, key })
})
