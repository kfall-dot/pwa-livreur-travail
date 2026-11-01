import { useEffect, useState } from 'react'
import { authFetch, BASE } from '../managerApi'
import { appTodayString } from '../../../lib/appDate'
import { compareStatement, statementTotals, type ManagementSnapshot, type ManagementStatement } from '../../../../shared/managementStatement'
import { formatFcfa } from './procurementUi'
import './ExecutiveDashboard.css'
type Reading={snapshot:ManagementSnapshot;sourceHash:string;statements:ManagementStatement[];readAt:string}
function previousMonth(){const [y,m]=appTodayString().slice(0,7).split('-').map(Number);return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7)}
export function ManagementStatements({role,handleAuth}:{role:'daf'|'pdg'|'accountant';handleAuth:(status:number)=>boolean}){
 const [month,setMonth]=useState(previousMonth)
 const [reading,setReading]=useState<Reading|null>(null)
 const [refresh,setRefresh]=useState(0)
 const [selected,setSelected]=useState('live')
 const [loading,setLoading]=useState(false)
 const [saving,setSaving]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [pin,setPin]=useState('')
 const [comment,setComment]=useState('')
 const [reviewed,setReviewed]=useState(false)
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setReading(null);setError('');setReviewed(false);setPin('')
  void authFetch(`/procurement/management-statements?month=${encodeURIComponent(month)}`,{signal:controller.signal}).then(async res=>{
   if(res.status===401)handleAuth(res.status)
   const body=await res.json();if(!res.ok)throw new Error(body.message??'Lecture impossible');if(!controller.signal.aborted)setReading(body as Reading)
  }).catch(err=>{if(!controller.signal.aborted)setError(err instanceof Error?err.message:'Lecture impossible')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[month,refresh,handleAuth])
 const saved=reading?.statements.find(row=>row.id===selected)
 const snapshot=saved?.snapshot??reading?.snapshot
 const totals=snapshot?statementTotals(snapshot):null
 const latest=reading?.statements[0]
 const changed=Boolean(latest&&reading&&latest.sourceHash!==reading.sourceHash)
 const comparison=latest&&reading?compareStatement(latest.snapshot,reading.snapshot):null
 const ended=month<appTodayString().slice(0,7)
 const validate=async()=>{
  if(!reading||saving)return
  setSaving(true);setError('');setNotice('')
  try{
   const res=await authFetch('/procurement/management-statements',{method:'POST',body:JSON.stringify({month,pin,comment,reviewed,sourceHash:reading.sourceHash})})
   const body=await res.json();if(!res.ok)throw new Error(body.message??'Validation impossible')
   setNotice(`Arrêté validé — version ${body.statement.version}.`);setSelected(body.statement.id);setComment('');setRefresh(value=>value+1)
  }catch(err){setError(err instanceof Error?err.message:'Validation impossible')}finally{setPin('');setSaving(false)}
 }
 return <section className="executive" data-testid="management-statements">
  <header className="executive__heading"><div><span className="executive__eyebrow">ARRÊTÉ DE GESTION</span><h2>Conserver une lecture mensuelle validée.</h2><p>Photographie de gestion, sans verrouillage des opérations ni clôture du logiciel comptable.</p></div></header>
  <div className="executive__card" style={{margin:'20px 0',display:'flex',gap:16,alignItems:'end',flexWrap:'wrap'}}>
   <label>Mois de réception des BC<input disabled={saving} type="month" value={month} max={appTodayString().slice(0,7)} onChange={e=>{if(e.target.value){setMonth(e.target.value);setSelected('live');setNotice('');setComment('')}}} style={{display:'block',marginTop:8,padding:8}}/></label>
   <button type="button" disabled={loading||saving} onClick={()=>setRefresh(value=>value+1)}>Actualiser la lecture</button>
   {reading&&<label>Version affichée<select disabled={saving} value={selected} onChange={e=>setSelected(e.target.value)} style={{display:'block',marginTop:8,padding:8}}><option value="live">Lecture actuelle — non figée</option>{reading.statements.map(row=><option key={row.id} value={row.id}>Version {row.version} validée le {new Date(row.validatedAt).toLocaleDateString('fr-FR')}</option>)}</select></label>}
  </div>
  {loading&&<p>Lecture du registre…</p>}{error&&<p className="executive__warning" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {reading&&snapshot&&totals&&<>
   <p className="executive__muted">{saved?`Version ${saved.version} · ${saved.validatedByName} · ${new Date(saved.validatedAt).toLocaleString('fr-FR')}`:`Lecture actuelle du ${new Date(reading.readAt).toLocaleString('fr-FR')}`} · Montants en FCFA.</p>
   {saved?.comment&&<p>Motif / commentaire : {saved.comment}</p>}
   <div className="executive__warning">Les BC sont rattachés au mois de réception du registre. Les statuts de paiement et les justificatifs des BC correspondent à l’état lors de cette lecture, pas nécessairement à la fin du mois. Les budgets ci-dessous sont cumulés à la date de lecture. Une donnée ajoutée tardivement peut modifier la lecture actuelle ; les versions validées restent consultables.</div>
   {latest&&<p className="executive__muted">{changed?`Écart avec la dernière version : ${comparison?.added} BC ajouté(s), ${comparison?.removed} retiré(s), ${comparison?.changed} modifié(s), ${comparison?.paymentChanges} paiement(s) ajouté(s), retiré(s) ou modifié(s). Le contexte budgétaire cumulé peut aussi avoir évolué.`:'La lecture actuelle correspond à la dernière version validée.'}</p>}
   <div className="executive__metrics"><article><h3>BC du registre</h3><strong>{totals.count}</strong></article><article><h3>Montant réceptionné</h3><strong>{formatFcfa(totals.receivedAmount)}</strong></article><article><h3>Transmis non marqué payé</h3><strong>{formatFcfa(totals.unpaidAmount)}</strong><p>{totals.unpaidCount} BC ; montant du registre, pas un solde fournisseur.</p></article><article><h3>Facture à compléter</h3><strong>{totals.missingInvoices}</strong><p>Référence ou pièce de facture absente.</p></article></div>
   <section className="executive__card"><header><h3>Registre du mois sélectionné</h3>{saved&&<a href={`${BASE}/procurement/management-statements/${encodeURIComponent(saved.id)}/html`} target="_blank" rel="noopener noreferrer">Imprimer la version validée</a>}</header>
    {!snapshot.receivedOrders.length?<p className="executive__empty">Aucun BC réceptionné dans ce registre pour ce mois.</p>:<div className="executive__table"><table><thead><tr><th>BC / réception</th><th>Chantier</th><th>Fournisseur</th><th>Montant</th><th>Facture</th><th>Paiement à la lecture</th></tr></thead><tbody>{snapshot.receivedOrders.map(row=><tr key={row.id}><th scope="row">{row.reference}<br/>{row.date}</th><td>{row.siteName}</td><td>{row.supplierName}</td><td>{formatFcfa(row.amountFcfa)}</td><td>{row.invoice||'Non renseignée'}<br/>{row.invoiceFileName||'Pièce non jointe'}</td><td>{row.invoicePaid?'Payé':row.invoiceTransmitted?'À payer':'Non transmise'}</td></tr>)}</tbody></table></div>}
   </section>
   <section className="executive__card" style={{marginTop:20}}><header><h3>Paiements enregistrés dans le mois</h3><strong>{formatFcfa(totals.paidAmount)} FCFA</strong></header><p className="executive__muted">{totals.paidCount} paiement(s) de Trésorerie, matériaux et main-d’œuvre, rattachés par date de paiement dans le fuseau métier. Ne pas additionner ces montants aux réceptions ci-dessus.</p>
    {!(snapshot.paymentsInMonth??[]).length?<p>Aucun paiement de Trésorerie enregistré pour ce mois.</p>:<div className="executive__table"><table><thead><tr><th>BT / EB</th><th>Chantier</th><th>Date de paiement</th><th>Montant payé</th><th>Mode / transaction</th></tr></thead><tbody>{(snapshot.paymentsInMonth??[]).map(row=><tr key={row.id}><th scope="row">{row.treasuryReference}<br/>{row.requestReference}</th><td>{row.siteName}</td><td>{new Date(row.paidAt).toLocaleString('fr-FR',{timeZone:'Africa/Abidjan'})}</td><td>{formatFcfa(row.amountFcfa)}</td><td>{row.method}<br/>{row.transactionReference||'Non renseignée'}</td></tr>)}</tbody></table></div>}
   </section>
   <details className="executive__method"><summary>Budgets cumulés conservés avec cette lecture</summary><div className="executive__table"><table><thead><tr><th>Chantier</th><th>Enveloppe</th><th>Engagé cumulé</th><th>Réalisé cumulé</th></tr></thead><tbody>{snapshot.budgetsAtReading.map(row=><tr key={row.siteId}><th scope="row">{row.siteName}</th><td>{row.budgetTotalFcfa==null?'Non renseignée':formatFcfa(row.budgetTotalFcfa)}</td><td>{formatFcfa(row.engagedFcfa)}</td><td>{formatFcfa(row.realizedFcfa)}</td></tr>)}</tbody></table></div></details>
   {role==='daf'&&selected==='live'&&<section className="executive__card"><h3>{latest?'Valider une nouvelle version':'Valider l’arrêté de gestion'}</h3>
    {!ended?<p>La validation sera possible lorsque le mois sera terminé.</p>:latest&&!changed?<p>Cette lecture est déjà validée. Aucune nouvelle version n’est nécessaire.</p>:<form onSubmit={e=>{e.preventDefault();void validate()}}>
     <label style={{display:'block',marginTop:16}}><input disabled={saving} type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)} required/> J’ai contrôlé ce registre, les montants et les justificatifs ; les éléments restant à régulariser sont identifiés.</label>
     <label style={{display:'block',marginTop:16}}>Commentaire / {latest?'motif de révision obligatoire (10 caractères minimum)':'réserves éventuelles'}<textarea disabled={saving} value={comment} onChange={e=>setComment(e.target.value)} minLength={latest?10:undefined} required={Boolean(latest)} maxLength={1000} rows={3} style={{display:'block',width:'100%',padding:10,marginTop:8}}/></label>
     <label style={{display:'block',marginTop:16}}>NIP du DAF<input disabled={saving} type="password" inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={e=>setPin(e.target.value)} required style={{display:'block',padding:8,marginTop:8,maxWidth:160}}/></label>
     <button type="submit" disabled={saving||!reviewed||!pin.trim()||(Boolean(latest)&&comment.trim().length<10)} style={{marginTop:16}}>{saving?'Validation…':'Valider et conserver cette lecture'}</button>
    </form>}
   </section>}
  </>}
 </section>
}
