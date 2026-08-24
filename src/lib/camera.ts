/** Ouvre la caméra — doit être appelé depuis un geste utilisateur (clic / touch). */
function getUserMediaWithTimeout(
  constraints: MediaStreamConstraints,
  timeoutMs = 8_000,
): Promise<MediaStream> {
  return Promise.race([
    navigator.mediaDevices.getUserMedia(constraints),
    new Promise<MediaStream>((_, reject) => {
      window.setTimeout(() => reject(new Error('camera-timeout')), timeoutMs)
    }),
  ])
}

function cameraConstraintsForDevice(): MediaStreamConstraints[] {
  if (prefersNativeCamera()) {
    return [
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ]
  }
  // Mac / desktop : pas de facingMode arrière (bloque souvent Chrome sur MacBook)
  return [
    { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
    { video: true, audio: false },
  ]
}

export async function openCameraStream(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new DOMException('Insecure context', 'SecurityError')
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia unavailable')
  }

  const attempts = cameraConstraintsForDevice()
  let lastError: unknown
  for (const constraints of attempts) {
    try {
      return await getUserMediaWithTimeout(constraints)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError ?? new Error('getUserMedia failed')
}

export function openCameraStreamWithTimeout(timeoutMs = 20_000): Promise<MediaStream> {
  return Promise.race([
    openCameraStream(),
    new Promise<MediaStream>((_, reject) => {
      window.setTimeout(
        () =>
          reject(
            new Error(
              'Délai dépassé — autorisez la caméra dans Chrome (icône dans la barre d’adresse).',
            ),
          ),
        timeoutMs,
      )
    }),
  ])
}

export function isCameraApiAvailable(): boolean {
  return window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function'
}

/** Téléphone / tablette : l’input fichier + capture ouvre l’appareil photo natif. */
export function prefersNativeCamera(): boolean {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches)
  )
}

export function cameraErrorMessage(err: unknown): string {
  if (!window.isSecureContext) {
    return 'Caméra bloquée en HTTP (adresse IP). Utilisez http://localhost:8888 ou choisissez une photo.'
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Caméra non supportée par ce navigateur.'
  }
  const name = err instanceof DOMException ? err.name : ''
  const msg = err instanceof Error ? err.message : ''
  if (msg === 'camera-timeout') {
    return 'La caméra met trop de temps à répondre. Vérifiez les autorisations Chrome et macOS, puis réessayez.'
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Accès caméra refusé. Dans Chrome : icône à gauche de l’URL → Caméra → Autoriser. Sur macOS : Réglages → Confidentialité → Caméra → Chrome.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Aucune caméra détectée sur cet appareil.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Caméra occupée par une autre application. Fermez FaceTime, Zoom, etc., puis réessayez.'
  }
  if (name === 'OverconstrainedError') {
    return 'Paramètres caméra non supportés. Réessayez ou choisissez une photo.'
  }
  if (err instanceof Error && err.message) return err.message
  return 'Impossible d\'accéder à la caméra.'
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop())
}

/** Attache un flux à un élément vidéo et attend les dimensions. */
export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream,
): Promise<void> {
  video.srcObject = stream
  await video.play().catch(() => undefined)
  if (video.videoWidth > 0 && video.videoHeight > 0) return
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('La caméra ne renvoie pas d’image.'))
    }, 10_000)
    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup()
        resolve()
      }
    }
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('playing', onReady)
    }
    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('playing', onReady)
    onReady()
  })
}
