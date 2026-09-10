import { Link } from 'react-router-dom'
import { TraceOMark } from '../components/brand/TraceOMark'

export function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-nav__inner">
          <TraceOMark onBrand layout="badge" withMotto={false} />
          <div className="landing-nav__links">
            <a href="#fonctionnalites" className="landing-nav__link">Fonctionnalités</a>
            <a href="#processus" className="landing-nav__link">Comment ça marche</a>
            <a href="#tarifs" className="landing-nav__link">Tarifs</a>
            <Link to="/login" className="landing-nav__cta">Se connecter</Link>
          </div>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero__bg" aria-hidden="true">
          <div className="landing-hero__orb landing-hero__orb--1" />
          <div className="landing-hero__orb landing-hero__orb--2" />
        </div>
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
            TraceO® garantit la conformité de vos bons de commande en temps réel.
          </p>
          <div className="landing-hero__actions">
            <Link to="/login" className="landing-hero__btn landing-hero__btn--primary">
              Accéder à mon espace
            </Link>
            <a href="#fonctionnalites" className="landing-hero__btn landing-hero__btn--secondary">
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
              <span className="landing-hero__stat-label">Suivi</span>
            </div>
            <div className="landing-hero__stat">
              <span className="landing-hero__stat-value">Zéro</span>
              <span className="landing-hero__stat-label">Perte</span>
            </div>
          </div>
        </div>
      </section>

      <section id="fonctionnalites" className="landing-features">
        <div className="landing-features__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Tout ce dont vous avez besoin</h2>
            <p className="landing-section__subtitle">Une solution complète pour la gestion de vos livraisons chantier</p>
          </div>
          <div className="landing-features__grid">
            <div className="landing-feature-card">
              <div className="landing-feature-card__icon landing-feature-card__icon--blue">📊</div>
                                                                             l</h3>
              <p className="landing-feature-card__desc">Suivez chaque livraison de la commande à la réception.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-card__icon landing-feature-card__icon--green">📸</div>
              <h3 className="landing-feature-card__t              <h3 clh3>
              <p className="landing-feature-card__desc">Chaque livraison est photographiée et horodatée.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-car              <div className="landing-feature-car              <div className="landing-feature-car              <div clasmanagers</h3>
              <p className="landing-feature-card__desc">Notifications instantanées au DT, DAF, PDG, CdG et              <p className="landing-feature-card__desc">Notifications instantanées au DT, DAF, PDG,lassName="landing-feature-card__icon landing-feature-card__icon--orange">📋</div>
                                                                                                                   -fea                 Gestion complète des BC/BT avec suivi d'approbation.                                                                                                    ame                                                                                                                                                                                         "l                ard                       ntelligente des livraisons multi-chantiers.</p>
            </div>
            <div className="landing-feature-card">
              <div className="landing-feature-card__icon landing-feature-card__icon--teal">�              <div className="landing-feature-card__icon landing-feature-card__icon--teal">�              <div className="landing-feature-card__icon landing-feature-card__ic les smartphones.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="processus" className="landing-how">
        <div className="landing-how__inner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Comment ça marche</h2>
            <p className="landing-section__subtitle">Trois étapes simples pour digitaliser vos livraisons</p>
          </div>
          <div className="landing-how__steps">
            <div className="landing-how__step">
              <div className="landing-how__step-num">1</div>
              <h3 className="landing-how__step-title">Planifiez</h3>
              <p className="landing-how__step-desc">Créez vos tournées et assignez les livraisons.</p>
            </div>
            <div className="landing-how__step-line" aria-hidden="true" />
            <div className="landing-how__step">
              <div className="landing-how__step-num">2</div>
              <h3 className="landing-how__step-title">Livrez</h3>
              <p className="landing-how__step-desc">Le livreur suit la livraison et capture les preuves.</p>
            </div>
            <div className="landing-how__step-line" aria-hidden="true" />
            <div className="landing-how__step">
              <div className="landing-how__step-num">3</div>
              <h3 className="landing-how__step-title">Validez</h3>
              <p className="landing-how__step-desc">Le responsable réceptionne via un code OTP.</p>
            </div>
          </div>
                                                                 Na                                                                 Ner">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Tarifs transparents</h2>
            <p className="landing-section__subtitle">Choisissez la formule adaptée à votre activité</p>
          </div>
          <div className="landing-pricing__grid">
            <div className="landing-pricing-card">
              <div className="landing-pricing-card__header">
                <h3 className="landing-pricing-card__name">Démarrage</h3>
                <p className="landing-pricing-card__desc">Pour débuter</p>
              </div>
              <div className="landing-pricing-card__price">
                <span className="landing-pricing-card__amount">0</span>
                <span className="landing-pricing-card__currency">FCFA</span>
                <span className="landing-pricing-card__period">/mois</span>
              </div>
              <ul className="landing-pricing-card__features">
                <li>5 livraisons/mois</li>
                <li>1 livreur</li>
                <li>Suivi basique</li>
                <li>Support email</li>
              </ul>
              <Link to              <Link to              <Link to              <Link to              <Link to        nk>
            </div>
            <div className="landing-pricing-card landing-pricing-card--featured">
              <div class              <div class              <div class                 <div className="landing-pricing-card__header">
                <h3 className="landing-pricing-card__name">Professionnel</h3>
                <p cla                <p ci                <p cla                <p ci                        <div className="landing-pricing-card__price">
                <span className="landing-pricing-card__amount">25 000</span>
                <span className="landing-pricing-card__currency">FCFA</span>
                <span className="landing-pricing-card__period">/mois</span>
              </div>
                                           g-card__features">
                <li>Tournées illimitées</li>
                <li>10 livreurs</li>
                <li>Alertes managers</li>
                <li>Rapports PDF</li>
                <li>Support prioritaire</li>
              </ul>
              <Link to="/login" className="landing-pricing-card__btn landing-pricing-card__btn--primary">Commenc              <Link to="/login" className="landing-pricing-card__btn landing-pricing-card__btn--primary">Commenc              <Link toader">
                <h3 className="landing-pricing-card__name">Entreprise</h3>
                <p className="landing-pricing-card__desc">Sur mesure</p>
              </div>
              <div className="landing-pricing-card__price">
                <span className="landing-pricing-card__amount">Sur devis</span>
              </div>
              <ul className="landing-pricing-card__features">
                <li>Tout illimité</li>
                <li>Multi-sociétés</li>
                <li>API dédiée</li>
                <li>Support 7j                <li>Support 7j               href="mailto:contact@traceo.ci" classNa                <li>Support 7j  nding-pricing-card__btn--outline">Nous contacter</a>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-cta__inner">
          <h2 className="landing-cta__title">Prêt à digitaliser vos livraisons ?</h2>
          <p className="landing-cta__subtitle">Rejoignez les entreprises qui font confiance à TraceO®</p>
          <Link to="/login" className="landing-cta__btn">Commencer maintenant</Link>
        </div>
      </section>

      <footer       <footer       <footer       <footer       <footer   g-footer__inner">
          <div className="landing-footer__brand">
            <TraceOMark onBrand lay            <TraceOMark onBrand lay            <TraceOMark oan            <TraceOMark onBrand lay  � a            <TraceOMark onBrand lay                   <TraceOMark onBrand lay ding-footer__cols">
            <div className="landing-footer__col">
              <h4 className="landing-footer__col-title">Produit</h4>
              <a href="#fonctionnalites" className="landing-footer__link">Fonctionnalités</a>
              <a href="#tarifs" clas              <a href="#tarifs" clas a>
            </div>
            <div className="landing-footer__col">
              <h4 className="landing-footer__col-title">Entrepri              <h4 className="landing-footer__col-title">Entrepri              <h4 className="landing-fo                   <h4 className="landing-footer__col-title">Entrepri              <h4 cv>             <d              <anding-footer__col">
              <h4 className="landing-footer__col-title">Légal</h4>
              <a href="#" className="landing-footer__l              <a href="#" className="landing-footer__l              <a href="#" className="landing-footer__l              <a href="#" className="landing-footer__l              <a href="#" className="landing-footer__l              <a co              <a href="#" className="landing-foo�              <a href="#" className="landing-footer__l             div>
  )
}
