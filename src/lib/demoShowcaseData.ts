export type DemoShowcaseRole = 'driver' | 'manager'

export type DemoShowcaseSlide = {
  title: string
  body: string
  image: string
  alt: string
  frame: 'phone' | 'desktop'
}

export const DEMO_SHOWCASE: Record<
  DemoShowcaseRole,
  { subtitle: string; slides: DemoShowcaseSlide[] }
> = {
  driver: {
    subtitle: 'Parcours livreur — démo visuelle',
    slides: [
      {
        title: 'Connexion rapide au terrain',
        body: 'Le livreur ouvre l’app et saisit son code PIN — sans mot de passe complexe.',
        image: '/demo/assets/livreur-01-login.png',
        alt: 'Écran de connexion livreur TraceO avec code PIN',
        frame: 'phone',
      },
      {
        title: 'Tournée du jour',
        body: 'Liste des arrêts, statuts et volumes à livrer — tout est visible d’un coup d’œil.',
        image: '/demo/assets/livreur-02-liste.png',
        alt: 'Liste des livraisons du jour sur mobile',
        frame: 'phone',
      },
      {
        title: 'Carte et itinéraire',
        body: 'Visualisation des points de livraison pour prioriser le terrain.',
        image: '/demo/assets/livreur-03-carte.png',
        alt: 'Carte des arrêts de livraison',
        frame: 'phone',
      },
      {
        title: 'Preuve à chaque remise',
        body: 'Photos, déclaration des quantités et validation OTP — le certificat est généré sur place.',
        image: '/demo/assets/livreur-04-detail.png',
        alt: 'Écran de livraison avec photos, déclaration et OTP',
        frame: 'phone',
      },
    ],
  },
  manager: {
    subtitle: 'Cockpit gestionnaire — démo visuelle',
    slides: [
      {
        title: 'Espace gestionnaire',
        body: 'Connexion sécurisée pour piloter les tournées et consulter les preuves.',
        image: '/demo/assets/manager-01-login.png',
        alt: 'Écran de connexion gestionnaire TraceO',
        frame: 'desktop',
      },
      {
        title: 'Suivi en temps réel',
        body: 'Vue consolidée des livraisons : statuts, volumes et alertes terrain.',
        image: '/demo/assets/manager-02-suivi.png',
        alt: 'Tableau de suivi des tournées',
        frame: 'desktop',
      },
      {
        title: 'Planification & replan',
        body: 'Organiser les arrêts, réaffecter un reliquat ou replanifier sans ressaisie.',
        image: '/demo/assets/manager-03-planifier.png',
        alt: 'Écran de planification des tournées',
        frame: 'desktop',
      },
    ],
  },
}
