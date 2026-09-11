import { Link } from 'react-router-dom'
import { TraceOMark } from '../components/brand/TraceOMark'

export function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-nav__inner">
          <TraceOMark onBrand layout="badge" withMotto={false} />
          <div className="landing-nav__links">
            <a href="#features" className="landing-nav__link">Fonctionnalités</a>
            <a href="#how" className="landing-nav__link">Comment ça marche</a>
            <a href="#pricing" className="landing-nav__link">Tarifs</a>
            <Link to="/login" className="landing-nav__cta">Se connecter</Link>
          </div>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__badge">
            <span className="landing-hero__badge-dot" />
                                                                           e="landing-hero__title">
            La traçabilité au service de vos{' '}
            <span className="landing-hero__accent">livraisons</span>
          </h1>
          <p className="landing-hero__sub">
            Du dépôt au chantier, chaque produit est suivi, photographié et certifié.
          </p>
          <div className="landing-hero__actions">
            <Link to="/login" className="landing-hero__btn landing-hero__btn--primary">
              Accéder à mon e              Accéder à mon e              Accéder à  className="landing-her              Accéder à mon e              Accéder à mon e                        Accéder à mon e              Accéder à mon e                       <div className="landing-hero__stat">
              <span className="landing-hero__stat-value">100%</span>
              <span c              <span c              <span abilité</span>
            </div>
            <div className="landing-hero__stat">
              <span className="landing-hero__stat-value">📸</span>
              <span className="landing-hero__stat-label">Suivi               <span className="landing-hero__stat-label">Suivi  ding-hero__stat">
              <span className="landing-hero__stat-value">☁️</span>
              <span className="landing-hero__stat-label">Centralisé</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <h2 className="landing-section__title">Fonctionnalités</h2>
        <div className="landing-features">
          <div className="landing-feature">
            <div className="landing-feature__icon">📦</div>
            <h3>Suivi temps réel</h3>
            <p>Chaque livraison tracée du dépôt au chantier</            <p>Chaque livraison tracée du e="landing-feature">
            <div className="landing-feature__icon">📋</div>
            <h3>Bons de commande</h3>
            <p>Gestion BC/BT avec validations multi            <p>Gestion BC/BT avec validations multi            <p>Gtu            <p>Gestion BC/BT avec validations multi            <p>Gestion BC/BT avec validations multi            <p>Gtu            <p>Gestio/PDG, suivi budget</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__icon">🔔</div>
                   rtes intelligentes</h3>
            <p>Notifications in            <p>Notifications in            <p>Notificatise            <p>Notifications in className="landing-section">
        <h2 className="landing-section__title">Comment ça marche</h2>
        <div className="        <div className="        <div className="        <div            <div className="landing-how__num">1</div>
            <h3>Expression de besoin</h3>
            <p>Via WhatsApp ou directement dans l'app</p>
          </div          </div          </div          </div          </div<d          </div          </div      iv>
            <h3>Validation</h3>
            <p>DT, DAF, PDG valident la demande</p>
          </div>
          <div className="landing-how__step">
            <div className="landing-how__num">3</div>
            <h3>Livraison</h3>
            <p>Avec preuve photo et signature</p>
          </div>
          <div className="landing-how__step">
            <div className="landing-how__num">4</div>
            <h3>Suivi</h3>
            <p>Tableaux de bord et rapports</p>
          </div>
        </div>
      </section>

      <section id="pricing" className="landing-section">
        <h2 className="landing-section__title">Tarifs</h2>
        <div className="landi        <div className="landi        <div className="landi        <div className="landi        <div className="landsName="landing-pricing__price">Gratuit</p>
            <ul>
              <li>1 chantier</li>
              <li>3 livreurs</li>
              <li>Support e-mail</li>
            </ul>
          </div>
          <div className="landing-pricing__card landing-pricing__card--          <div className="landing-pricing__cag-pricing__badge">Popula          <div className="landing-pricing__c          <p className="landing-pricing__price">Sur devis</p>
            <ul>
              <li>Chantiers illimités</li>
              <li>Livreurs illimités</li>
              <li>Achats complets</li>
              <li>Alertes SMS</li>
                                      /li>
            </ul>
            <a href="mailto:            <a ci" className="la         cing__btn            <a href="mailto:            <a ci" class  </div>
        </div>
      </section>

      <section className="landing-cta">
        <h2>Prêt à transformer vos livraisons ?</h2>
        <div className="landing-cta__actions">
          <Link to="/login" className="landing-cta__btn landing-cta _btn--primary">Se connecter</Link>
          <a href="mailto:contact@traceo.ci" clas          <a href="mailto:contg-cta__btn--secondary">Démo</a>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer__brand">
          <TraceOMark onBrand layout="badge" withMotto />
          <p>© {new Date().getFullYear()} TraceO® — Côte d'Ivoire</p>
          <p>>
      </footer>
    </div>
  )
}
