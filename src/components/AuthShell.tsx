import type { ReactNode } from 'react'
import { BRAND_FOOTER } from '../brand'
import { TraceOMark } from './brand/TraceOMark'

type AuthShellProps = {
  roleTitle: string
  roleSubtitle: string
  children: ReactNode
  variant?: 'default' | 'driver-hero'
}

function AuthFooter() {
  return (
    <footer className="auth-footer">
      <span className="auth-footer-proof">
        <span className="auth-footer-shield" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l7 3v6c0 5-3.5 9.4-7 11-3.5-1.6-7-6-7-11V5l7-3z" />
          </svg>
          <span className="auth-footer-shield-check">✓</span>
        </span>
        {BRAND_FOOTER}
      </span>
      <span className="auth-footer-flag">Côte d'Ivoire</span>
    </footer>
  )
}

export function AuthShell({
  roleTitle,
  roleSubtitle,
  children,
  variant = 'default',
}: AuthShellProps) {
  const isHero = variant === 'driver-hero'

  if (!isHero) {
    return (
      <div className="auth-shell-v2">
        <div className="auth-wrapper">
          {/* Brand — gauche */}
          <div className="auth-brand-side">
            <TraceOMark onBrand layout="wordmark" withMotto={false} />
            <p className="auth-tagline">La traçabilité au service de vos activités.</p>
            <div className="auth-features">
              <div className="auth-feature">
                <div className="auth-feature-icon">📊</div>
                <div>
                  <div className="auth-feature-title">Suivi en temps réel</div>
                  <div className="auth-feature-desc">Suivez chaque livraison du dépôt au chantier</div>
                </div>
              </div>
              <div className="auth-feature">
                <div className="auth-feature-icon">📋</div>
                <div>
                  <div className="auth-feature-title">Conformité BC</div>
                  <div className="auth-feature-desc">Les produits sont verrouillés par bon de commande</div>
                </div>
              </div>
              <div className="auth-feature">
                <div className="auth-feature-icon">📷</div>
                <div>
                  <div className="auth-feature-title">Preuves photos</div>
                  <div className="auth-feature-desc">Chaque arrêt est documenté et certifié</div>
                </div>
              </div>
            </div>
          </div>

          {/* Séparation subtile */}
          <div className="auth-divider" />

          {/* Formulaire — droite */}
          <div className="auth-form-side">
            <div className="auth-card">
              <h2>{roleTitle}</h2>
              <p className="auth-card-subtitle">{roleSubtitle}</p>
              {children}
            </div>
          </div>
        </div>

        <AuthFooter />
      </div>
    )
  }

  return (
    <div className="auth-shell auth-shell--driver-hero">
      <div className="auth-shell__stage">
        <div className="auth-shell__panel">
          <header className="auth-shell__header">
            <TraceOMark onBrand layout="wordmark" withMotto />
          </header>

          <div className="auth-shell__body">
            <div className="auth-card auth-card--hero">
              <h1 className="auth-card__role">{roleTitle}</h1>
              <p className="auth-card__subtitle">{roleSubtitle}</p>
              {children}
            </div>
          </div>

          <div className="auth-shell__hero-wrap auth-shell__hero-wrap--mobile">
            <svg
              className="auth-shell__wave"
              viewBox="0 0 390 48"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d="M0 0 H390 V10 C300 42 220 48 195 36 C160 20 80 8 0 28 Z"
                fill="#ffffff"
              />
            </svg>
            <div className="auth-shell__hero">
              <img
                className="auth-shell__hero-img"
                src="/brand/login-hero-v2.jpg"
                alt="Livreur TraceO® à Abidjan"
                width={1600}
                height={1066}
                decoding="async"
                fetchPriority="high"
              />
            </div>
          </div>

          <AuthFooter />
        </div>

        <aside className="auth-shell__hero-desktop" aria-label="Livreur TraceO® à Abidjan">
          <img
            className="auth-shell__hero-img auth-shell__hero-img--desktop"
            src="/brand/login-hero-v2.jpg"
            alt=""
            width={1600}
            height={1066}
            decoding="async"
          />
          <div className="auth-shell__hero-desktop-veil" />
          <p className="auth-shell__hero-desktop-caption">
            Preuves terrain. Engagements tenus.
          </p>
        </aside>
      </div>
    </div>
  )
}
