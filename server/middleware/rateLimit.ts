import type { Request, Response, NextFunction } from 'express'
import { getStore } from '@netlify/blobs'
import { isBlobsEnabled } from '../lib/blobs.js'
import { allowTestBypass } from '../config/production.js'

type Window = { count: number; resetAt: number }

const memoryStore = new Map<string, Window>()
const BLOBS_STORE = 'rate-limits'

function rateLimitDisabled(): boolean {
  return allowTestBypass() && process.env.VITE_E2E === 'true'
}

async function readWindow(key: string): Promise<Window | undefined> {
  if (isBlobsEnabled()) {
    try {
      const store = getStore({ name: BLOBS_STORE, consistency: 'strong' })
      const data = (await store.get(key, { type: 'json' })) as Window | null
      if (data && typeof data.count === 'number' && typeof data.resetAt === 'number') {
        memoryStore.set(key, data)
        return data
      }
    } catch {
      // fallback mémoire (dev sans Blobs)
    }
  }
  return memoryStore.get(key)
}

async function writeWindow(key: string, entry: Window): Promise<void> {
  memoryStore.set(key, entry)
  if (!isBlobsEnabled()) return
  try {
    const store = getStore({ name: BLOBS_STORE, consistency: 'strong' })
    await store.setJSON(key, entry)
  } catch {
    // mémoire seule
  }
}

/**
 * Compteur partagé entre instances serverless via Netlify Blobs quand disponible,
 * sinon Map in-process (dev local / fallback).
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  if (rateLimitDisabled()) return { allowed: true }
  const now = Date.now()
  const entry = await readWindow(key)
  if (!entry || now >= entry.resetAt) {
    await writeWindow(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }
  if (entry.count >= max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
  }
  entry.count += 1
  await writeWindow(key, entry)
  return { allowed: true }
}

/** Reset mémoire (tests unitaires uniquement). */
export function resetRateLimitMemoryForTests(): void {
  memoryStore.clear()
}

export async function clearRateLimitKey(key: string): Promise<void> {
  memoryStore.delete(key)
  if (!isBlobsEnabled()) return
  try {
    const store = getStore({ name: BLOBS_STORE, consistency: 'strong' })
    await store.delete(key)
  } catch {
    // ignore
  }
}

/** Lit l'état du compteur sans incrémenter. */
export async function isRateLimitBlocked(
  key: string,
  max: number,
): Promise<{ blocked: false } | { blocked: true; retryAfterSec: number }> {
  if (rateLimitDisabled()) return { blocked: false }
  const now = Date.now()
  const entry = await readWindow(key)
  if (!entry || now >= entry.resetAt) return { blocked: false }
  if (entry.count >= max) {
    return {
      blocked: true,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    }
  }
  return { blocked: false }
}

/** Enregistre un échec (incrémente le compteur). */
export async function recordFailureHit(
  key: string,
  maxFailures: number,
  windowMs: number,
): Promise<{ blocked: boolean; retryAfterSec?: number }> {
  if (rateLimitDisabled()) return { blocked: false }
  const result = await checkRateLimit(key, maxFailures, windowMs)
  if (!result.allowed) {
    return { blocked: true, retryAfterSec: result.retryAfterSec }
  }
  return { blocked: false }
}

function clientKey(req: Request, suffix: string): string {
  const forwarded = req.headers['x-forwarded-for']
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ||
    req.socket.remoteAddress ||
    'unknown'
  return `${suffix}:${ip}`
}

export function rateLimitByIp(max: number, windowMs: number, suffix: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await checkRateLimit(clientKey(req, suffix), max, windowMs)
    if (!result.allowed) {
      res.status(429).json({
        message: 'Trop de tentatives. Réessayez plus tard.',
        retryAfterSec: result.retryAfterSec,
      })
      return
    }
    next()
  }
}

export function rateLimitByBodyField(
  field: string,
  max: number,
  windowMs: number,
  suffix: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const value = (req.body as Record<string, unknown> | undefined)?.[field]
    const id = typeof value === 'string' ? value.trim().toLowerCase() : ''
    const key = id ? `${suffix}:${id}` : clientKey(req, suffix)
    const result = await checkRateLimit(key, max, windowMs)
    if (!result.allowed) {
      res.status(429).json({
        message: 'Trop de tentatives. Réessayez plus tard.',
        retryAfterSec: result.retryAfterSec,
      })
      return
    }
    next()
  }
}
