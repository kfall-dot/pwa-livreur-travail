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
            Côte d'Ivoire 🇨🇮
          </div>
          <h1 className="landing-hero__title">
            La traçabilité au service de vos{' '}
            <span className="landing-hero__accent">livraisons</span>
          </h1>
          <p className="landing-hero__subtitle">
            Du dépôt au chantier, chaque produit est suivi, photographié et certifié.
          </p>
          <div className="landing-hero__actions">
            <Link to="/login" className="landing-hero__btn landing-hero__btn--primary">
              Accéder à mon espace
            </Link>
            <a href="#features" className="landing-hero__btn landing-hero__btn--secondary">
              Découvrir
            </a>
          </div>
          <div className="landing-hero__stats">
            <div className="landing-hero__stat">
              <span className="landing-hero__stat-value">100%</span>
              <span className="landing-hero__stat-label">Traçabilité</span>
            </div>
            <div className="landing-hero__stat">
              <span className="landing-hero__stat-value">Temps réel</span>
              <span className="landing-hero__stat-label">Suivi photos</span>
            </div>
            <div className="landing-hero__stat">
              <span className="landing-hero__stat-value">Multi-chantiers</span>
              <span className="landing-hero__stat-label">Centralisé</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <h2 className="landing-section__title">Fonctionna        <h2 className="landinsName="landing-features__grid">
          <div className="landing-feature">
            <div className="landing-feature__i          /div>
            <h3>Suivi temps réel</h3>
            <p>Chaque livraison tracée du dépôt au chantier</p>
          </div>
          <div className="l          <div className="l          <div className="l          <div classNav>
            <h3>Bons de commande</h3>
            <p>Gestion BC/BT avec validations multi-niveaux</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__icon">👥</div>
            <h3>Équipe & chantiers</h3>
            <p>Gérez livreurs, DT, chefs de chantier</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__icon">🏗️</div>
            <h3>Achats chantier</h3>
            <p>EB, validations DT/DAF/PDG, suivi budget</p>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__icon">📊</div>
            <h3>Tableaux de bord</h3>
            <p>KPI par chantier, livreur, période</p>
          </div>
          <div className="landing-feature">
                                                                          <h3>Alertes intelligentes</h3>
            <p>Notifications in-app et SMS</p>
          </div>
        </div>
      </section>

      <section id="how" className="landing-section">
        <h2 className="landing-section__title">Comment ça marche</h2>
        <div className="landing-how__grid">
          <div className="landing-how__step">
            <div className="landing-how__num">1</div>
            <h3>Expression de besoin</h3>
            <p>Via WhatsApp ou directement dans l'app</p>
          </div>
          <div className="landing-how__step">
            <div className="landing-how__num">2</div>
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
            <p>Temps réel pour toutes les parties</p>
          </div>
        </div>
      </section>

      <section id="pricing" className="landing-section">
        <h2 className="landing-section__title">Tarifs</h2>
        <div className="landing-pricing__grid">
          <div className="landing-pricing__card">
            <h3>Démo</h3>
            <p className="landing-pricing__price">Gratuit</p>
            <ul>
              <li>1 chantier</li>
              <li>3 livreurs</li>
              <li>Support e-mail</li>
            </ul>
            <Link to="/login" className="landing-pricing__btn">Commencer</Link>
          </div>
          <div className="landing-pricing__card landing-pricing__card--featured">
            <div className="landing-pricing__badge">Populaire</div>
            <h3>Pilote BTP</h3>
            <p className="landing-pricing__price">Sur devis</p>
            <ul>
              <li>Chantiers illimités</li>
              <li>Livreurs illimités</li>
              <li>Achats complets</li>
              <li>Alertes SMS</li>
              <li>Support prioritaire</li>
            </ul>
            <a href="mailto:contact@traceo.ci" className="landing-pricing__btn landing-pricing__btn--primary">Contact</a>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <h2>Prêt à transformer vos livraisons ?</h2>
        <div className="landing-cta__actions">
          <Link to="/login" className="landing-cta__btn landing-cta__btn--primary">Se connecter</Link>
          <a href="mailto:contact@traceo.ci" className="landing-cta__btn landing-cta__btn--secondary">Démo</a>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer__brand">
          <TraceOMark onBrand layout="badge" withMotto />
          <p>© {new Date().getFullYear()} TraceO® — Côte d'Ivoire</p>
        </div>
      </footer>
    </div>
  )
}
