import { BRAND_MOTTO } from '../brand'
import { TraceOMark } from './brand/TraceOMark'
import { useOnline } from '../hooks/useOnline'

type DriverHeroProps = {
  name: string
  roleLabel?: string
}

export function DriverHero({ name, roleLabel = 'Livreur TraceO®' }: DriverHeroProps) {
  const online = useOnline()
  const helloName = name.trim() || 'Livreur'

  return (
    <header className="driver-hero">
      <TraceOMark onBrand layout="wordmark" withMotto={false} className="driver-hero__brand" />
      <p className="driver-hero__motto-watermark" aria-hidden="true">
        {BRAND_MOTTO}
      </p>
      <div className="driver-hero__row">
        <div className="driver-hero__identity">
          <img
            className="driver-hero__avatar"
            src="/brand/driver-avatar.png"
            alt=""
            width={48}
            height={48}
          />
          <div>
            <p className="driver-hero__hello">Bonjour, {helloName}</p>
            <p className="driver-hero__role">{roleLabel}</p>
          </div>
        </div>
        <span className="driver-hero__online">
          <span className="driver-hero__online-dot" aria-hidden="true" />
          {online ? 'En ligne' : 'Hors ligne'}
        </span>
      </div>
    </header>
  )
}
