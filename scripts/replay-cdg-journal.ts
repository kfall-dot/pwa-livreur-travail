/**
 * T08 — **rejeu hors ligne du journal du CdG** (aucune base, aucun serveur).
 *
 * Confronte les chiffres de la spec (`docs/BTP-SPEC-F02-…` §5.3) au **vrai
 * fichier** du CdG : combien de lignes, combien portent un n° de BC (donc
 * **exclues**, I100), combien sont hors BC (le rejeu), et où tombent les
 * natures / les libellés de chantier.
 *
 * Usage :
 *   npx tsx scripts/replay-cdg-journal.ts
 *   npx tsx scripts/replay-cdg-journal.ts "docs/originaux/DG CI ENERGIE (version 1).xlsx"
 *
 * Ce script **n'écrit rien** : c'est l'aperçu (`/historical-expenses/preview`)
 * reproduit hors ligne, pour valider le parseur sur données réelles.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import * as XLSX from 'xlsx'
import { parseCdgJournalRows, reconcileCdgJournal } from '../shared/cdgJournal.js'
import {
  chargeNatureFamily,
  chargeNatureLabel,
  inferChargeNature,
  resolveChargeNature,
} from '../shared/chargeNatures.js'

const DEFAULT_FILE = 'docs/originaux/DG CI ENERGIE (version 1).xlsx'

/** Chiffres annoncés par le CdG en séance (16/10/2026) — pour comparaison. */
const EXPECTED = {
  total: 508,
  withBc: 192,
  withBcFcfa: 11_476_531,
  horsBc: 315,
  horsBcFcfa: 58_988_050,
}

const fcfa = (n: number) => `${n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} F`

function main(): void {
  const file = process.argv[2] ?? DEFAULT_FILE
  const workbook = XLSX.read(readFileSync(file))
  const sheetName = workbook.SheetNames[0] ?? ''
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    console.error(`Feuille introuvable dans ${file}`)
    process.exitCode = 1
    return
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })

  const parsed = parseCdgJournalRows(rows)
  const recon = reconcileCdgJournal(parsed.lines)

  const line = '='.repeat(72)
  console.log(`\n${line}\nT08 — rejeu hors ligne : ${basename(file)}\n${line}`)
  console.log(`Feuille lue        : « ${sheetName} » — ${rows.length} lignes brutes`)
  console.log(`Lignes exploitables: ${parsed.lines.length}`)
  console.log(`Lignes rejetées    : ${parsed.rejected.length}`)
  if (parsed.rejected.length > 0) {
    const byReason = new Map<string, number>()
    for (const r of parsed.rejected) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1)
    for (const [reason, count] of [...byReason].sort((a, b) => b[1] - a[1])) {
      console.log(`   · ${reason} : ${count}`)
    }
  }

  console.log(`\n${line}\nRAPPROCHEMENT (I100)\n${line}`)
  console.log(`Avec n° de BC → EXCLUES : ${recon.excluded.length} lignes · ${fcfa(recon.excludedFcfa)}`)
  console.log(`Sans n° de BC → À REJOUER: ${recon.toImport.length} lignes · ${fcfa(recon.toImportFcfa)}`)
  console.log(`Total fichier            : ${recon.totalLines} lignes · ${fcfa(recon.totalFcfa)}`)

  console.log(`\n${line}\nCOMPARAISON AVEC LA SÉANCE DU 16/10/2026\n${line}`)
  const checks: Array<[string, number, number]> = [
    ['Lignes exploitables', parsed.lines.length, EXPECTED.total],
    ['Lignes avec n° de BC', recon.excluded.length, EXPECTED.withBc],
    ['Montant avec BC', recon.excludedFcfa, EXPECTED.withBcFcfa],
    ['Lignes hors BC', recon.toImport.length, EXPECTED.horsBc],
    ['Montant hors BC', recon.toImportFcfa, EXPECTED.horsBcFcfa],
  ]
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected
    const delta = actual - expected
    const suffix = ok ? '' : `  (écart ${delta > 0 ? '+' : ''}${delta})`
    console.log(
      `${ok ? 'OK ' : '!! '} ${label.padEnd(22)} attendu ${String(expected).padStart(12)} · réel ${String(actual).padStart(12)}${suffix}`,
    )
  }
  // ── Résolution des natures : ce qui entre dans le référentiel F02, et comment
  console.log(`\n${line}\nNATURES DE CHARGE — résolution\n${line}`)
  const byAlias = new Map<string, number>()
  const byInference = new Map<string, number>()
  const unresolved: string[] = []
  for (const l of parsed.lines) {
    const exact = resolveChargeNature(l.natureLabel)
    if (exact) byAlias.set(exact, (byAlias.get(exact) ?? 0) + 1)
    else {
      const inferred = inferChargeNature(l.natureLabel)
      byInference.set(inferred, (byInference.get(inferred) ?? 0) + 1)
      if (inferred === 'autres_materiaux') unresolved.push(l.natureLabel)
    }
  }
  const countOf = (m: Map<string, number>) => [...m.values()].reduce((s, n) => s + n, 0)
  console.log(`Rapprochées par alias/libellé : ${countOf(byAlias)} lignes`)
  console.log(`Devinées par inférence        : ${countOf(byInference)} lignes`)
  console.log(`Dont fourre-tout « autres »   : ${unresolved.length} lignes`)
  if (unresolved.length > 0) {
    const counts = new Map<string, number>()
    for (const label of unresolved) counts.set(label, (counts.get(label) ?? 0) + 1)
    for (const [label, count] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`   · « ${label} » x${count}`)
    }
  }

  // ── Répartition du rejeu par famille (ce que F03 affichera)
  console.log(`\n${line}\nREJEU HORS BC — répartition par famille\n${line}`)
  const byFamily = new Map<string, { lines: number; fcfa: number }>()
  for (const l of recon.toImport) {
    const family = chargeNatureFamily(l.nature) ?? 'inconnue'
    const entry = byFamily.get(family) ?? { lines: 0, fcfa: 0 }
    entry.lines += 1
    entry.fcfa += l.amountFcfa
    byFamily.set(family, entry)
  }
  for (const [family, v] of [...byFamily].sort((a, b) => b[1].fcfa - a[1].fcfa)) {
    const share = recon.toImportFcfa > 0 ? (v.fcfa / recon.toImportFcfa) * 100 : 0
    console.log(
      `${family.padEnd(14)} ${String(v.lines).padStart(4)} lignes · ${fcfa(v.fcfa).padStart(20)} · ${share.toFixed(1)} %`,
    )
  }

  // ── Top natures du rejeu
  console.log(`\n${line}\nREJEU HORS BC — 10 natures les plus lourdes\n${line}`)
  const byNature = new Map<string, { lines: number; fcfa: number }>()
  for (const l of recon.toImport) {
    const entry = byNature.get(l.nature) ?? { lines: 0, fcfa: 0 }
    entry.lines += 1
    entry.fcfa += l.amountFcfa
    byNature.set(l.nature, entry)
  }
  for (const [nature, v] of [...byNature].sort((a, b) => b[1].fcfa - a[1].fcfa).slice(0, 10)) {
    console.log(
      `${chargeNatureLabel(nature).padEnd(34)} ${String(v.lines).padStart(4)} lignes · ${fcfa(v.fcfa).padStart(20)}`,
    )
  }

  // ── Chantiers du journal (rapprochement de libellés)
  console.log(`\n${line}\nCHANTIERS CITÉS PAR LE JOURNAL\n${line}`)
  const bySite = new Map<string, { lines: number; fcfa: number }>()
  for (const l of parsed.lines) {
    const key = l.siteName || '(vide)'
    const entry = bySite.get(key) ?? { lines: 0, fcfa: 0 }
    entry.lines += 1
    entry.fcfa += l.amountFcfa
    bySite.set(key, entry)
  }
  for (const [site, v] of [...bySite].sort((a, b) => b[1].fcfa - a[1].fcfa)) {
    console.log(`${site.padEnd(40)} ${String(v.lines).padStart(4)} lignes · ${fcfa(v.fcfa)}`)
  }

  // ── Période couverte (le rejeu amorce l'historique du réalisé)
  const dates = parsed.lines.map((l) => l.occurredOn).sort()
  console.log(`\n${line}\nPÉRIODE COUVERTE\n${line}`)
  console.log(`${dates[0] ?? '—'} → ${dates[dates.length - 1] ?? '—'}`)
  const byMonth = new Map<string, { lines: number; fcfa: number }>()
  for (const l of recon.toImport) {
    const month = l.occurredOn.slice(0, 7)
    const entry = byMonth.get(month) ?? { lines: 0, fcfa: 0 }
    entry.lines += 1
    entry.fcfa += l.amountFcfa
    byMonth.set(month, entry)
  }
  console.log('Rejeu hors BC par mois :')
  for (const [month, v] of [...byMonth].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`   ${month}  ${String(v.lines).padStart(4)} lignes · ${fcfa(v.fcfa).padStart(20)}`)
  }
  console.log(`\n${line}\nAucune écriture : ce rapport est un aperçu (I106).\n${line}\n`)
}

main()
