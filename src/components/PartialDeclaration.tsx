import type { AdjustmentLine, DeliveryProductOption } from '../types'
import { formatQuantityWithUnit, resolvePlannedUnit } from '../lib/deliveryUnits'
import { finalizeDeclarationLines } from '../lib/deliveryHelpers'
import {
  type DeclarationOutcome,
  DEFAULT_FULL_JUSTIFICATION,
  PARTIAL_JUSTIFICATION_MESSAGE,
  REJECTION_JUSTIFICATION_MESSAGE,
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
  const isFullReadonly = outcome === 'full'
  const displayUnit = resolvePlannedUnit(deliveryProducts, lines, plannedUnit)

  const updateLine = (index: number, patch: Partial<AdjustmentLine>) => {
    onLinesChange(lines.map((row, i) => (i !== index ? row : { ...row, ...patch })))
  }

  const toggleSelected = (index: number, selected: boolean) => {
    onLinesChange(
      lines.map((row, i) => {
        if (i !== index) return row
        const expected = lineExpectedFor(row, expectedPalettes, lines.length) ?? expectedPalettes
        if (selected) {
          return {
            ...row,
            isPartial: true,
            quantityAccepted: undefined,
            quantityRefused: 0,
            justification: '',
          }
        }
        return {
          ...row,
          isPartial: false,
          quantityAccepted: expected,
          quantityRefused: 0,
          justification: DEFAULT_FULL_JUSTIFICATION,
        }
      })
    )
  }

  const declarationError = declared
    ? null
    : validateDeclarationBeforeSubmit(
        finalizeDeclarationLines(lines, expectedPalettes, outcome),
        expectedPalettes,
        outcome,
        deliveryProducts
      )

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
            ? 'Cochez les produits refusés. Les produits non cochés sont livrés en totalité. Le motif est obligatoire pour chaque produit refusé.'
            : 'Cochez les produits livrés partiellement. Les produits non cochés sont livrés en totalité.'}
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

      {outcomeChosen && isFullReadonly ? (
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
          const expected = lineExpectedFor(line, expectedPalettes, lines.length)
          const expectedQty = expected ?? expectedPalettes
          const acc = lineQty(line.quantityAccepted)
          const ref = lineQty(line.quantityRefused)
          const selected = Boolean(line.isPartial)

          if (declared) {
            const refused = ref > 0
            const partial = expected != null && acc > 0 && acc < expected
            const justification = (line.justification || '').trim()
            return (
              <div key={index} className="declare-line-card declare-line-card--readonly">
                {renderProductHeader(line)}
                {refused ? (
                  <p className="hint" style={{ margin: '8px 0 0' }}>
                    {formatQuantityWithUnit(ref, line.unit || displayUnit)} refusée(s),{' '}
                    {formatQuantityWithUnit(acc, line.unit || displayUnit)} acceptée(s)
                  </p>
                ) : partial ? (
                  <p className="hint" style={{ margin: '8px 0 0' }}>
                    {formatQuantityWithUnit(acc, line.unit || displayUnit)} acceptée(s),{' '}
                    {formatQuantityWithUnit(ref, line.unit || displayUnit)} refusée(s)
                  </p>
                ) : (
                  <p className="hint success-text" style={{ margin: '8px 0 0' }}>
                    {formatQuantityWithUnit(acc, line.unit || displayUnit)} acceptée(s) — conforme
                  </p>
                )}
                {justification && justification !== DEFAULT_FULL_JUSTIFICATION && (
                  <p className="hint" style={{ margin: '8px 0 0' }}>
                    Motif : {justification}
                  </p>
                )}
              </div>
            )
          }

          return (
            <div key={index} className="declare-line-card">
              {fixedProducts ? (
                renderProductHeader(line)
              ) : (
                <div className="field-block">
                  <label>Produit</label>
                  <input
                    type="text"
                    value={line.productLabel}
                    onChange={(e) => updateLine(index, { productLabel: e.target.value })}
                  />
                </div>
              )}

              <label className="declare-select-row">
                <input
                  type="checkbox"
                  checked={selected}
                  data-testid={`select-product-${index}`}
                  onChange={(e) => toggleSelected(index, e.target.checked)}
                />
                <span>{isRejected ? 'Refuser ce produit' : 'Partiel sur ce produit'}</span>
              </label>

              {!selected ? (
                <p className="hint success-text" style={{ margin: '8px 0 0' }}>
                  Livré en totalité :{' '}
                  {formatQuantityWithUnit(expectedQty, line.unit || displayUnit)} accepté(s), 0 refusé
                </p>
              ) : isRejected ? (
                <>
                  <p className="hint" style={{ margin: '8px 0 0' }}>
                    0 acceptée, {formatQuantityWithUnit(expectedQty, line.unit || displayUnit)} refusée(s)
                  </p>
                  <div className="field-block">
                    <label>Motif du refus *</label>
                    <textarea
                      rows={2}
                      placeholder={REJECTION_JUSTIFICATION_MESSAGE}
                      value={line.justification}
                      onChange={(e) => updateLine(index, { justification: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="declare-line-row declare-line-row--2col">
                    <div className="field-block">
                      <label>Quantité acceptée</label>
                      <input
                        type="number"
                        min={0}
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
                      <label>Refusé (calculé)</label>
                      <input type="number" min={0} disabled value={Math.max(0, expectedQty - acc)} />
                    </div>
                  </div>
                  <div className="field-block">
                    <label>Motif du partiel *</label>
                    <textarea
                      rows={2}
                      placeholder={PARTIAL_JUSTIFICATION_MESSAGE}
                      value={line.justification}
                      onChange={(e) => updateLine(index, { justification: e.target.value })}
                    />
                  </div>
                </>
              )}
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
