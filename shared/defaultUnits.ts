/** Unités par défaut pour une nouvelle entreprise (catalogue + tournées). */
export const DEFAULT_COMPANY_UNITS = [
  { code: 'palette', label: 'Palette', displayOrder: 1 },
  { code: 'kg', label: 'Kg', displayOrder: 2 },
  { code: 'colis', label: 'Colis', displayOrder: 3 },
  { code: 'caisse', label: 'Caisse', displayOrder: 4 },
  { code: 'plateau', label: 'Plateau', displayOrder: 5 },
  { code: 'unite', label: 'Unité', displayOrder: 6 },
  { code: 'carton', label: 'Carton', displayOrder: 7 },
  { code: 'sac', label: 'Sac', displayOrder: 8 },
  { code: 'bidon', label: 'Bidon', displayOrder: 9 },
  { code: 'tonne', label: 'Tonne', displayOrder: 10 },
  { code: 'botte', label: 'Botte', displayOrder: 11 },
  { code: 'seau', label: 'Seau', displayOrder: 12 },
  { code: 'metre', label: 'Mètre', displayOrder: 13 },
  { code: 'litre', label: 'Litre', displayOrder: 14 },
  { code: 'rouleau', label: 'Rouleau', displayOrder: 15 },
  { code: 'camion', label: 'Camion', displayOrder: 16 },
] as const

export type DefaultCompanyUnitCode = (typeof DEFAULT_COMPANY_UNITS)[number]['code']
