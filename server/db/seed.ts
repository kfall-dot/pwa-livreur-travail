import bcrypt from 'bcryptjs'
import { inArray } from 'drizzle-orm'
import { db } from './index.js'
import { seedDefaultCompanyUnits } from './queries.js'
import { deliveryPoints, drivers, managerTasks, managers, products, DEMO_COMPANY_ID, companies, supermarkets, tours } from './schema.js'
import { LIVRAISON_SUPERMARKETS } from './livraisonSupermarkets.js'
import { seedBtpPilotData } from './seedBtpPilot.js'

import { localTodayIso, localYesterdayIso } from '../utils/dates.js'

function todayIso(): string {
  return localTodayIso()
}

function yesterdayIso(): string {
  return localYesterdayIso()
}

/**
 * Stable IDs used across the app and E2E tests.
 * Never change these constants — tests reference them.
 *
 * Téléphones / e-mail : surchargeables via env (pilote Netlify) pour qu’un
 * seed après wipe ne remette pas les valeurs démo.
 * - SEED_DRIVER_PHONE, SEED_DRIVER2_PHONE, SEED_MANAGER_EMAIL
 */
export const DEMO = {
  MANAGER_ID: 'mgr-demo-1',
  MANAGER_EMAIL: 'manager@demo.fr',
  DRIVER_ID: 'drv-demo-1',
  DRIVER_PHONE: '+2250701234567',
  DRIVER2_ID: 'drv-demo-2',
  /** Numéro pilote Aya — ne plus utiliser un faux +2250102030405. */
  DRIVER2_PHONE: '+2250700430402',
  TOUR_ID: 'tour-demo-today',
  TOUR2_ID: 'tour-demo-2-today',
  TOUR_YESTERDAY_ID: 'tour-demo-yesterday',
  DELIVERY_IDS: ['del-1', 'del-2', 'del-3', 'del-4'],
  DELIVERY2_IDS: ['del-k1', 'del-k2', 'del-k3'],
  TASK_IDS: [
    'task-demo-confirmed',
    'task-demo-partial',
    'task-demo-cancelled',
    'task-demo-missed',
    'task-demo-reassign',
  ],
  PRODUCT_IDS: ['prod-demo-1', 'prod-demo-2', 'prod-demo-3', 'prod-demo-4', 'prod-demo-5'],
} as const

function envOr(key: string, fallback: string): string {
  const v = process.env[key]?.trim()
  return v || fallback
}

function seedManagerEmail(): string {
  return envOr('SEED_MANAGER_EMAIL', DEMO.MANAGER_EMAIL)
}

function seedDriverPhone(): string {
  return envOr('SEED_DRIVER_PHONE', DEMO.DRIVER_PHONE)
}

function seedDriver2Phone(): string {
  return envOr('SEED_DRIVER2_PHONE', DEMO.DRIVER2_PHONE)
}

/** E2E (ALLOW_WIPE_USERS) : chemins seed plus rapides — timeout netlify dev = 30s. */
function isE2eWipeSeed(): boolean {
  return process.env.ALLOW_WIPE_USERS === 'true' || process.env.ALLOW_WIPE_USERS === '1'
}

function seedBcryptRounds(): number {
  return isE2eWipeSeed() ? 4 : 10
}

async function seedDemoManagerTasks(today: string, yesterday: string): Promise<void> {
  await db.delete(managerTasks).where(inArray(managerTasks.id, [...DEMO.TASK_IDS]))

  const tasks = [
    {
      id: 'task-demo-confirmed',
      type: 'delivery_confirmed' as const,
      deliveryId: 'del-1',
      title: 'Livraison confirmée — Carrefour City République',
      description:
        'Livraison complète validée par OTP. Livreur : Kouassi Livreur. ' +
        `Tournée du ${today}. Certificat : RCT-DEMO001. ` +
        'E-mails envoyés : gérant : manager@demo.fr.',
      payload: {
        deliveryId: 'del-1',
        receiptId: 'RCT-DEMO001',
        supermarketName: 'Carrefour City République',
        driverName: 'Kouassi Livreur',
        tourId: DEMO.TOUR_ID,
        tourDate: today,
        isPartial: false,
        isRejected: false,
        emailLine: 'E-mails envoyés : gérant : manager@demo.fr.',
      },
      relatedTourId: DEMO.TOUR_ID,
      relatedDriverId: DEMO.DRIVER_ID,
    },
    {
      id: 'task-demo-partial',
      type: 'partial_delivery' as const,
      deliveryId: 'del-2',
      title: 'Livraison partielle — Monoprix Bastille',
      description:
        `Livreur : Kouassi Livreur. Tournée du ${today}. Certificat : RCT-DEMO002.`,
      payload: {
        deliveryId: 'del-2',
        receiptId: 'RCT-DEMO002',
        supermarketName: 'Monoprix Bastille',
        driverName: 'Kouassi Livreur',
        tourId: DEMO.TOUR_ID,
        tourDate: today,
        refusedLines: [
          { productLabel: 'Tomates cerises', quantityExpected: 4, quantityRefused: 2, unit: 'carton' },
          { productLabel: 'Salade iceberg', quantityExpected: 10, quantityRefused: 1, unit: 'caisse' },
        ],
      },
      relatedTourId: DEMO.TOUR_ID,
      relatedDriverId: DEMO.DRIVER_ID,
    },
    {
      id: 'task-demo-cancelled',
      type: 'delivery_cancelled' as const,
      deliveryId: 'del-3',
      title: 'Livraison annulée — Chantier Résidence Les Lilas',
      description:
        `Tournée du ${today}. Livreur : Kouassi Livreur. ` +
        'Le livreur a annulé la livraison en cours : photos et déclaration effacées, statut « à démarrer ».',
      payload: {
        deliveryId: 'del-3',
        supermarketName: 'Chantier Résidence Les Lilas',
        driverName: 'Kouassi Livreur',
        tourId: DEMO.TOUR_ID,
        tourDate: today,
      },
      relatedTourId: DEMO.TOUR_ID,
      relatedDriverId: DEMO.DRIVER_ID,
    },
    {
      id: 'task-demo-missed',
      type: 'missed_delivery' as const,
      deliveryId: 'del-overdue',
      title: 'Livraison non effectuée — Lidl Express Montreuil',
      description:
        `Date prévue : ${yesterday}. Livreur : Kouassi Livreur. Statut : failed. ` +
        'La livraison n\'a pas été finalisée (aucune validation OTP).',
      payload: {
        deliveryId: 'del-overdue',
        supermarketName: 'Lidl Express Montreuil',
        driverName: 'Kouassi Livreur',
        tourId: DEMO.TOUR_YESTERDAY_ID,
        tourDate: yesterday,
        status: 'failed',
      },
      relatedTourId: DEMO.TOUR_YESTERDAY_ID,
      relatedDriverId: DEMO.DRIVER_ID,
    },
    {
      id: 'task-demo-reassign',
      type: 'reassign_tour' as const,
      deliveryId: null,
      title: `Réaffecter la tournée du ${today}`,
      description:
        `Le livreur Aya Livreur a été désactivé. La tournée du ${today} ` +
        '(3 arrêt(s)) doit être assignée à un autre livreur.',
      payload: {
        tourId: DEMO.TOUR2_ID,
        tourDate: today,
        previousDriverId: DEMO.DRIVER2_ID,
        previousDriverName: 'Aya Livreur',
        totalDeliveries: 3,
      },
      relatedTourId: DEMO.TOUR2_ID,
      relatedDriverId: DEMO.DRIVER2_ID,
    },
  ]

  await db.insert(managerTasks).values(
    tasks.map((task) => ({
      id: task.id,
      companyId: DEMO_COMPANY_ID,
      type: task.type,
      deliveryId: task.deliveryId,
      title: task.title,
      description: task.description,
      payload: task.payload,
      relatedTourId: task.relatedTourId,
      relatedDriverId: task.relatedDriverId,
      resolved: false,
    })),
  )
}

export async function seedDemoStopCatalog(): Promise<number> {
  const ayaPhone = seedDriver2Phone()
  const points = [
    {
      id: 'sm-demo-carrefour-republique',
      name: 'Carrefour City République',
      address: '45 Avenue de la République, 75011 Paris',
      contactPhone: ayaPhone,
      lat: '48.8920000',
      lng: '2.4120000',
    },
    {
      id: 'sm-demo-monoprix-bastille',
      name: 'Monoprix Bastille',
      address: '8 Place de la Bastille, 75004 Paris',
      contactPhone: ayaPhone,
      lat: '48.8750000',
      lng: '2.3580000',
    },
    {
      id: 'sm-demo-chantier-lilas',
      name: 'Chantier Résidence Les Lilas',
      address: '3 Rue des Lilas, 93260 Les Lilas',
      contactPhone: ayaPhone,
      lat: '48.8610000',
      lng: '2.3210000',
    },
    {
      id: 'sm-demo-lidl-montreuil',
      name: 'Lidl Express Montreuil',
      address: '22 Rue de Paris, 93100 Montreuil',
      contactPhone: ayaPhone,
      lat: '48.8480000',
      lng: '2.2950000',
    },
    {
      id: 'sm-demo-lidl-montreuil-retard',
      name: 'Lidl Express Montreuil (retard)',
      address: '22 Rue de Paris, 93100 Montreuil',
      contactPhone: ayaPhone,
      lat: '48.8480000',
      lng: '2.2950000',
    },
    {
      id: 'sm-demo-abidjan-centre',
      name: 'Supermarché Abidjan Centre',
      address: "Rue du Commerce, Plateau, Abidjan, Côte d'Ivoire",
      contactPhone: ayaPhone,
      lat: '5.3200000',
      lng: '-4.0160000',
    },
    {
      id: 'sm-demo-treichville',
      name: 'Marché de Treichville',
      address: "Avenue 21, Treichville, Abidjan, Côte d'Ivoire",
      contactPhone: ayaPhone,
      lat: '5.2971000',
      lng: '-4.0118000',
    },
    {
      id: 'sm-demo-yopougon',
      name: 'Entrepôt Yopougon',
      address: "Zone Industrielle, Yopougon, Abidjan, Côte d'Ivoire",
      contactPhone: ayaPhone,
      lat: '5.3670000',
      lng: '-4.0702000',
    },
  ]

  await db
    .insert(supermarkets)
    .values(points.map((point) => ({ ...point, companyId: DEMO_COMPANY_ID, active: true })))
    .onConflictDoNothing()
  return points.length
}

export async function seedLivraisonSupermarkets(): Promise<number> {
  await db
    .insert(supermarkets)
    .values(
      LIVRAISON_SUPERMARKETS.map((point) => ({
        id: point.id,
        companyId: DEMO_COMPANY_ID,
        name: point.name,
        address: point.address,
        contactPhone: point.contactPhone,
        contactName: point.contactName ?? null,
        contactEmail: point.contactEmail ?? null,
        lat: point.lat ?? null,
        lng: point.lng ?? null,
        active: point.active,
      })),
    )
    .onConflictDoNothing()
  return LIVRAISON_SUPERMARKETS.length
}

export async function seedDemoProducts(): Promise<number> {
  const catalog = [
    { id: 'prod-demo-1', label: 'Tomates cerises', unit: 'colis' as const, displayOrder: 1 },
    { id: 'prod-demo-2', label: 'Salade iceberg', unit: 'caisse' as const, displayOrder: 2 },
    { id: 'prod-demo-3', label: 'Œufs fermiers', unit: 'plateau' as const, displayOrder: 3 },
    { id: 'prod-demo-4', label: 'Pommes de terre', unit: 'kg' as const, displayOrder: 4 },
    { id: 'prod-demo-5', label: 'Palettes mixtes', unit: 'palette' as const, displayOrder: 5 },
  ]

  if (isE2eWipeSeed()) {
    await db.delete(products).where(inArray(products.id, [...DEMO.PRODUCT_IDS]))
    await db
      .insert(products)
      .values(catalog.map((item) => ({ ...item, companyId: DEMO_COMPANY_ID, active: true })))
  } else {
    for (const item of catalog) {
      await db
        .insert(products)
        .values({ ...item, companyId: DEMO_COMPANY_ID, active: true })
        .onConflictDoUpdate({
          target: products.id,
          set: {
            companyId: DEMO_COMPANY_ID,
            label: item.label,
            unit: item.unit,
            displayOrder: item.displayOrder,
            active: true,
          },
        })
    }
  }

  return catalog.length
}

export async function seedDemoData(): Promise<{ driverId: string; tourId: string; tasksSeeded: number; supermarketsSeeded: number; productsSeeded: number; btpPilot: Awaited<ReturnType<typeof seedBtpPilotData>> }> {
  const today = todayIso()
  const yesterday = yesterdayIso()
  const rounds = seedBcryptRounds()
  const pinHash = await bcrypt.hash(process.env.DRIVER_PIN ?? '1234', rounds)
  const managerPasswordHash = await bcrypt.hash(process.env.MANAGER_PASSWORD ?? 'admin1234', rounds)

  await db
    .insert(companies)
    .values({ id: DEMO_COMPANY_ID, name: 'Entreprise Démo', slug: 'demo', status: 'active' })
    .onConflictDoNothing()

  await seedDefaultCompanyUnits(DEMO_COMPANY_ID)

  const managerEmail = seedManagerEmail()
  const managerConflictSet: {
    passwordHash: string
    name: string
    email?: string
    companyId: string
    role: 'admin'
  } = { passwordHash: managerPasswordHash, name: 'Admin Démo', companyId: DEMO_COMPANY_ID, role: 'admin' }
  // Si SEED_MANAGER_EMAIL est défini (pilote), réaligner l’e-mail à chaque seed.
  if (process.env.SEED_MANAGER_EMAIL?.trim()) {
    managerConflictSet.email = managerEmail
  }

  await db
    .insert(managers)
    .values({
      id: DEMO.MANAGER_ID,
      companyId: DEMO_COMPANY_ID,
      email: managerEmail,
      passwordHash: managerPasswordHash,
      name: 'Admin Démo',
      role: 'admin',
    })
    .onConflictDoUpdate({
      target: managers.id,
      set: managerConflictSet,
    })

  await db
    .insert(drivers)
    .values({
      id: DEMO.DRIVER_ID,
      companyId: DEMO_COMPANY_ID,
      phone: seedDriverPhone(),
      pinHash,
      name: 'Kouassi Livreur',
      status: 'active',
    })
    .onConflictDoUpdate({
      target: drivers.id,
      // Ne pas écraser phone : conserve le numéro saisi en pilote / manager.
      set: { companyId: DEMO_COMPANY_ID, name: 'Kouassi Livreur', status: 'active', pinHash },
    })

  await db
    .insert(drivers)
    .values({
      id: DEMO.DRIVER2_ID,
      companyId: DEMO_COMPANY_ID,
      phone: seedDriver2Phone(),
      pinHash,
      name: 'Aya Livreur',
      status: 'active',
    })
    .onConflictDoUpdate({
      target: drivers.id,
      // Ne pas écraser phone (Aya / pilote) — le seed ne doit plus le réécrire.
      set: { companyId: DEMO_COMPANY_ID, name: 'Aya Livreur', status: 'active', pinHash },
    })

  await db
    .insert(tours)
    .values({
      id: DEMO.TOUR_ID,
      companyId: DEMO_COMPANY_ID,
      driverId: DEMO.DRIVER_ID,
      date: today,
      depotName: 'Entrepôt Nord',
      depotAddress: '12 Rue des Logistiques, 93000 Bobigny',
      depotLat: '48.9102000',
      depotLng: '2.4395000',
      optimizationScore: 87,
    })
    .onConflictDoUpdate({
      target: tours.id,
      set: {
        companyId: DEMO_COMPANY_ID,
        date: today,
        driverId: DEMO.DRIVER_ID,
        depotName: 'Entrepôt Nord',
        depotAddress: '12 Rue des Logistiques, 93000 Bobigny',
      },
    })

  await db
    .insert(tours)
    .values({
      id: DEMO.TOUR_YESTERDAY_ID,
      companyId: DEMO_COMPANY_ID,
      driverId: DEMO.DRIVER_ID,
      date: yesterday,
      depotName: 'Entrepôt Nord',
      depotAddress: '12 Rue des Logistiques, 93000 Bobigny',
      depotLat: '48.9102000',
      depotLng: '2.4395000',
      optimizationScore: 80,
    })
    .onConflictDoUpdate({
      target: tours.id,
      set: { companyId: DEMO_COMPANY_ID, date: yesterday },
    })

  // Catalogue avant les arrêts — chaque arrêt référence un supermarketId
  await seedDemoStopCatalog()
  await seedLivraisonSupermarkets()

  const ayaPhone = seedDriver2Phone()
  const stops = [
    {
      id: 'del-1',
      tourId: DEMO.TOUR_ID,
      sequence: 1,
      name: 'Carrefour City République',
      address: '45 Avenue de la République, 75011 Paris',
      instructions: 'Livraison quai arrière — sonner 2 fois',
      status: 'pending' as const,
      units: 3,
      unitType: 'palette' as const,
      weightKg: '120.00',
      orderRef: 'CMD-2026-8841',
      distanceFromPrevM: 4200,
      timeWindowStart: '08:00',
      timeWindowEnd: '10:00',
      estimatedArrival: '08:45',
      lat: '48.8920000',
      lng: '2.4120000',
      contactPhone: ayaPhone,
      requiredPhotos: 1,
      supermarketId: 'sm-demo-carrefour-republique',
      products: [
        { label: 'Palettes œufs', qty: 2, unit: 'palette' },
        { label: "Jus d'orange", qty: 1, unit: 'caisse' },
      ],
    },
    {
      id: 'del-2',
      tourId: DEMO.TOUR_ID,
      sequence: 2,
      name: 'Monoprix Bastille',
      address: '8 Place de la Bastille, 75004 Paris',
      status: 'pending' as const,
      units: 4,
      unitType: 'caisse' as const,
      weightKg: '85.00',
      orderRef: 'CMD-2026-8842',
      distanceFromPrevM: 2100,
      timeWindowStart: '10:00',
      timeWindowEnd: '12:00',
      estimatedArrival: '10:30',
      lat: '48.8750000',
      lng: '2.3580000',
      requiredPhotos: 2,
      supermarketId: 'sm-demo-monoprix-bastille',
      products: [{ label: 'Salade iceberg', qty: 4, unit: 'caisse' }],
    },
    {
      id: 'del-3',
      tourId: DEMO.TOUR_ID,
      sequence: 3,
      name: 'Chantier Résidence Les Lilas',
      address: '3 Rue des Lilas, 93260 Les Lilas',
      instructions: 'Accès par portail chantier — badge requis',
      status: 'pending' as const,
      units: 5,
      unitType: 'sac' as const,
      weightKg: '150.00',
      orderRef: 'CMD-2026-8843',
      distanceFromPrevM: 3800,
      timeWindowStart: '12:00',
      timeWindowEnd: '14:00',
      estimatedArrival: '12:15',
      lat: '48.8610000',
      lng: '2.3210000',
      requiredPhotos: 3,
      supermarketId: 'sm-demo-chantier-lilas',
    },
    {
      id: 'del-4',
      tourId: DEMO.TOUR_ID,
      sequence: 4,
      name: 'Lidl Express Montreuil',
      address: '22 Rue de Paris, 93100 Montreuil',
      status: 'pending' as const,
      units: 2,
      unitType: 'colis' as const,
      weightKg: '73.00',
      orderRef: 'CMD-2026-8844',
      distanceFromPrevM: 1900,
      timeWindowStart: '14:00',
      timeWindowEnd: '16:00',
      estimatedArrival: '14:40',
      lat: '48.8480000',
      lng: '2.2950000',
      requiredPhotos: 1,
      supermarketId: 'sm-demo-lidl-montreuil',
    },
    {
      id: 'del-overdue',
      tourId: DEMO.TOUR_YESTERDAY_ID,
      sequence: 1,
      name: 'Lidl Express Montreuil (retard)',
      address: '22 Rue de Paris, 93100 Montreuil',
      status: 'failed' as const,
      units: 2,
      unitType: 'colis' as const,
      weightKg: '73.00',
      orderRef: 'CMD-2026-8800',
      distanceFromPrevM: 0,
      timeWindowStart: '14:00',
      timeWindowEnd: '16:00',
      estimatedArrival: '14:40',
      lat: '48.8480000',
      lng: '2.2950000',
      requiredPhotos: 1,
      supermarketId: 'sm-demo-lidl-montreuil-retard',
    },
  ]

  if (isE2eWipeSeed()) {
    await db.delete(deliveryPoints).where(inArray(deliveryPoints.id, stops.map((s) => s.id)))
    await db.insert(deliveryPoints).values(stops)
  } else {
    for (const stop of stops) {
      await db
        .insert(deliveryPoints)
        .values(stop)
        .onConflictDoUpdate({
          target: deliveryPoints.id,
          set: {
            tourId: stop.tourId,
            status: stop.status,
            name: stop.name,
            address: stop.address,
            supermarketId: stop.supermarketId,
            // Ne pas écraser contactPhone (OTP) modifié en pilote.
          },
        })
    }
  }

  // ─── Tournée de Kouassi ────────────────────────────────────────────────────
  await db
    .insert(tours)
    .values({
      id: DEMO.TOUR2_ID,
      companyId: DEMO_COMPANY_ID,
      driverId: DEMO.DRIVER2_ID,
      date: today,
      depotName: 'Entrepôt Sud',
      depotAddress: '8 Avenue du Port, 01000 Bourg-en-Bresse',
      depotLat: '5.3545000',
      depotLng: '-4.0015000',
      optimizationScore: 82,
    })
    .onConflictDoUpdate({
      target: tours.id,
      set: { companyId: DEMO_COMPANY_ID, date: today, driverId: DEMO.DRIVER2_ID },
    })

  const stops2 = [
    {
      id: 'del-k1',
      tourId: DEMO.TOUR2_ID,
      sequence: 1,
      name: 'Supermarché Abidjan Centre',
      address: 'Rue du Commerce, Plateau, Abidjan, Côte d\'Ivoire',
      instructions: 'Entrée principale — demander le responsable réception',
      units: 6,
      unitType: 'caisse' as const,
      weightKg: '200.00',
      orderRef: 'CMD-2026-9001',
      distanceFromPrevM: 3100,
      timeWindowStart: '08:00',
      timeWindowEnd: '10:00',
      estimatedArrival: '08:30',
      lat: '5.3200000',
      lng: '-4.0160000',
      contactPhone: ayaPhone,
      requiredPhotos: 1,
      supermarketId: 'sm-demo-abidjan-centre',
      products: [
        { label: 'Salade iceberg', qty: 4, unit: 'caisse' },
        { label: 'Œufs fermiers', qty: 2, unit: 'plateau' },
      ],
    },
    {
      id: 'del-k2',
      tourId: DEMO.TOUR2_ID,
      sequence: 2,
      name: 'Marché de Treichville',
      address: 'Avenue 21, Treichville, Abidjan, Côte d\'Ivoire',
      units: 3,
      unitType: 'palette' as const,
      weightKg: '140.00',
      orderRef: 'CMD-2026-9002',
      distanceFromPrevM: 4500,
      timeWindowStart: '10:30',
      timeWindowEnd: '12:30',
      estimatedArrival: '11:00',
      lat: '5.2971000',
      lng: '-4.0118000',
      requiredPhotos: 1,
      supermarketId: 'sm-demo-treichville',
      products: [{ label: 'Palettes mixtes', qty: 3, unit: 'palette' }],
    },
    {
      id: 'del-k3',
      tourId: DEMO.TOUR2_ID,
      sequence: 3,
      name: 'Entrepôt Yopougon',
      address: 'Zone Industrielle, Yopougon, Abidjan, Côte d\'Ivoire',
      instructions: 'Portail automatique — code 4589',
      units: 8,
      unitType: 'palette' as const,
      weightKg: '95.00',
      orderRef: 'CMD-2026-9003',
      distanceFromPrevM: 7200,
      timeWindowStart: '13:00',
      timeWindowEnd: '15:00',
      estimatedArrival: '13:45',
      lat: '5.3670000',
      lng: '-4.0702000',
      requiredPhotos: 2,
      supermarketId: 'sm-demo-yopougon',
      products: [
        { label: 'Palettes mixtes', qty: 5, unit: 'palette' },
        { label: 'Salade iceberg', qty: 3, unit: 'caisse' },
      ],
    },
  ]

  if (isE2eWipeSeed()) {
    const stops2Rows = stops2.map(({ products: stopProducts, ...point }) => ({
      ...point,
      products: stopProducts,
    }))
    await db.delete(deliveryPoints).where(inArray(deliveryPoints.id, stops2Rows.map((s) => s.id)))
    await db.insert(deliveryPoints).values(stops2Rows)
  } else {
    for (const stop of stops2) {
      const { products: stopProducts, ...point } = stop
      await db
        .insert(deliveryPoints)
        .values({ ...point, products: stopProducts })
        .onConflictDoUpdate({
          target: deliveryPoints.id,
          set: {
            tourId: DEMO.TOUR2_ID,
            status: 'pending',
            name: point.name,
            address: point.address,
            supermarketId: point.supermarketId,
            units: point.units,
            unitType: point.unitType,
            weightKg: point.weightKg,
            products: stopProducts,
          },
        })
    }
  }

  await seedDemoManagerTasks(today, yesterday)
  const productsSeeded = await seedDemoProducts()
  const btpPilot = await seedBtpPilotData()
  // Catalogues déjà seedés avant les arrêts
  const demoCatalogSeeded = 8
  const livraisonSeeded = LIVRAISON_SUPERMARKETS.length

  return {
    driverId: DEMO.DRIVER_ID,
    tourId: DEMO.TOUR_ID,
    tasksSeeded: DEMO.TASK_IDS.length,
    supermarketsSeeded: demoCatalogSeeded + livraisonSeeded,
    productsSeeded,
    btpPilot,
  }
}

/** Prépare tournées + livraisons co-demo (idempotent) — appelé à l’entrée /demo/*. */
let ensureDemoPromise: Promise<void> | null = null

export async function ensureDemoEnvironment(): Promise<void> {
  if (!ensureDemoPromise) {
    ensureDemoPromise = seedDemoData()
      .then(() => undefined)
      .finally(() => {
        ensureDemoPromise = null
      })
  }
  await ensureDemoPromise
}

export { BTP_DEMO, seedBtpPilotData } from './seedBtpPilot.js'

