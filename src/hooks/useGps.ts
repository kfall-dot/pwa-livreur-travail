import { useEffect, useState } from 'react'
import { type GpsReading, watchPosition } from '../lib/geo'
import { testBypass } from '../lib/testBypass'

/** Position fixe dev/E2E — Abidjan (pilote), pas Paris. */
const E2E_GPS: GpsReading = {
  lat: 5.32,
  lng: -4.016,
  accuracy: 5,
  timestamp: Date.now(),
}

export function useGps(enabled = true) {
  const [reading, setReading] = useState<GpsReading | null>(
    testBypass.fixedGps ? E2E_GPS : null
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!testBypass.fixedGps)

  useEffect(() => {
    if (!enabled) return
    if (testBypass.fixedGps) {
      setReading(E2E_GPS)
      setLoading(false)
      return
    }
    setLoading(true)
    const stop = watchPosition(
      (r) => {
        setReading(r)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(
          err.code === 1
            ? 'Autorisez la géolocalisation dans les paramètres'
            : 'GPS indisponible'
        )
        setLoading(false)
      }
    )
    return stop
  }, [enabled])

  const ready =
    reading != null && (testBypass.relaxGpsAccuracy || reading.accuracy <= 100)

  return { reading, error, loading, ready }
}
