import type { Request, Response, NextFunction } from 'express'

/** En-têtes de durcissement HTTP (équivalent helmet minimal). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self)')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.netlify.app https://*.tile.openstreetmap.org",
      "frame-ancestors 'none'",
    ].join('; '),
  )
  next()
}
