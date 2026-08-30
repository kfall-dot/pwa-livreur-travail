import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { managers, type ProcurementRole } from '../db/schema.js'
import { sendEmail } from './email.js'

const ROLE_LABELS: Record<ProcurementRole, string> = {
  site_controller: 'Conducteur de travaux',
  technical_director: 'Directeur technique',
  daf: 'DAF',
  purchasing: 'Service achats',
  pdg: 'PDG',
  controle_gestion: 'Contrôle de gestion',
  site_manager: 'Chef de chantier',
}

export async function notifyManagersByProcurementRole(
  companyId: string,
  roles: ProcurementRole[],
  subject: string,
  text: string,
): Promise<{ notified: number }> {
  const rows = await db
    .select({ email: managers.email, name: managers.name, procurementRole: managers.procurementRole })
    .from(managers)
    .where(eq(managers.companyId, companyId))

  const targets = rows.filter(
    (m) => m.procurementRole && roles.includes(m.procurementRole),
  )

  let notified = 0
  for (const target of targets) {
    console.log(
      `[procurement-notify] ${ROLE_LABELS[target.procurementRole!]} ${target.name} <${target.email}>: ${subject}`,
    )
    await sendEmail({ to: target.email, subject, text })
    notified++
  }
  return { notified }
}

export async function notifyDraftReadyForReview(
  companyId: string,
  draftId: string,
  siteName: string,
): Promise<void> {
  await notifyManagersByProcurementRole(
    companyId,
    ['technical_director'],
    `EB à valider — ${siteName}`,
    `Un nouvel expression de besoin (brouillon ${draftId}) est prête pour relecture DT.\nChantier : ${siteName}`,
  )
}

export async function notifyRequestStatusChange(
  companyId: string,
  reference: string,
  status: string,
  targetRoles: ProcurementRole[],
): Promise<void> {
  await notifyManagersByProcurementRole(
    companyId,
    targetRoles,
    `EB ${reference} — ${status}`,
    `La demande ${reference} est passée au statut « ${status} » et nécessite votre action${
      status === 'submitted' ? ' (Service achats)' : status === 'cdg_review' ? ' (Contrôle de gestion)' : ''
    }.`,
  )
}

export async function notifyPurchaseOrderReady(
  companyId: string,
  reference: string,
  poReference: string,
): Promise<void> {
  await notifyManagersByProcurementRole(
    companyId,
    ['purchasing', 'technical_director'],
    `BC prêt — ${poReference}`,
    `Le bon de commande ${poReference} a été généré pour la demande ${reference}.`,
  )
}
