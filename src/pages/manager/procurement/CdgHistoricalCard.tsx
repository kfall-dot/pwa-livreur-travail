/**
 * T08 — **Rejeu de l'historique du CdG** (journal `DG CI ENERGIE`).
 *
 * Le fichier du CdG est une **compilation** : il recompile des données qui
 * existent déjà ailleurs. L'écran en tire deux conséquences visibles :
 *
 * 1. **Rien n'est écrit avant d'avoir montré** — l'aperçu (`/preview`) affiche
 *    la part du fichier **déjà connue** de TraceO (lignes portant un n° de BC,
 *    exclues : invariant I100) et la part réellement à rejouer. Le CdG décide
 *    ensuite, en connaissance de cause (I106).
 * 2. **Le rejeu est réversible** — chaque import forme un **lot** identifiable
 *    et annulable, et rejouer deux fois le même fichier n'ajoute rien (I99).
 *
 * Le fichier est lu **dans le navigateur** (`xlsx`) et envoyé en cellules
 * brutes : le serveur re-parse et re-rapproche, il ne reçoit jamais de données
 * « prêtes à insérer ».
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { toast } from '../../../lib/toast'
import {
  deleteHistoricalBatch,
  fetchHistoricalExpenses,
  fetchProcurementSites,
  importHistoricalJournal,
  previewHistoricalJournal,
} from './procurementApi'
import { css, formatFcfa } from './procurementUi'
import type { HistoricalExpensesResponse, HistoricalJournalPreview } from './procurementTypes'

const FAMILY_LABEL: Record<string, string> = {
  materiaux: 'Matériaux',
  main_oeuvre: "Main d'œuvre",
  engins: 'Engins & transport',
  frais: 'Frais',
}

/** Pastille de synthèse du rapprochement (libellé + valeur, lisible en un coup). */
function Metric({ testid, label, value }: { testid: string; label: string; value: string }) {
  return (
    <div style={{ minWidth: 168 }} data-testid={testid}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

export function CdgHistoricalCard({ canEdit }: { canEdit: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<unknown[][] | null>(null)
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState<HistoricalJournalPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [data, setData] = useState<HistoricalExpensesResponse | null>(null)
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([])
  const [targetSiteId, setTargetSiteId] = useState('')

  const reload = useCallback(async () => {
    try {
      setData(await fetchHistoricalExpenses())
    } catch {
      // L'historique est un confort de lecture : son échec ne casse pas la synthèse.
    }
  }, [])

  useEffect(() => {
    void reload()
    fetchProcurementSites()
      .then(setSites)
      .catch(() => {
        // Sans liste de chantiers, le rejeu reste possible si le journal en nomme un.
      })
  }, [reload])

  /**
   * L'aperçu suit **le fichier et le chantier désigné** : changer de chantier
   * recalcule le rapprochement sans relire le fichier. Il n'écrit rien (I106).
   */
  useEffect(() => {
    if (!rows) return
    let cancelled = false
    setBusy(true)
    previewHistoricalJournal(rows, targetSiteId || undefined)
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Lecture du journal impossible')
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [rows, targetSiteId])

  const reset = () => {
    setRows(null)
    setPreview(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const readFile = async (file: File) => {
    setBusy(true)
    reset()
    try {
      const workbook = XLSX.read(await file.arrayBuffer())
      const sheet = workbook.Sheets[workbook.SheetNames[0] ?? '']
      if (!sheet) {
        toast.error('Fichier vide ou illisible')
        return
      }
      // `header: 1` → tableaux de cellules. L'en-tête est **détecté côté
      // serveur** (`shared/cdgJournal.ts`) : le format historique sans en-tête
      // reste accepté (mapping positionnel A → J).
      const parsed = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      })
      if (parsed.length === 0) {
        toast.error('Aucune ligne dans le fichier')
        return
      }
      setRows(parsed)
      setFileName(file.name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lecture du fichier impossible')
    } finally {
      setBusy(false)
    }
  }

  const doImport = async () => {
    if (!rows) return
    setBusy(true)
    try {
      const result = await importHistoricalJournal(rows, targetSiteId || undefined)
      const already = result.skipped > 0 ? ` · ${result.skipped} déjà présente(s)` : ''
      toast.success(
        `${result.imported} ligne(s) rejouée(s) — ${formatFcfa(result.importedFcfa)}${already}`,
      )
      reset()
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import impossible')
    } finally {
      setBusy(false)
    }
  }

  const cancelBatch = async (batchId: string) => {
    setBusy(true)
    try {
      const deleted = await deleteHistoricalBatch(batchId)
      toast.success(`${deleted} ligne(s) retirée(s)`)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Annulation impossible')
    } finally {
      setBusy(false)
    }
  }

  const batches = data?.batches ?? []

  return (
    <div style={{ ...css.card, marginTop: 16 }} data-testid="mgr-cdg-historique-rejeu">
      <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>🗄️ Rejeu de l&apos;historique — journal du CdG</h4>
      <p style={{ ...css.meta, marginTop: 0 }}>
        Les dépenses hors BC sont rejouées comme des <strong>faits datés</strong> et alimentent le
        réalisé. Les lignes portant un n° de BC sont <strong>exclues</strong> : elles sont déjà des
        bons de commande de TraceO (I100). Rejouer deux fois le même fichier n&apos;ajoute rien (I99).
      </p>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            data-testid="mgr-cdg-historique-file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
            }}
          />
          {fileName && <span style={{ ...css.meta, margin: 0 }}>{fileName}</span>}
        </div>
      )}

      {busy && <p style={{ ...css.meta, marginBottom: 0 }}>Traitement…</p>}

      {preview && (
        <div style={{ marginTop: 12 }} data-testid="mgr-cdg-historique-preview">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Metric
              testid="mgr-cdg-historique-total"
              label="Total du fichier"
              value={`${preview.parsedLines} ligne(s) · ${formatFcfa(preview.totalFcfa)}`}
            />
            <Metric
              testid="mgr-cdg-historique-excluded"
              label="Déjà dans TraceO — exclues (I100)"
              value={`${preview.excluded.lines} ligne(s) · ${formatFcfa(preview.excluded.fcfa)}`}
            />
            <Metric
              testid="mgr-cdg-historique-to-import"
              label="À rejouer — hors BC"
              value={`${preview.toImport.lines} ligne(s) · ${formatFcfa(preview.toImport.fcfa)}`}
            />
            <Metric
              testid="mgr-cdg-historique-match-rate"
              label="Taux de rapprochement"
              value={`${preview.matchRatePct.toLocaleString('fr-FR')} %`}
            />
          </div>

          {preview.rejected.length > 0 && (
            <div
              style={{ ...css.transcriptBox, marginTop: 12 }}
              data-testid="mgr-cdg-historique-rejected"
            >
              <strong>{preview.rejected.length} ligne(s) illisible(s) — non importées :</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {preview.rejected.slice(0, 12).map((r) => (
                  <li key={`${r.row}-${r.reason}`}>
                    Ligne {r.row} : {r.reason}
                  </li>
                ))}
              </ul>
              {preview.rejected.length > 12 && (
                <span style={css.meta}>… et {preview.rejected.length - 12} autre(s).</span>
              )}
            </div>
          )}

          {preview.unmappedBcReferences.length > 0 && (
            <p style={{ ...css.meta, marginTop: 10 }} data-testid="mgr-cdg-historique-unmapped">
              {preview.unmappedBcReferences.length} n° de BC du journal sont introuvables dans TraceO
              ({preview.unmappedBcReferences.slice(0, 8).join(', ')}
              {preview.unmappedBcReferences.length > 8 ? '…' : ''}). Ces lignes restent{' '}
              <strong>exclues</strong> : à rapprocher dans le registre des BC (I106).
            </p>
          )}

          {preview.sites.length > 0 && (
            <table style={{ ...css.lineTable, marginTop: 12 }} data-testid="mgr-cdg-historique-sites">
              <thead>
                <tr>
                  <th style={css.lineTh}>Chantier (journal)</th>
                  <th style={css.lineTh}>Chantier TraceO</th>
                  <th style={css.lineTh}>Lignes</th>
                  <th style={css.lineTh}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {preview.sites.map((s) => (
                  <tr key={s.journalName}>
                    <td style={css.lineTd}>{s.journalName}</td>
                    <td style={css.lineTd}>
                      {s.siteName ?? <span style={{ color: '#b91c1c' }}>non imputé</span>}
                    </td>
                    <td style={css.lineTd}>{s.lines}</td>
                    <td style={css.lineTd}>{formatFcfa(s.fcfa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.byNature.length > 0 && (
            <table
              style={{ ...css.lineTable, marginTop: 12 }}
              data-testid="mgr-cdg-historique-natures"
            >
              <thead>
                <tr>
                  <th style={css.lineTh}>Nature de charge</th>
                  <th style={css.lineTh}>Famille</th>
                  <th style={css.lineTh}>Lignes</th>
                  <th style={css.lineTh}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {preview.byNature.map((n) => (
                  <tr key={n.nature}>
                    <td style={css.lineTd}>{n.label}</td>
                    <td style={css.lineTd}>{FAMILY_LABEL[n.family] ?? n.family}</td>
                    <td style={css.lineTd}>{n.lines}</td>
                    <td style={css.lineTd}>{formatFcfa(n.fcfa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Le journal réel ne nomme aucun chantier : le CdG désigne la cible. */}
          {canEdit && preview.unassigned.lines > 0 && (
            <div style={{ marginTop: 12 }} data-testid="mgr-cdg-historique-target">
              <label style={{ fontSize: 12, fontWeight: 600 }}>
                Chantier à imputer — {preview.unassigned.lines} ligne(s) ·{' '}
                {formatFcfa(preview.unassigned.fcfa)} sans chantier reconnu
              </label>
              <div style={{ marginTop: 4 }}>
                <select
                  value={targetSiteId}
                  onChange={(e) => setTargetSiteId(e.target.value)}
                  data-testid="mgr-cdg-historique-target-select"
                  style={{ padding: '0.4rem', minWidth: 260 }}
                >
                  <option value="">— choisir un chantier —</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <p style={{ ...css.meta, margin: '4px 0 0' }}>
                Sans désignation, ces lignes seraient importées mais ne compteraient dans le réalisé
                d&apos;aucun chantier. Le libellé d&apos;origine du journal est conservé.
              </p>
            </div>
          )}

          {canEdit && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginTop: 12,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                style={css.btnPrimary}
                data-testid="mgr-cdg-historique-import"
                disabled={busy || preview.toImport.lines === 0}
                onClick={() => void doImport()}
              >
                Rejouer {preview.toImport.lines} ligne(s) hors BC
              </button>
              <button type="button" style={css.btnOutline} disabled={busy} onClick={reset}>
                Annuler
              </button>
              {preview.toImport.lines === 0 && (
                <span style={{ ...css.meta, margin: 0 }}>
                  Aucune ligne hors BC : ce fichier est déjà entièrement dans TraceO.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Lots déjà rejoués : un rejeu se constate et s'annule ── */}
      {batches.length > 0 && (
        <table style={{ ...css.lineTable, marginTop: 16 }} data-testid="mgr-cdg-historique-batches">
          <thead>
            <tr>
              <th style={css.lineTh}>Lot</th>
              <th style={css.lineTh}>Lignes</th>
              <th style={css.lineTh}>Montant</th>
              {canEdit && <th style={css.lineTh} />}
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.batchId}>
                <td style={css.lineTd}>
                  {b.batchId}
                  <div style={{ ...css.meta, margin: 0 }}>
                    {b.importedAt.slice(0, 16).replace('T', ' ')}
                  </div>
                </td>
                <td style={css.lineTd}>{b.lines}</td>
                <td style={css.lineTd}>{formatFcfa(b.amountFcfa)}</td>
                {canEdit && (
                  <td style={css.lineTd}>
                    <button
                      type="button"
                      style={css.btnOutline}
                      data-testid={`mgr-cdg-historique-cancel-${b.batchId}`}
                      disabled={busy}
                      onClick={() => void cancelBatch(b.batchId)}
                    >
                      Annuler ce lot
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {batches.length === 0 && !preview && (
        <p style={{ ...css.meta, marginBottom: 0 }} data-testid="mgr-cdg-historique-empty">
          Aucun historique rejoué pour l&apos;instant.
        </p>
      )}
    </div>
  )
}
