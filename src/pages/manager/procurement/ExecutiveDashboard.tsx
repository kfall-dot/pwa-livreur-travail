import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '../managerApi'
import type { BcRegisterRow, PurchaseRequestRow, SiteBudget } from './procurementTypes'
import { formatFcfa, STATUS_LABELS } from './procurementUi'
import { buildExecutiveOverview } from '../../../../shared/executiveOverview'
import './ExecutiveDashboard.css'

type Snapshot = { budgets: SiteBudget[] | null; requests: PurchaseRequestRow[] | null; invoices: BcRegisterRow[] | null; at: string }
export function ExecutiveDashboard({ role, handleAuth, onOpenRequest, onOpenBudgets, onOpenRequests }: {
 role: 'daf' | 'pdg'; handleAuth: (status: number) => boolean; onOpenRequest: (id: string) => void; onOpenBudgets: () => void; onOpenRequests: () => void
}) {
 const [snapshot,setSnapshot]=useState<Snapshot | null>(null)
 const [refresh,setRefresh]=useState(0)
 const [loading,setLoading]=useState(true)
 const [allSites,setAllSites]=useState(false)
 useEffect(()=>{
  const controller=new AbortController()
  setLoading(true)
  const read=async(path:string,key:string)=>{
   const res=await authFetch(path,{signal:controller.signal})
   if(res.status===401)handleAuth(res.status)
   if(!res.ok)throw new Error('Lecture indisponible')
   const body=await res.json() as Record<string,unknown>
   if(!Array.isArray(body[key]))throw new Error('Réponse incomplète')
   return body[key]
  }
  void Promise.allSettled([read('/procurement/site-budgets','budgets'),read('/procurement/requests','requests'),read('/procurement/bc-register?month=all','rows')]).then(results=>{
   if(controller.signal.aborted)return
   setSnapshot({budgets:results[0].status==='fulfilled'?results[0].value as SiteBudget[]:null,requests:results[1].status==='fulfilled'?results[1].value as PurchaseRequestRow[]:null,invoices:results[2].status==='fulfilled'?results[2].value as BcRegisterRow[]:null,at:new Date().toISOString()})
   setLoading(false)
  })
  return()=>controller.abort()
 },[refresh,handleAuth])
 useEffect(()=>{const timer=window.setInterval(()=>{if(!document.hidden)setRefresh(value=>value+1)},60000);return()=>window.clearInterval(timer)},[])
 const model=useMemo(()=>buildExecutiveOverview(snapshot?.budgets??[],snapshot?.requests??[],snapshot?.invoices??[],role),[snapshot,role])
 const rankedSites=useMemo(()=>[...(snapshot?.budgets??[])].sort((a,b)=>{
  const score=(s:SiteBudget)=>s.budgetTotalFcfa&&s.budgetTotalFcfa>0?s.engagedFcfa/s.budgetTotalFcfa:(s.engagedFcfa>0?1:0)
  return score(b)-score(a)||b.engagedFcfa-a.engagedFcfa
 }),[snapshot])
 if(!snapshot)return <section className="executive" aria-busy="true"><p>Chargement de la vue de pilotage…</p></section>
 const partial=snapshot.budgets===null||snapshot.requests===null||snapshot.invoices===null
 const metrics=[
  {label:'Engagements enregistrés',value:snapshot.budgets?formatFcfa(model.engaged):'Indisponible',note:'Cumul du suivi budgétaire, matériaux et main-d’œuvre.'},
  {label:'Réalisé enregistré',value:snapshot.budgets?formatFcfa(model.realized):'Indisponible',note:'Selon les règles du suivi chantier ; ne représente pas le solde bancaire.'},
  {label:'Factures transmises à payer',value:snapshot.invoices?formatFcfa(model.unpaidAmount):'Indisponible',note:snapshot.invoices?`${model.unpaid.length} BC avec facture transmise non marquée payée. Montants du registre BC.`:'Registre indisponible.'},
  {label:'À votre validation',value:snapshot.requests?String(model.pending.length):'Indisponible',note:role==='daf'?'Demandes à l’étape DAF.':'Demandes à l’étape PDG.'},
 ]
 return <section className="executive" data-testid="executive-dashboard" aria-busy={loading}>
  <header className="executive__heading"><div><span className="executive__eyebrow">{role==='daf'?'PILOTAGE FINANCIER':'VUE DE DIRECTION'}</span><h2>{role==='daf'?'Anticiper les engagements.':'Repérer les points d’attention.'}</h2><p>Compagnie connectée · Chantiers et dossiers accessibles à votre rôle · Données cumulées · Montants en FCFA</p></div><button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>{loading?'Actualisation…':'Actualiser'}</button></header>
  <p className="executive__timestamp">Lecture du {new Date(snapshot.at).toLocaleString('fr-FR')} · Actualisation automatique chaque minute lorsque la page est visible.</p>
  {partial&&<div className="executive__warning" role="alert"><strong>Vue partielle.</strong> {snapshot.budgets===null?'Budgets indisponibles. ':''}{snapshot.requests===null?'Demandes indisponibles. ':''}{snapshot.invoices===null?'Factures indisponibles. ':''}Les données absentes ne sont pas assimilées à zéro. Réessayez avec « Actualiser ».</div>}
  <div className="executive__metrics">{(role==='pdg'?[metrics[3],metrics[0],metrics[1],metrics[2]]:metrics).map(metric=><article key={metric.label}><h3>{metric.label}</h3><strong>{metric.value}</strong><p>{metric.note}</p></article>)}</div>
  <div className="executive__grid">
   <section className="executive__card"><header><h3>Points d’attention <span>{model.alerts.length}{partial?' + données manquantes':''}</span></h3></header><p className="executive__muted">Signaux indicatifs à examiner ; ils ne bloquent aucune opération.</p>
    {model.alerts.length===0?<p className="executive__empty">{partial?'Aucun signal calculable sur les sources disponibles.':'Aucun seuil déclenché sur les données disponibles. Cela ne garantit pas l’absence de risque.'}</p>:<ul className="executive__alerts">{model.alerts.slice(0,12).map(alert=><li key={alert.id} className={alert.severity==='alert'?'is-alert':''}><span className="executive__tag">{alert.severity==='alert'?'Dépassement':'À examiner'}</span><strong>{alert.title}</strong><p>{alert.detail}</p><button type="button" onClick={()=>alert.requestId?onOpenRequest(alert.requestId):onOpenBudgets()}>{alert.requestId?'Ouvrir le dossier':'Voir le suivi budgétaire'} →</button></li>)}</ul>}
    {model.alerts.length>12&&<p className="executive__muted">12 signaux affichés sur {model.alerts.length}. Consultez les demandes et les budgets pour le détail.</p>}
   </section>
   <div className="executive__stack"><section className="executive__card"><header><h3>Décisions en attente</h3><button type="button" onClick={onOpenRequests}>Toutes les demandes →</button></header>
    {snapshot.requests===null?<p>Source indisponible.</p>:model.pending.length===0?<p className="executive__empty">Aucune demande à votre étape de validation.</p>:<ul className="executive__requests">{[...model.pending].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt)).slice(0,5).map(row=><li key={row.id}><button type="button" onClick={()=>onOpenRequest(row.id)}><strong>{row.reference}{row.urgency==='urgent'?' · Urgent':''}</strong><span>{row.siteName??'Chantier non renseigné'}</span><span>{row.totalAmountFcfa==null?'Montant non renseigné':formatFcfa(row.totalAmountFcfa)} · {STATUS_LABELS[row.status as keyof typeof STATUS_LABELS]??row.status}</span></button></li>)}</ul>}
   </section>
   <section className="executive__card"><header><h3>Fiabilité de la lecture</h3></header><dl className="executive__coverage"><div><dt>Enveloppes renseignées</dt><dd>{snapshot.budgets?`${model.budgetedSites} / ${model.siteCount} chantiers`:'Indisponible'}</dd></div><div><dt>Total des enveloppes renseignées</dt><dd>{snapshot.budgets&&model.knownBudget!==null?formatFcfa(model.knownBudget):'Non renseigné'}</dd></div></dl><p className="executive__muted">Les échéances fournisseurs, les soldes bancaires et un avancement chantier consolidé ne sont pas disponibles dans cette vue. Aucun prévisionnel de trésorerie ni ratio dépenses/avancement n’est déduit de ces données.</p></section></div>
  </div>
  <section className="executive__card"><header><h3>Exposition par chantier</h3><button type="button" onClick={onOpenBudgets}>Ouvrir le suivi chantier →</button></header><p className="executive__muted">Classement par taux d’engagement. Le réalisé et l’engagé sont deux lectures distinctes : ils ne s’additionnent pas.</p>
   {snapshot.budgets===null?<p>Budgets indisponibles.</p>:rankedSites.length===0?<p className="executive__empty">Aucun chantier dans le suivi budgétaire.</p>:<div className="executive__table"><table><thead><tr><th>Chantier</th><th>Enveloppe</th><th>Engagé</th><th>Réalisé</th><th>Reste à engager</th><th>Engagement</th></tr></thead><tbody>{rankedSites.slice(0,allSites?undefined:8).map(site=>{const ratio=site.budgetTotalFcfa&&site.budgetTotalFcfa>0?site.engagedFcfa/site.budgetTotalFcfa*100:null;return <tr key={site.siteId}><th scope="row">{site.siteName}</th><td>{site.budgetTotalFcfa==null?'Non renseignée':formatFcfa(site.budgetTotalFcfa)}</td><td>{formatFcfa(site.engagedFcfa)}</td><td>{formatFcfa(site.realizedFcfa)}</td><td>{site.remainingFcfa==null?'Non renseigné':formatFcfa(site.remainingFcfa)}</td><td>{ratio===null?'Non calculable':<><span>{Math.round(ratio)} %</span><div className="executive__bar" aria-hidden="true"><i style={{width:`${Math.min(100,Math.max(0,ratio))}%`,background:ratio>100?'#b91c1c':ratio>=90?'#d97706':'#64748b'}}/></div></>}</td></tr>})}</tbody></table></div>}
   {rankedSites.length>8&&<button type="button" className="executive__more" onClick={()=>setAllSites(value=>!value)}>{allSites?'Réduire la liste':`Voir les ${rankedSites.length} chantiers`}</button>}
  </section>
  {role==='daf'&&<section className="executive__card" style={{marginTop:20}}><header><h3>Factures transmises non marquées payées</h3></header><p className="executive__muted">Registre des BC réceptionnés, toutes périodes. Une ligne par BC ; aucun classement par échéance faute de dates fiables.</p>
   {snapshot.invoices===null?<p>Registre indisponible.</p>:model.unpaid.length===0?<p className="executive__empty">Aucune facture transmise non payée dans ce registre.</p>:<ul className="executive__requests">{model.unpaid.slice(0,10).map(row=><li key={row.purchaseOrderId}><button type="button" onClick={()=>onOpenRequest(row.purchaseRequestId)}><strong>{row.invoice||'Facture sans référence'} · {row.bon}</strong><span>{row.siteName} · {formatFcfa(row.amountFcfa)}</span><span>Ouvrir le dossier et ses pièces →</span></button></li>)}</ul>}
   {model.unpaid.length>10&&<p className="executive__muted">10 BC affichés sur {model.unpaid.length}. Le total ci-dessus porte sur l’ensemble du registre.</p>}
  </section>}
  <details className="executive__method"><summary>Comprendre les indicateurs et les alertes</summary><p>Enveloppe proche de sa limite : engagement ≥ 90 %. Dépassement : engagement supérieur à l’enveloppe. Inactivité : au moins 7 jours depuis la dernière modification d’un dossier en préparation ou validation. Ces seuils sont indicatifs et restent à confirmer avec la direction.</p><p>Factures à payer : BC du registre dont la facture a été transmise et n’est pas marquée payée, sans doubles comptes par BC. Le montant utilisé est celui du registre, pas un solde fournisseur ni un montant diminué de règlements partiels. Les alertes ne modifient pas les validations existantes.</p></details>
 </section>
}
