import { useCallback, useEffect, useRef, useState } from 'react'
import { DEMO_SHOWCASE, type DemoShowcaseRole } from '../lib/demoShowcaseData'
import '../styles/demoShowcase.css'

type DemoShowcasePageProps = {
  role: DemoShowcaseRole
}

export function DemoShowcasePage({ role }: DemoShowcasePageProps) {
  const { subtitle, slides } = DEMO_SHOWCASE[role]
  const [index, setIndex] = useState(0)
  const touchStartX = useRef(0)
  const total = slides.length

  const goTo = useCallback(
    (next: number) => {
      setIndex(Math.max(0, Math.min(total - 1, next)))
    },
    [total],
  )

  useEffect(() => {
    document.title = role === 'driver' ? 'TraceO® — Démo livreur' : 'TraceO® — Démo gestionnaire'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [role])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') goTo(index + 1)
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') goTo(index - 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goTo, index])

  return (
    <div
      className="demo-showcase"
      aria-live="polite"
      onTouchStart={(event) => {
        touchStartX.current = event.changedTouches[0]?.clientX ?? 0
      }}
      onTouchEnd={(event) => {
        const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current
        if (Math.abs(delta) < 48) return
        if (delta < 0) goTo(index + 1)
        else goTo(index - 1)
      }}
    >
      <header className="demo-showcase__topbar">
        <div className="demo-showcase__brand">
          <img src="/demo/assets/traceo-mark.svg" alt="" width="28" height="28" />
          <div>
            <strong>TraceO®</strong>
            <span>{subtitle}</span>
          </div>
        </div>
        <span className="demo-showcase__badge">Hors ligne</span>
      </header>

      <main className="demo-showcase__carousel">
        {slides.map((item, i) => (
          <section
            key={item.image}
            className={`demo-showcase__slide${i === index ? ' is-active' : ''}`}
            aria-hidden={i !== index}
          >
            <div className="demo-showcase__caption">
              <p className="demo-showcase__step">Étape {String(i + 1).padStart(2, '0')}</p>
              <h1>{item.title}</h1>
              <p>{item.body}</p>
            </div>
            <div className="demo-showcase__frame">
              <div className={item.frame === 'phone' ? 'demo-showcase__phone' : 'demo-showcase__desktop'}>
                <img
                  src={item.image}
                  alt={item.alt}
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              </div>
            </div>
          </section>
        ))}
      </main>

      <footer className="demo-showcase__controls">
        <div className="demo-showcase__progress" aria-label="Progression">
          {slides.map((item, i) => (
            <button
              key={item.image}
              type="button"
              className={`demo-showcase__dot${i === index ? ' is-active' : ''}`}
              aria-label={`Étape ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
        <div className="demo-showcase__nav">
          <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)}>
            Précédent
          </button>
          <button
            type="button"
            className="primary"
            disabled={index === total - 1}
            onClick={() => goTo(index + 1)}
          >
            Suivant
          </button>
        </div>
        <p className="demo-showcase__hint">
          {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          {' · '}
          Démo visuelle (captures d’écran) — aucune connexion au système réel.
        </p>
      </footer>
    </div>
  )
}
