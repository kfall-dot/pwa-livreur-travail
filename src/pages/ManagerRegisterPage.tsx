import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { authFetch } from './manager/managerApi'

const EMPTY_REGISTER_FORM = {
  companyName: '',
  managerName: '',
  email: '',
  password: '',
}

export function ManagerRegisterPage() {
  const [companyName, setCompanyName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    setCompanyName(EMPTY_REGISTER_FORM.companyName)
    setManagerName(EMPTY_REGISTER_FORM.managerName)
    setEmail(EMPTY_REGISTER_FORM.email)
    setPassword(EMPTY_REGISTER_FORM.password)
    setError(null)
    setLoading(false)
  }, [location.key])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await authFetch('/auth/register-company', {
        method: 'POST',
        body: JSON.stringify({
          companyName: companyName.trim(),
          managerName: managerName.trim(),
          email: email.trim(),
          password,
        }),
      })
      const data = (await res.json()) as { message?: string; company?: { name: string } }
      if (!res.ok) throw new Error(data.message ?? 'Inscription impossible')
      navigate('/manager')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell roleTitle="Créer mon entreprise" roleSubtitle="Mise en service — espace isolé TraceO®">
      <form onSubmit={(e) => void handleSubmit(e)} className="auth-form" autoComplete="off">
        <label htmlFor="companyName">Nom de l&apos;entreprise</label>
        <input
          id="companyName"
          data-testid="register-company-name"
          required
          autoComplete="off"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />

        <label htmlFor="managerName">Votre nom</label>
        <input
          id="managerName"
          data-testid="register-manager-name"
          required
          autoComplete="name"
          value={managerName}
          onChange={(e) => setManagerName(e.target.value)}
        />

        <label htmlFor="email">E-mail manager</label>
        <input
          id="email"
          type="email"
          data-testid="register-email"
          required
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Mot de passe (≥ 8 caractères)</label>
        <input
          id="password"
          type="password"
          data-testid="register-password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          data-testid="register-submit"
          disabled={loading}
          className="btn btn-primary btn-block"
        >
          {loading ? 'Création…' : 'Créer l’entreprise'}
        </button>
      </form>

      <p className="auth-links">
        Déjà un compte ? <Link to="/manager/login">Connexion</Link>
      </p>
    </AuthShell>
  )
}
