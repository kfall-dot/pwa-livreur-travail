import { useCallback, useEffect, useRef, useState } from 'react'
import { attachStreamToVideo } from '../lib/camera'
import {
  captureFromVideo,
  computePerceptualHash,
  extractGpsFromImage,
  isDuplicatePhoto,
  registerPhotoHash,
  validatePhotoFile,
} from '../lib/photo'
import type { Coordinates } from '../types'

interface Props {
  gps: Coordinates
  deliveryId: string
  stream: MediaStream | null
  openError?: string | null
  onCapture: (blob: Blob, meta: { lat: number; lng: number; hash: string }) => void | Promise<void>
  onCancel: () => void
  onDuplicate: () => void
}

export function CameraCapture({
  gps,
  deliveryId,
  stream,
  openError = null,
  onCapture,
  onCancel,
  onDuplicate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [preview, setPreview] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(openError)
  const [busy, setBusy] = useState(false)
  const [streamReady, setStreamReady] = useState(false)

  useEffect(() => {
    setError(openError ?? null)
  }, [openError])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) {
      setStreamReady(false)
      return
    }

    let cancelled = false
    setStreamReady(false)
    setError(null)

    void attachStreamToVideo(video, stream)
      .then(() => {
        if (!cancelled) setStreamReady(true)
      })
      .catch((err) => {
        if (!cancelled) {
          setStreamReady(false)
          setError(err instanceof Error ? err.message : 'Impossible d\'afficher la caméra.')
        }
      })

    return () => {
      cancelled = true
      video.srcObject = null
    }
  }, [stream])

  const processBlob = useCallback(async (blob: Blob) => {
    const err = validatePhotoFile(blob, blob.type || 'image/jpeg')
    if (err) {
      setError(err)
      return
    }
    setPreview(blob)
    setError(null)
  }, [])

  const handleCapture = useCallback(async () => {
    const video = videoRef.current
    if (!video || !streamReady) return
    setBusy(true)
    setError(null)
    try {
      const blob = await captureFromVideo(video)
      await processBlob(blob)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur capture')
    } finally {
      setBusy(false)
    }
  }, [processBlob, streamReady])

  const handleFilePick = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      setBusy(true)
      setError(null)
      try {
        await processBlob(file)
      } finally {
        setBusy(false)
      }
    },
    [processBlob],
  )

  const handleValidate = useCallback(async () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const hash = await computePerceptualHash(preview)
      if (await isDuplicatePhoto(hash, deliveryId)) {
        onDuplicate()
        setPreview(null)
        return
      }
      const coords = await extractGpsFromImage(preview, gps)
      await registerPhotoHash(hash, deliveryId)
      await onCapture(preview, { ...coords, hash })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du téléversement')
    } finally {
      setBusy(false)
    }
  }, [preview, gps, deliveryId, onCapture, onDuplicate])

  const filePicker = (
    <label className="btn btn-secondary camera-file-btn">
      Choisir une photo
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="visually-hidden"
        onChange={(e) => void handleFilePick(e.target.files?.[0])}
      />
    </label>
  )

  if ((error || openError) && !preview && !stream) {
    return (
      <div className="camera-overlay">
        <div className="camera-panel">
          <p role="alert">{error ?? openError}</p>
          {filePicker}
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Retour
          </button>
        </div>
      </div>
    )
  }

  if (preview) {
    const url = URL.createObjectURL(preview)
    return (
      <div className="camera-overlay">
        <div className="camera-panel">
          <img src={url} alt="Aperçu photo" className="camera-preview" onLoad={() => URL.revokeObjectURL(url)} />
          {error && <p role="alert" className="camera-error">{error}</p>}
          <div className="camera-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setPreview(null)
                setError(null)
              }}
              disabled={busy}
            >
              Reprendre
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleValidate()}
              disabled={busy}
            >
              {busy ? 'Téléversement…' : 'Valider'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="camera-overlay">
      <button type="button" className="camera-close btn btn-ghost" onClick={onCancel}>
        Annuler
      </button>

      <div className="camera-stage">
        {stream ? (
          <>
            <video ref={videoRef} className="camera-video" playsInline muted autoPlay aria-label="Vue caméra" />
            {!streamReady && (
              <p className="camera-status" role="status">
                Autorisez la caméra dans Chrome si demandé…
              </p>
            )}
          </>
        ) : (
          <p role="alert" className="camera-status">
            {error ?? openError ?? 'Caméra indisponible.'}
          </p>
        )}
      </div>

      {error && <p role="alert" className="camera-error">{error}</p>}

      <div className="camera-controls">
        {stream && (
          <button
            type="button"
            className="camera-shutter"
            onClick={() => void handleCapture()}
            disabled={busy || !streamReady}
            aria-label="Prendre la photo"
          />
        )}
        {filePicker}
      </div>
    </div>
  )
}
