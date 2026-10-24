const paths: Record<string, string> = {
  achats: 'M4 5h16v15H4z M8 3v4 M16 3v4 M8 11h8 M8 15h5',
  comptabilite: 'M5 3h14v18l-3-2-4 2-4-2-3 2V3Z M8 7h8 M8 11h8 M8 15h4',
  tresorerie: 'M3 6h18v14H3z M3 10h18 M7 15h3',
  suiviChantier: 'M3 21h18 M5 21V9l7-6 7 6v12 M9 21v-7h6v7',
  suiviBc: 'M9 3h6v4H9z M9 5H5v16h14V5h-4 M8 12h8 M8 16h6',
  suivi: 'M2 6h12v12H2z M14 10h4l4 4v4h-8 M5 18a2 2 0 1 0 0 .01 M18 18a2 2 0 1 0 0 .01',
  planifier: 'M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18 M7 14h3 M14 14h3',
  maJournee: 'M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18 M8 15l3 3 5-5',
  catalogue: 'M3 7l9-4 9 4v10l-9 4-9-4V7z M3 7l9 4 9-4 M12 11v10',
  livreurs: 'M15 21v-3a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v3 M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M17 5a3 3 0 0 1 0 6 M18 14a4 4 0 0 1 3 4v3',
  taches: 'M9 5H4v16h16V5h-5 M9 3h6v4H9z M8 14l3 3 5-6',
}
export function WorkspaceIcon({ name }: { name: string }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name === 'gestionnaires' ? 'livreurs' : name] ?? paths.catalogue} /></svg>
}
