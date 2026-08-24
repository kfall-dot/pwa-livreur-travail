import { Link } from 'react-router-dom'

/** Page 404 explicite — évite de renvoyer silencieusement vers l’app livreur. */
export function NotFoundPage() {
  return (
    <div className="page page-center" style={{ maxWidth: 420, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Page introuvable</h1>
      <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: 14 }}>
        Cette adresse n’existe pas ou votre application n’est pas à jour (cache PWA).
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <li>
          <Link to="/manager/register">Créer mon entreprise</Link>
        </li>
        <li>
          <Link to="/manager/login">Connexion manager</Link>
        </li>
        <li>
          <Link to="/login">Connexion livreur</Link>
        </li>
      </ul>
      <p style={{ marginTop: '1.5rem', fontSize: 13, color: '#888' }}>
        Si le problème continue : fermez l’onglet, videz le cache du site, puis rouvrez le lien.
      </p>
    </div>
  )
}
