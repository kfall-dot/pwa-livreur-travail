/**
 * Points de livraison synchronisés depuis Livraison (dashboard :5175 / API :3001).
 * Source : GET /api/v1/dashboard/supermarkets?all=true
 */
export interface LivraisonSupermarketSeed {
  id: string
  name: string
  address: string
  contactPhone: string
  contactName?: string | null
  contactEmail?: string | null
  lat?: string | null
  lng?: string | null
  active: boolean
}

export const LIVRAISON_SUPERMARKETS: LivraisonSupermarketSeed[] = [
  {
    id: 'c2c87e01-a633-4f6c-899f-2faa65a5d2a9',
    name: 'AUCHAN',
    address: '123 AUCHAN ROAD',
    contactPhone: '+2250700430402',
    contactName: 'KOFFI',
    contactEmail: 'kfallet@gmail.COM',
    lat: '5.345',
    lng: '-3.986',
    active: true,
  },
  {
    id: 'feaeeb36-db4f-4074-974a-6c13a6494b0e',
    name: 'carrefour 7 decembre',
    address: '39 rue abdoulaye ouattara',
    contactPhone: '+2250908090677',
    contactName: 'koff',
    contactEmail: 'koff@carref.com',
    lat: '5.2810408',
    lng: '-3.9754669',
    active: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    name: 'Carrefour Abidjan Plateau',
    address: "Plateau, Abidjan, Côte d'Ivoire",
    contactPhone: '+2250700430402',
    contactName: 'Pierre Bernard',
    contactEmail: 'kfallet@hotmail.COM',
    lat: '5.2810979',
    lng: '-3.9761412',
    active: true,
  },
  {
    id: '51e249e6-a6c0-4a8d-bc8f-b32f8ca23391',
    name: 'CASINO',
    address: '123 RUE CASINO',
    contactPhone: '+2250700430402',
    contactName: 'KONÉ',
    contactEmail: 'kfallet@hotmail.COM',
    lat: '5.36',
    lng: '-4.0083',
    active: true,
  },
  {
    id: '0ccabb0d-bca4-416f-a2b9-ff91983a681a',
    name: 'IGA hamel',
    address: '1035 boulevard wilfried hamel, g1m 2r7',
    contactPhone: '+2250707618447',
    contactName: 'John',
    contactEmail: 'kfallet@gmail.com',
    lat: '46.808644',
    lng: '-71.25865',
    active: true,
  },
  {
    id: '8fb51b85-f161-418d-937a-1199139d315e',
    name: 'maxi /',
    address: '550 rue fleur-de-lys',
    contactPhone: '+2250707618447',
    contactName: 'yaya',
    contactEmail: 'kfallet@gmail.com',
    lat: '46.822497',
    lng: '-71.251877',
    active: true,
  },
  {
    id: 'f6a89147-be7b-4150-aa11-f30cb83adafc',
    name: 'Maxi. bouvier',
    address: '350 Rue Bouvier, quebec, quebec',
    contactPhone: '+14182650363',
    contactName: 'Fallet Koné',
    contactEmail: 'kfallet@gmail.com',
    lat: '46.8411634',
    lng: '-71.2705286',
    active: true,
  },
  {
    id: 'fe45ce1b-5c8d-4634-ae79-abfafe720523',
    name: 'Maxi RLev',
    address: '955 Boulevard René-Lévesque O, quebec, quebec, g1s 1t7',
    contactPhone: '+14182650363',
    contactName: 'pipo',
    contactEmail: 'kfallet@gmail.com',
    lat: '46.79636',
    lng: '-71.23995',
    active: true,
  },
  {
    id: '32457ebb-7343-4ff8-888d-0709daa75588',
    name: 'Métro laurier',
    address: '2450 Boul Laurier',
    contactPhone: '+14182650363',
    contactName: 'Fallet Koné',
    contactEmail: 'kfallet@gmail.com',
    lat: '46.7744424',
    lng: '-71.2798493',
    active: true,
  },
  {
    id: '930b513e-4be1-4f95-b892-f81138d3b627',
    name: 'Test Geocode Auto',
    address: '1230 Boulevard Hamel, Québec, QC, Canada',
    contactPhone: '+2250701234567',
    contactName: 'Responsable',
    contactEmail: 'responsable@test.local',
    lat: '48.6291545',
    lng: '-72.4325783',
    active: true,
  },
  {
    id: '130c7a03-7bdb-4a4c-bf45-d78f09595723',
    name: 'Test Point CI',
    address: 'Abidjan test',
    contactPhone: '+2250707618447',
    contactName: 'Responsable',
    contactEmail: 'kfallet@hotmail.COM',
    lat: '5.36',
    lng: '-4.0083',
    active: true,
  },
]
