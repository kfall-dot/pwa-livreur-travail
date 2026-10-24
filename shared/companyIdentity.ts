/** Identité provisoire du pilote EFPC ; à remplacer par les réglages compagnie lors du lot holding. */
export const EFPC_IDENTITY = {
  shortName: 'EFPC',
  legalName: 'Entreprise de Fournitures de Prestation et de Construction',
  logoUrl: '/branding/efpc-logo.png',
  address: 'Cocody Riviera Palmeraie',
  postalAddress: '01 BP 13200 Abidjan 01',
  rccm: 'CI-ABJ-2013-B-15105',
  taxpayerNumber: '1346011 T',
  phone: '+225 07 49 46 76 57',
}
export function companyIdentity(companyId?: string | null) {
  return companyId === 'co-btp-pilote' ? EFPC_IDENTITY : null
}
