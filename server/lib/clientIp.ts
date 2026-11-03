import { isIP } from 'node:net'

export interface ClientIpRequest {
  headers: { [key: string]: string | string[] | undefined }
  socket?: { remoteAddress?: string }
}

function validIp(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const ip = value.trim()
  if (!isIP(ip) || ip.includes('%')) return undefined
  if (ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4) return ip.slice(7)
  // Canonicalise IPv6 so equivalent spellings cannot create separate counters.
  return isIP(ip) === 6 ? new URL(`http://[${ip}]`).hostname.slice(1, -1) : ip
}

/** Railway public HTTP ingress supplies X-Real-IP. Never trust arbitrary XFF.
 * Direct/local servers only use the socket. Railway private callers remain inside
 * the trusted ingress boundary and must not expose an alternate public TCP port.
 * https://docs.railway.com/networking/public-networking/specs-and-limits
 */
export function clientIpFromRequest(
  req: ClientIpRequest,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.RAILWAY_PROJECT_ID && env.RAILWAY_SERVICE_ID) {
    const edgeIp = validIp(req.headers['x-real-ip'])
    if (edgeIp) return edgeIp
  }
  return validIp(req.socket?.remoteAddress)
}
