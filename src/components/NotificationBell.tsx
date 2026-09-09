import { useCallback, useEffect, useState } from 'react'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  link?: string | null
  read: boolean
  createdAt: string
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const unreadCount = notifications.filter((n) => !n.read).length

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications ?? [])
      }
    } catch {
      /* silencieux */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) loadNotifications()
  }, [open, loadNotifications])

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' })
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    } catch {
      /* silencieux */
    }
  }

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      /* silencieux */
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 20,
          position: 'relative',
          padding: 4,
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: '#ef4444',
              color: '#fff',
              borderRadius: 10,
              fontSize: 10,
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            width: 320,
            maxHeight: 400,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              borderBottom: '1px solid #e5e7eb',
              position: 'sticky',
              top: 0,
              background: '#fff',
            }}
          >
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Tout marquer lu
              </button>
            )}
          </div>
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
              Chargement...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: '#6b7280' }}>
              Aucune notification
            </div>
          ) : (
            notifications.slice(0, 20).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (!n.read) markAsRead(n.id)
                  if (n.link) {
                    window.location.href = n.link
                  }
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: n.read ? '#fff' : '#eff6ff',
                  border: 'none',
                  borderBottom: '1px solid #f3f4f6',
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: n.read ? 400 : 600,
                    color: '#111827',
                    marginBottom: 2,
                  }}
                >
                  {n.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#6b7280',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.message}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
