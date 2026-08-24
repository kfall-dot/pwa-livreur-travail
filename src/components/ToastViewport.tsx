import { useEffect, useState } from 'react'
import { toast, type ToastItem } from '../lib/toast'

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => toast.subscribe(setItems), [])

  if (items.length === 0) return null

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {items.map((item) => (
        <div
          key={item.id}
          className={`toast toast--${item.tone}`}
          role={item.tone === 'error' ? 'alert' : 'status'}
          data-testid={`toast-${item.tone}`}
        >
          <span className="toast__message">{item.message}</span>
          <button
            type="button"
            className="toast__dismiss"
            aria-label="Fermer"
            onClick={() => toast.dismiss(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
