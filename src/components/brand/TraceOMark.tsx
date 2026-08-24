import { BRAND_MOTTO } from '../../brand'
import { TraceOIcon } from './TraceOIcon'

type TraceOMarkProps = {
  withMotto?: boolean
  onBrand?: boolean
  /**
   * wordmark → « Trace » + logo à la place du O (+ ®)
   * badge    → même wordmark, compact (headers)
   * stack    → logo au-dessus + TraceO®
   */
  layout?: 'wordmark' | 'badge' | 'stack'
  /** Conservé pour les icônes hors wordmark (layout stack) */
  iconSize?: number
  className?: string
}

export function TraceOMark({
  withMotto = true,
  onBrand = false,
  layout = 'wordmark',
  iconSize,
  className = '',
}: TraceOMarkProps) {
  const classes = [
    'traceo-mark',
    onBrand ? 'traceo-mark--on-brand' : '',
    layout === 'badge' ? 'traceo-mark--badge' : '',
    layout === 'stack' ? 'traceo-mark--stack' : '',
    layout === 'wordmark' ? 'traceo-mark--wordmark' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const stackIconSize = iconSize ?? 52
  const iconVariant = onBrand ? 'onBrand' : 'color'

  /**
   * « O » fantôme (même police que Trace) → métriques / chasse correctes.
   * Le mark SVG est superposé dessus pour lire comme une lettre.
   */
  const wordmark = (
    <p className="traceo-mark__name traceo-mark__name--integrated" aria-label="TraceO®">
      <span className="traceo-mark__trace" aria-hidden="true">
        Trace
      </span>
      <span className="traceo-mark__o-slot" aria-hidden="true">
        <span className="traceo-mark__o-ghost">O</span>
        <TraceOIcon
          className="traceo-mark__o"
          variant={iconVariant}
          title=""
          asLetter
        />
      </span>
      <span className="traceo-mark__reg" aria-hidden="true">
        ®
      </span>
    </p>
  )

  return (
    <div className={classes}>
      {(layout === 'wordmark' || layout === 'badge') && wordmark}

      {layout === 'stack' && (
        <>
          <TraceOIcon
            className="traceo-mark__icon"
            size={stackIconSize}
            variant={iconVariant}
          />
          {wordmark}
        </>
      )}

      {withMotto && <p className="traceo-mark__motto">{BRAND_MOTTO}</p>}
      {withMotto && <span className="traceo-mark__accent" aria-hidden="true" />}
    </div>
  )
}
