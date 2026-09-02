import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { authFetch } from './manager/managerApi'
import { isProcurementWorkspaceRole } from './manager/procurement/procurementUi'

type LoginManager = {
  procurementRole?: string | null
}

function homeAfterLogin(manager?: LoginManager): string {
  return isProcurementWorkspaceRole(manager?.procurementRole) ? '/manager?tab=achats' : '/manager'
}

function loginErrorMessage(err: unknown, fallbackBody?: string): string {
  const raw = err instanceof Error ? err.message : ''
  if (
    raw === 'Failed to fetch' ||
    raw === 'Load failed' ||
    /failed to fetch|networkerror|load failed/i.test(raw)
  ) {
    return 'Serveur injoignable — ouvrez http://localhost:5173/manager/login (`npm run dev:local`), pas la page livreur `/`.'
  }
  if (raw && !/unexpected token/i.test(raw)) return raw
  if (fallbackBody?.trim()) return fallbackBody.trim()
  return 'Serveur injoignable — lancez `npm run dev:local` (API attendue sur http://localhost:3002)'
}

const DEV_ACCOUNTS = [
  { label: 'Logistique', email: 'manager@demo.fr', password: 'admin1234' },
  { label: 'DT', email: 'dt@btp-pilote.ci', password: 'admin1234' },
  { label: 'SA', email: 'sa@btp-pilote.ci', password: 'admin1234' },
] as const

export function ManagerLoginPage() {
  const [email, setEmail] = useState(import.meta.env.PROD ? '' : 'manager@demo.fr')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpToken, setTotpToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const finishLogin = (manager?: LoginManager) => {
    navigate(homeAfterLogin(manager))
  }

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!totpToken) return
    setError(null)
    setLoading(true)
    try {
      const res = await authFetch('/auth/totp-verify-login', {
        method: 'POST',
        body: JSON.stringify({ totpToken, code: totpCode.trim() }),
      })
      const data = (await res.json()) as { message?: string; manager?: LoginManager }
      if (!res.ok) throw new Error(data.message ?? 'Code 2FA invalide')
      finishLogin(data.manager)
    } catch (err) {
      setError(loginErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authFetch('/auth/login-dashboard', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const text = await res.text()
      let data: {
        message?: string
        requiresTotp?: boolean
        totpToken?: string
        manager?: LoginManager
      } = {}
      try {
        data = text.trim() ? (JSON.parse(text) as typeof data) : {}
      } catch {
        throw new Error(
          'Serveur injoignable — lancez `npm run dev:local` (API attendue sur http://localhost:3002).',
        )
      }
      if (!res.ok) {
        throw new Error(
          data.message ??
            (text.trim()
              ? 'Identifiants invalides'
              : 'Serveur injoignable — lancez `npm run dev:local` (API attendue sur http://localhost:3002)'),
        )
      }
      if (data.requiresTotp && data.totpToken) {
        setTotpToken(data.totpToken)
        return
      }
      finishLogin(data.manager)
    } catch (err) {
      setError(loginErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (totpToken) {
    return (
      <AuthShell roleTitle="Vérification 2FA" roleSubtitle="Code à 6 chiffres depuis votre application d’authentification">
        <form onSubmit={(e) => void handleTotpSubmit(e)} className="auth-form">
          <label htmlFor="totp-code">Code 2FA</label>
          <input
            id="totp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            required
            data-testid="mgr-totp-code"
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={loading} className="btn btn-primary btn-block" data-testid="mgr-totp-submit">
            {loading ? 'Vérification…' : 'Valider'}
          </button>
          <button
            type="button"
            className="btn btn-block"
            style={{ marginTop: 8 }}
            onClick={() => {
              setTotpToken(null)
              setTotpCode('')
            }}
          >
            Retour
          </button>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell roleTitle="Gestionnaire" roleSubtitle="Tournées, preuves et achats chantier">
      <form onSubmit={(e) => void handleSubmit(e)} className="auth-form">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          data-testid="mgr-login-email"
        />

        <label htmlFor="mgr-password">Mot de passe</label>
        <input
          id="mgr-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          data-testid="mgr-login-password"
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
          data-testid="mgr-login-submit"
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

      {!import.meta.env.PROD && (
        <div className="auth-demo-hint" data-testid="mgr-login-btp-hint" style={{ marginTop: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem' }}>Comptes de test — cliquer pour remplir :</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DEV_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                className="btn"
                data-testid={`mgr-login-fill-${account.label.toLowerCase()}`}
                onClick={() => {
                  setEmail(account.email)
                  setPassword(account.password)
                  setError(null)
                }}
              >
                {account.label}
              </button>
            ))}
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: 12 }}>
            Mot de passe : <strong>admin1234</strong> — URL :{' '}
            <strong>http://localhost:5173/manager/login</strong>
          </p>
        </div>
      )}
      <p className="auth-links">
        <Link to="/manager/forgot-password">Mot de passe oublié ?</Link>
      </p>
      <p className="auth-links">
        Nouvelle entreprise ? <Link to="/manager/register" state={{ fresh: true }}>Créer mon espace</Link>
      </p>
    </AuthShell>
  )
}
