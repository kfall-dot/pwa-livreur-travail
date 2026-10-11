/**
 * Identifiants de la chaîne documentaire achats (EB → BT → BC → BL).
 *
 * Point d'entrée unique du résolveur : l'utilisateur colle un identifiant
 * (référence imprimée sur une pièce, ou id technique) et on retrouve la pièce
 * puis sa chaîne. Formats reconnus :
 *  - `EB-2026-0007` (suffixe de révision « — v2 » toléré) → demande d'achat
 *  - `BT-2026-0003` / `AV-20260712-0001`                  → bon de trésorerie
 *  - `BC-2026-0012`                                       → bon de commande
 *  - `RCT-A1B2C3D4`                                       → BL (certificat de livraison)
 *  - id technique (UUID) : EB, BT/AV, BC ou arrêt livré
 */
export type DocumentRefKind = 'eb' | 'bt' | 'bc' | 'bl' | 'uuid' | 'unknown'

export interface ParsedDocumentRef {
  kind: DocumentRefKind
  /** Valeur canonique comparée en base : référence en majuscules, id en minuscules. */
  value: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** `EB-2026-0007` + suffixe de révision collé (« — v2 », « —v12 »). */
const EB_RE = /^EB-(\d{4})-(\d{3,6})(?:[—–-]V?(\d+))?$/
/** Bon de trésorerie `BT-2026-0003` et avance `AV-20260712-0001`. */
const BT_RE = /^(?:BT|AV)-(\d{4}|\d{8})-(\d{3,6})$/
const BC_RE = /^BC-(\d{4})-(\d{3,6})$/
/** BL interne : certificat `RCT-` + 8 caractères alphanumériques. */
const BL_RE = /^RCT-[A-Z0-9]{4,16}$/

/** Libellés recopiés depuis l'affichage (« EB EB-2026-0007 », « BL RCT-… »). */
const LABELS = ['EB', 'BT', 'BC', 'BL']

function parseCompact(compact: string): ParsedDocumentRef | null {
  const eb = EB_RE.exec(compact)
  if (eb) return { kind: 'eb', value: `EB-${eb[1]}-${eb[2]}` }
  if (BT_RE.test(compact)) return { kind: 'bt', value: compact }
  if (BC_RE.test(compact)) return { kind: 'bc', value: compact }
  if (BL_RE.test(compact)) return { kind: 'bl', value: compact }
  return null
}

/**
 * Analyse un identifiant collé : casse, espaces et libellé préfixé tolérés
 * (` bc-2026-0012 `, `EB EB-2026-0007 — v2`). Renvoie `unknown` plutôt que de
 * deviner : le résolveur répond alors « identifiant non reconnu ».
 */
export function parseDocumentRef(input: string): ParsedDocumentRef {
  const raw = (input ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return { kind: 'unknown', value: '' }
  const compact = raw.replace(/\s/g, '').toUpperCase()

  const direct = parseCompact(compact)
  if (direct) return direct

  // « EB EB-2026-0007 » (libellé recopié tel qu'affiché) : on retente sans.
  if (LABELS.some((label) => compact.startsWith(label))) {
    const stripped = parseCompact(compact.slice(2))
    if (stripped) return stripped
  }

  if (UUID_RE.test(raw)) return { kind: 'uuid', value: raw.toLowerCase() }

  return { kind: 'unknown', value: '' }
}
