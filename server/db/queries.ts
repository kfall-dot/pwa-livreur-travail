import { and, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { localTodayIso } from '../utils/dates.js'
import {
  countDriverVisibleStops as countVisibleStops,
  mergeDriverStopsForDay as mergeDayStops,
} from '../lib/driverDayStops.js'
import { db } from './index.js'
import {
  certificates,
  companies,
  declarations,
  deliveryPoints,
  drivers,
  managerTasks,
  managers,
  managerInvites,
  managerPasswordResets,
  otps,
  photoHashes,
  products,
  companyUnits,
  sessions,
  securityAuditEvents,
  DEMO_COMPANY_ID,
  supermarkets,
  tours,
  ebParseRuns,
  whatsappMessages,
  purchaseRequestLines,
  approvalSteps,
  purchaseOrders,
  treasuryOrders,
  purchaseRequests,
  purchaseRequestDrafts,
  documentTemplates,
  suppliers,
  sites,
  type Certificate,
  type Company,
  type Declaration,
  type DeliveryPoint,
  type Driver,
  type Manager,
  type ManagerInvite,
  type ManagerRole,
  type ManagerTask,
  type Product,
  type CompanyUnit,
  type Session,
  type Supermarket,
  type Tour,
} from './schema.js'

import { formatTimeHHMM, stopPayloadDiffersFromExisting } from './stopPayloadCompare.js'
import { DEFAULT_COMPANY_UNITS } from '../../shared/defaultUnits.js'
import { catalogUnitFromEb } from '../../shared/ebCatalog.js'

export { formatTimeHHMM, stopPayloadDiffersFromExisting }

/**
 * `db` ou une transaction Drizzle. Permet aux fonctions d'écriture de participer
 * à une transaction (atomicité) tout en restant appelables directement.
 */
type DbExecutor = Pick<typeof db, 'insert' | 'update' | 'delete' | 'select'>

/** Exécute une séquence d'écritures dans une transaction (rollback si erreur). */
export function runInTransaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return db.transaction((tx) => fn(tx))
}

// ─── Drivers ──────────────────────────────────────────────────────────────────

export async function getDriverByPhone(phone: string): Promise<Driver | null> {
  const [row] = await db.select().from(drivers).where(eq(drivers.phone, phone)).limit(1)
  return row ?? null
}

export async function getDriversByPhone(phone: string): Promise<Driver[]> {
  return db.select().from(drivers).where(eq(drivers.phone, phone))
}

/** Dev local : lève l’unicité globale du téléphone pour pouvoir recréer un livreur de test. */
export async function relaxDriversPhoneUniqueForDev(): Promise<void> {
  try {
    await db.execute(sql`ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_phone_key`)
  } catch {
    /* contrainte déjà absente */
  }
  try {
    await db.execute(sql`DROP INDEX IF EXISTS drivers_phone_key`)
  } catch {
    /* index déjà absent */
  }
}

export async function getDriverById(id: string): Promise<Driver | null> {
  const [row] = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1)
  return row ?? null
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(
  driverId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date
): Promise<void> {
  await db.insert(sessions).values({ id: randomUUID(), driverId, accessToken, refreshToken, expiresAt })
}

export async function getSessionByRefreshToken(refreshToken: string): Promise<Session | null> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.refreshToken, refreshToken))
    .limit(1)
  return row ?? null
}

export async function rotateSession(
  oldRefreshToken: string,
  newAccessToken: string,
  newRefreshToken: string,
  newExpiresAt: Date
): Promise<Session | null> {
  const [row] = await db
    .update(sessions)
    .set({ accessToken: newAccessToken, refreshToken: newRefreshToken, expiresAt: newExpiresAt })
    .where(eq(sessions.refreshToken, oldRefreshToken))
    .returning()
  return row ?? null
}

// ─── Tours ────────────────────────────────────────────────────────────────────

export async function getFirstTourByDriverAndDate(driverId: string, date: string): Promise<Tour | null> {
  const [row] = await db
    .select()
    .from(tours)
    .where(and(eq(tours.driverId, driverId), eq(tours.date, date)))
    .orderBy(tours.createdAt, tours.id)
    .limit(1)
  return row ?? null
}

export async function getToursByDriverAndDate(driverId: string, date: string): Promise<Tour[]> {
  return db
    .select()
    .from(tours)
    .where(and(eq(tours.driverId, driverId), eq(tours.date, date)))
    .orderBy(tours.createdAt, tours.id)
}

async function attachDeclarationMeta<T extends { id: string }>(
  stops: T[]
): Promise<Array<T & { declarationOutcome: string | null; declarationLines: unknown }>> {
  if (stops.length === 0) return []
  const ids = stops.map((s) => s.id)
  const declRows = await db
    .select({
      deliveryId: declarations.deliveryId,
      outcome: declarations.outcome,
      lines: declarations.lines,
    })
    .from(declarations)
    .where(inArray(declarations.deliveryId, ids))
  const byId = new Map(
    declRows.map((d) => [d.deliveryId, { outcome: d.outcome, lines: d.lines } as const])
  )
  return stops.map((s) => {
    const decl = byId.get(s.id)
    return {
      ...s,
      declarationOutcome: decl?.outcome ?? null,
      declarationLines: decl?.lines ?? null,
    }
  })
}

/** Tous les arrêts du jour pour un livreur (plusieurs tournées fusionnées, hors failed). */
export async function getStopsForDriverOnDate(
  driverId: string,
  date: string
): Promise<{ tours: Tour[]; stops: DeliveryPoint[] }> {
  const tourList = await getToursByDriverAndDate(driverId, date)
  if (tourList.length === 0) return { tours: [], stops: [] }

  const rows = await db
    .select({ stop: deliveryPoints })
    .from(deliveryPoints)
    .innerJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .where(and(eq(tours.driverId, driverId), eq(tours.date, date)))
    .orderBy(tours.createdAt, deliveryPoints.sequence)

  const stops = mergeDayStops(rows.map(({ stop }) => stop))
  const stopsWithDecl = await attachDeclarationMeta(stops)
  return { tours: tourList, stops: stopsWithDecl }
}

export async function getTourById(id: string): Promise<Tour | null> {
  const [row] = await db.select().from(tours).where(eq(tours.id, id)).limit(1)
  return row ?? null
}

export async function getStopsForTour(tourId: string): Promise<DeliveryPoint[]> {
  return db
    .select()
    .from(deliveryPoints)
    .where(eq(deliveryPoints.tourId, tourId))
    .orderBy(deliveryPoints.sequence)
}

export async function getTourWithStops(
  tourId: string
): Promise<{
  tour: Tour & { driverName: string; driverPhone: string }
  stops: Array<
    DeliveryPoint & {
      declarationOutcome: string | null
      declarationLines: unknown
      declaredAt: Date | null
    }
  >
} | null> {
  const [row] = await db
    .select({
      tour: tours,
      driverName: drivers.name,
      driverPhone: drivers.phone,
    })
    .from(tours)
    .innerJoin(drivers, eq(tours.driverId, drivers.id))
    .where(eq(tours.id, tourId))
    .limit(1)
  if (!row) return null
  const stops = await getStopsForTour(tourId)
  const declByDelivery = await getDeclarationsByDeliveryIds(stops.map((s) => s.id))
  const enriched = stops.map((stop) => {
    const decl = declByDelivery.get(stop.id)
    return {
      ...stop,
      timeWindowStart: formatTimeHHMM(stop.timeWindowStart) || null,
      timeWindowEnd: formatTimeHHMM(stop.timeWindowEnd) || null,
      declarationOutcome: decl?.outcome ?? null,
      declarationLines: decl?.lines ?? null,
      declaredAt: decl?.declaredAt ?? null,
    }
  })
  return { tour: { ...row.tour, driverName: row.driverName, driverPhone: row.driverPhone }, stops: enriched }
}

export async function updateTourMeta(
  tourId: string,
  data: Partial<Pick<Tour, 'driverId' | 'date' | 'depotName' | 'depotAddress' | 'depotLat' | 'depotLng'>>
): Promise<void> {
  await db.update(tours).set(data).where(eq(tours.id, tourId))
}

export type ExpectedProduct = { label: string; qty: number; unit: string }

export async function upsertDeliveryPoint(point: {
  id: string
  tourId: string
  sequence: number
  name: string
  address: string
  instructions?: string
  units: number
  unitType: DeliveryPoint['unitType']
  weightKg: string
  orderRef: string
  contactPhone?: string
  timeWindowStart?: string
  timeWindowEnd?: string
  requiredPhotos: number
  lat: string
  lng: string
  supermarketId?: string | null
  products?: ExpectedProduct[] | null
}): Promise<void> {
  await db
    .insert(deliveryPoints)
    .values({ ...point, distanceFromPrevM: 0 })
    .onConflictDoUpdate({
      target: deliveryPoints.id,
      set: {
        sequence: point.sequence,
        name: point.name,
        address: point.address,
        instructions: point.instructions,
        units: point.units,
        unitType: point.unitType,
        weightKg: point.weightKg,
        orderRef: point.orderRef,
        contactPhone: point.contactPhone,
        timeWindowStart: point.timeWindowStart,
        timeWindowEnd: point.timeWindowEnd,
        requiredPhotos: point.requiredPhotos,
        lat: point.lat,
        lng: point.lng,
        supermarketId: point.supermarketId ?? null,
        products: point.products ?? null,
      },
    })
}

export async function deleteDeliveryPoints(tourId: string, keepIds: string[]): Promise<void> {
  const allStops = await getStopsForTour(tourId)
  const toDelete = allStops.filter((s) => !keepIds.includes(s.id) && s.status !== 'delivered')
  for (const s of toDelete) {
    await db.delete(deliveryPoints).where(eq(deliveryPoints.id, s.id))
  }
}

export async function updateDeliveryPointSequence(id: string, sequence: number): Promise<void> {
  await db.update(deliveryPoints).set({ sequence }).where(eq(deliveryPoints.id, id))
}

export function parseExpectedProducts(raw: unknown): ExpectedProduct[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => ({
      label: String(p.label ?? '').trim(),
      qty: Number(p.qty ?? 1),
      unit: String(p.unit ?? 'colis'),
    }))
    .filter((p) => p.label)
}

export type ExpectedDeclarationLine = {
  productLabel: string
  unit: string
  quantityExpected: number
  justification: string
}

/** Lignes attendues pour la déclaration livreur (une entrée par produit planifié). */
export function expectedDeclarationLinesFromStop(
  stop: Pick<DeliveryPoint, 'products' | 'unitType' | 'units'>
): ExpectedDeclarationLine[] {
  const products = parseExpectedProducts(stop.products)
  if (products && products.length > 0) {
    return products.map((p) => ({
      productLabel: p.label,
      unit: p.unit,
      quantityExpected: p.qty,
      justification: '',
    }))
  }
  return [
    {
      productLabel: 'Produit commandé',
      unit: stop.unitType,
      quantityExpected: stop.units,
      justification: '',
    },
  ]
}

function countDriverVisibleStops(
  _toursMeta: Array<{ id: string; createdAt: Date }>,
  stops: DeliveryPoint[]
): number {
  return countVisibleStops(stops)
}

export async function getScheduleDays(
  driverId: string,
  from: string,
  to: string
): Promise<{ date: string; count: number }[]> {
  const rows = await db
    .select({
      date: tours.date,
      tourId: tours.id,
      tourCreatedAt: tours.createdAt,
      stop: deliveryPoints,
    })
    .from(tours)
    .innerJoin(deliveryPoints, eq(deliveryPoints.tourId, tours.id))
    .where(
      and(eq(tours.driverId, driverId), gte(tours.date, from), lte(tours.date, to))
    )
    .orderBy(tours.date, tours.createdAt, tours.id, deliveryPoints.sequence)

  type DayBucket = { tours: Array<{ id: string; createdAt: Date }>; stops: DeliveryPoint[] }
  const byDate = new Map<string, DayBucket>()

  for (const row of rows) {
    let bucket = byDate.get(row.date)
    if (!bucket) {
      bucket = { tours: [], stops: [] }
      byDate.set(row.date, bucket)
    }
    if (!bucket.tours.some((t) => t.id === row.tourId)) {
      bucket.tours.push({ id: row.tourId, createdAt: row.tourCreatedAt })
    }
    bucket.stops.push(row.stop)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      count: countDriverVisibleStops(bucket.tours, bucket.stops),
    }))
}

// ─── DeliveryPoints ───────────────────────────────────────────────────────────

export interface StopWithTourDate extends DeliveryPoint {
  tourDate: string
}

export async function getStopWithTourDate(deliveryId: string): Promise<StopWithTourDate | null> {
  const [row] = await db
    .select({ stop: deliveryPoints, tourDate: tours.date })
    .from(deliveryPoints)
    .innerJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .where(eq(deliveryPoints.id, deliveryId))
    .limit(1)
  if (!row) return null
  return { ...row.stop, tourDate: row.tourDate }
}

export async function updateDeliveryStatus(
  id: string,
  patch: Partial<Pick<DeliveryPoint, 'status' | 'receiptId'>>,
  exec: DbExecutor = db,
): Promise<DeliveryPoint | null> {
  const [row] = await exec
    .update(deliveryPoints)
    .set(patch)
    .where(eq(deliveryPoints.id, id))
    .returning()
  return row ?? null
}

// ─── Photo hashes ─────────────────────────────────────────────────────────────

export async function checkAndAddPhotoHash(deliveryId: string, hash: string): Promise<boolean> {
  try {
    await db.insert(photoHashes).values({ hash, deliveryId })
    return true
  } catch {
    return false
  }
}

export async function getPhotoCount(deliveryId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(photoHashes)
    .where(eq(photoHashes.deliveryId, deliveryId))
  return Number(row?.count ?? 0)
}

export async function removePhotoHash(deliveryId: string, hash: string): Promise<void> {
  if (!hash) return
  await db
    .delete(photoHashes)
    .where(and(eq(photoHashes.deliveryId, deliveryId), eq(photoHashes.hash, hash)))
}

export async function clearPhotoHashes(deliveryId: string): Promise<void> {
  await db.delete(photoHashes).where(eq(photoHashes.deliveryId, deliveryId))
}

// ─── OTPs ─────────────────────────────────────────────────────────────────────

const OTP_TTL_MS = 10 * 60_000
export const MAX_OTP_ATTEMPTS = 5

export type OtpVerifyResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'expired' | 'invalid' | 'locked'; attemptsLeft?: number }

export async function setOtp(deliveryId: string, code: string): Promise<void> {
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  await db
    .insert(otps)
    .values({ deliveryId, code, expiresAt, attempts: 0 })
    .onConflictDoUpdate({
      target: otps.deliveryId,
      set: { code, expiresAt, attempts: 0 },
    })
}

export async function getOtpForDelivery(
  deliveryId: string,
): Promise<{ code: string; expiresAt: Date; attempts: number } | null> {
  const [otp] = await db.select().from(otps).where(eq(otps.deliveryId, deliveryId)).limit(1)
  if (!otp) return null
  return { code: otp.code, expiresAt: otp.expiresAt, attempts: otp.attempts }
}

export async function getDeliveryStopForCompany(
  deliveryId: string,
  companyId: string,
): Promise<StopWithTourDate | null> {
  const [row] = await db
    .select({ stop: deliveryPoints, tourDate: tours.date, tourCompanyId: tours.companyId })
    .from(deliveryPoints)
    .innerJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .where(and(eq(deliveryPoints.id, deliveryId), eq(tours.companyId, companyId)))
    .limit(1)
  if (!row) return null
  return { ...row.stop, tourDate: row.tourDate }
}

export async function verifyOtp(deliveryId: string, code: string): Promise<OtpVerifyResult> {
  const [otp] = await db.select().from(otps).where(eq(otps.deliveryId, deliveryId)).limit(1)
  if (!otp) return { ok: false, reason: 'missing' }
  if (otp.expiresAt < new Date()) return { ok: false, reason: 'expired' }
  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, reason: 'locked', attemptsLeft: 0 }
  }
  if (otp.code !== code) {
    const attempts = otp.attempts + 1
    await db.update(otps).set({ attempts }).where(eq(otps.deliveryId, deliveryId))
    if (attempts >= MAX_OTP_ATTEMPTS) {
      return { ok: false, reason: 'locked', attemptsLeft: 0 }
    }
    return { ok: false, reason: 'invalid', attemptsLeft: MAX_OTP_ATTEMPTS - attempts }
  }
  return { ok: true }
}

/** Marque les arrêts non livrés d'une tournée comme obsolètes après replanification. */
export async function supersedeNonDeliveredStopsFromTour(tourId: string): Promise<number> {
  const rows = await db
    .select({ id: deliveryPoints.id, status: deliveryPoints.status })
    .from(deliveryPoints)
    .where(eq(deliveryPoints.tourId, tourId))
  const toSupersede = rows.filter((r) => r.status !== 'delivered' && r.status !== 'failed')
  if (toSupersede.length === 0) return 0
  await db
    .update(deliveryPoints)
    .set({ status: 'failed' })
    .where(
      and(
        eq(deliveryPoints.tourId, tourId),
        inArray(
          deliveryPoints.id,
          toSupersede.map((r) => r.id)
        )
      )
    )
  return toSupersede.length
}

export async function clearOtp(deliveryId: string): Promise<void> {
  await db.delete(otps).where(eq(otps.deliveryId, deliveryId))
}

// ─── Declarations ─────────────────────────────────────────────────────────────

export async function setDeclaration(
  deliveryId: string,
  outcome: Declaration['outcome'],
  lines: unknown[]
): Promise<void> {
  await db
    .insert(declarations)
    .values({ deliveryId, outcome, lines })
    .onConflictDoUpdate({
      target: declarations.deliveryId,
      set: { outcome, lines, declaredAt: new Date() },
    })
}

export async function getDeclaration(deliveryId: string): Promise<Declaration | null> {
  const [row] = await db
    .select()
    .from(declarations)
    .where(eq(declarations.deliveryId, deliveryId))
    .limit(1)
  return row ?? null
}

/** Charge les déclarations de plusieurs livraisons en une requête (évite le N+1). */
export async function getDeclarationsByDeliveryIds(
  deliveryIds: string[],
): Promise<Map<string, Declaration>> {
  const map = new Map<string, Declaration>()
  if (deliveryIds.length === 0) return map
  const rows = await db
    .select()
    .from(declarations)
    .where(inArray(declarations.deliveryId, deliveryIds))
  for (const row of rows) {
    if (!map.has(row.deliveryId)) map.set(row.deliveryId, row)
  }
  return map
}

export async function clearDeclaration(deliveryId: string): Promise<void> {
  await db.delete(declarations).where(eq(declarations.deliveryId, deliveryId))
}

// ─── Certificates ─────────────────────────────────────────────────────────────

export async function saveCertificate(
  receiptId: string,
  deliveryId: string,
  certificateUrl: string,
  opts: { isPartial?: boolean; isRejected?: boolean; acceptedPalettes?: number } = {},
  exec: DbExecutor = db,
): Promise<void> {
  await exec.insert(certificates).values({
    receiptId,
    deliveryId,
    certificateUrl,
    isPartial: opts.isPartial ?? false,
    isRejected: opts.isRejected ?? false,
    acceptedPalettes: opts.acceptedPalettes,
  })
}

export async function getCertificate(receiptId: string): Promise<Certificate | null> {
  const [row] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.receiptId, receiptId))
    .limit(1)
  return row ?? null
}

// ─── Managers ─────────────────────────────────────────────────────────────────

export async function getManagerByEmail(email: string): Promise<Manager | null> {
  const [row] = await db.select().from(managers).where(eq(managers.email, email)).limit(1)
  return row ?? null
}

export async function getManagerById(id: string): Promise<Manager | null> {
  const [row] = await db.select().from(managers).where(eq(managers.id, id)).limit(1)
  return row ?? null
}

export async function upsertManager(
  id: string,
  email: string,
  passwordHash: string,
  name: string,
  companyId: string = DEMO_COMPANY_ID,
  role: ManagerRole = 'admin',
): Promise<void> {
  await db
    .insert(managers)
    .values({ id, email, passwordHash, name, companyId, role })
    .onConflictDoUpdate({ target: managers.id, set: { email, passwordHash, name, companyId, role } })
}

export async function setManagerTotp(
  id: string,
  totpSecret: string | null,
  totpEnabled: boolean,
): Promise<void> {
  await db
    .update(managers)
    .set({ totpSecret, totpEnabled })
    .where(eq(managers.id, id))
}

export async function getAllManagers(
  companyId: string,
): Promise<Array<Pick<Manager, 'id' | 'email' | 'name' | 'role' | 'createdAt'>>> {
  return db
    .select({
      id: managers.id,
      email: managers.email,
      name: managers.name,
      role: managers.role,
      createdAt: managers.createdAt,
    })
    .from(managers)
    .where(eq(managers.companyId, companyId))
    .orderBy(managers.name)
}

export async function createManager(
  id: string,
  email: string,
  passwordHash: string,
  name: string,
  companyId: string,
  role: ManagerRole = 'manager',
): Promise<Manager> {
  const [row] = await db
    .insert(managers)
    .values({
      id,
      email: email.trim().toLowerCase(),
      passwordHash,
      name: name.trim(),
      companyId,
      role,
    })
    .returning()
  return row!
}

export async function updateManager(
  id: string,
  data: Partial<Pick<Manager, 'name' | 'email' | 'passwordHash' | 'role'>>,
): Promise<Manager | null> {
  const set: Partial<Pick<Manager, 'name' | 'email' | 'passwordHash' | 'role'>> = {}
  if (data.name) set.name = data.name.trim()
  if (data.email) set.email = data.email.trim().toLowerCase()
  if (data.passwordHash) set.passwordHash = data.passwordHash
  if (data.role) set.role = data.role
  if (Object.keys(set).length === 0) return getManagerById(id)
  const [row] = await db.update(managers).set(set).where(eq(managers.id, id)).returning()
  return row ?? null
}

export async function deleteManager(id: string): Promise<boolean> {
  const rows = await db.delete(managers).where(eq(managers.id, id)).returning({ id: managers.id })
  return rows.length > 0
}

export async function countManagers(companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(managers)
    .where(eq(managers.companyId, companyId))
  return Number(row?.count ?? 0)
}

export async function countAdmins(companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(managers)
    .where(and(eq(managers.companyId, companyId), eq(managers.role, 'admin')))
  return Number(row?.count ?? 0)
}

export async function createManagerInvite(input: {
  id: string
  companyId: string
  email: string
  name: string
  tokenHash: string
  expiresAt: Date
  invitedBy: string
}): Promise<ManagerInvite> {
  const [row] = await db
    .insert(managerInvites)
    .values({
      id: input.id,
      companyId: input.companyId,
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      invitedBy: input.invitedBy,
    })
    .returning()
  return row!
}

export async function getPendingManagerInvites(
  companyId: string,
): Promise<Array<Pick<ManagerInvite, 'id' | 'email' | 'name' | 'expiresAt' | 'createdAt'>>> {
  return db
    .select({
      id: managerInvites.id,
      email: managerInvites.email,
      name: managerInvites.name,
      expiresAt: managerInvites.expiresAt,
      createdAt: managerInvites.createdAt,
    })
    .from(managerInvites)
    .where(and(eq(managerInvites.companyId, companyId), sql`${managerInvites.acceptedAt} IS NULL`))
    .orderBy(desc(managerInvites.createdAt))
}

export async function getManagerInviteByTokenHash(tokenHash: string): Promise<ManagerInvite | null> {
  const [row] = await db
    .select()
    .from(managerInvites)
    .where(and(eq(managerInvites.tokenHash, tokenHash), sql`${managerInvites.acceptedAt} IS NULL`))
    .limit(1)
  return row ?? null
}

export async function getManagerInviteById(id: string): Promise<ManagerInvite | null> {
  const [row] = await db.select().from(managerInvites).where(eq(managerInvites.id, id)).limit(1)
  return row ?? null
}

export async function markManagerInviteAccepted(id: string): Promise<void> {
  await db
    .update(managerInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(managerInvites.id, id))
}

export async function deleteManagerInvite(id: string, companyId: string): Promise<boolean> {
  const rows = await db
    .delete(managerInvites)
    .where(and(eq(managerInvites.id, id), eq(managerInvites.companyId, companyId)))
    .returning({ id: managerInvites.id })
  return rows.length > 0
}

export async function createManagerPasswordReset(input: {
  id: string
  managerId: string
  tokenHash: string
  expiresAt: Date
}): Promise<void> {
  await db.insert(managerPasswordResets).values({
    id: input.id,
    managerId: input.managerId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
  })
}

export async function getManagerPasswordResetByTokenHash(
  tokenHash: string,
): Promise<{ id: string; managerId: string; expiresAt: Date } | null> {
  const [row] = await db
    .select({
      id: managerPasswordResets.id,
      managerId: managerPasswordResets.managerId,
      expiresAt: managerPasswordResets.expiresAt,
    })
    .from(managerPasswordResets)
    .where(and(eq(managerPasswordResets.tokenHash, tokenHash), sql`${managerPasswordResets.usedAt} IS NULL`))
    .limit(1)
  return row ?? null
}

export async function markManagerPasswordResetUsed(id: string): Promise<void> {
  await db.update(managerPasswordResets).set({ usedAt: new Date() }).where(eq(managerPasswordResets.id, id))
}

export async function ensureDemoCompany(): Promise<void> {
  await db
    .insert(companies)
    .values({ id: DEMO_COMPANY_ID, name: 'Entreprise Démo', slug: 'demo', status: 'active' })
    .onConflictDoNothing()
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const [row] = await db.select().from(companies).where(eq(companies.slug, slug)).limit(1)
  return row ?? null
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const [row] = await db.select().from(companies).where(eq(companies.id, id)).limit(1)
  return row ?? null
}

export async function createCompanyWithManager(input: {
  companyId: string
  companyName: string
  slug: string
  managerId: string
  managerName: string
  email: string
  passwordHash: string
}): Promise<{ company: Company; manager: Manager }> {
  return db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        id: input.companyId,
        name: input.companyName,
        slug: input.slug,
        status: 'active',
      })
      .returning()
    const [manager] = await tx
      .insert(managers)
      .values({
        id: input.managerId,
        companyId: input.companyId,
        email: input.email,
        passwordHash: input.passwordHash,
        name: input.managerName,
        role: 'admin',
      })
      .returning()
    return { company: company!, manager: manager! }
  })
}

export async function getOpsSnapshot(): Promise<{
  companies: number
  managers: number
  drivers: number
  tours: number
  selfSignupAllowed: boolean
  allowSeed: boolean
  allowReset: boolean
}> {
  const [c] = await db.select({ count: count() }).from(companies)
  const [m] = await db.select({ count: count() }).from(managers)
  const [d] = await db.select({ count: count() }).from(drivers)
  const [t] = await db.select({ count: count() }).from(tours)
  return {
    companies: Number(c?.count ?? 0),
    managers: Number(m?.count ?? 0),
    drivers: Number(d?.count ?? 0),
    tours: Number(t?.count ?? 0),
    selfSignupAllowed:
      process.env.ALLOW_SELF_SIGNUP === 'true' || process.env.ALLOW_SELF_SIGNUP === '1',
    allowSeed: process.env.ALLOW_SEED === 'true',
    allowReset: process.env.ALLOW_RESET === 'true',
  }
}

/**
 * Supprime une tournée et ses arrêts.
 * Refuse si un arrêt est déjà livré (traçabilité / certificats).
 */
export async function deleteTourIfNoDeliveries(
  tourId: string
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'has_delivered' }> {
  return db.transaction(async (tx) => {
    const [tour] = await tx.select().from(tours).where(eq(tours.id, tourId)).limit(1)
    if (!tour) return { ok: false, reason: 'not_found' as const }

    const stops = await tx
      .select({ id: deliveryPoints.id, status: deliveryPoints.status })
      .from(deliveryPoints)
      .where(eq(deliveryPoints.tourId, tourId))
    if (stops.some((s) => s.status === 'delivered')) {
      return { ok: false, reason: 'has_delivered' as const }
    }

    const stopIds = stops.map((s) => s.id)
    if (stopIds.length > 0) {
      await tx.delete(otps).where(inArray(otps.deliveryId, stopIds))
      await tx.delete(declarations).where(inArray(declarations.deliveryId, stopIds))
      await tx.delete(certificates).where(inArray(certificates.deliveryId, stopIds))
      await tx.delete(photoHashes).where(inArray(photoHashes.deliveryId, stopIds))
      await tx.delete(managerTasks).where(inArray(managerTasks.deliveryId, stopIds))
    }
    await tx.delete(managerTasks).where(eq(managerTasks.relatedTourId, tourId))
    const linkedPos = await tx
      .select({ id: purchaseOrders.id, purchaseRequestId: purchaseOrders.purchaseRequestId })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.tourId, tourId))
    if (linkedPos.length > 0) {
      await tx.update(purchaseOrders).set({ tourId: null }).where(eq(purchaseOrders.tourId, tourId))
      const requestIds = [...new Set(linkedPos.map((p) => p.purchaseRequestId))]
      await tx
        .update(purchaseRequests)
        .set({ status: 'po_ready', updatedAt: new Date() })
        .where(
          and(inArray(purchaseRequests.id, requestIds), eq(purchaseRequests.status, 'delivery_scheduled')),
        )
    }
    if (stopIds.length > 0) {
      await tx.delete(deliveryPoints).where(inArray(deliveryPoints.id, stopIds))
    }
    await tx.delete(tours).where(eq(tours.id, tourId))
    return { ok: true as const }
  })
}

// ─── Dashboard queries ─────────────────────────────────────────────────────────

export interface DashboardTourRow {
  tourId: string
  tourDate: string
  driverId: string
  driverName: string
  driverPhone: string
  depotName: string
  totalStops: number
  delivered: number
  inProgress: number
}

export async function getDashboardTours(date: string, companyId: string): Promise<DashboardTourRow[]> {
  const rows = await db
    .select({
      tourId: tours.id,
      tourDate: tours.date,
      driverId: drivers.id,
      driverName: drivers.name,
      driverPhone: drivers.phone,
      depotName: tours.depotName,
    })
    .from(tours)
    .innerJoin(drivers, eq(tours.driverId, drivers.id))
    .where(and(eq(tours.date, date), eq(tours.companyId, companyId)))

  const result: DashboardTourRow[] = []
  for (const row of rows) {
    const stops = await db
      .select({ status: deliveryPoints.status, cnt: count() })
      .from(deliveryPoints)
      .where(eq(deliveryPoints.tourId, row.tourId))
      .groupBy(deliveryPoints.status)
    const totalStops = stops.reduce((s, r) => s + Number(r.cnt), 0)
    const delivered = stops.find((r) => r.status === 'delivered')?.cnt ?? 0
    const inProgress = stops.find((r) => r.status === 'in_progress')?.cnt ?? 0
    result.push({ ...row, totalStops, delivered: Number(delivered), inProgress: Number(inProgress) })
  }
  return result
}

export async function getAllDrivers(companyId: string): Promise<Driver[]> {
  return db.select().from(drivers).where(eq(drivers.companyId, companyId)).orderBy(drivers.name)
}

export type TourUnitType = string

export interface CreateTourInput {
  companyId: string
  driverId: string
  date: string
  depotName: string
  depotAddress: string
  depotLat: string
  depotLng: string
  stops: Array<{
    name: string
    address: string
    instructions?: string
    units: number
    unitType: TourUnitType
    weightKg: string
    orderRef: string
    contactPhone?: string
    timeWindowStart?: string
    timeWindowEnd?: string
    requiredPhotos: number
    lat: string
    lng: string
    supermarketId?: string | null
    products?: ExpectedProduct[] | null
  }>
}

export async function createTourWithStops(input: CreateTourInput): Promise<{ tourId: string }> {
  const tourId = `tour-${randomUUID()}`
  await db.transaction(async (tx) => {
    await tx.insert(tours).values({
      id: tourId,
      companyId: input.companyId,
      driverId: input.driverId,
      date: input.date,
      depotName: input.depotName,
      depotAddress: input.depotAddress,
      depotLat: input.depotLat,
      depotLng: input.depotLng,
      optimizationScore: 0,
    })
    for (let i = 0; i < input.stops.length; i++) {
      const s = input.stops[i]!
      await tx.insert(deliveryPoints).values({
        id: `dp-${randomUUID()}`,
        tourId,
        sequence: i + 1,
        name: s.name,
        address: s.address,
        instructions: s.instructions,
        units: s.units,
        unitType: s.unitType,
        weightKg: s.weightKg,
        orderRef: s.orderRef,
        contactPhone: s.contactPhone,
        timeWindowStart: s.timeWindowStart,
        timeWindowEnd: s.timeWindowEnd,
        requiredPhotos: s.requiredPhotos,
        lat: s.lat,
        lng: s.lng,
        supermarketId: s.supermarketId ?? null,
        products: s.products ?? null,
        distanceFromPrevM: 0,
      })
    }
  })
  return { tourId }
}

export interface TourReplanTemplate {
  sourceTourId: string
  sourceDate: string
  driverId: string
  depotName: string
  depotAddress: string
  replanKind?: 'tour' | 'partial'
  partialSourceDeliveryId?: string
  stops: Array<{
    name: string
    address: string
    lat: string
    lng: string
    instructions: string
    orderRef: string
    contactPhone: string
    timeWindowStart: string
    timeWindowEnd: string
    requiredPhotos: string
    supermarketId?: string
    products: Array<{ label: string; qty: string; unit: string }>
  }>
}

export async function getTourReplanTemplate(tourId: string): Promise<TourReplanTemplate | null> {
  const data = await getTourWithStops(tourId)
  if (!data) return null

  const redo = data.stops.filter((s) => s.status !== 'delivered')
  return {
    sourceTourId: tourId,
    sourceDate: data.tour.date,
    driverId: data.tour.driverId,
    depotName: data.tour.depotName,
    depotAddress: data.tour.depotAddress,
    replanKind: 'tour',
    stops: redo.map((s) => ({
      name: s.name,
      address: s.address,
      lat: String(s.lat ?? '0'),
      lng: String(s.lng ?? '0'),
      instructions: s.instructions ?? '',
      orderRef: s.orderRef,
      contactPhone: s.contactPhone ?? '',
      timeWindowStart: s.timeWindowStart ?? '',
      timeWindowEnd: s.timeWindowEnd ?? '',
      requiredPhotos: String(s.requiredPhotos),
      supermarketId: s.supermarketId ?? undefined,
      products: Array.isArray(s.products)
        ? (s.products as ExpectedProduct[]).map((p) => ({
            label: p.label,
            qty: String(p.qty),
            unit: p.unit,
          }))
        : [],
    })),
  }
}

/** Pré-remplit une replanification du reliquat d'une livraison partielle ou refusée. */
export async function getPartialDeliveryReplanTemplate(
  deliveryId: string
): Promise<TourReplanTemplate | null> {
  const ctx = await getStopWithDriverContext(deliveryId)
  if (!ctx) return null

  const decl = await getDeclaration(deliveryId)
  if (!decl || (decl.outcome !== 'partial' && decl.outcome !== 'rejected')) return null

  const lines = mapDeclarationLinesForTask(Array.isArray(decl.lines) ? decl.lines : [])
  const refusedLines = lines.filter((l) => (l.quantityRefused || 0) > 0)
  const sourceLines = refusedLines.length > 0 ? refusedLines : lines

  const products = sourceLines
    .map((l) => {
      const qty = refusedLines.length > 0 ? l.quantityRefused || 0 : l.quantityExpected || 0
      return {
        label: l.productLabel,
        qty: String(qty > 0 ? qty : 1),
        unit: l.unit,
      }
    })
    .filter((p) => p.label.trim())

  if (products.length === 0) return null

  const tour = await getTourById(ctx.tourId)
  if (!tour) return null

  return {
    sourceTourId: ctx.tourId,
    sourceDate: ctx.tourDate,
    driverId: ctx.driverId,
    depotName: tour.depotName,
    depotAddress: tour.depotAddress,
    replanKind: 'partial',
    partialSourceDeliveryId: deliveryId,
    stops: [
      {
        name: ctx.name,
        address: ctx.address,
        lat: String(ctx.lat ?? '0'),
        lng: String(ctx.lng ?? '0'),
        instructions: ctx.instructions ?? '',
        orderRef: `${ctx.orderRef}-suite`,
        contactPhone: ctx.contactPhone ?? '',
        timeWindowStart: ctx.timeWindowStart ?? '',
        timeWindowEnd: ctx.timeWindowEnd ?? '',
        requiredPhotos: String(ctx.requiredPhotos),
        supermarketId: ctx.supermarketId ?? undefined,
        products,
      },
    ],
  }
}

// ─── Delivery detail ──────────────────────────────────────────────────────────

export interface DeliveryDetail {
  deliveryId: string
  deliveryName: string
  deliveryAddress: string
  instructions: string | null
  status: string
  units: number
  unitType: string
  weightKg: string
  orderRef: string
  contactPhone: string | null
  timeWindowStart: string | null
  timeWindowEnd: string | null
  requiredPhotos: number
  tourId: string
  tourDate: string
  driverId: string
  driverName: string
  driverPhone: string
  depotName: string
  // declaration
  declarationOutcome: string | null
  declarationLines: unknown
  declaredAt: Date | null
  // photo count
  photoCount: number
  receiptId: string | null
  // expected products
  products: { label: string; qty: number; unit: string }[] | null
  /** Historique assistance OTP gestionnaire (relai code / validation manuelle). */
  otpAssistTrail: OtpAssistTrailEvent[]
}

export interface OtpAssistTrailEvent {
  id: string
  action: 'delivery.otp.manager_resend' | 'delivery.otp.manager_bypass' | string
  at: string
  managerEmail: string | null
  managerName: string | null
  summary: string
  metadata: Record<string, unknown> | null
}

export async function getDeliveryDetail(
  deliveryId: string,
  companyId?: string,
): Promise<DeliveryDetail | null> {
  const [row] = await db
    .select({
      deliveryId: deliveryPoints.id,
      deliveryName: deliveryPoints.name,
      deliveryAddress: deliveryPoints.address,
      instructions: deliveryPoints.instructions,
      status: deliveryPoints.status,
      units: deliveryPoints.units,
      unitType: deliveryPoints.unitType,
      weightKg: deliveryPoints.weightKg,
      orderRef: deliveryPoints.orderRef,
      contactPhone: deliveryPoints.contactPhone,
      timeWindowStart: deliveryPoints.timeWindowStart,
      timeWindowEnd: deliveryPoints.timeWindowEnd,
      requiredPhotos: deliveryPoints.requiredPhotos,
      receiptId: deliveryPoints.receiptId,
      products: deliveryPoints.products,
      tourId: tours.id,
      tourDate: tours.date,
      driverId: drivers.id,
      driverName: drivers.name,
      driverPhone: drivers.phone,
      depotName: tours.depotName,
    })
    .from(deliveryPoints)
    .innerJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .innerJoin(drivers, eq(tours.driverId, drivers.id))
    .where(
      companyId
        ? and(eq(deliveryPoints.id, deliveryId), eq(tours.companyId, companyId))
        : eq(deliveryPoints.id, deliveryId),
    )
    .limit(1)

  if (!row) return null

  const [decl] = await db.select().from(declarations).where(eq(declarations.deliveryId, deliveryId)).limit(1)
  const [photoRow] = await db
    .select({ cnt: count() })
    .from(photoHashes)
    .where(eq(photoHashes.deliveryId, deliveryId))

  const products = Array.isArray(row.products)
    ? (row.products as { label: string; qty: number; unit: string }[])
    : null

  const otpAssistTrail = companyId
    ? await listDeliveryOtpAssistEvents(deliveryId, companyId)
    : []

  return {
    ...row,
    weightKg: String(row.weightKg),
    declarationOutcome: decl?.outcome ?? null,
    declarationLines: decl?.lines ?? null,
    declaredAt: decl?.declaredAt ?? null,
    photoCount: Number(photoRow?.cnt ?? 0),
    receiptId: row.receiptId ?? null,
    products,
    otpAssistTrail,
  }
}

export async function listDeliveryOtpAssistEvents(
  deliveryId: string,
  companyId: string,
): Promise<OtpAssistTrailEvent[]> {
  const rows = await db
    .select({
      id: securityAuditEvents.id,
      action: securityAuditEvents.action,
      metadata: securityAuditEvents.metadata,
      createdAt: securityAuditEvents.createdAt,
      actorId: securityAuditEvents.actorId,
      managerEmail: managers.email,
      managerName: managers.name,
    })
    .from(securityAuditEvents)
    .leftJoin(managers, eq(securityAuditEvents.actorId, managers.id))
    .where(
      and(
        eq(securityAuditEvents.companyId, companyId),
        inArray(securityAuditEvents.action, [
          'delivery.otp.manager_resend',
          'delivery.otp.manager_bypass',
        ]),
        sql`${securityAuditEvents.metadata}->>'deliveryId' = ${deliveryId}`,
      ),
    )
    .orderBy(desc(securityAuditEvents.createdAt))
    .limit(50)

  return rows.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>
    const email = r.managerEmail ?? (typeof meta.managerEmail === 'string' ? meta.managerEmail : null)
    const who = email || r.managerName || 'Gestionnaire'
    let summary: string
    if (r.action === 'delivery.otp.manager_bypass') {
      const reason = typeof meta.reason === 'string' ? meta.reason : ''
      summary = reason
        ? `Validation manuelle sans OTP par ${who} — ${reason}`
        : `Validation manuelle sans OTP par ${who}`
    } else {
      const smsTo = typeof meta.smsTo === 'string' ? meta.smsTo : ''
      const sent = meta.sent === true
      summary = smsTo
        ? `Code OTP fourni / renvoyé par ${who} (dest. ${smsTo}${sent ? '' : ', SMS non confirmé'})`
        : `Code OTP fourni / renvoyé par ${who}`
    }
    return {
      id: r.id,
      action: r.action,
      at: r.createdAt.toISOString(),
      managerEmail: email,
      managerName: r.managerName ?? null,
      summary,
      metadata: meta,
    }
  })
}

/** Trace métier visible dans Tâches : assistance OTP (relai code ou validation manuelle). */
export async function createOtpManagerAssistTask(input: {
  companyId: string
  deliveryId: string
  tourId: string
  driverId: string
  supermarketName: string
  tourDate: string
  managerEmail: string
  kind: 'resend' | 'bypass'
  smsTo?: string
  reason?: string
  receiptId?: string
}): Promise<void> {
  const title =
    input.kind === 'bypass'
      ? `OTP — validation manuelle — ${input.supermarketName}`
      : `OTP — code fourni par gestionnaire — ${input.supermarketName}`
  const description =
    input.kind === 'bypass'
      ? `Le gestionnaire ${input.managerEmail} a validé la livraison sans SMS OTP.` +
        (input.reason ? ` Motif : ${input.reason}` : '') +
        (input.receiptId ? ` Certificat : ${input.receiptId}.` : '')
      : `Le gestionnaire ${input.managerEmail} a fourni / renvoyé le code OTP` +
        (input.smsTo ? ` (destinataire ${input.smsTo})` : '') +
        ` pour relai vocal ou renvoi SMS. Tournée du ${input.tourDate}.`

  await insertManagerTask({
    type: 'otp_manager_assist',
    companyId: input.companyId,
    deliveryId: input.deliveryId,
    title,
    description,
    payload: {
      deliveryId: input.deliveryId,
      supermarketName: input.supermarketName,
      tourId: input.tourId,
      tourDate: input.tourDate,
      emailLine: description,
    },
    relatedTourId: input.tourId,
    relatedDriverId: input.driverId,
  })
}

// ─── Supermarkets ─────────────────────────────────────────────────────────────

export async function getAllSupermarkets(companyId: string): Promise<Supermarket[]> {
  return db
    .select()
    .from(supermarkets)
    .where(eq(supermarkets.companyId, companyId))
    .orderBy(supermarkets.name)
}

export async function upsertSupermarket(
  id: string,
  data: Partial<Omit<Supermarket, 'id' | 'createdAt'>> & { companyId: string }
): Promise<Supermarket> {
  const insertValues = {
    id,
    name: data.name ?? '',
    address: data.address ?? '',
    contactPhone: data.contactPhone ?? '',
    companyId: data.companyId,
    contactName: data.contactName ?? null,
    contactEmail: data.contactEmail ?? null,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    active: data.active ?? true,
    siteType: data.siteType ?? 'prive',
  }
  const updateSet: Partial<typeof insertValues> = { companyId: data.companyId }
  if (data.name !== undefined) updateSet.name = data.name
  if (data.address !== undefined) updateSet.address = data.address
  if (data.contactPhone !== undefined) updateSet.contactPhone = data.contactPhone
  if (data.contactName !== undefined) updateSet.contactName = data.contactName ?? null
  if (data.contactEmail !== undefined) updateSet.contactEmail = data.contactEmail ?? null
  if (data.lat !== undefined) updateSet.lat = data.lat ?? null
  if (data.lng !== undefined) updateSet.lng = data.lng ?? null
  if (data.siteType !== undefined) updateSet.siteType = data.siteType
  // Ne jamais écraser `active` sur un point existant — seul setSupermarketActive le fait.

  const [row] = await db
    .insert(supermarkets)
    .values(insertValues)
    .onConflictDoUpdate({ target: supermarkets.id, set: updateSet })
    .returning()
  return row!
}

export async function updateSupermarketDetails(
  id: string,
  data: {
    companyId: string
    name: string
    address: string
    contactPhone: string
    contactName?: string | null
    contactEmail?: string | null
    lat?: string | null
    lng?: string | null
    siteType?: string
  },
): Promise<Supermarket | null> {
  const [row] = await db
    .update(supermarkets)
    .set({
      companyId: data.companyId,
      name: data.name,
      address: data.address,
      contactPhone: data.contactPhone,
      contactName: data.contactName ?? null,
      contactEmail: data.contactEmail ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      ...(data.siteType ? { siteType: data.siteType } : {}),
    })
    .where(eq(supermarkets.id, id))
    .returning()
  return row ?? null
}

export async function setSupermarketSiteType(id: string, siteType: string): Promise<Supermarket | null> {
  const [row] = await db
    .update(supermarkets)
    .set({ siteType })
    .where(eq(supermarkets.id, id))
    .returning()
  return row ?? null
}

export async function setSupermarketActive(id: string, active: boolean): Promise<Supermarket | null> {
  const [row] = await db
    .update(supermarkets)
    .set({ active })
    .where(eq(supermarkets.id, id))
    .returning()
  return row ?? null
}

export async function getSupermarketById(id: string): Promise<Supermarket | null> {
  const [row] = await db.select().from(supermarkets).where(eq(supermarkets.id, id)).limit(1)
  return row ?? null
}

/** Propage le téléphone catalogue vers les arrêts encore ouverts (OTP / SMS). */
export async function syncSupermarketContactToOpenStops(
  supermarketId: string,
  contactPhone: string,
): Promise<number> {
  const updated = await db
    .update(deliveryPoints)
    .set({ contactPhone })
    .where(
      and(
        eq(deliveryPoints.supermarketId, supermarketId),
        inArray(deliveryPoints.status, ['pending', 'in_progress']),
      ),
    )
    .returning({ id: deliveryPoints.id })
  return updated.length
}

export async function updateDeliveryPointContactPhone(
  deliveryId: string,
  contactPhone: string,
): Promise<void> {
  await db
    .update(deliveryPoints)
    .set({ contactPhone })
    .where(eq(deliveryPoints.id, deliveryId))
}

export async function linkDeliveryPointToSupermarket(
  deliveryId: string,
  supermarketId: string,
  contactPhone: string,
): Promise<void> {
  await db
    .update(deliveryPoints)
    .set({ supermarketId, contactPhone })
    .where(eq(deliveryPoints.id, deliveryId))
}

function catalogNameKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Aligne tous les arrêts ouverts sur le catalogue (supermarketId + téléphone).
 * Retourne le détail pour audit manager.
 */
export async function reconcileOpenStopsWithCatalog(companyId: string): Promise<{
  linked: number
  updatedPhone: number
  unmatched: Array<{ id: string; name: string }>
}> {
  const open = await db
    .select({ stop: deliveryPoints })
    .from(deliveryPoints)
    .innerJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .where(
      and(
        eq(tours.companyId, companyId),
        inArray(deliveryPoints.status, ['pending', 'in_progress', 'otp_sent']),
      ),
    )

  const catalog = await getAllSupermarkets(companyId)
  const active = catalog.filter((s) => s.active)
  const byId = new Map(active.map((s) => [s.id, s]))
  const byName = new Map(active.map((s) => [catalogNameKey(s.name), s]))

  let linked = 0
  let updatedPhone = 0
  const unmatched: Array<{ id: string; name: string }> = []

  for (const { stop } of open) {
    const fromId = stop.supermarketId ? byId.get(stop.supermarketId) : undefined
    const fromName = byName.get(catalogNameKey(stop.name))
    const match = fromId ?? fromName
    if (!match?.contactPhone?.trim()) {
      unmatched.push({ id: stop.id, name: stop.name })
      continue
    }
    const phone = match.contactPhone.trim()
    const needsLink = !stop.supermarketId || stop.supermarketId !== match.id
    const needsPhone = String(stop.contactPhone ?? '').trim() !== phone
    if (needsLink || needsPhone) {
      await db
        .update(deliveryPoints)
        .set({ supermarketId: match.id, contactPhone: phone })
        .where(eq(deliveryPoints.id, stop.id))
      if (needsLink) linked += 1
      if (needsPhone) updatedPhone += 1
    }
  }

  return { linked, updatedPhone, unmatched }
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function getAllProducts(companyId: string): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(eq(products.companyId, companyId))
    .orderBy(products.displayOrder, products.label)
}

export async function getProductById(id: string): Promise<Product | null> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1)
  return row ?? null
}

export async function upsertProduct(
  id: string,
  data: Partial<Omit<Product, 'id' | 'createdAt'>> & { companyId: string }
): Promise<Product> {
  const values = {
    id,
    companyId: data.companyId,
    label: data.label ?? '',
    unit: data.unit ?? 'palette',
    displayOrder: data.displayOrder ?? 0,
    active: data.active ?? true,
  }
  const [row] = await db
    .insert(products)
    .values(values)
    .onConflictDoUpdate({ target: products.id, set: values })
    .returning()
  return row!
}

export async function ensureProductsFromEbLines(
  companyId: string,
  lines: Array<{ label?: string | null; unit?: string | null }>,
): Promise<number> {
  const existing = await getAllProducts(companyId)
  const known = new Set(existing.map((p) => p.label.trim().toLowerCase()))
  let order = existing.reduce((m, p) => Math.max(m, p.displayOrder), 0)
  let created = 0
  for (const line of lines) {
    const label = (line.label ?? '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    if (known.has(key)) continue
    order += 1
    await upsertProduct(`prod-eb-${randomUUID()}`, {
      companyId,
      label,
      unit: catalogUnitFromEb(line.unit),
      displayOrder: order,
      active: true,
    })
    known.add(key)
    created += 1
  }
  return created
}

// ─── Company units ────────────────────────────────────────────────────────────

export async function getAllCompanyUnits(companyId: string): Promise<CompanyUnit[]> {
  return db
    .select()
    .from(companyUnits)
    .where(eq(companyUnits.companyId, companyId))
    .orderBy(companyUnits.displayOrder, companyUnits.label)
}

export async function getCompanyUnitByCode(companyId: string, code: string): Promise<CompanyUnit | null> {
  const normalized = code.trim().toLowerCase()
  const [row] = await db
    .select()
    .from(companyUnits)
    .where(and(eq(companyUnits.companyId, companyId), eq(companyUnits.code, normalized)))
    .limit(1)
  return row ?? null
}

export async function isActiveCompanyUnit(companyId: string, code: string): Promise<boolean> {
  const row = await getCompanyUnitByCode(companyId, code)
  return !!row?.active
}

export async function upsertCompanyUnit(
  id: string,
  data: Partial<Omit<CompanyUnit, 'id' | 'createdAt'>> & { companyId: string; code: string; label: string }
): Promise<CompanyUnit> {
  const values = {
    id,
    companyId: data.companyId,
    code: data.code.trim().toLowerCase(),
    label: data.label.trim(),
    displayOrder: data.displayOrder ?? 0,
    active: data.active ?? true,
  }
  const [row] = await db
    .insert(companyUnits)
    .values(values)
    .onConflictDoUpdate({
      target: [companyUnits.companyId, companyUnits.code],
      set: {
        label: values.label,
        displayOrder: values.displayOrder,
        active: values.active,
      },
    })
    .returning()
  return row!
}

export async function getCompanyUnitById(id: string): Promise<CompanyUnit | null> {
  const [row] = await db.select().from(companyUnits).where(eq(companyUnits.id, id)).limit(1)
  return row ?? null
}

export async function seedDefaultCompanyUnits(companyId: string): Promise<number> {
  const values = DEFAULT_COMPANY_UNITS.map((unit) => ({
    id: `unit-${companyId}-${unit.code}`,
    companyId,
    code: unit.code,
    label: unit.label,
    displayOrder: unit.displayOrder,
    active: true,
  }))
  const inserted = await db.insert(companyUnits).values(values).onConflictDoNothing().returning({ id: companyUnits.id })
  return inserted.length
}

export async function ensureCompanyUnit(companyId: string, code: string, label?: string): Promise<void> {
  const unitCode = code.trim().toLowerCase()
  if (!unitCode) return
  await db
    .insert(companyUnits)
    .values({
      id: `unit-${companyId}-${unitCode}`,
      companyId,
      code: unitCode,
      label: (label ?? unitCode).trim() || unitCode,
      displayOrder: 99,
      active: true,
    })
    .onConflictDoNothing()
}

// ─── Manager Tasks ────────────────────────────────────────────────────────────

export interface ManagerTaskPayload {
  deliveryId?: string
  tourId?: string
  tourDate?: string
  supermarketName?: string
  driverName?: string
  previousDriverId?: string
  previousDriverName?: string
  totalDeliveries?: number
  status?: string
  receiptId?: string | null
  isPartial?: boolean
  isRejected?: boolean
  emailLine?: string
  refusedLines?: Array<{
    productLabel?: string
    quantityExpected?: number
    quantityRefused?: number
    unit?: string
    justification?: string
  }>
  adjustmentLines?: unknown[]
}

export interface ManagerTaskRow extends ManagerTask {
  deliveryName?: string | null
  deliveryDate?: string | null
  driverName?: string | null
  canReplan?: boolean
}

/** Indique si le bouton Replanifier doit être proposé pour cette tâche. */
export async function canReplanManagerTask(
  task: Pick<ManagerTaskRow, 'type' | 'deliveryId' | 'relatedTourId'>,
): Promise<boolean> {
  if (task.type === 'partial_delivery') {
    if (!task.deliveryId) return false
    return (await getPartialDeliveryReplanTemplate(task.deliveryId)) !== null
  }
  if (
    task.type === 'missed_delivery'
    || task.type === 'delivery_cancelled'
    || task.type === 'reassign_tour'
  ) {
    if (!task.relatedTourId) return false
    const template = await getTourReplanTemplate(task.relatedTourId)
    return template !== null && template.stops.length > 0
  }
  return false
}

export interface StopWithDriverContext extends StopWithTourDate {
  tourId: string
  driverId: string
  driverName: string
}

export async function getStopWithDriverContext(deliveryId: string): Promise<StopWithDriverContext | null> {
  const [row] = await db
    .select({
      stop: deliveryPoints,
      tourDate: tours.date,
      tourId: tours.id,
      driverId: drivers.id,
      driverName: drivers.name,
    })
    .from(deliveryPoints)
    .innerJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .innerJoin(drivers, eq(tours.driverId, drivers.id))
    .where(eq(deliveryPoints.id, deliveryId))
    .limit(1)
  if (!row) return null
  return { ...row.stop, tourDate: row.tourDate, tourId: row.tourId, driverId: row.driverId, driverName: row.driverName }
}

function todayIsoDate(): string {
  return localTodayIso()
}

function mapDeclarationLinesForTask(lines: unknown[]) {
  return (lines as Record<string, unknown>[]).map((line) => ({
    productLabel: String(line.productLabel ?? line.product_label ?? line.label ?? ''),
    quantityExpected: Number(line.quantityExpected ?? line.quantity_expected ?? 0) || undefined,
    quantityAccepted: line.quantityAccepted ?? line.quantity_accepted ?? null,
    quantityRefused: Number(line.quantityRefused ?? line.quantity_refused ?? 0),
    unit: String(line.unit ?? 'colis'),
    justification: line.justification ? String(line.justification) : undefined,
  }))
}

async function insertManagerTask(values: {
  type: ManagerTask['type']
  companyId?: string | null
  deliveryId?: string | null
  title: string
  description: string
  payload?: ManagerTaskPayload
  relatedTourId?: string | null
  relatedDriverId?: string | null
}): Promise<ManagerTask> {
  let companyId = values.companyId ?? null
  if (!companyId && values.relatedTourId) {
    const tour = await getTourById(values.relatedTourId)
    companyId = tour?.companyId ?? null
  }
  if (!companyId && values.relatedDriverId) {
    const driver = await getDriverById(values.relatedDriverId)
    companyId = driver?.companyId ?? null
  }
  if (!companyId && values.deliveryId) {
    const stopCtx = await getStopWithTourDate(values.deliveryId)
    if (stopCtx) {
      const tour = await getTourById(stopCtx.tourId)
      companyId = tour?.companyId ?? null
    }
  }
  companyId = companyId ?? DEMO_COMPANY_ID

  const [row] = await db
    .insert(managerTasks)
    .values({
      id: `task-${randomUUID()}`,
      companyId,
      type: values.type,
      deliveryId: values.deliveryId ?? null,
      title: values.title,
      description: values.description,
      payload: values.payload ?? null,
      relatedTourId: values.relatedTourId ?? null,
      relatedDriverId: values.relatedDriverId ?? null,
      resolved: false,
    })
    .returning()
  return row!
}

export async function getManagerTasks(
  companyId: string,
  options: { resolved: boolean; limit?: number },
): Promise<ManagerTaskRow[]> {
  const conditions = [
    eq(managerTasks.companyId, companyId),
    eq(managerTasks.resolved, options.resolved),
  ]
  const rows = await db
    .select({
      id: managerTasks.id,
      companyId: managerTasks.companyId,
      type: managerTasks.type,
      deliveryId: managerTasks.deliveryId,
      title: managerTasks.title,
      description: managerTasks.description,
      payload: managerTasks.payload,
      relatedTourId: managerTasks.relatedTourId,
      relatedDriverId: managerTasks.relatedDriverId,
      resolved: managerTasks.resolved,
      resolvedAt: managerTasks.resolvedAt,
      createdAt: managerTasks.createdAt,
      deliveryName: deliveryPoints.name,
      driverName: drivers.name,
      deliveryDate: tours.date,
    })
    .from(managerTasks)
    .leftJoin(deliveryPoints, eq(managerTasks.deliveryId, deliveryPoints.id))
    .leftJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .leftJoin(drivers, eq(tours.driverId, drivers.id))
    .where(and(...conditions))
    .orderBy(options.resolved ? desc(managerTasks.resolvedAt) : managerTasks.createdAt)
    .limit(options.limit ?? 500)

  return rows
}

export async function getPendingManagerTasks(companyId: string): Promise<ManagerTaskRow[]> {
  return getManagerTasks(companyId, { resolved: false })
}

export async function countPendingManagerTasks(companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(managerTasks)
    .where(and(eq(managerTasks.resolved, false), eq(managerTasks.companyId, companyId)))
  return Number(row?.count ?? 0)
}

export async function resolveManagerTask(id: string, companyId: string): Promise<boolean> {
  const rows = await db
    .update(managerTasks)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(and(eq(managerTasks.id, id), eq(managerTasks.companyId, companyId)))
    .returning({ id: managerTasks.id })
  return rows.length > 0
}

export async function resolvePendingMissedForDelivery(deliveryId: string): Promise<number> {
  const rows = await db
    .update(managerTasks)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(
      and(
        eq(managerTasks.type, 'missed_delivery'),
        eq(managerTasks.resolved, false),
        sql`${managerTasks.payload}->>'deliveryId' = ${deliveryId}`
      )
    )
    .returning({ id: managerTasks.id })
  return rows.length
}

export async function resolvePendingCancelledForDelivery(deliveryId: string): Promise<number> {
  const rows = await db
    .update(managerTasks)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(
      and(
        eq(managerTasks.type, 'delivery_cancelled'),
        eq(managerTasks.resolved, false),
        sql`${managerTasks.payload}->>'deliveryId' = ${deliveryId}`
      )
    )
    .returning({ id: managerTasks.id })
  return rows.length
}

export async function resolvePendingReassignForTour(tourId: string): Promise<number> {
  const rows = await db
    .update(managerTasks)
    .set({ resolved: true, resolvedAt: new Date() })
    .where(
      and(
        eq(managerTasks.type, 'reassign_tour'),
        eq(managerTasks.relatedTourId, tourId),
        eq(managerTasks.resolved, false)
      )
    )
    .returning({ id: managerTasks.id })
  return rows.length
}

export async function createDeliveryConfirmedTask(
  ctx: StopWithDriverContext,
  receiptId: string,
  outcome: Declaration['outcome'] | null,
  emailLine?: string
): Promise<void> {
  const dup = await db
    .select({ id: managerTasks.id })
    .from(managerTasks)
    .where(
      and(
        eq(managerTasks.type, 'delivery_confirmed'),
        eq(managerTasks.resolved, false),
        sql`${managerTasks.payload}->>'deliveryId' = ${ctx.id}`
      )
    )
    .limit(1)
  if (dup[0]) return

  const supermarketName = ctx.name
  const isRejected = outcome === 'rejected'
  const isPartial = outcome === 'partial'
  const outcomeLabel = isRejected ? 'refusée' : isPartial ? 'partielle' : 'complète'

  const title = isRejected
    ? `Livraison refusée — ${supermarketName}`
    : `Livraison confirmée — ${supermarketName}`
  const description =
    `Livraison ${outcomeLabel} validée par OTP. ` +
    `Livreur : ${ctx.driverName}. ` +
    `Tournée du ${ctx.tourDate}. ` +
    `Certificat : ${receiptId}. ` +
    (emailLine ?? 'Aucun e-mail envoyé : renseignez l’adresse du compte manager.')

  await insertManagerTask({
    type: 'delivery_confirmed',
    deliveryId: ctx.id,
    title,
    description,
    payload: {
      deliveryId: ctx.id,
      receiptId,
      supermarketName,
      driverName: ctx.driverName,
      tourId: ctx.tourId,
      tourDate: ctx.tourDate,
      isPartial,
      isRejected,
      emailLine,
    },
    relatedTourId: ctx.tourId,
    relatedDriverId: ctx.driverId,
  })
}

export async function createPartialDeliveryTask(
  ctx: StopWithDriverContext,
  receiptId: string,
  lines: unknown[],
  outcome: Declaration['outcome']
): Promise<void> {
  const dup = await db
    .select({ id: managerTasks.id })
    .from(managerTasks)
    .where(
      and(
        eq(managerTasks.type, 'partial_delivery'),
        eq(managerTasks.resolved, false),
        sql`${managerTasks.payload}->>'deliveryId' = ${ctx.id}`
      )
    )
    .limit(1)
  if (dup[0]) return

  const linesPayload = mapDeclarationLinesForTask(lines).map((line) => {
    const expectedProducts = Array.isArray(ctx.products)
      ? (ctx.products as ExpectedProduct[])
      : []
    const match = expectedProducts.find(
      (p) => p.label.toLowerCase() === line.productLabel.toLowerCase()
    )
    return {
      ...line,
      quantityExpected: line.quantityExpected ?? match?.qty ?? undefined,
    }
  })
  const refusedLines = linesPayload.filter((l) => (l.quantityRefused || 0) > 0)
  const isRejected = outcome === 'rejected'
  const supermarketName = ctx.name

  const title = isRejected
    ? `Livraison refusée — ${supermarketName}`
    : `Livraison partielle — ${supermarketName}`
  const description =
    `Livreur : ${ctx.driverName}. Tournée du ${ctx.tourDate}. ` +
    `Certificat : ${receiptId}.`

  await insertManagerTask({
    type: 'partial_delivery',
    deliveryId: ctx.id,
    title,
    description,
    payload: {
      deliveryId: ctx.id,
      receiptId,
      supermarketName,
      driverName: ctx.driverName,
      tourId: ctx.tourId,
      tourDate: ctx.tourDate,
      refusedLines,
      adjustmentLines: linesPayload,
    },
    relatedTourId: ctx.tourId,
    relatedDriverId: ctx.driverId,
  })
}

export async function createDeliveryCancelledTask(ctx: StopWithDriverContext): Promise<void> {
  const dup = await db
    .select({ id: managerTasks.id })
    .from(managerTasks)
    .where(
      and(
        eq(managerTasks.type, 'delivery_cancelled'),
        eq(managerTasks.resolved, false),
        sql`${managerTasks.payload}->>'deliveryId' = ${ctx.id}`
      )
    )
    .limit(1)
  if (dup[0]) return

  const supermarketName = ctx.name
  const title = `Livraison annulée — ${supermarketName}`
  const description =
    `Tournée du ${ctx.tourDate}. Livreur : ${ctx.driverName}. ` +
    `Le livreur a annulé la livraison en cours : photos et déclaration effacées, statut « à démarrer ».`

  await insertManagerTask({
    type: 'delivery_cancelled',
    deliveryId: ctx.id,
    title,
    description,
    payload: {
      deliveryId: ctx.id,
      supermarketName,
      driverName: ctx.driverName,
      tourId: ctx.tourId,
      tourDate: ctx.tourDate,
    },
    relatedTourId: ctx.tourId,
    relatedDriverId: ctx.driverId,
  })
}

export async function createMissedDeliveryTask(
  ctx: StopWithDriverContext,
  status: DeliveryPoint['status']
): Promise<void> {
  const dup = await db
    .select({ id: managerTasks.id })
    .from(managerTasks)
    .where(
      and(
        eq(managerTasks.type, 'missed_delivery'),
        eq(managerTasks.resolved, false),
        sql`${managerTasks.payload}->>'deliveryId' = ${ctx.id}`
      )
    )
    .limit(1)
  if (dup[0]) return

  const supermarketName = ctx.name
  const title = `Livraison non effectuée — ${supermarketName}`
  const description =
    `Date prévue : ${ctx.tourDate}. Livreur : ${ctx.driverName}. Statut : ${status}. ` +
    `La livraison n'a pas été finalisée (aucune validation OTP).`

  await insertManagerTask({
    type: 'missed_delivery',
    deliveryId: ctx.id,
    title,
    description,
    payload: {
      deliveryId: ctx.id,
      supermarketName,
      driverName: ctx.driverName,
      tourId: ctx.tourId,
      tourDate: ctx.tourDate,
      status,
    },
    relatedTourId: ctx.tourId,
    relatedDriverId: ctx.driverId,
  })
}

export async function findFutureToursForDriver(driverId: string, limit = 50): Promise<Array<Tour & { totalStops: number }>> {
  const today = todayIsoDate()
  const rows = await db
    .select({
      tour: tours,
      totalStops: count(deliveryPoints.id),
    })
    .from(tours)
    .leftJoin(deliveryPoints, eq(deliveryPoints.tourId, tours.id))
    .where(and(eq(tours.driverId, driverId), gte(tours.date, today)))
    .groupBy(tours.id)
    .limit(limit)
  return rows.map((r) => ({ ...r.tour, totalStops: Number(r.totalStops) }))
}

export async function createReassignTourTask(
  tour: Tour & { totalStops: number },
  driverId: string,
  driverName: string
): Promise<void> {
  const dup = await db
    .select({ id: managerTasks.id })
    .from(managerTasks)
    .where(
      and(
        eq(managerTasks.type, 'reassign_tour'),
        eq(managerTasks.relatedTourId, tour.id),
        eq(managerTasks.resolved, false)
      )
    )
    .limit(1)
  if (dup[0]) return

  const title = `Réaffecter la tournée du ${tour.date}`
  const description =
    `Le livreur ${driverName} a été désactivé. La tournée du ${tour.date} ` +
    `(${tour.totalStops} arrêt(s)) doit être assignée à un autre livreur.`

  await insertManagerTask({
    type: 'reassign_tour',
    title,
    description,
    payload: {
      tourId: tour.id,
      tourDate: tour.date,
      previousDriverId: driverId,
      previousDriverName: driverName,
      totalDeliveries: tour.totalStops,
    },
    relatedTourId: tour.id,
    relatedDriverId: driverId,
  })
}

export async function findOverdueUndelivered(): Promise<StopWithDriverContext[]> {
  const today = todayIsoDate()
  const rows = await db
    .select({
      stop: deliveryPoints,
      tourDate: tours.date,
      tourId: tours.id,
      driverId: drivers.id,
      driverName: drivers.name,
    })
    .from(deliveryPoints)
    .innerJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .innerJoin(drivers, eq(tours.driverId, drivers.id))
    .where(
      and(
        inArray(deliveryPoints.status, ['pending', 'in_progress', 'otp_sent']),
        sql`${tours.date} < ${today}`
      )
    )
    .orderBy(tours.date)
  return rows.map((r) => ({ ...r.stop, tourDate: r.tourDate, tourId: r.tourId, driverId: r.driverId, driverName: r.driverName }))
}

export async function syncOverdueDeliveryTasks(): Promise<{ created: number; scanned: number }> {
  const overdue = await findOverdueUndelivered()
  let created = 0
  for (const ctx of overdue) {
    await updateDeliveryStatus(ctx.id, { status: 'failed' })
    const before = await db
      .select({ id: managerTasks.id })
      .from(managerTasks)
      .where(
        and(
          eq(managerTasks.type, 'missed_delivery'),
          eq(managerTasks.resolved, false),
          sql`${managerTasks.payload}->>'deliveryId' = ${ctx.id}`
        )
      )
      .limit(1)
    if (before[0]) continue
    await createMissedDeliveryTask({ ...ctx, status: 'failed' }, 'failed')
    created += 1
  }
  return { created, scanned: overdue.length }
}

/** @deprecated use typed create* helpers */
export async function createManagerTask(
  type: ManagerTask['type'],
  deliveryId: string | null,
  description: string
): Promise<void> {
  await insertManagerTask({
    type,
    deliveryId,
    title: description.slice(0, 120),
    description,
    payload: deliveryId ? { deliveryId } : undefined,
  })
}

// ─── Dashboard deliveries ──────────────────────────────────────────────────────

export interface DashboardDelivery {
  deliveryId: string
  deliveryName: string
  deliveryAddress: string
  status: string
  units: number
  unitType: string
  tourDate: string
  driverId: string
  driverName: string
  tourId: string
  depotName: string
  products: unknown
  declarationOutcome: string | null
  declarationLines: unknown
}

export async function getDashboardDeliveries(
  date: string,
  status: string | undefined,
  companyId: string,
): Promise<DashboardDelivery[]> {
  const conditions = [eq(tours.date, date), eq(tours.companyId, companyId)]
  if (status && status !== 'all') {
    conditions.push(eq(deliveryPoints.status, status as DeliveryPoint['status']))
  }
  const rows = await db
    .select({
      id: deliveryPoints.id,
      deliveryId: deliveryPoints.id,
      deliveryName: deliveryPoints.name,
      deliveryAddress: deliveryPoints.address,
      status: deliveryPoints.status,
      units: deliveryPoints.units,
      unitType: deliveryPoints.unitType,
      tourDate: tours.date,
      driverId: drivers.id,
      driverName: drivers.name,
      tourId: tours.id,
      depotName: tours.depotName,
      products: deliveryPoints.products,
    })
    .from(deliveryPoints)
    .innerJoin(tours, eq(deliveryPoints.tourId, tours.id))
    .innerJoin(drivers, eq(tours.driverId, drivers.id))
    .where(and(...conditions))
    .orderBy(drivers.name, tours.id, deliveryPoints.sequence)

  const enriched = await attachDeclarationMeta(
    rows.map((row) => ({ ...row, id: row.deliveryId }))
  )
  return enriched.map(({ declarationOutcome, declarationLines, ...row }) => {
    const { id: _id, ...rest } = row as typeof row & { id: string }
    return { ...rest, declarationOutcome, declarationLines }
  })
}

// ─── Driver CRUD ──────────────────────────────────────────────────────────────

export async function createDriver(
  id: string,
  name: string,
  phone: string,
  pinHash: string,
  companyId: string,
): Promise<Driver> {
  const [row] = await db
    .insert(drivers)
    .values({ id, name, phone, pinHash, status: 'active', companyId })
    .returning()
  return row!
}

export async function updateDriver(
  id: string,
  data: Partial<Pick<Driver, 'name' | 'phone' | 'pinHash' | 'status'>>
): Promise<Driver | null> {
  const [row] = await db
    .update(drivers)
    .set(data)
    .where(eq(drivers.id, id))
    .returning()
  return row ?? null
}

// ─── Reset ────────────────────────────────────────────────────────────────────

export async function resetAllData(): Promise<void> {
  const { assertDatabaseResetAllowed, assertDatabaseWipeAllowed } = await import(
    '../config/databaseProtection.js'
  )
  const { isPgMissingRelation } = await import('../lib/pgErrors.js')
  assertDatabaseResetAllowed()
  assertDatabaseWipeAllowed()

  const safeDelete = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (err) {
      if (!isPgMissingRelation(err)) throw err
    }
  }

  // Catalogues + comptes : uniquement en E2E (ALLOW_WIPE_USERS).
  // En pilote, un reset ne doit plus vider Produits / Points / Livreurs.
  if (process.env.ALLOW_WIPE_USERS === 'true' || process.env.ALLOW_WIPE_USERS === '1') {
    try {
      await db.execute(sql`
        TRUNCATE TABLE
          eb_parse_runs,
          whatsapp_messages,
          purchase_request_lines,
          approval_steps,
          purchase_orders,
          treasury_orders,
          purchase_requests,
          purchase_request_drafts,
          document_templates,
          site_budget_amendments,
          suppliers,
          sites,
          certificates,
          otps,
          declarations,
          photo_hashes,
          manager_tasks,
          delivery_points,
          sessions,
          tours,
          products,
          supermarkets,
          drivers,
          managers,
          companies
        CASCADE
      `)
    } catch (err) {
      if (!isPgMissingRelation(err)) throw err
      await db.execute(sql`
        TRUNCATE TABLE
          certificates,
          otps,
          declarations,
          photo_hashes,
          manager_tasks,
          delivery_points,
          sessions,
          tours,
          products,
          supermarkets,
          drivers,
          managers,
          companies
        CASCADE
      `)
    }
    return
  }

  await safeDelete(() => db.delete(ebParseRuns))
  await safeDelete(() => db.delete(whatsappMessages))
  await safeDelete(() => db.delete(purchaseRequestLines))
  await safeDelete(() => db.delete(approvalSteps))
  await safeDelete(() => db.delete(purchaseOrders))
  await safeDelete(() => db.delete(treasuryOrders))
  await safeDelete(() => db.delete(purchaseRequestDrafts))
  await safeDelete(() => db.delete(purchaseRequests))
  await safeDelete(() => db.delete(documentTemplates))
  await safeDelete(() => db.delete(suppliers))
  await safeDelete(() => db.delete(sites))

  await db.delete(certificates)
  await db.delete(otps)
  await db.delete(declarations)
  await db.delete(photoHashes)
  await db.delete(managerTasks)
  await db.delete(deliveryPoints)
  await db.delete(sessions)
  await db.delete(tours)
}
