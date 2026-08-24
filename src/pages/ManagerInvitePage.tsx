import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { authFetch } from './manager/managerApi'

export function ManagerInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas')
      return
    }
    if (!token) {
      setError('Lien d\'invitation invalide')
      return
    }
    setLoading(true)
    try {
      const res = await authFetch('/auth/accept-manager-invite', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      navigate('/manager')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell roleTitle="Gestionnaire" roleSubtitle="Activez votre compte">
      {!token ? (
        <p className="form-error" role="alert">
          Lien d&apos;invitation invalide. Demandez une nouvelle invitation à votre administrateur.
        </p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
          <p style={{ fontSize: 14, color: '#555', margin: '0 0 1rem' }}>
            Choisissez un mot de passe pour accéder au tableau de bord TraceO.
          </p>
          <label htmlFor="invite-password">Mot de passe</label>
          <input
            id="invite-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            data-testid="mgr-invite-password"
          />
          <label htmlFor="invite-confirm">Confirmer le mot de passe</label>
          <input
            id="invite-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            data-testid="mgr-invite-confirm"
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary btn-block"
            data-testid="mgr-invite-submit"
          >
            {loading ? 'Activation…' : 'Activer mon compte'}
          </button>
        </form>
      )}
      <p className="auth-links" style={{ marginTop: '1rem' }}>
        <Link to="/manager/login">Déjà un compte ? Se connecter</Link>
      </p>
    </AuthShell>
  )
}
