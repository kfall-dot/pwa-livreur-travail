export type SaActor = { id: string; companyId: string; procurementRole: string | null; saSupervisorId: string | null }

export function isValidSaSupervisor(resource: SaActor, head: SaActor | null): boolean {
  return Boolean(head && resource.procurementRole === 'purchasing' && resource.id !== head.id && resource.companyId === head.companyId && head.procurementRole === 'purchasing' && !head.saSupervisorId)
}

export function canValidateSaAction(actor: SaActor, reviewerId: string | null): boolean {
  return actor.procurementRole === 'purchasing' && !actor.saSupervisorId && actor.id === reviewerId
}

export function canReleaseSaPurchaseOrders(status: string, orders: Array<{ saApprovalRequired?: boolean; saHeadSignature?: string | null }>): boolean {
  return orders.length > 0 && (status === 'po_ready' || status === 'delivery_scheduled') && !orders.some((po) => po.saApprovalRequired && !po.saHeadSignature?.trim())
}
