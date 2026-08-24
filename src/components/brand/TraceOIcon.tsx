/**
 * Mark TraceO — calqué sur docs/maquettes/logo-concept-2-route-o.png
 * C/O ouvert à droite · pointillés · pin orange · waypoint orange
 */
type TraceOIconProps = {
  size?: number
  variant?: 'color' | 'onBrand' | 'mono' | 'tile'
  className?: string
  /** Vide = décoratif (dans le wordmark Trace+O) */
  title?: string
  /**
   * Optimisé pour remplacer la lettre O : viewBox resserré sur l’anneau,
   * trait un peu plus fin pour coller au gras de DM Sans.
   */
  asLetter?: boolean
}

const GREEN = '#0b4a2c'
const ORANGE = '#e85d04'

const CX = 32
const CY = 34
const R = 17

function polar(deg: number, radius = R) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) }
}

function arcPath(a: number, b: number, radius = R) {
  const start = polar(a, radius)
  const end = polar(b, radius)
  const sweep = (b - a + 360) % 360
  const large = sweep > 180 ? 1 : 0
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

/** Angles des pastilles sur l’ouverture (haut → bas, hors pin / waypoint) */
const DOT_ANGLES = [42, 58, 74, 92] as const

export function TraceOIcon({
  size = 40,
  variant = 'color',
  className = '',
  title = 'TraceO',
  asLetter = false,
}: TraceOIconProps) {
  if (variant === 'tile') {
    return (
      <img
        src="/brand/traceo-icon-tile.png"
        width={size}
        height={size}
        alt={title || ''}
        className={className}
        draggable={false}
      />
    )
  }

  const mono = variant === 'mono'
  const ring = variant === 'onBrand' ? '#ffffff' : mono ? 'currentColor' : GREEN
  const accent = mono ? 'currentColor' : ORANGE
  const hole = mono ? '#ffffff' : variant === 'onBrand' ? GREEN : '#ffffff'
  const decorative = !title

  // Trait plus gras en lettre pour coller au weight 700 de DM Sans
  const sw = asLetter ? 5.6 : 4.8
  const dotR = asLetter ? 1.85 : 1.65
  const wayR = asLetter ? 2.7 : 2.55

  // Arc plein : bas-droite → gauche → haut (s’arrête avant le pin)
  const solid = arcPath(128, 22)
  const waypoint = polar(118)
  const pinAt = polar(22)
  const pinTip = 12.5

  // asLetter : cadre centré sur l’anneau (le pin déborde un peu en haut)
  const viewBox = asLetter ? '10 4 48 52' : '0 0 64 64'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={asLetter ? undefined : size}
      height={asLetter ? undefined : size}
      viewBox={viewBox}
      fill="none"
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <path d={solid} stroke={ring} strokeWidth={sw} strokeLinecap="round" fill="none" />
      {DOT_ANGLES.map((deg) => {
        const p = polar(deg)
        return <circle key={deg} cx={p.x} cy={p.y} r={dotR} fill={ring} />
      })}
      <circle cx={waypoint.x} cy={waypoint.y} r={wayR} fill={accent} />
      <g transform={`translate(${pinAt.x.toFixed(2)} ${(pinAt.y - pinTip).toFixed(2)})`}>
        <path
          fill={accent}
          d="M0 12.5 C-5.2 5.3 -7.6 2.2 -7.6 -2 A7.6 7.6 0 1 1 7.6 -2 C7.6 2.2 5.2 5.3 0 12.5 Z"
        />
        <circle cx="0" cy="-2" r="2.9" fill={hole} />
      </g>
    </svg>
  )
}
