/** L'initiateur du brouillon prime sur la personne qui transmet ensuite l'EB. */
export async function isEbInitiator(
  request: { sourceDraftId: string | null; createdByManagerId: string | null },
  managerId: string,
  loadDraft: (id: string) => Promise<{ createdByManagerId: string | null } | null>,
): Promise<boolean> {
  if (!request.sourceDraftId) return request.createdByManagerId === managerId
  const draft = await loadDraft(request.sourceDraftId)
  return draft?.createdByManagerId === managerId
}
