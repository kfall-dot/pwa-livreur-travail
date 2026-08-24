import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { authFetch } from './manager/managerApi'

export function ManagerForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authFetch('/auth/manager-forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell roleTitle="Gestionnaire" roleSubtitle="Mot de passe oublié">
      {sent ? (
        <p style={{ fontSize: 14, color: '#374151' }}>
          Si un compte existe pour cet e-mail, un lien de réinitialisation a été envoyé.
        </p>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
          <label htmlFor="forgot-email">E-mail</label>
          <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            data-testid="mgr-forgot-email"
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
            data-testid="mgr-forgot-submit"
          >
            {loading ? 'Envoi…' : 'Envoyer le lien'}
          </button>
        </form>
      )}
      <p className="auth-links" style={{ marginTop: '1rem' }}>
        <Link to="/manager/login">Retour à la connexion</Link>
      </p>
    </AuthShell>
  )
}
