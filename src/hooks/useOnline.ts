import { useEffect, useState } from 'react'
import { processSyncQueue, registerBackgroundSync } from '../lib/sync'

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => {
      setOnline(true)
      void processSyncQueue()
      registerBackgroundSync()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return online
}
