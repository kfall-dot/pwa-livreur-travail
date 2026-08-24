import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { authFetch } from './manager/managerApi'

export function ManagerResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
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
      setError('Lien de réinitialisation invalide')
      return
    }
    setLoading(true)
    try {
      const res = await authFetch('/auth/manager-reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setDone(true)
      setTimeout(() => navigate('/manager/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell roleTitle="Gestionnaire" roleSubtitle="Nouveau mot de passe">
      {done ? (
        <p style={{ fontSize: 14, color: '#16a34a' }}>
          Mot de passe mis à jour. Redirection vers la connexion…
        </p>
      ) : !token ? (
        <p className="form-error" role="alert">
          Lien de réinitialisation invalide.
        </p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
          <label htmlFor="reset-password">Nouveau mot de passe</label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            data-testid="mgr-reset-password"
          />
          <label htmlFor="reset-confirm">Confirmer</label>
          <input
            id="reset-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            data-testid="mgr-reset-confirm"
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
            data-testid="mgr-reset-submit"
          >
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
      <p className="auth-links" style={{ marginTop: '1rem' }}>
        <Link to="/manager/login">Retour à la connexion</Link>
      </p>
    </AuthShell>
  )
}
