import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { useAuth } from '../contexts/AuthContext'
import {
  PHONE_FORMAT_HINT,
  isValidDriverPhone,
  normalizeDriverPhone,
} from '../lib/phone'

/** Saisie nationale CI 10 chiffres (indicatif +225 déjà affiché). */
function formatLoginPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  const national = digits.startsWith('225') ? digits.slice(3) : digits
  return national.slice(0, 10)
}

const REMEMBER_KEY = 'traceo.rememberPhone'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) {
        setPhone(formatLoginPhone(saved))
        setRemember(true)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const formatted = normalizeDriverPhone(phone)

    if (!isValidDriverPhone(formatted)) {
      setError(`Téléphone invalide — ${PHONE_FORMAT_HINT}`)
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('PIN à 4 chiffres requis')
      return
    }
    setLoading(true)
    try {
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, phone)
        else localStorage.removeItem(REMEMBER_KEY)
      } catch {
        /* ignore */
      }
      await login(formatted, pin)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      variant="driver-hero"
      roleTitle="Livreur"
      roleSubtitle="Preuve de livraison"
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="auth-form"
        noValidate
      >
        <label htmlFor="phone">Numéro de téléphone</label>
        <div className="auth-field-phone">
          <span className="auth-field-phone__lead">
            <span className="auth-field-phone__cc">+225</span>
          </span>
          <input
            id="phone"
            data-testid="phone-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="0700000000"
            value={phone}
            onChange={(e) => setPhone(formatLoginPhone(e.target.value))}
            required
          />
        </div>
        <p className="hint">{PHONE_FORMAT_HINT}</p>

        <label htmlFor="pin">Code PIN</label>
        <div className="auth-field-pin">
          <input
            id="pin"
            data-testid="pin-input"
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoComplete="one-time-code"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            required
          />
          <button
            type="button"
            className="auth-field-pin__toggle"
            onClick={() => setShowPin((v) => !v)}
            aria-label={showPin ? 'Masquer le PIN' : 'Afficher le PIN'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {showPin ? (
                <>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              ) : (
                <>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        </div>

        <div className="auth-form__row">
          <label className="auth-check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Se souvenir de moi
          </label>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block"
          data-testid="login-submit"
          disabled={loading}
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </AuthShell>
  )
}
