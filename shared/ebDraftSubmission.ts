/** Le SA prépare les pièces au statut submitted, puis utilise submit-finance. */
export function ebDraftSubmissionStatus(
  role: 'technical_director' | 'site_manager' | 'purchasing',
  horsSaOnly: boolean,
): 'dt_review' | 'submitted' | 'cdg_review' {
  if (role === 'site_manager') return 'dt_review'
  if (role === 'technical_director' && horsSaOnly) return 'cdg_review'
  return 'submitted'
}
