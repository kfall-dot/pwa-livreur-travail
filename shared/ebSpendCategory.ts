/** Postes matériaux du rapport Koestrem, tableau 5.1 — saisis à la création de l’EB. */

export const EB_SPEND_CATEGORIES = [
  { value: 'menuiserie', label: 'Matériels menuiserie' },
  { value: 'peinture', label: 'Matériels de peinture' },
  { value: 'electricite', label: 'Matériels électricité' },
  { value: 'plomberie', label: 'Matériels de plomberie' },
  { value: 'ferraille', label: 'Matériels ferraille' },
  { value: 'charpente', label: 'Matériels de charpente' },
  { value: 'platre', label: 'Matériels de plâtre' },
  { value: 'cadres_portes', label: 'Cadres et portes' },
  { value: 'ciments', label: 'Ciments' },
  { value: 'carburant', label: 'Carburant' },
  { value: 'etancheite', label: 'Matériels étanchéité' },
  { value: 'sable', label: 'Sable' },
  { value: 'maconnerie', label: 'Matériels maçonnerie' },
  { value: 'agglos', label: 'Agglos' },
  { value: 'nettoyage', label: 'Matériels de nettoyage' },
  { value: 'carocol', label: 'Carocol' },
  { value: 'autres_materiaux', label: 'Autres matériaux' },
] as const

export type EbSpendCategory = (typeof EB_SPEND_CATEGORIES)[number]['value']

export const EB_SPEND_CATEGORY_VALUES = EB_SPEND_CATEGORIES.map((c) => c.value) as [
  EbSpendCategory,
  ...EbSpendCategory[],
]

export const DEFAULT_EB_SPEND_CATEGORY: EbSpendCategory = 'autres_materiaux'

const LEGACY_SPEND_CATEGORY: Record<string, EbSpendCategory> = {
  materiaux: 'autres_materiaux',
  main_oeuvre: 'autres_materiaux',
  services: 'autres_materiaux',
  sous_traitance: 'autres_materiaux',
  autres: 'autres_materiaux',
}

const INFER_RULES: Array<{ re: RegExp; category: EbSpendCategory }> = [
  { re: /ciment/i, category: 'ciments' },
  { re: /carocol/i, category: 'carocol' },
  { re: /agglo|parpaing|brique/i, category: 'agglos' },
  { re: /peinture|peintre/i, category: 'peinture' },
  { re: /[ée]lectri|cable|câble/i, category: 'electricite' },
  { re: /plomb|tuyau|robinet/i, category: 'plomberie' },
  { re: /menuis/i, category: 'menuiserie' },
  { re: /charpente/i, category: 'charpente' },
  { re: /pl[aâ]tre/i, category: 'platre' },
  { re: /\bporte|\bcadre/i, category: 'cadres_portes' },
  { re: /carburant|gasoil|gazole|essence/i, category: 'carburant' },
  { re: /[eé]tanch/i, category: 'etancheite' },
  { re: /sable/i, category: 'sable' },
  { re: /ma[cç]on/i, category: 'maconnerie' },
  { re: /ferraille|\bfer\b|barre/i, category: 'ferraille' },
  { re: /nettoyage/i, category: 'nettoyage' },
]

export function isEbSpendCategory(value: unknown): value is EbSpendCategory {
  return EB_SPEND_CATEGORIES.some((c) => c.value === value)
}

export function normalizeEbSpendCategory(value?: string | null): EbSpendCategory {
  if (isEbSpendCategory(value)) return value
  if (value && LEGACY_SPEND_CATEGORY[value]) return LEGACY_SPEND_CATEGORY[value]!
  return DEFAULT_EB_SPEND_CATEGORY
}

export function isMaterialsSpendCategory(value?: string | null): boolean {
  return isEbSpendCategory(normalizeEbSpendCategory(value))
}

export function inferEbSpendCategory(label?: string | null): EbSpendCategory {
  const text = (label ?? '').trim()
  if (!text) return DEFAULT_EB_SPEND_CATEGORY
  for (const rule of INFER_RULES) {
    if (rule.re.test(text)) return rule.category
  }
  return DEFAULT_EB_SPEND_CATEGORY
}

export function ebSpendCategoryLabel(value?: string | null): string {
  const key = normalizeEbSpendCategory(value)
  return EB_SPEND_CATEGORIES.find((c) => c.value === key)?.label ?? 'Autres matériaux'
}
