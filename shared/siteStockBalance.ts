export type ReceivedSiteMaterial = { siteId: string; siteName: string; productLabel: string; unit: string; onHand: number; onOrder: number }
export type SiteMaterialConsumption = { siteId: string; productLabel: string; unit: string; consumed: number }
export type SiteMaterialBalance = ReceivedSiteMaterial & { consumed: number; available: number }

const unitAliases: Record<string, string> = {
  sacs: 'sac', bottes: 'botte', palettes: 'palette', cartons: 'carton', caisses: 'caisse',
  bidons: 'bidon', seaux: 'seau', tonnes: 'tonne', metres: 'metre', m: 'metre',
  litres: 'litre', l: 'litre', rouleaux: 'rouleau', camions: 'camion', colis: 'colis',
  u: 'unite', unites: 'unite', piece: 'unite', pieces: 'unite', pc: 'unite', pcs: 'unite',
}
function normalized(value: string) { return value.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() }
function materialKey(siteId: string, label: string, unit: string) {
  const normalizedUnit = normalized(unit)
  return JSON.stringify([siteId, normalized(label), unitAliases[normalizedUnit] ?? normalizedUnit])
}
const quantity = (value: number) => Number(value.toFixed(6))

/** Les quantités attendues ne sont jamais comptées comme disponibles. */
export function buildSiteStockBalances(received: ReceivedSiteMaterial[], consumption: SiteMaterialConsumption[]): SiteMaterialBalance[] {
  const balances = new Map<string, SiteMaterialBalance>()
  for (const row of received) {
    const key = materialKey(row.siteId, row.productLabel, row.unit)
    const current = balances.get(key) ?? { ...row, onHand: 0, onOrder: 0, consumed: 0, available: 0 }
    current.onHand = quantity(current.onHand + row.onHand)
    current.onOrder = quantity(current.onOrder + row.onOrder)
    balances.set(key, current)
  }
  for (const row of consumption) {
    const key = materialKey(row.siteId, row.productLabel, row.unit)
    const current = balances.get(key) ?? { ...row, siteName: '', onHand: 0, onOrder: 0, consumed: 0, available: 0 }
    current.consumed = quantity(current.consumed + row.consumed)
    balances.set(key, current)
  }
  return [...balances.values()].map(row => ({ ...row, available: quantity(row.onHand - row.consumed) }))
    .sort((a, b) => a.productLabel.localeCompare(b.productLabel, 'fr') || a.unit.localeCompare(b.unit, 'fr'))
}
