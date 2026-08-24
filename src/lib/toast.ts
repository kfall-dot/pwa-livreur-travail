export type ToastTone = 'success' | 'error' | 'info'

export type ToastItem = {
  id: string
  message: string
  tone: ToastTone
  durationMs: number
}

type Listener = (items: ToastItem[]) => void

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 3200,
  error: 4500,
  info: 3500,
}

let items: ToastItem[] = []
const listeners = new Set<Listener>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function emit() {
  const snapshot = items.slice()
  for (const listener of listeners) listener(snapshot)
}

function remove(id: string) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  items = items.filter((t) => t.id !== id)
  emit()
}

function push(message: string, tone: ToastTone, durationMs?: number) {
  const text = message.trim()
  if (!text) return
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const ms = durationMs ?? DEFAULT_DURATION[tone]
  const item: ToastItem = { id, message: text, tone, durationMs: ms }
  items = [...items.slice(-4), item]
  emit()
  timers.set(
    id,
    setTimeout(() => remove(id), ms),
  )
}

export const toast = {
  show(message: string, tone: ToastTone = 'info', durationMs?: number) {
    push(message, tone, durationMs)
  },
  success(message: string, durationMs?: number) {
    push(message, 'success', durationMs)
  },
  error(message: string, durationMs?: number) {
    push(message, 'error', durationMs)
  },
  info(message: string, durationMs?: number) {
    push(message, 'info', durationMs)
  },
  dismiss(id: string) {
    remove(id)
  },
  subscribe(listener: Listener) {
    listeners.add(listener)
    listener(items.slice())
    return () => {
      listeners.delete(listener)
    }
  },
}
