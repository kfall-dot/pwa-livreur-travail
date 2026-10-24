import type { ReactNode } from 'react'
import { EFPC_IDENTITY } from '../../shared/companyIdentity'
import './EfpcLoginShell.css'

export function EfpcLoginShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <main className="efpc-login"><div className="efpc-login__canvas">
    <section className="efpc-login__identity" aria-label="EFPC">
      <div className="efpc-login__brand">
        <div className="efpc-login__logo"><img src={EFPC_IDENTITY.logoUrl} alt="Logo EFPC" width="164" height="148" /></div>
        <p className="efpc-login__legal">{EFPC_IDENTITY.legalName}</p>
        <address className="efpc-login__contact">
          <span>{EFPC_IDENTITY.address} · {EFPC_IDENTITY.postalAddress}</span>
          <span>N° RCCM : {EFPC_IDENTITY.rccm}</span>
          <span>CC n° : {EFPC_IDENTITY.taxpayerNumber}</span>
          <a href={`tel:${EFPC_IDENTITY.phone.replace(/\s/g, '')}`}>Tél. : {EFPC_IDENTITY.phone}</a>
        </address>
      </div>
      <div className="efpc-login__architecture" aria-hidden="true">
        <div className="efpc-login__drawing-label"><span>EFPC / CONSTRUCTION</span><span>01 — PERSPECTIVE</span></div>
        <svg viewBox="0 0 560 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g stroke="#c1c6cd" strokeWidth=".7"><path d="M0 225H560M0 240H560M42 0V260M518 0V260M0 70H560" strokeDasharray="3 5"/><path d="M0 260L280 80L560 260M70 260L280 125L490 260"/></g>
          <g stroke="#89939f" strokeWidth="1.1" strokeLinejoin="round">
            <path d="M100 205V98L243 28L442 100V207L298 256L100 205Z" fill="#f8f9fb"/>
            <path d="M100 98L298 165L442 100M298 165V256M243 28V113"/>
            <path d="M120 111L120 195L279 239V176L120 123M146 132V202M177 142V210M208 152V219M240 162V227"/>
            <path d="M315 174L425 124V197L315 236V174ZM345 160V225M379 145V213M410 132V202"/>
            <path d="M100 136L298 198L442 138M100 174L298 230L442 177M115 92L299 153L428 98"/>
            <path d="M165 65L358 135M195 51L389 120M225 37L420 107M140 78L277 123L363 80M172 63L309 111L394 91"/>
            <path d="M73 213L296 273M73 205V220M445 220L314 264M452 208V223"/>
          </g>
          <g stroke="#e85d04" strokeWidth="2"><path d="M243 28L442 100V138M100 98L100 136"/><path d="M263 44L279 50"/></g>
          <g fill="#e85d04"><circle cx="243" cy="28" r="3"/><circle cx="442" cy="100" r="3"/></g>
        </svg>
        <div className="efpc-login__sectors"><span>Fournitures</span><i /><span>Prestations</span><i /><span>Construction</span></div>
      </div>
    </section>
    <section className="efpc-login__access" aria-label="Connexion">
      <div className="efpc-login__topline"><span className="efpc-login__dot" /> ESPACE COLLABORATEURS</div>
      <div className="efpc-login__form">
        <div className="efpc-login__access-icon" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg></div>
        <span className="efpc-login__form-label">BIENVENUE CHEZ EFPC</span>
        <h2>{title}</h2>
        <p className="efpc-login__subtitle">{subtitle}</p>
        {children}
        <div className="efpc-login__help">Un problème d’accès ? Contactez votre administrateur.</div>
      </div>
      <footer className="efpc-login__footer"><span>EFPC · Espace professionnel</span><span>Propulsé par TraceO</span></footer>
    </section>
  </div></main>
}
