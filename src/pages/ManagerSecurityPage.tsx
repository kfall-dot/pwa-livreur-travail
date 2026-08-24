import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { authFetch } from './manager/managerApi'

export function ManagerSecurityPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [totpEnabled, setTotpEnabled] = useState(false)
  const [setupUri, setSetupUri] = useState<string | null>(null)
  const [setupSecret, setSetupSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void authFetch('/auth/me')
      .then(async (res) => {
        const data = (await res.json()) as {
          manager?: { role?: string; totpEnabled?: boolean }
        }
        if (!res.ok) throw new Error('Session expirée')
        setIsAdmin(data.manager?.role === 'admin')
        setTotpEnabled(Boolean(data.manager?.totpEnabled))
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [])

  const startSetup = async () => {
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const res = await authFetch('/auth/totp/setup', { method: 'POST', body: '{}' })
      const data = (await res.json()) as { uri?: string; secret?: string; message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Erreur configuration 2FA')
      setSetupUri(data.uri ?? null)
      setSetupSecret(data.secret ?? null)
      setMessage('Scannez le QR dans Google Authenticator ou entrez le secret manuellement.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const enableTotp = async () => {
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const res = await authFetch('/auth/totp/enable', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Code invalide')
      setTotpEnabled(true)
      setSetupUri(null)
      setSetupSecret(null)
      setCode('')
      setMessage('2FA activée pour votre compte administrateur.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const disableTotp = async () => {
    setError(null)
    setMessage(null)
    setBusy(true)
    try {
      const res = await authFetch('/auth/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message ?? 'Code invalide')
      setTotpEnabled(false)
      setCode('')
      setMessage('2FA désactivée.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <AuthShell roleTitle="Sécurité" roleSubtitle="Chargement…">
        <p>Chargement…</p>
      </AuthShell>
    )
  }

  if (!isAdmin) {
    return (
      <AuthShell roleTitle="Sécurité" roleSubtitle="Réservé aux administrateurs">
        <p>Cette page est réservée aux comptes administrateur.</p>
        <p className="auth-links">
          <Link to="/manager">Retour au tableau de bord</Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell roleTitle="Sécurité" roleSubtitle="Authentification à deux facteurs (admin)">
      <p style={{ marginBottom: 16 }}>
        Statut 2FA : <strong>{totpEnabled ? 'Activée' : 'Désactivée'}</strong>
      </p>

      {!totpEnabled && !setupUri && (
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void startSetup()}>
          Configurer la 2FA
        </button>
      )}

      {setupSecret && (
        <div style={{ marginBottom: 12, fontSize: 13, wordBreak: 'break-all' }}>
          <p>Secret : <code>{setupSecret}</code></p>
          {setupUri && (
            <p>
              URI : <a href={setupUri}>{setupUri}</a>
            </p>
          )}
        </div>
      )}

      <label htmlFor="totp-setup-code">Code à 6 chiffres</label>
      <input
        id="totp-setup-code"
        inputMode="numeric"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        style={{ width: '100%', marginBottom: 12 }}
      />

      {!totpEnabled ? (
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy || !code.trim()}
          onClick={() => void enableTotp()}
        >
          Activer la 2FA
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-block"
          disabled={busy || !code.trim()}
          onClick={() => void disableTotp()}
        >
          Désactiver la 2FA
        </button>
      )}

      {message && <p role="status" style={{ marginTop: 12, color: '#166534' }}>{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <p className="auth-links" style={{ marginTop: 16 }}>
        <Link to="/manager">Retour au tableau de bord</Link>
      </p>
    </AuthShell>
  )
}
