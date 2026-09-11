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
            Suivi en temps réel, preuves photographiques et certification de vos livraisons BTP.
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
              <span className="landing-hero__stat-value">500+</span>
              <span className="landing-hero__stat-label">Livraisons suivies</span>
            </div>
            <div className="landing-hero__stat">
              <span className="landing-hero__stat-value">50+</span>
              <span className="landing-hero__stat-label">Chantiers actifs</span>
            </div>
            <div className="landing-hero__stat">
              <span className="landing-hero__stat-value">99%</span>
              <span className="landing-hero__stat-label">Satisfaction</span>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-features">
        <div className="landing-features__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Tout ce dont vous avez besoin</h2>
            <p className="landing-section__subtitle">Une solution complète pour la gestion de vos livraisons BTP</p>
          </div>
          <div className="landing-features__grid">
            <div className="landing-feature">
              <div className="landing-feature__icon">📸</div>
              <h3 className="landing-feature__title">Preuve photo</h3>
              <p className="landing-feature__text">Chaque livraison est photographiée et horodatée.</p>
            </div>
            <div className="landing-feature">
              <div className="landing-feature__icon">📍</div>
              <h3 className="landing-feature__title">Géolocalisation</h3>
              <p className="landing-feature__text">Suivi GPS en temps réel de vos livreurs.</p>
            </div>
            <div className="landing-feature">
              <div className="landing-feature__icon">✅</div>
              <h3 className="landing-feature__title">Certification OTP</h3>
              <p className="landing-feature__text">Code OTP pour confirmer la réception.</p>
            </div>
            <div className="landing-feature">
              <div className="landing-feature__icon">📊</div>
              <h3 className="landing-feature__title">Tableaux de bord</h3>
              <p className="landing-feature__text">Visualisez vos indicateurs en un coup d'œil.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="landing-how">
        <div className="landing-how__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Comment ça marche</h2>
            <p className="landing-section__subtitle">Trois étapes simples pour démarrer</p>
          </div>
          <div className="landing-how__steps">
            <div className="landing-how__step">
              <div className="landing-how__step-number">1</div>
              <h3 className="landing-how__step-title">Créez votre compte</h3>
              <p className="landing-how__step-text">Inscrivez votre entreprise et invitez vos équipes.</p>
            </div>
            <div className="landing-how__step">
              <div className="landing-how__step-number">2</div>
              <h3 className="landing-how__step-title">Planifiez vos livraisons</h3>
              <p className="landing-how__step-text">Créez des tournées et assignez-les à vos livreurs.</p>
            </div>
            <div className="landing-how__step">
              <div className="landing-how__step-number">3</div>
              <h3 className="landing-how__step-title">Suivez en temps réel</h3>
              <p className="landing-how__step-text">Recevez les preuves de livraison et certifiez chaque réception.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="landing-pricing">
        <div className="landing-pricing__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Tarifs simples</h2>
            <p className="landing-section__subtitle">Choisissez la formule adaptée à votre activité</p>
          </div>
          <div className="landing-pricing__grid">
            <div className="landing-pricing__card">
              <h3 className="landing-pricing__name">Starter</h3>
              <div className="landing-pricing__price">
                <span className="landing-pricing__amount">25 000</span>
                <span className="landing-pricing__currency">FCFA</span>
                <span className="landing-pricing__period">/mois</span>
              </div>
              <ul className="landing-pricing__features">
                <li>Jusqu'à 3 livreurs</li>
                <li>50 livraisons/mois</li>
                <li>Support email</li>
              </ul>
              <Link to="/login" className="landing-pricing__btn">Commencer</Link>
            </div>
            <div className="landing-pricing__card landing-pricing__card--featured">
              <div className="landing-pricing__badge">Populaire</div>
              <h3 className="landing-pricing__name">Pro</h3>
              <div className="landing-pricing__price">
                <span className="landing-pricing__amount">75 000</span>
                <span className="landing-pricing__currency">FCFA</span>
                <span className="landing-pricing__period">/mois</span>
              </div>
              <ul className="landing-pricing__features">
                <li>Livreurs illimités</li>
                <li>Livraisons illimitées</li>
                <li>Support prioritaire</li>
                <li>Tableaux de bord avancés</li>
              </ul>
              <Link to="/login" className="landing-pricing__btn landing-pricing__btn--primary">Commencer</Link>
            </div>
            <div className="landing-pricing__card">
              <h3 className="landing-pricing__name">Entreprise</h3>
              <div className="landing-pricing__price">
                <span className="landing-pricing__amount">Sur mesure</span>
              </div>
              <ul className="landing-pricing__features">
                <li>Multi-sites</li>
                <li>API dédiée</li>
                <li>Formation incluse</li>
                <li>Support 24/7</li>
              </ul>
              <a href="mailto:contact@traceo.ci" className="landing-pricing__btn">Nous contacter</a>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-cta__inner">
          <h2 className="landing-cta__title">Prêt à optimiser vos livraisons ?</h2>
          <p className="landing-cta__text">Rejoignez les entreprises ivoiriennes qui font confiance à TraceO.</p>
          <Link to="/login" className="landing-cta__btn">Démarrer maintenant</Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <TraceOMark onBrand layout="badge" withMotto={false} />
            <p className="landing-footer__tagline">La traçabilité au service de vos livraisons</p>
          </div>
          <div className="landing-footer__links">
            <div className="landing-footer__column">
              <h4 className="landing-footer__title">Produit</h4>
              <a href="#features" className="landing-footer__link">Fonctionnalités</a>
              <a href="#pricing" className="landing-footer__link">Tarifs</a>
            </div>
            <div className="landing-footer__column">
              <h4 className="landing-footer__title">Entreprise</h4>
              <a href="mailto:contact@traceo.ci" className="landing-footer__link">Contact</a>
            </div>
          </div>
        </div>
        <div className="landing-footer__bottom">
          <p>&copy; 2026 TraceO. Tous droits réservés. Fait en Côte d'Ivoire 🇨🇮</p>
        </div>
      </footer>
    </div>
  )
}
