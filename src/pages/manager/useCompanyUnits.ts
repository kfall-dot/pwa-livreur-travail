import { useCallback, useEffect, useState } from 'react'
import { authFetch } from './managerApi'
import type { UnitRow } from './managerTypes'

export function useCompanyUnits(refreshKey = 0) {
  const [units, setUnits] = useState<UnitRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch('/dashboard/units')
      const data = (await res.json()) as { units?: UnitRow[]; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Impossible de charger les unités')
      setUnits(data.units ?? [])
    } catch (err) {
      setUnits([])
      setError(err instanceof Error ? err.message : 'Unités indisponibles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, refreshKey])

  const activeUnits = units.filter((u) => u.active !== false)

  return { units, activeUnits, loading, error, refresh }
}
