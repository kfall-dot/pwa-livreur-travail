/**
 * Référentiel des natures de charge — **F02 lot A**.
 *
 * Source de vérité unique, en code (le référentiel est une **liste fermée** :
 * voir `docs/BTP-SPEC-F02-NATURES-CHARGE-DEPENSES-HORS-SA.md` §6.4).
 *
 * Contenu = **union** de :
 * 1. la grille matériaux Koestrem 5.1 (17 postes déjà stockés dans
 *    `purchase_request_lines.spend_category` — **valeurs conservées à
 *    l'identique**, aucune ligne existante n'est à migrer) ;
 * 2. le rapport du CdG « DG CI ENERGIE » (35 postes : 19 matériaux +
 *    16 main-d'œuvre / engins), complété par les fourre-tout nécessaires.
 *
 * La **famille** est la clé de routage du circuit (F02 lot B) : seuls les
 * `materiaux` passent par le SA → BC ; `main_oeuvre`, `engins` et `frais`
 * suivent le circuit hors SA. Elle porte aussi le KPI « part des matériaux ».
 */

export const CHARGE_FAMILIES = [
  { value: 'materiaux', label: 'Matériaux' },
  { value: 'main_oeuvre', label: "Main d'œuvre" },
  { value: 'engins', label: 'Engins & transport' },
  { value: 'frais', label: 'Frais' },
] as const

export type ChargeFamily = (typeof CHARGE_FAMILIES)[number]['value']

export type ChargeNature = {
  /** Code stable stocké dans `purchase_request_lines.spend_category`. */
  value: string
  /** Libellé canonique affiché (celui du rapport CdG quand il existe). */
  label: string
  family: ChargeFamily
  /** Variantes de libellé rencontrées dans les journaux / rapports. */
  aliases: readonly string[]
}

/** Nature par défaut : fourre-tout matériaux (comportement historique). */
export const DEFAULT_CHARGE_NATURE = 'autres_materiaux'

export const CHARGE_NATURES = [
  // ── Matériaux (23) ──────────────────────────────────────────────────
  // 17 postes du tableau Koestrem 5.1 : valeurs historiques INCHANGÉES.
  { value: 'menuiserie', label: 'Menuiserie', family: 'materiaux', aliases: ['MATERIELS MENUISERIE', 'MENUISERIE BOIS'] },
  { value: 'peinture', label: 'Peinture', family: 'materiaux', aliases: ['MATERIELS DE PEINTURE', 'DILUANT'] },
  { value: 'electricite', label: 'Électricité', family: 'materiaux', aliases: ['MATERIELS ELECTRICITE'] },
  { value: 'plomberie', label: 'Plomberie', family: 'materiaux', aliases: ['MATERIELS PLOMBERIE', 'MATERIELS DE PLOMBERIE'] },
  { value: 'ferraille', label: 'Ferraille', family: 'materiaux', aliases: ['MATERIELS FERRAILLE', 'MATERIELS DE FERRAILLE', 'FER'] },
  { value: 'charpente', label: 'Charpente', family: 'materiaux', aliases: ['MATERIELS DE CHARPENTERIE', 'MATERIELS CHARPENTERIE'] },
  { value: 'platre', label: 'Plâtre', family: 'materiaux', aliases: ['PLATRES+MATERIELS DE PLATRE', 'PLATRE+MATERIELS DE PLATRE'] },
  { value: 'cadres_portes', label: 'Cadres et portes', family: 'materiaux', aliases: ['CADRES ET PORTES'] },
  { value: 'ciments', label: 'Ciments', family: 'materiaux', aliases: ['CIMENT'] },
  { value: 'carburant', label: 'Carburant', family: 'materiaux', aliases: ['GASOIL', 'GAZOLE', 'ESSENCE'] },
  { value: 'etancheite', label: 'Étanchéité', family: 'materiaux', aliases: ['MATERIELS ETANCHEITE'] },
  { value: 'sable', label: 'Sable', family: 'materiaux', aliases: [] },
  { value: 'maconnerie', label: 'Maçonnerie', family: 'materiaux', aliases: ['MATERIELS MACONNERIE'] },
  { value: 'agglos', label: 'Agglos', family: 'materiaux', aliases: ['PARPAING', 'BRIQUE'] },
  { value: 'nettoyage', label: 'Nettoyage', family: 'materiaux', aliases: ['MATERIELS NETTOYAGE', 'MATERIELS DE NETOYAGE'] },
  { value: 'carocol', label: 'Carocol', family: 'materiaux', aliases: [] },
  { value: 'autres_materiaux', label: 'Autres matériaux', family: 'materiaux', aliases: [] },
  // 6 postes matériaux du rapport CdG absents du tableau 5.1.
  { value: 'marbre_plinthes', label: 'Marbre / plinthes', family: 'materiaux', aliases: ['MARBRES/PLINTHES', 'MARBRE/PLINTHES', 'MARBRE', 'SANTA LUCIA', 'GRANITE'] },
  { value: 'materiels_cuisine', label: 'Matériels de cuisine', family: 'materiaux', aliases: ['MATERIELS DE CUISINE', 'CUISINE'] },
  { value: 'menuiserie_aluminium', label: 'Menuiserie aluminium', family: 'materiaux', aliases: ['MENUISERIE ALUMINIUM', 'MENUISIRIE ALUMINUIN'] },
  { value: 'accessoires_menuiserie', label: 'Accessoires menuiserie', family: 'materiaux', aliases: ['ACCESSOIRES MENUISERIE', 'ASSECCOIRES MENUISIERIE'] },
  { value: 'equipement_travail', label: 'Équipement de travail', family: 'materiaux', aliases: ['EQUIPEMENT DE TRAVAIL'] },
  { value: 'sac_vide', label: 'Sac vide', family: 'materiaux', aliases: ['SAC VIDE', 'SACS VIDES'] },

  // ── Main d'œuvre (14) ───────────────────────────────────────────────
  // 13 postes du rapport CdG + un fourre-tout pour l'ancienne famille
  // `main_oeuvre`, aplatie en `autres_materiaux` par la migration
  // 20260821200000 (c'est cette perte que F02-A répare).
  { value: 'salaire_technicien', label: 'Salaires technicien', family: 'main_oeuvre', aliases: ['SALAIRES TECHNICIEN', 'SALAIRES'] },
  { value: 'confection_volet', label: 'Confection de volet', family: 'main_oeuvre', aliases: ['CONFECTION DE VOLET', 'VOLET ELECTRIQUE'] },
  { value: 'mo_menuiserie', label: "Main d'œuvre menuisier", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE MENUISIER", 'EBENISTE'] },
  { value: 'mo_poncage', label: "Main d'œuvre ponceur", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE PONCEUR", 'PONCEUR', 'PONCAGE'] },
  { value: 'mo_carrelage', label: "Main d'œuvre carrelage", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE CARRELAGE", "MAIN D'OEUVRE CARRELEUR", 'CARRELEURS'] },
  { value: 'pose_marbre_plinthes', label: 'Pose marbre / plinthes', family: 'main_oeuvre', aliases: ['POSE MARBRE/PLINTH', 'POSE DE MARBRE/PLINTHES'] },
  { value: 'mo_aides', label: "Main d'œuvre et aides", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE ET AIDES", 'MANOEUVRE ET AIDES', 'AIDES'] },
  { value: 'mo_peinture', label: "Main d'œuvre peintre", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE PEINTRE", 'PEINTRE'] },
  { value: 'mo_ferraille', label: "Main d'œuvre ferraille", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE FERRAILLE"] },
  { value: 'mo_alucobond', label: "Main d'œuvre alucobond", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE ALUCOBOND", "MAIN D'OEUVRE ALUCONBOND"] },
  { value: 'depose_granite', label: 'Dépose granite', family: 'main_oeuvre', aliases: ['DEPOSE GRANITE', 'DEPOSE DE GRANITE'] },
  { value: 'mo_maconnerie', label: "Main d'œuvre maçon", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE MACON", 'MACON'] },
  { value: 'mo_etancheite', label: "Main d'œuvre étanchéité", family: 'main_oeuvre', aliases: ["MAIN D'OEUVRE ETANCHEITE"] },
  { value: 'mo_divers', label: "Main d'œuvre (autre)", family: 'main_oeuvre', aliases: [] },

  // ── Engins & transport (3) ──────────────────────────────────────────
  { value: 'ramassage_demolition', label: 'Ramassage / démolition et décapage', family: 'engins', aliases: ['RAMASSAGE/DEMOLITION ET DECAPAGE', 'RAMASSAGE'] },
  { value: 'chargement_dechargement', label: 'Frais de chargement / déchargement', family: 'engins', aliases: ['FRAIS DE CHARGEMENT/DECHARGEMENT', 'CHARGEMENT', 'DECHARGEMENT'] },
  { value: 'livraison_materiels', label: 'Livraison de matériels', family: 'engins', aliases: ['LIVRAISON MATERIELS', 'LIVRAISON DE MATERIELS', 'LIVRAISON'] },

  // ── Frais (2) ───────────────────────────────────────────────────────
  { value: 'frais_depot', label: 'Frais de dépôt', family: 'frais', aliases: ['FRAIS DE DEPOT', 'DEPOT'] },
  { value: 'frais_divers', label: 'Autres frais', family: 'frais', aliases: ['FRAIS DIVERS', 'SERVICES', 'SOUS TRAITANCE'] },
] as const satisfies readonly ChargeNature[]

export type ChargeNatureValue = (typeof CHARGE_NATURES)[number]['value']

/** Entrée du référentiel avec ses littéraux préservés (`value` reste typé). */
export type ChargeNatureEntry = (typeof CHARGE_NATURES)[number]

/**
 * Clé de comparaison d'un libellé : majuscules, sans accents, `œ` → `OE`,
 * séparateurs unifiés. Sert à rapprocher les libellés du journal (qui
 * dérivent : `MENUISIRIE ALUMINUIN`, `MATERIELS DE NETOYAGE`…) des libellés
 * canoniques du référentiel.
 */
export function chargeNatureKey(text?: string | null): string {
  return (text ?? '')
    .replace(/[\u0153\u0152]/g, 'OE')
    .replace(/[\u00e6\u00c6]/g, 'AE')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u0060\u00b4]/g, "'")
    .replace(/[^A-Za-z0-9']+/g, ' ')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

const NATURE_BY_VALUE = new Map<string, ChargeNature>()
const NATURE_BY_KEY = new Map<string, ChargeNature>()
for (const nature of CHARGE_NATURES) {
  NATURE_BY_VALUE.set(nature.value, nature)
  for (const raw of [nature.value, nature.label, ...nature.aliases]) {
    const key = chargeNatureKey(raw)
    if (key) NATURE_BY_KEY.set(key, nature)
  }
}

export function isChargeFamily(value: unknown): value is ChargeFamily {
  return CHARGE_FAMILIES.some((f) => f.value === value)
}

export function chargeFamilyLabel(value?: string | null): string {
  return CHARGE_FAMILIES.find((f) => f.value === value)?.label ?? 'Famille inconnue'
}

/** Entrée du référentiel, ou `null` si la valeur n'en fait pas partie. */
export function chargeNatureEntry(value?: string | null): ChargeNature | null {
  if (!value) return null
  return NATURE_BY_VALUE.get(value) ?? null
}

export function isChargeNature(value: unknown): value is ChargeNatureValue {
  return typeof value === 'string' && NATURE_BY_VALUE.has(value)
}

export function chargeNatureLabel(value?: string | null): string {
  return chargeNatureEntry(value)?.label ?? 'Nature inconnue'
}

/** Famille d'une nature — `null` si la valeur est inconnue. */
export function chargeNatureFamily(value?: string | null): ChargeFamily | null {
  return chargeNatureEntry(value)?.family ?? null
}

/** Seule famille qui passe par le circuit SA → BC (invariant I102). */
export function isMaterialsNature(value?: string | null): boolean {
  return chargeNatureFamily(value) === 'materiaux'
}

export function chargeNaturesByFamily(family: ChargeFamily): readonly ChargeNature[] {
  return CHARGE_NATURES.filter((n) => n.family === family)
}

/**
 * Rapproche un libellé libre du référentiel : code, libellé canonique ou alias.
 * Retourne `null` si aucun rapprochement exact — l'appelant décide alors de
 * marquer la ligne « à catégoriser » (voir §6.4 de la spec).
 */
export function resolveChargeNature(label?: string | null): ChargeNatureValue | null {
  const key = chargeNatureKey(label)
  if (!key) return null
  return (NATURE_BY_KEY.get(key)?.value as ChargeNatureValue | undefined) ?? null
}

/**
 * Inférence pour les libellés libres (parse WhatsApp, import Excel).
 * L'ordre des règles compte : la main-d'œuvre est testée **avant** les
 * matériaux, sinon « MAIN D'ŒUVRE PEINTRE » tomberait sur la nature peinture.
 */
const INFER_RULES: ReadonlyArray<{ re: RegExp; nature: ChargeNatureValue }> = [
  // 1. Main d'œuvre
  { re: /MAIN D'OEUVRE ET AIDES|MANOEUVRE|AIDES?\b/, nature: 'mo_aides' },
  { re: /MAIN D'OEUVRE CARREL|CARRELEUR|CARRELAGE/, nature: 'mo_carrelage' },
  { re: /MAIN D'OEUVRE MENUIS|MENUISIER|EBENISTE/, nature: 'mo_menuiserie' },
  { re: /MAIN D'OEUVRE PONC|PONCEUR|PONCAGE/, nature: 'mo_poncage' },
  { re: /MAIN D'OEUVRE PEINTRE|PEINTRE\b/, nature: 'mo_peinture' },
  { re: /MAIN D'OEUVRE FERRAILLE/, nature: 'mo_ferraille' },
  { re: /MAIN D'OEUVRE ALUCO/, nature: 'mo_alucobond' },
  { re: /MAIN D'OEUVRE MACON|MACON\b/, nature: 'mo_maconnerie' },
  { re: /MAIN D'OEUVRE ETANCH/, nature: 'mo_etancheite' },
  { re: /POSE .*MARBRE|POSE DE MARBRE/, nature: 'pose_marbre_plinthes' },
  { re: /DEPOSE/, nature: 'depose_granite' },
  { re: /CONFECTION DE VOLET|VOLET ELECTRIQUE/, nature: 'confection_volet' },
  { re: /SALAIRE/, nature: 'salaire_technicien' },
  { re: /MAIN D'OEUVRE/, nature: 'mo_divers' },
  // 2. Engins & transport
  { re: /LIVRAISON/, nature: 'livraison_materiels' },
  { re: /CHARGEMENT|DECHARGEMENT/, nature: 'chargement_dechargement' },
  { re: /RAMASSAGE|DEMOLITION|DECAPAGE|TRANSPORT/, nature: 'ramassage_demolition' },
  // 3. Frais
  { re: /FRAIS DE DEPOT|DEPOT/, nature: 'frais_depot' },
  { re: /TVA|REMISE|FRAIS DIVERS|SOUS TRAITANCE/, nature: 'frais_divers' },
  // 4. Matériaux — règles Koestrem historiques, puis les 6 postes du rapport CdG.
  { re: /CIMENT/, nature: 'ciments' },
  { re: /CAROCOL/, nature: 'carocol' },
  { re: /AGGLO|PARPAING|BRIQUE/, nature: 'agglos' },
  { re: /PEINTURE/, nature: 'peinture' },
  { re: /ELECTRI|CABLE/, nature: 'electricite' },
  { re: /PLOMB|TUYAU|ROBINET/, nature: 'plomberie' },
  { re: /MENUISERIE ALUMINIUM|ALUMINIUM|ALUCOBOND/, nature: 'menuiserie_aluminium' },
  { re: /MENUIS|CONTRE PLAQUE|PANNEAU/, nature: 'menuiserie' },
  { re: /CHARPENT/, nature: 'charpente' },
  { re: /PLATRE/, nature: 'platre' },
  { re: /\bPORTE|\bCADRE/, nature: 'cadres_portes' },
  { re: /CARBURANT|GASOIL|GAZOLE|ESSENCE/, nature: 'carburant' },
  { re: /ETANCH/, nature: 'etancheite' },
  { re: /SABLE/, nature: 'sable' },
  { re: /MACONN/, nature: 'maconnerie' },
  { re: /FERRAILLE|\bFER\b|BARRE/, nature: 'ferraille' },
  { re: /NETTOYAGE/, nature: 'nettoyage' },
  { re: /MARBRE|PLINTH|SANTA LUCIA|GRANITE/, nature: 'marbre_plinthes' },
  { re: /CUISINE/, nature: 'materiels_cuisine' },
  { re: /ACCESSOIRE/, nature: 'accessoires_menuiserie' },
  { re: /EQUIPEMENT/, nature: 'equipement_travail' },
  { re: /SAC VIDE|SACS VIDES/, nature: 'sac_vide' },
]

/** Meilleure nature devinée pour un libellé libre — jamais `null`. */
export function inferChargeNature(label?: string | null): ChargeNatureValue {
  const resolved = resolveChargeNature(label)
  if (resolved) return resolved
  const key = chargeNatureKey(label)
  if (!key) return DEFAULT_CHARGE_NATURE
  for (const rule of INFER_RULES) {
    if (rule.re.test(key)) return rule.nature
  }
  return DEFAULT_CHARGE_NATURE
}
