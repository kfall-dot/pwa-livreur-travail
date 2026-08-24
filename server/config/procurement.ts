/**
 * Configuration module Achats-Chantier (BTP).
 *
 * Hypothèses pilote validées :
 * - Pont WhatsApp groupe : technicien transfère/répond au numéro métier TraceO
 * - Seuil PDG : 500 000 FCFA (> seuil → PDG ; ≤ → DAF seul pour validation montant)
 * - BT (fiche trésorerie) : produit quand FADYM n'a pas de compte chez le fournisseur (has_account=false)
 * - Mission terrain : profil livreur existant — livraison uniquement, pas d'achat espèces
 */

export const DEFAULT_BT_THRESHOLD_FCFA = 500_000

export type ProcurementConfig = {
  btThresholdFcfa: number
  whatsappVerifyToken: string
  whatsappMock: boolean
  openAiEnabled: boolean
}

export function getProcurementConfig(_companyId?: string): ProcurementConfig {
  const raw = process.env.PROCUREMENT_BT_THRESHOLD_FCFA
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  const btThresholdFcfa =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BT_THRESHOLD_FCFA

  return {
    btThresholdFcfa,
    whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || 'traceo-dev-verify',
    whatsappMock:
      process.env.WHATSAPP_MOCK === 'true' ||
      process.env.WHATSAPP_MOCK === '1' ||
      process.env.NODE_ENV !== 'production',
    openAiEnabled: Boolean(process.env.OPENAI_API_KEY?.trim()),
  }
}
