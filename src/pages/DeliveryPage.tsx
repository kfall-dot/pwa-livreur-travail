import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CameraCapture } from '../components/CameraCapture'
import { PartialDeclaration } from '../components/PartialDeclaration'
import { StatusBadge } from '../components/StatusBadge'
import { useTour } from '../contexts/TourContext'
import { ApiError, api } from '../lib/api'
import { db, purgeSyncQueueForDelivery } from '../lib/db'
import {
  applyDeclarationFromApi,
  buildPartialDeclareLines,
  buildRejectedLines,
  fallbackDeliveryProducts,
  fullLinesFromPlanned,
} from '../lib/deliveryHelpers'
import type { DeclarationOutcome } from '../lib/declarationValidation'
import { validateDeclarationBeforeSubmit } from '../lib/declarationValidation'
import { resolvePlannedUnit, formatDriverDeliveryContent } from '../lib/deliveryUnits'
import { checkGeofence, getCurrentPosition, type GpsReading } from '../lib/geo'
import {
  applyPhotoTargetFromApi,
  effectivePhotoTarget,
  photoCapacity,
} from '../lib/photoRequirements'
import { mapDeliveryStatus } from '../lib/livraisonAdapter'
import { toast } from '../lib/toast'
import {
  buildDeliveredProductsDisplay,
  deliveredQuantityEmptyLabel,
  expectedProductsDisplay,
} from '../lib/deliveredQuantity'
import { formatProductQuantityLine } from './manager/productHelpers'
import {
  canOpenDelivery,
  deliveryAccessLabel,
  isDeliveryTerminal,
  isFutureTourDate,
  isTodayTourDate,
} from '../lib/deliveryAccess'
import { shouldSkipGeofence, testBypass } from '../lib/testBypass'
import { isDemoSession } from '../lib/demoSession'
import { useDemoDeliveryAutoplay } from '../hooks/useDemoDeliveryAutoplay'
import { useGps } from '../hooks/useGps'
import { useOnline } from '../hooks/useOnline'
import {
  cameraErrorMessage,
  isCameraApiAvailable,
  openCameraStreamWithTimeout,
  prefersNativeCamera,
  stopMediaStream,
} from '../lib/camera'
import { computePerceptualHash, extractGpsFromImage, isDuplicatePhoto, registerPhotoHash, validatePhotoFile } from '../lib/photo'
import { processSyncQueue } from '../lib/sync'
import type { AdjustmentLine, ConfirmResult, DeliveryPoint, DeliveryProductOption } from '../types'

const IS_E2E = testBypass.simulatePhotos
const SHOW_DEV_PHOTO_TOOLS = import.meta.env.DEV || IS_E2E || isDemoSession()

type Step = 'start' | 'photos' | 'declare' | 'otp' | 'confirm'

interface CapturedPhoto {
  blob: Blob
  meta: { lat: number; lng: number; hash: string }
}

function deliveryStatusRank(s: string | undefined): number {
  switch (s) {
    case 'pending':
      return 0
    case 'in_progress':
      return 1
    case 'otp_sent':
      return 2
    case 'delivered':
    case 'failed':
    case 'cancelled':
      return 3
    default:
      return 0
  }
}

export function DeliveryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tour, updateStop, loading: tourLoading } = useTour()
  const online = useOnline()
  const { reading, ready, error: gpsError } = useGps()

  const delivery = tour?.stops.find((s) => s.id === id)
  const deliveryStatusRef = useRef(delivery?.status)
  const detailFetchGen = useRef(0)

  useEffect(() => {
    deliveryStatusRef.current = delivery?.status
  }, [delivery?.status])

  const [step, setStep] = useState<Step>('start')
  const [photos, setPhotos] = useState<CapturedPhoto[]>([])
  const [showCamera, setShowCamera] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const [cameraOpenError, setCameraOpenError] = useState<string | null>(null)
  const [cameraOpening, setCameraOpening] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [pendingPhoto, setPendingPhoto] = useState<Blob | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [otp, setOtp] = useState('')
  const [otpAttempts, setOtpAttempts] = useState(3)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null)
  const [loading, setLoading] = useState(false)

  const [expectedPalettes, setExpectedPalettes] = useState(delivery?.units ?? 1)
  const [plannedUnit, setPlannedUnit] = useState<string | null>(null)
  const [deliveryProducts, setDeliveryProducts] = useState<DeliveryProductOption[]>([])
  const [declareLines, setDeclareLines] = useState<AdjustmentLine[]>([])
  const [declareOutcome, setDeclareOutcome] = useState<DeclarationOutcome | null>(null)
  const [declared, setDeclared] = useState(false)
  const [requiredPhotosTarget, setRequiredPhotosTarget] = useState(1)
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)
  const [otpStatus, setOtpStatus] = useState<string | null>(null)
  const [declareOfflineQueued, setDeclareOfflineQueued] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [detailLoading, setDetailLoading] = useState(() => !api.isMock)

  const displayUnit = useMemo(
    () => resolvePlannedUnit(deliveryProducts, declareLines, plannedUnit),
    [deliveryProducts, declareLines, plannedUnit]
  )

  const photoTarget = useMemo(
    () =>
      effectivePhotoTarget({
        deliveryProducts,
        declareLines,
        declared,
        apiRequired: requiredPhotosTarget,
      }),
    [deliveryProducts, declareLines, declared, requiredPhotosTarget]
  )

  const maxPhotos = useMemo(
    () =>
      photoCapacity({
        deliveryProducts,
        declareLines,
        declared,
        apiRequired: requiredPhotosTarget,
      }),
    [deliveryProducts, declareLines, declared, requiredPhotosTarget]
  )

  const canAddPhoto = photos.length < maxPhotos
  const canProceedToDeclare = photos.length >= photoTarget

  const hydrateFromDetail = useCallback(
    (deliveryId: string, expected: number, data: Awaited<ReturnType<typeof api.getDelivery>>) => {
      setExpectedPalettes(expected)
      const unit = data.plannedUnit ?? data.adjustmentLines?.[0]?.unit ?? null
      setPlannedUnit(unit)
      const products = fallbackDeliveryProducts(expected, data.adjustmentLines, unit)
      setDeliveryProducts(products)
      const decl = applyDeclarationFromApi(
        expected,
        data.adjustmentLines,
        data.declared,
        data.declarationOutcome,
        unit
      )
      setDeclareLines(decl.declareLines)
      setDeclared(decl.declared)
      setDeclareOutcome(decl.declareOutcome)
      if (data.requiredPhotos) setRequiredPhotosTarget(applyPhotoTargetFromApi(data.requiredPhotos, decl.declareLines))
      else if (decl.declared) setRequiredPhotosTarget(applyPhotoTargetFromApi(undefined, decl.declareLines))
      // Ne pas vider les photos locales déjà prises (re-fetch après start).
      if (Array.isArray(data.photos) && data.photos.length > 0) {
        setPhotos((prev) =>
          prev.length > 0
            ? prev
            : Array.from({ length: data.photos!.length }, () => ({
                blob: new Blob(),
                meta: { lat: 0, lng: 0, hash: '' },
              })),
        )
      }
      const rawStatus = data.delivery?.status
      const status = rawStatus ? mapDeliveryStatus(rawStatus) : undefined
      if (status) {
        const outcome =
          data.declarationOutcome === 'full' ||
          data.declarationOutcome === 'partial' ||
          data.declarationOutcome === 'rejected'
            ? data.declarationOutcome
            : undefined
        // Ne pas écraser un statut local plus avancé (réponse getDelivery périmée).
        if (deliveryStatusRank(status) >= deliveryStatusRank(deliveryStatusRef.current)) {
          updateStop(deliveryId, {
            status,
            declarationOutcome: outcome,
          })
        }
      }
      if (status === 'otp_sent') {
        setStep('otp')
        setDeclared(true)
      } else if (decl.declared && status === 'in_progress') {
        setStep('declare')
      } else if (status === 'in_progress') {
        setStep((prev) => (prev === 'start' ? 'photos' : prev))
      }
      if (data.devOtpCode) setDevOtpHint(data.devOtpCode)
    },
    [updateStop]
  )

  useEffect(() => {
    if (!delivery?.id) return
    const deliveryId = delivery.id
    const units = delivery.units
    const unitType = delivery.unitType
    const declarationOutcome = delivery.declarationOutcome
    const initialStatus = delivery.status

    if (api.isMock) {
      const products = fallbackDeliveryProducts(units, undefined, unitType)
      setDeliveryProducts(products)
      const decl = applyDeclarationFromApi(
        units,
        undefined,
        false,
        declarationOutcome,
        unitType,
      )
      setDeclareLines(decl.declareLines)
      setExpectedPalettes(units)
      setDetailLoading(false)
      return
    }
    const gen = ++detailFetchGen.current
    setDetailLoading(true)
    void (async () => {
      try {
        const data = await api.getDelivery(deliveryId)
        if (gen !== detailFetchGen.current) return
        const expected = Number(data.delivery?.expected_palettes) || units
        hydrateFromDetail(deliveryId, expected, data)
      } catch {
        if (gen !== detailFetchGen.current) return
        const products = fallbackDeliveryProducts(units, undefined, unitType)
        setDeliveryProducts(products)
        const alreadyDeclared =
          initialStatus === 'otp_sent' ||
          isDeliveryTerminal(initialStatus) ||
          declarationOutcome != null
        const decl = applyDeclarationFromApi(
          units,
          undefined,
          alreadyDeclared,
          declarationOutcome,
          unitType,
        )
        setDeclareLines(decl.declareLines)
        setDeclared(decl.declared)
        setDeclareOutcome(decl.declareOutcome)
        if (initialStatus === 'otp_sent') setStep('otp')
        else if (decl.declared && initialStatus === 'in_progress') setStep('declare')
      } finally {
        if (gen === detailFetchGen.current) setDetailLoading(false)
      }
    })()
    // Intentionnellement tied à l'id seulement : un refetch à chaque changement de status
    // provoquait une course qui remettait « À démarrer » après un start réussi.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- units/status/outcome lus une fois au mount id
  }, [delivery?.id, hydrateFromDetail])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  const handleStart = useCallback(async () => {
    if (!delivery) return
    const position =
      reading ??
      (shouldSkipGeofence(api.isMock) && delivery.coordinates
        ? { lat: delivery.coordinates.lat, lng: delivery.coordinates.lng, accuracy: 5, timestamp: Date.now() }
        : null)
    if (!position) {
      setError('Position GPS requise pour démarrer la livraison.')
      return
    }
    setError(null)
    setLoading(true)
    const geo = shouldSkipGeofence(api.isMock)
      ? { ok: true as const }
      : checkGeofence(position, delivery.coordinates, 200)
    if (!geo.ok) {
      setError(`Hors zone : vous êtes à ${geo.distanceM} m (max 200 m)`)
      setLoading(false)
      return
    }
    try {
      if (online) {
        await api.startDelivery(delivery.id, { lat: position.lat, lng: position.lng })
      } else {
        await db.syncQueue.add({
          type: 'start',
          deliveryId: delivery.id,
          payload: JSON.stringify({ lat: position.lat, lng: position.lng }),
          createdAt: Date.now(),
          retries: 0,
        })
      }
      // Invalide les getDelivery en vol pour qu'ils ne remettent pas « pending ».
      detailFetchGen.current += 1
      updateStop(delivery.id, { status: 'in_progress' })
      setStep('photos')
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        const d = (e.data as { distanceM?: number })?.distanceM
        setError(`Hors géofence${d != null ? ` (${d} m)` : ''}`)
      } else {
        setError(e instanceof Error ? e.message : 'Erreur démarrage')
      }
    } finally {
      setLoading(false)
    }
  }, [delivery, reading, online, updateStop])

  const photoGps = useMemo((): { lat: number; lng: number } => {
    if (reading) return { lat: reading.lat, lng: reading.lng }
    if (delivery?.coordinates) return delivery.coordinates
    return { lat: 0, lng: 0 }
  }, [reading, delivery?.coordinates])

  const closeCamera = useCallback(() => {
    stopMediaStream(cameraStreamRef.current)
    cameraStreamRef.current = null
    setCameraStream(null)
    setCameraOpenError(null)
    setShowCamera(false)
  }, [])

  const uploadPhoto = useCallback(
    async (blob: Blob, meta: { lat: number; lng: number; hash: string }, index: number) => {
      if (!delivery) return
      const paletteNumber = `PRODUIT-${index + 1}`
      if (online) {
        try {
          await api.uploadPhoto(delivery.id, blob, { ...meta, paletteNumber })
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            throw new Error('Photo similaire déjà enregistrée — reprenez sous un angle différent', {
              cause: e,
            })
          }
          throw e
        }
      } else {
        await db.pendingPhotos.add({
          deliveryId: delivery.id,
          blob,
          hash: meta.hash,
          lat: meta.lat,
          lng: meta.lng,
          paletteNumber,
          createdAt: Date.now(),
          retries: 0,
        })
      }
      setPhotos((p) => [...p, { blob, meta }])
      closeCamera()
    },
    [delivery, online, closeCamera]
  )

  const processPhotoFile = useCallback(
    async (file: File | undefined) => {
      if (!file || !delivery) return
      setPhotoBusy(true)
      setError(null)
      try {
        const validation = validatePhotoFile(file, file.type)
        if (validation) throw new Error(validation)
        setPendingPhoto(file)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur lors de la photo')
      } finally {
        setPhotoBusy(false)
        if (photoInputRef.current) photoInputRef.current.value = ''
      }
    },
    [delivery],
  )

  const confirmPendingPhoto = useCallback(async () => {
    if (!pendingPhoto || !delivery) return
    setPhotoBusy(true)
    setError(null)
    try {
      const hash = await computePerceptualHash(pendingPhoto)
      if (await isDuplicatePhoto(hash, delivery.id)) {
        setError('Photo similaire déjà prise — changez de cadrage')
        return
      }
      const coords = await extractGpsFromImage(pendingPhoto, photoGps)
      await registerPhotoHash(hash, delivery.id)
      await uploadPhoto(pendingPhoto, { ...coords, hash }, photos.length)
      setPendingPhoto(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la photo')
    } finally {
      setPhotoBusy(false)
    }
  }, [pendingPhoto, delivery, photoGps, uploadPhoto, photos.length])

  const handleTakePhotoDesktop = useCallback(async () => {
    setError(null)
    setCameraOpenError(null)
    stopMediaStream(cameraStreamRef.current)
    cameraStreamRef.current = null
    setCameraStream(null)
    setShowCamera(false)

    if (!isCameraApiAvailable()) {
      setError('Caméra navigateur indisponible. Utilisez « Choisir une photo » ci-dessous.')
      return
    }

    setCameraOpening(true)
    try {
      const stream = await openCameraStreamWithTimeout()
      cameraStreamRef.current = stream
      setCameraStream(stream)
      setShowCamera(true)
    } catch (e) {
      setCameraOpenError(cameraErrorMessage(e))
      setShowCamera(true)
    } finally {
      setCameraOpening(false)
    }
  }, [])

  const simulateTestPhoto = useCallback(async () => {
    if (!delivery) return
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`
    ctx.fillRect(0, 0, 64, 64)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.9)
    })
    const hash = await computePerceptualHash(blob)
    await registerPhotoHash(hash, delivery.id)
    await uploadPhoto(blob, { ...photoGps, hash }, photos.length)
  }, [delivery, photoGps, uploadPhoto, photos.length])

  const handleOutcomeChange = (outcome: DeclarationOutcome) => {
    setDeclareOutcome(outcome)
    if (outcome === 'full') {
      setDeclareLines(fullLinesFromPlanned(expectedPalettes, deliveryProducts))
    } else if (outcome === 'rejected') {
      setDeclareLines(buildRejectedLines(expectedPalettes, deliveryProducts, displayUnit))
    } else {
      setDeclareLines(buildPartialDeclareLines(expectedPalettes, deliveryProducts, displayUnit))
    }
  }

  const handleDeclare = useCallback(async () => {
    if (!delivery) return
    if (
      declared ||
      delivery.status === 'otp_sent' ||
      isDeliveryTerminal(delivery.status)
    ) {
      setError('Cette déclaration est déjà enregistrée ou la livraison est clôturée.')
      return
    }
    if (!declareOutcome) {
      setError('Choisissez une option : livraison acceptée, partielle ou refusée.')
      return
    }
    const validationError = validateDeclarationBeforeSubmit(
      declareLines,
      expectedPalettes,
      declareOutcome,
      deliveryProducts
    )
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    setError(null)
    const payload = { outcome: declareOutcome, lines: declareLines }
    try {
      if (online) {
        // Si le démarrage n’a pas été persisté (hors-ligne, reset seed, Failed to fetch),
        // le serveur refuse encore la déclaration en statut pending — on démarre d’abord.
        if (delivery.status === 'pending' || delivery.status === 'in_progress') {
          try {
            await api.startDelivery(delivery.id, {
              lat: photoGps.lat,
              lng: photoGps.lng,
            })
            updateStop(delivery.id, { status: 'in_progress' })
          } catch (startErr) {
            if (
              startErr instanceof ApiError &&
              startErr.status === 422 &&
              /déjà|progress|en cours/i.test(startErr.message)
            ) {
              // déjà démarrée côté serveur
            } else if (delivery.status === 'pending') {
              throw startErr
            }
            // in_progress local : tenter la déclaration malgré un start redondant en échec réseau
          }
        }
        const result = await api.declareDelivery(delivery.id, payload)
        setDeclareOfflineQueued(false)
        setDeclared(true)
        updateStop(delivery.id, { declarationOutcome: declareOutcome })
        setRequiredPhotosTarget(
          applyPhotoTargetFromApi(result.requiredPhotos, result.lines ?? declareLines)
        )
        if (result.lines) setDeclareLines(result.lines)
      } else {
        await db.syncQueue.add({
          type: 'start',
          deliveryId: delivery.id,
          payload: JSON.stringify({ lat: photoGps.lat, lng: photoGps.lng }),
          createdAt: Date.now(),
          retries: 0,
        })
        await db.syncQueue.add({
          type: 'declare',
          deliveryId: delivery.id,
          payload: JSON.stringify(payload),
          createdAt: Date.now() + 1,
          retries: 0,
        })
        setDeclared(true)
        setDeclareOfflineQueued(true)
        updateStop(delivery.id, { status: 'in_progress', declarationOutcome: declareOutcome })
        setRequiredPhotosTarget(applyPhotoTargetFromApi(undefined, declareLines))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur déclaration')
    } finally {
      setLoading(false)
    }
  }, [
    delivery,
    declared,
    declareLines,
    declareOutcome,
    deliveryProducts,
    expectedPalettes,
    online,
    photoGps.lat,
    photoGps.lng,
    updateStop,
  ])

  const resetDeliveryFlow = useCallback(
    async (opts?: { reloadFromApi?: boolean }) => {
      if (!delivery) return
      await purgeSyncQueueForDelivery(delivery.id)
      updateStop(delivery.id, { status: 'pending' })
      setStep('start')
      setPhotos([])
      setDeclared(false)
      setDeclareOfflineQueued(false)
      setOtp('')
      setDevOtpHint(null)
      const products = fallbackDeliveryProducts(expectedPalettes, undefined, displayUnit)
      setDeliveryProducts(products)
      const decl = applyDeclarationFromApi(expectedPalettes, undefined, false, null, displayUnit)
      setDeclareLines(decl.declareLines)
      setDeclareOutcome(decl.declareOutcome)
      if (opts?.reloadFromApi && !api.isMock) {
        const data = await api.getDelivery(delivery.id)
        hydrateFromDetail(delivery.id, expectedPalettes, data)
      }
    },
    [delivery, expectedPalettes, displayUnit, updateStop, hydrateFromDetail]
  )

  const requestCancel = useCallback(() => {
    if (!delivery) return
    if (step !== 'photos' && step !== 'declare') {
      setError('Annulation impossible à cette étape')
      return
    }
    setError(null)
    setShowCancelConfirm(true)
  }, [delivery, step])

  const confirmCancel = useCallback(async () => {
    if (!delivery) return
    setShowCancelConfirm(false)
    if (!online) {
      setError('Connexion requise pour annuler la livraison')
      return
    }
    setLoading(true)
    setError(null)
    try {
      try {
        await api.cancelDelivery(delivery.id)
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 422)) throw e
      }
      await resetDeliveryFlow({ reloadFromApi: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Annulation impossible')
    } finally {
      setLoading(false)
    }
  }, [delivery, online, resetDeliveryFlow])

  const handleSendOtp = useCallback(async () => {
    if (!delivery) return
    // Renvoi depuis l’écran OTP : la déclaration a déjà été faite (serveur / statut otp_sent)
    const resending =
      step === 'otp' || delivery.status === 'otp_sent'
    if (!declared && !resending && !api.isMock) {
      setError('Enregistrez d’abord la déclaration des quantités.')
      return
    }
    if (resendCooldown > 0) {
      setError(`Patientez encore ${resendCooldown}s avant de renvoyer le code.`)
      return
    }
    setLoading(true)
    setError(null)
    setOtpStatus(resending ? 'Envoi d’un nouveau code…' : 'Envoi du code…')
    try {
      let devOtp: string | undefined
      let notice: string | null = null
      if (online) {
        await processSyncQueue()
        const res = await api.sendOtp(delivery.id)
        devOtp = res.devOtpCode
        if (res.smsWarning) {
          notice = res.smsWarning
        } else if (res.sent === false) {
          notice = 'Le SMS n’a pas pu être confirmé — vérifiez le téléphone du point ou Textbee.'
        } else {
          const to = res.smsTo ? ` au responsable du point (${res.smsTo})` : ' au responsable du point'
          notice = resending
            ? `Nouveau code envoyé par SMS${to}.`
            : `Code envoyé par SMS${to}.`
          if (res.smsNotice) notice = `${notice} ${res.smsNotice}`
        }
      } else {
        await db.syncQueue.add({
          type: 'send-otp',
          deliveryId: delivery.id,
          payload: '{}',
          createdAt: Date.now(),
          retries: 0,
        })
        notice = 'Hors ligne : le code sera envoyé dès le retour du réseau.'
      }
      if (devOtp) {
        setDevOtpHint(devOtp)
        setOtp(devOtp)
      } else if (resending) {
        // Nouveau code : effacer l’ancien saisi pour forcer la relecture du SMS
        setOtp('')
      }
      updateStop(delivery.id, { status: 'otp_sent' })
      setDeclared(true)
      setStep('otp')
      setOtpStatus(notice)
      setResendCooldown(import.meta.env.VITE_E2E === 'true' ? 1 : 30)
    } catch (e) {
      setOtpStatus(null)
      if (e instanceof ApiError && e.status === 422) {
        const msg = e.message
        if (/Photos insuffisantes/i.test(msg) && testBypass.minPhotosOnly) {
          setError(
            `${msg} — activez PHOTOS_MIN_ONLY=true sur l’API Livraison (voir VALIDATIONS-TESTS.md).`
          )
        } else {
          setError(msg)
        }
      } else if (e instanceof ApiError && e.status === 429) {
        setError('Trop de renvois — patientez quelques minutes puis réessayez.')
      } else {
        setError(e instanceof Error ? e.message : 'Envoi OTP échoué')
      }
    } finally {
      setLoading(false)
    }
  }, [delivery, declared, online, updateStop, step, resendCooldown])

  const handleConfirm = useCallback(async () => {
    if (!delivery) return
    if (!online && !api.isMock) {
      setError('Connexion requise pour valider la livraison')
      return
    }
    if (!/^\d{6}$/.test(otp)) {
      setError('Code OTP à 6 chiffres requis')
      return
    }

    let pos: GpsReading | null = reading
    if (!pos) {
      try {
        pos = await getCurrentPosition()
      } catch {
        if (shouldSkipGeofence(api.isMock)) {
          pos = {
            lat: delivery.coordinates.lat,
            lng: delivery.coordinates.lng,
            accuracy: 0,
            timestamp: Date.now(),
          }
        }
      }
    }
    if (!pos) {
      setError('Position GPS requise — autorisez la géolocalisation et réessayez.')
      return
    }

    const geo = shouldSkipGeofence(api.isMock)
      ? { ok: true as const }
      : checkGeofence(pos, delivery.coordinates, 100)
    if (!geo.ok) {
      setError(`Vérification GPS finale : ${geo.distanceM} m du point (max 100 m)`)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await api.confirmDelivery(delivery.id, {
        otp,
        lat: pos.lat,
        lng: pos.lng,
      })
      updateStop(delivery.id, {
        status: 'delivered',
        receiptId: result.receiptId,
        certificateUrl: result.certificateUrl,
        declarationOutcome:
          result.declarationOutcome ??
          (result.isRejected ? 'rejected' : result.isPartial ? 'partial' : declareOutcome),
      })
      setConfirmResult(result)
      toast.success(
        result.receiptId
          ? `Livraison confirmée — certificat ${result.receiptId}`
          : 'Livraison confirmée',
      )
      setTimeout(() => navigate('/', { replace: true }), 3500)
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setOtpAttempts((a) => a - 1)
        setError('Code OTP incorrect')
        if (otpAttempts <= 1) setError('Nombre de tentatives épuisé')
      } else {
        setError(e instanceof Error ? e.message : 'Validation échouée')
      }
    } finally {
      setLoading(false)
    }
  }, [delivery, reading, online, otp, otpAttempts, updateStop, navigate, declareOutcome])

  useDemoDeliveryAutoplay({
    delivery,
    deliveryId: id,
    expectedPalettes,
    deliveryProducts,
    devOtpHint,
    otp,
    setOtp,
    setStep,
    setDeclareOutcome,
    setDeclareLines,
    handleStart,
    simulateTestPhoto,
    handleDeclare,
    handleSendOtp,
    handleConfirm,
  })

  if (!delivery) {
    if (tourLoading || detailLoading) {
      return (
        <div className="page page-center" role="status">
          <div className="loading-block">
            <span className="loading-block__spinner" aria-hidden="true" />
            <span>Chargement de la livraison…</span>
          </div>
        </div>
      )
    }
    return (
      <div className="page page-center">
        <p>Livraison introuvable</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
          Retour
        </button>
      </div>
    )
  }

  if (detailLoading) {
    return (
      <div className="page page-center" role="status">
        <div className="loading-block">
          <span className="loading-block__spinner" aria-hidden="true" />
          <span>Chargement de la livraison…</span>
        </div>
      </div>
    )
  }

  const tourDate = tour?.date ?? ''
  const isFuture = tourDate && isFutureTourDate(tourDate)
  const isReadOnly = tourDate && !isTodayTourDate(tourDate)
  const declarationLocked =
    declared ||
    delivery.status === 'otp_sent' ||
    isDeliveryTerminal(delivery.status)

  if (isDeliveryTerminal(delivery.status) && !confirmResult) {
    return (
      <TerminalDeliveryView
        delivery={delivery}
        tourDate={tourDate}
        onBack={() => navigate('/')}
      />
    )
  }

  if (tourDate && !canOpenDelivery(delivery.status, tourDate) && !confirmResult) {
    const lockLabel = deliveryAccessLabel(delivery.status, tourDate, delivery.declarationOutcome)
    return (
      <div className="page page-center">
        <p>{lockLabel ?? 'Cette livraison n’est plus accessible.'}</p>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
          Retour au tableau de bord
        </button>
      </div>
    )
  }

  // Mode lecture seule pour les livraisons futures
  if (isReadOnly && delivery.status === 'pending') {
    return (
      <div className="page delivery-page">
        <header className="delivery-header">
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} aria-label="Retour">
            ←
          </button>
          <span className="badge badge-info">{isFuture ? 'Livraison future' : 'Vue lecture seule'}</span>
        </header>

        <section>
          <h1>{delivery.name}</h1>
          <p>{delivery.address}</p>
          {delivery.instructions && <p className="instructions">{delivery.instructions}</p>}
          <dl className="info-grid">
            <dt>Date de livraison</dt>
            <dd>{new Date(`${tourDate}T12:00:00`).toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}</dd>
            <dt>Contenu</dt>
            <dd>{formatDriverDeliveryContent(delivery.units, delivery.unitType, delivery.products)}</dd>
            <dt>Réf.</dt>
            <dd>{delivery.orderRef}</dd>
            <dt>Créneau</dt>
            <dd>{delivery.timeWindow.start} – {delivery.timeWindow.end}</dd>
          </dl>
          <div className="info-panel" style={{ marginTop: 24, padding: 16, background: 'var(--color-bg-secondary)', borderRadius: 8 }}>
            <p style={{ margin: 0 }}>
              {isFuture
                ? 'Cette livraison est planifiée pour une date future. Vous pourrez la démarrer le jour J.'
                : "Cette livraison n'est pas accessible pour modification."}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginTop: 24 }}
            onClick={() => navigate('/')}
          >
            Retour au tableau de bord
          </button>
        </section>
      </div>
    )
  }

  if (pendingPhoto && delivery) {
    return (
      <PhotoPreviewOverlay
        blob={pendingPhoto}
        error={error}
        busy={photoBusy}
        onRetake={() => {
          setPendingPhoto(null)
          setError(null)
        }}
        onConfirm={() => void confirmPendingPhoto()}
      />
    )
  }

  if (showCamera && delivery && (cameraStream || cameraOpenError)) {
    return (
      <CameraCapture
        gps={photoGps}
        deliveryId={delivery.id}
        stream={cameraStream}
        openError={cameraOpenError}
        onCapture={async (blob, meta) => {
          await uploadPhoto(blob, meta, photos.length)
        }}
        onCancel={closeCamera}
        onDuplicate={() => setError('Photo similaire déjà prise — changez de cadrage')}
      />
    )
  }

  const steps: Step[] = ['start', 'photos', 'declare', 'otp', 'confirm']
  const inDeliveryFlow = step === 'photos' || step === 'declare'
  const canCancel =
    inDeliveryFlow &&
    delivery.status !== 'otp_sent' &&
    delivery.status !== 'delivered' &&
    delivery.status !== 'failed'

  const cancelButton = canCancel ? (
    <button
      type="button"
      className="btn btn-ghost btn-block delivery-cancel-btn"
      disabled={loading}
      data-testid="cancel-delivery"
      onClick={() => requestCancel()}
    >
      Annuler la livraison
    </button>
  ) : null

  return (
    <div className="page delivery-page">
      <header className="delivery-header">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)} aria-label="Retour">
          ←
        </button>
        <StatusBadge status={delivery.status} declarationOutcome={delivery.declarationOutcome} />
      </header>

      <ol className="step-indicator" aria-label="Étapes livraison">
        {steps.map((s, i) => {
          const current = steps.indexOf(step)
          return (
            <li
              key={s}
              className={step === s ? 'active' : i < current ? 'done' : ''}
              aria-current={step === s ? 'step' : undefined}
            >
              {i + 1}
            </li>
          )
        })}
      </ol>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {step === 'start' && (
        <section>
          <h1>{delivery.name}</h1>
          <p>{delivery.address}</p>
          {delivery.instructions && <p className="instructions">{delivery.instructions}</p>}
          <dl className="info-grid">
            <dt>Contenu</dt>
            <dd>{formatDriverDeliveryContent(expectedPalettes, displayUnit, deliveryProducts)}</dd>
            <dt>Réf.</dt>
            <dd>{delivery.orderRef}</dd>
          </dl>
          {reading && (
            <p className="gps-info" aria-live="polite">
              GPS : {reading.lat.toFixed(5)}, {reading.lng.toFixed(5)} · ±{Math.round(reading.accuracy)} m
            </p>
          )}
          {gpsError && <p role="alert">{gpsError}</p>}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!(ready || shouldSkipGeofence(api.isMock)) || loading}
            data-testid="start-delivery"
            onClick={() => void handleStart()}
          >
            Démarrer la livraison
          </button>
        </section>
      )}

      {step === 'photos' && (
        <section>
          <h2>
            Photos produits
            {maxPhotos > photoTarget ? (
              <span className="hint" style={{ display: 'block', fontSize: 14, fontWeight: 400 }}>
                {photos.length} prise(s) · minimum {photoTarget}
                {maxPhotos > photoTarget ? ` · jusqu’à ${maxPhotos} (une par produit)` : ''}
              </span>
            ) : (
              <span className="hint" style={{ display: 'block', fontSize: 14, fontWeight: 400 }}>
                {photos.length} / {photoTarget} photo(s)
                {deliveryProducts.length > 1 ? ' — une par produit commandé' : ''}
              </span>
            )}
            {testBypass.minPhotosOnly && (
              <span className="hint" style={{ display: 'block', fontSize: 14, fontWeight: 400 }}>
                Mode test : 1 photo suffit pour continuer, vous pouvez en ajouter d’autres
              </span>
            )}
          </h2>
          <p>Utilisez la caméra — une photo par produit commandé lorsque c’est possible.</p>
          {!prefersNativeCamera() && (
            <p className="hint">
              Sur Mac : « Choisir une photo » ouvre vos images (Photo Booth, Captures d’écran, etc.).
              « Utiliser la webcam » pour la caméra live dans le navigateur.
            </p>
          )}
          <ul className="photo-thumbs">
            {photos.map((_, i) => (
              <li key={i}>✓ Photo {i + 1}</li>
            ))}
          </ul>
          {canAddPhoto && (
            <>
              <input
                ref={photoInputRef}
                id="delivery-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                capture={prefersNativeCamera() ? 'environment' : undefined}
                className="visually-hidden"
                data-testid="photo-file-input"
                disabled={photoBusy || loading}
                onChange={(e) => void processPhotoFile(e.target.files?.[0])}
              />
              {prefersNativeCamera() ? (
                <label
                  htmlFor="delivery-photo-input"
                  className={`btn btn-primary btn-block${photoBusy || loading ? ' btn-disabled' : ''}`}
                  data-testid="take-photo"
                  aria-disabled={photoBusy || loading}
                  style={photoBusy || loading ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
                >
                  {photoBusy ? 'Traitement photo…' : photos.length === 0 ? 'Prendre photo' : 'Prendre une autre photo'}
                </label>
              ) : (
                <>
                  <label
                    htmlFor="delivery-photo-input"
                    className={`btn btn-primary btn-block${photoBusy || loading ? ' btn-disabled' : ''}`}
                    data-testid="choose-photo"
                    aria-disabled={photoBusy || loading}
                    style={photoBusy || loading ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
                  >
                    {photoBusy ? 'Traitement photo…' : photos.length === 0 ? 'Choisir une photo' : 'Choisir une autre photo'}
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    data-testid="take-photo"
                    disabled={photoBusy || loading || cameraOpening}
                    onClick={() => void handleTakePhotoDesktop()}
                  >
                    {cameraOpening ? 'Ouverture webcam…' : 'Utiliser la webcam'}
                  </button>
                </>
              )}
              {SHOW_DEV_PHOTO_TOOLS && (
                <button
                  type="button"
                  className="btn btn-secondary btn-block"
                  data-testid="simulate-photo"
                  disabled={photoBusy || loading}
                  onClick={() => void simulateTestPhoto().catch((e) => {
                    setError(e instanceof Error ? e.message : 'Échec simulation photo')
                  })}
                >
                  Simuler photo (dev)
                </button>
              )}
            </>
          )}
          {canProceedToDeclare && !declarationLocked && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              data-testid="go-declare"
              onClick={() => setStep('declare')}
            >
              Continuer vers la déclaration
            </button>
          )}
          {canProceedToDeclare && declarationLocked && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              data-testid="go-declare-locked"
              onClick={() => setStep(delivery.status === 'otp_sent' ? 'otp' : 'declare')}
            >
              {delivery.status === 'otp_sent' ? 'Continuer vers le code OTP' : 'Voir la déclaration'}
            </button>
          )}
          {canProceedToDeclare && canAddPhoto && (
            <p className="hint">
              Minimum atteint — vous pouvez ajouter d&apos;autres photos ou passer à la déclaration.
            </p>
          )}
          {!canProceedToDeclare && canAddPhoto && (
            <p className="hint">
              Encore {photoTarget - photos.length} photo(s) minimum avant la déclaration.
            </p>
          )}
          {cancelButton}
        </section>
      )}

      {step === 'declare' && (
        <section>
          <PartialDeclaration
            expectedPalettes={expectedPalettes}
            plannedUnit={plannedUnit}
            outcome={declareOutcome}
            lines={declareLines}
            deliveryProducts={deliveryProducts}
            declared={declarationLocked}
            loading={loading}
            onOutcomeChange={handleOutcomeChange}
            onLinesChange={setDeclareLines}
            onSubmit={() => void handleDeclare()}
          />
          {declarationLocked && !isDeliveryTerminal(delivery.status) && (
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 16 }}
              disabled={loading || photos.length < photoTarget}
              data-testid="send-otp"
              onClick={() => void handleSendOtp()}
            >
              Envoyer code au responsable
            </button>
          )}
          {declarationLocked && photos.length < photoTarget && (
            <>
              <p className="hint">
                Il manque {photoTarget - photos.length} photo(s) ({photos.length}/{photoTarget}) avant
                l&apos;OTP.
              </p>
              <button
                type="button"
                className="btn btn-secondary btn-block"
                data-testid="add-photo"
                onClick={() => setStep('photos')}
              >
                Ajouter une photo
              </button>
            </>
          )}
          {declarationLocked && declareOfflineQueued && (
            <p className="hint success-text">
              Déclaration enregistrée localement — synchronisation au retour du réseau.
            </p>
          )}
          {cancelButton}
        </section>
      )}

      {step === 'otp' && (
        <section>
          <p>SMS envoyé au contact du point de livraison.</p>
          {otpStatus && (
            <p className="hint success-text" role="status" aria-live="polite" data-testid="otp-status">
              {otpStatus}
            </p>
          )}
          {devOtpHint && (
            <p className="hint success-text">Code test (dev) : {devOtpHint}</p>
          )}
          <label htmlFor="otp">Code à 6 chiffres</label>
          <input
            id="otp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="otp-input"
            autoComplete="one-time-code"
          />
          <p className="hint">Tentatives restantes : {otpAttempts}</p>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="resend-otp"
            disabled={resendCooldown > 0 || loading}
            onClick={() => void handleSendOtp()}
          >
            {loading
              ? 'Envoi…'
              : resendCooldown > 0
                ? `Renvoyer (${resendCooldown}s)`
                : 'Renvoyer'}
          </button>
          {resendCooldown > 0 && !loading && (
            <p className="hint">Nouveau renvoi possible dans {resendCooldown}s.</p>
          )}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={otp.length !== 6}
            data-testid="otp-continue"
            onClick={() => setStep('confirm')}
          >
            Continuer
          </button>
        </section>
      )}

      {step === 'confirm' && (
        <section>
          <h2>Confirmation</h2>
          <Summary delivery={delivery} photos={photos.length} otp={otp} />
          {reading ? (
            <p className="gps-info" aria-live="polite">
              GPS : {reading.lat.toFixed(5)}, {reading.lng.toFixed(5)} · ±{Math.round(reading.accuracy)} m
            </p>
          ) : (
            <p className="hint" aria-live="polite">
              {gpsError ?? 'Acquisition GPS en cours…'}
            </p>
          )}
          {confirmResult ? (
            <div
              className={`fraud-alert fraud-${confirmResult.fraudLevel}`}
              role="alert"
              data-testid="confirm-receipt"
            >
              <p>Reçu : {confirmResult.receiptId}</p>
              <p>
                Score fraude : {confirmResult.fraudScore}/100 ({confirmResult.fraudLevel})
              </p>
              {confirmResult.fraudLevel !== 'low' && <p>Vérification manuelle recommandée</p>}
              <p>Redirection vers le tableau de bord…</p>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={loading || !online || otp.length !== 6}
              data-testid="confirm-delivery"
              onClick={() => void handleConfirm()}
            >
              {loading ? 'Validation…' : 'Valider la livraison'}
            </button>
          )}
          {!online && <p className="form-error">Connexion requise pour la validation finale</p>}
        </section>
      )}

      {showCancelConfirm && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="confirm-panel">
            <h2 id="cancel-title">Annuler la livraison ?</h2>
            <p>
              Revenir à « À démarrer » ? Les photos et la déclaration enregistrées seront effacées.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-secondary"
                data-testid="cancel-delivery-dismiss"
                onClick={() => setShowCancelConfirm(false)}
              >
                Retour
              </button>
              <button
                type="button"
                className="btn btn-primary"
                data-testid="cancel-delivery-confirm"
                disabled={loading}
                onClick={() => void confirmCancel()}
              >
                {loading ? 'Annulation…' : 'Confirmer l’annulation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TerminalDeliveryView({
  delivery,
  tourDate,
  onBack,
}: {
  delivery: DeliveryPoint
  tourDate: string
  onBack: () => void
}) {
  const [loading, setLoading] = useState(!api.isMock)
  const [expectedLines, setExpectedLines] = useState(() =>
    expectedProductsDisplay(null, delivery.units, delivery.unitType),
  )
  const [deliveredLines, setDeliveredLines] = useState<ReturnType<typeof buildDeliveredProductsDisplay>>([])
  const [declarationOutcome, setDeclarationOutcome] = useState<string | null>(
    delivery.declarationOutcome ?? null,
  )

  useEffect(() => {
    if (api.isMock) {
      const expected = expectedProductsDisplay(null, delivery.units, delivery.unitType)
      setExpectedLines(expected)
      setDeliveredLines(
        buildDeliveredProductsDisplay(
          expected,
          null,
          delivery.status,
          delivery.declarationOutcome ?? 'full',
        ),
      )
      setLoading(false)
      return
    }
    void (async () => {
      try {
        const data = await api.getDelivery(delivery.id)
        const units = Number(data.delivery?.expected_palettes) || delivery.units
        const unit = data.plannedUnit ?? delivery.unitType
        const expected = expectedProductsDisplay(
          data.products ?? null,
          units,
          unit,
        )
        const outcome = data.declarationOutcome ?? delivery.declarationOutcome ?? null
        setExpectedLines(expected)
        setDeliveredLines(
          buildDeliveredProductsDisplay(
            expected,
            data.adjustmentLines,
            delivery.status,
            outcome,
          ),
        )
        setDeclarationOutcome(outcome)
      } catch {
        const expected = expectedProductsDisplay(null, delivery.units, delivery.unitType)
        setExpectedLines(expected)
        setDeliveredLines(
          buildDeliveredProductsDisplay(expected, null, delivery.status, delivery.declarationOutcome),
        )
      } finally {
        setLoading(false)
      }
    })()
  }, [delivery.id, delivery.units, delivery.unitType, delivery.status, delivery.declarationOutcome])

  const lockLabel = deliveryAccessLabel(delivery.status, tourDate, declarationOutcome)

  return (
    <div className="page delivery-page" data-testid="delivery-terminal-view">
      <header className="delivery-header">
        <button type="button" className="btn btn-ghost" onClick={onBack} aria-label="Retour">
          ←
        </button>
        <StatusBadge status={delivery.status} declarationOutcome={declarationOutcome} />
      </header>

      <section>
        <h1>{delivery.name}</h1>
        <p>{delivery.address}</p>
        {delivery.instructions && <p className="instructions">{delivery.instructions}</p>}
        {lockLabel && <p className="hint">{lockLabel}</p>}

        {loading ? (
          <div className="loading-block" role="status">
            <span className="loading-block__spinner" aria-hidden="true" />
            <span>Chargement…</span>
          </div>
        ) : (
          <dl className="info-grid">
            <dt>Quantité attendue</dt>
            <dd>
              <ul className="product-qty-list">
                {expectedLines.map((line, i) => (
                  <li key={i}>{formatProductQuantityLine(line)}</li>
                ))}
              </ul>
            </dd>
            <dt>Quantité livrée</dt>
            <dd data-testid="delivered-quantity-lines">
              {deliveredLines.length > 0 ? (
                <ul className="product-qty-list">
                  {deliveredLines.map((line, i) => (
                    <li key={i}>{formatProductQuantityLine(line)}</li>
                  ))}
                </ul>
              ) : (
                <span>{deliveredQuantityEmptyLabel(delivery.status, declarationOutcome)}</span>
              )}
            </dd>
            <dt>Réf.</dt>
            <dd>{delivery.orderRef}</dd>
          </dl>
        )}

        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 24 }} onClick={onBack}>
          Retour au tableau de bord
        </button>
      </section>
    </div>
  )
}

function PhotoPreviewOverlay({
  blob,
  error,
  busy,
  onRetake,
  onConfirm,
}: {
  blob: Blob
  error: string | null
  busy: boolean
  onRetake: () => void
  onConfirm: () => void
}) {
  const url = useMemo(() => URL.createObjectURL(blob), [blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <div className="camera-overlay">
      <div className="camera-panel">
        <h2 style={{ color: '#fff', margin: 0 }}>Confirmer la photo</h2>
        <img src={url} alt="Aperçu" className="camera-preview" />
        {error && <p role="alert" className="camera-error">{error}</p>}
        <div className="camera-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onRetake}>
            Reprendre
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid="confirm-photo"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Enregistrement…' : 'Valider la photo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Summary({
  delivery,
  photos,
  otp,
}: {
  delivery: DeliveryPoint
  photos: number
  otp: string
}) {
  return (
    <dl className="summary-list">
      <dt>Point</dt>
      <dd>{delivery.name}</dd>
      <dt>Contenu</dt>
      <dd>{formatDriverDeliveryContent(delivery.units, delivery.unitType, delivery.products)}</dd>
      <dt>Photos</dt>
      <dd>{photos}</dd>
      <dt>Code</dt>
      <dd>{otp}</dd>
    </dl>
  )
}
