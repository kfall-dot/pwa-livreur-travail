import {
  createDraftFromParse,
  createEbParseRun,
  createWhatsappMessage,
  listSites,
  markWhatsappMessageProcessed,
} from '../db/procurementQueries.js'
import type { ParsedEbLine } from '../db/schema.js'
import { parseEbFromText, matchSiteFromDestination } from './ebParser.js'

export const PASTE_SOURCE_PHONE = 'paste:traceo'

export type PasteEbInput = {
  companyId: string
  bodyText: string
  siteId?: string | null
  pastedByManagerId: string
  pastedByName?: string | null
}

export type PasteEbResult = {
  draftId: string
  messageId: string
  lines: ParsedEbLine[]
  confidenceScore: number
  siteId: string | null
}

export async function createDraftFromPastedText(input: PasteEbInput): Promise<PasteEbResult> {
  const bodyText = input.bodyText.trim()
  if (!bodyText) {
    throw new Error('Collez le texte du message WhatsApp.')
  }

  const sites = await listSites(input.companyId)
  const parsed = await parseEbFromText(bodyText, {
    fromName: input.pastedByName ?? undefined,
  })
  const site =
    (input.siteId ? sites.find((s) => s.id === input.siteId) : undefined) ??
    matchSiteFromDestination(sites, parsed.destination) ??
    null

  const message = await createWhatsappMessage({
    companyId: input.companyId,
    externalId: null,
    fromPhone: PASTE_SOURCE_PHONE,
    fromName: input.pastedByName ?? 'Collage bureau',
    messageType: 'text',
    bodyText,
    rawPayload: {
      source: 'manager_paste',
      pastedByManagerId: input.pastedByManagerId,
    },
  })

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
    inputSummary: bodyText.slice(0, 500),
    extractedJson: parsed.rawExtracted ?? { lines: parsed.lines, urgency: parsed.urgency },
    confidenceScore: parsed.confidenceScore,
  })

  await markWhatsappMessageProcessed(message.id)

  return {
    draftId: draft.id,
    messageId: message.id,
    lines: parsed.lines,
    confidenceScore: parsed.confidenceScore,
    siteId: site?.id ?? null,
  }
}

const BLANK_FICHE_LINE_COUNT = 4

export async function createBlankEbDraft(input: {
  companyId: string
  createdByManagerId: string
  siteId?: string | null
}): Promise<{ draftId: string; siteId: string | null }> {
  const sites = await listSites(input.companyId)
  const site = input.siteId ? sites.find((s) => s.id === input.siteId) ?? null : null

  const blankLines: ParsedEbLine[] = Array.from({ length: BLANK_FICHE_LINE_COUNT }, () => ({
    label: '',
    quantity: 1,
    unit: 'unité',
  }))

  const draft = await createDraftFromParse({
    companyId: input.companyId,
    siteId: site?.id ?? null,
    sourceMessageIds: [],
    parsedLines: blankLines,
    parsedUrgency: 'normal',
    confidenceScore: 1,
    needsReview: true,
  })

  await createEbParseRun({
    draftId: draft.id,
    promptVersion: 'blank-fiche-v1',
    inputSummary: 'Fiche EB vierge',
    extractedJson: {
      demandeur: '',
      projetChantier: 'À préciser',
      dateBesoin: '',
      objet: 'BESOIN',
      urgence: 'normal',
      lines: [],
      source: 'blank_fiche',
      createdByManagerId: input.createdByManagerId,
    },
    confidenceScore: 1,
  })

  return { draftId: draft.id, siteId: site?.id ?? null }
}
