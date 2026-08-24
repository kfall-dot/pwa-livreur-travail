import { useMemo } from 'react'
import type { AdjustmentLine, DeliveryProductOption } from '../types'
import { formatQuantityWithUnit, formatUnitLabel, resolvePlannedUnit } from '../lib/deliveryUnits'
import {
  type DeclarationOutcome,
  DEFAULT_FULL_JUSTIFICATION,
  REJECTION_JUSTIFICATION_MESSAGE,
  lineJustificationFieldLabel,
  lineJustificationPlaceholder,
  lineNeedsJustification,
  validateDeclarationBeforeSubmit,
} from '../lib/declarationValidation'

type Props = {
  expectedPalettes: number
  plannedUnit?: string | null
  outcome: DeclarationOutcome | null
  lines: AdjustmentLine[]
  deliveryProducts: DeliveryProductOption[]
  declared: boolean
  loading: boolean
  onOutcomeChange: (outcome: DeclarationOutcome) => void
  onLinesChange: (lines: AdjustmentLine[]) => void
  onSubmit: () => void
}

function lineQty(value: unknown): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function lineExpectedFor(
  line: AdjustmentLine,
  expectedPalettes: number,
  lineCount: number
): number | null {
  const qe = line.quantityExpected
  if (typeof qe === 'number' && Number.isFinite(qe) && qe > 0) return qe
  if (lineCount === 1) return expectedPalettes
  return null
}

function fullAcceptanceLabel(products: DeliveryProductOption[]): string {
  if (products.length === 0) return 'Livraison acceptée'
  if (products.length === 1) {
    const p = products[0]
    const qty = p.quantityExpected ?? 1
    return `Livraison acceptée (${p.productLabel} : ${formatQuantityWithUnit(qty, p.unit)})`
  }
  const detail = products
    .map((p) => `${p.productLabel} ${formatQuantityWithUnit(p.quantityExpected ?? 0, p.unit)}`)
    .join(' · ')
  return `Livraison acceptée (${detail})`
}

export function PartialDeclaration({
  expectedPalettes,
  plannedUnit,
  outcome,
  lines,
  deliveryProducts,
  declared,
  loading,
  onOutcomeChange,
  onLinesChange,
  onSubmit,
}: Props) {
  const isRejected = outcome === 'rejected'
  const outcomeChosen = outcome != null
  const fixedProducts = deliveryProducts.length > 0
  const multiProduct = deliveryProducts.length > 1
  const isFullReadonly = outcome === 'full' && fixedProducts
  const displayUnit = resolvePlannedUnit(deliveryProducts, lines, plannedUnit)

  const unitOptions = useMemo(() => {
    const codes = new Set<string>()
    for (const p of deliveryProducts) {
      if (p.unit) codes.add(String(p.unit))
    }
    for (const l of lines) {
      if (l.unit) codes.add(String(l.unit))
    }
    if (displayUnit) codes.add(displayUnit)
    return Array.from(codes)
  }, [deliveryProducts, lines, displayUnit])

  const updateLine = (index: number, patch: Partial<AdjustmentLine>) => {
    onLinesChange(
      lines.map((row, i) => {
        if (i !== index) return row
        const next = { ...row, ...patch }
        if ('quantityAccepted' in patch || 'quantityRefused' in patch) {
          const acc = lineQty(next.quantityAccepted)
          const ref = lineQty(next.quantityRefused)
          const expected = lineExpectedFor(next, expectedPalettes, lines.length)
          if (
            lineNeedsJustification(acc, ref, expected) &&
            (next.justification || '').trim() === DEFAULT_FULL_JUSTIFICATION
          ) {
            next.justification = ''
          }
        }
        return next
      })
    )
  }

  const rejectionJustification =
    lines.find((line) => {
      const j = (line.justification || '').trim()
      return j.length > 0 && j !== DEFAULT_FULL_JUSTIFICATION
    })?.justification ?? ''

  const setRejectionJustification = (text: string) => {
    onLinesChange(lines.map((line) => ({ ...line, justification: text })))
  }

  const declarationError = declared
    ? null
    : validateDeclarationBeforeSubmit(lines, expectedPalettes, outcome, deliveryProducts)

  const renderProductHeader = (line: AdjustmentLine) => {
    const lineExpected = lineExpectedFor(line, expectedPalettes, lines.length)
    return (
      <div className="declare-product-header">
        <strong>{line.productLabel || 'Produit'}</strong>
        {lineExpected != null && (
          <span className="declare-product-expected">
            {' '}
            — {formatQuantityWithUnit(lineExpected, line.unit || displayUnit)} commandé(s)
          </span>
        )}
      </div>
    )
  }

  return (
    <section className="declare-section">
      <h3>Déclaration de livraison</h3>
      <p className="hint">
        {!outcomeChosen
          ? 'Choisissez d’abord le type de livraison (acceptée, partielle ou refusée).'
          : isRejected
            ? multiProduct
              ? 'Chaque produit commandé sera enregistré comme refusé. Le motif est obligatoire.'
              : `Toute la commande (${formatQuantityWithUnit(expectedPalettes, displayUnit)}) sera enregistrée comme refusée. Le motif est obligatoire.`
            : multiProduct
              ? 'Déclarez chaque produit commandé : quantités acceptées ou refusées et motif en cas d’écart.'
              : `Indiquez les quantités acceptées ou refusées. Accepté + refusé = ${formatQuantityWithUnit(expectedPalettes, displayUnit)} commandée(s).`}
      </p>

      {fixedProducts && (
        <ul className="declare-products-summary">
          {deliveryProducts.map((p) => (
            <li key={`${p.productLabel}\0${p.unit}`}>
              <strong>{p.productLabel}</strong>
              {' — '}
              {formatQuantityWithUnit(p.quantityExpected ?? 0, p.unit)} commandé(s)
            </li>
          ))}
        </ul>
      )}

      <div className="declare-mode">
        <label className="radio-chip">
          <input
            type="radio"
            name="outcome"
            checked={outcome === 'full'}
            disabled={declared}
            data-testid="declare-outcome-full"
            onChange={() => onOutcomeChange('full')}
          />
          {fixedProducts
            ? fullAcceptanceLabel(deliveryProducts)
            : `Livraison acceptée (${formatQuantityWithUnit(expectedPalettes, displayUnit)})`}
        </label>
        <label className="radio-chip">
          <input
            type="radio"
            name="outcome"
            checked={outcome === 'partial'}
            disabled={declared}
            data-testid="declare-outcome-partial"
            onChange={() => onOutcomeChange('partial')}
          />
          Livraison partielle
        </label>
        <label className="radio-chip">
          <input
            type="radio"
            name="outcome"
            checked={outcome === 'rejected'}
            disabled={declared}
            data-testid="declare-outcome-rejected"
            onChange={() => onOutcomeChange('rejected')}
          />
          Livraison refusée
        </label>
      </div>

      {outcomeChosen && isRejected ? (
        <>
          {lines.map((line, index) => (
            <div key={index} className="declare-line-card declare-line-card--readonly">
              {renderProductHeader(line)}
              <p className="hint" style={{ margin: '8px 0 0' }}>
                {formatQuantityWithUnit(
                  line.quantityRefused ??
                    lineExpectedFor(line, expectedPalettes, lines.length) ??
                    expectedPalettes,
                  line.unit || displayUnit
                )}{' '}
                refusée(s), 0 acceptée
              </p>
            </div>
          ))}
          <div className="field-block">
            <label>Motif du refus *</label>
            <textarea
              rows={3}
              disabled={declared}
              placeholder={REJECTION_JUSTIFICATION_MESSAGE}
              value={rejectionJustification}
              onChange={(e) => setRejectionJustification(e.target.value)}
            />
          </div>
        </>
      ) : outcomeChosen && isFullReadonly ? (
        lines.map((line, index) => (
          <div
            key={index}
            className="declare-line-card declare-line-card--readonly declare-line-card--full"
          >
            {renderProductHeader(line)}
            <p className="hint success-text" style={{ margin: '8px 0 0' }}>
              {formatQuantityWithUnit(
                line.quantityAccepted ??
                  lineExpectedFor(line, expectedPalettes, lines.length) ??
                  0,
                line.unit || displayUnit
              )}{' '}
              acceptée(s), 0 refusée — conforme
            </p>
          </div>
        ))
      ) : outcomeChosen ? (
        lines.map((line, index) => {
          const unitLocked = fixedProducts
          const acc = lineQty(line.quantityAccepted)
          const ref = lineQty(line.quantityRefused)
          const lineExpected = lineExpectedFor(line, expectedPalettes, lines.length)
          return (
            <div key={index} className="declare-line-card">
              {fixedProducts ? (
                <div className="field-block">{renderProductHeader(line)}</div>
              ) : (
                <div className="field-block">
                  <label>Produit</label>
                  <input
                    type="text"
                    value={line.productLabel}
                    disabled={declared}
                    onChange={(e) => updateLine(index, { productLabel: e.target.value })}
                  />
                </div>
              )}
              <div className="declare-line-row">
                <div className="field-block">
                  <label>Unité</label>
                  <select
                    value={line.unit}
                    disabled={declared || unitLocked}
                    onChange={(e) => updateLine(index, { unit: e.target.value })}
                  >
                    {unitOptions.map((u) => (
                      <option key={u} value={u}>
                        {formatUnitLabel(u)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-block">
                  <label>Accepté</label>
                  <input
                    type="number"
                    min={0}
                    disabled={declared}
                    value={line.quantityAccepted ?? ''}
                    onChange={(e) =>
                      updateLine(index, {
                        quantityAccepted:
                          e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                      })
                    }
                  />
                </div>
                <div className="field-block">
                  <label>Refusé</label>
                  <input
                    type="number"
                    min={0}
                    disabled={declared}
                    value={line.quantityRefused ?? ''}
                    onChange={(e) =>
                      updateLine(index, {
                        quantityRefused:
                          e.target.value === '' ? undefined : parseInt(e.target.value, 10),
                      })
                    }
                  />
                </div>
              </div>
              <div className="field-block">
                <label>{lineJustificationFieldLabel(acc, ref, lineExpected)}</label>
                <textarea
                  rows={2}
                  disabled={declared}
                  placeholder={lineJustificationPlaceholder(acc, ref, lineExpected)}
                  value={line.justification}
                  onChange={(e) => updateLine(index, { justification: e.target.value })}
                />
              </div>
            </div>
          )
        })
      ) : null}

      {!declared && !outcomeChosen && (
        <p className="hint declare-outcome-prompt" role="status">
          Aucune option sélectionnée — choisissez ci-dessus pour afficher le formulaire.
        </p>
      )}

      {!declared && outcomeChosen && declarationError && (
        <p className="form-error" role="alert">
          {declarationError}
        </p>
      )}

      {!declared && (
        <button
          type="button"
          className="btn btn-secondary btn-block"
          disabled={loading || Boolean(declarationError)}
          data-testid="save-declaration"
          onClick={onSubmit}
        >
          {loading ? 'Enregistrement…' : 'Enregistrer la déclaration'}
        </button>
      )}

      {declared && (
        <p className="hint success-text" role="status">
          Déclaration enregistrée — vous pouvez envoyer le code OTP.
        </p>
      )}
    </section>
  )
}
