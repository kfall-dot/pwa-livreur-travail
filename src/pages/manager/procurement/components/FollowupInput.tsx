
export type FollowupField = 'invoice' | 'observation' | 'verification' | 'justifs'

export interface FollowupInputProps {
  rowId: string | number
  field: FollowupField
  value: string
  placeholder: string
  onSave: (value: string) => void
  testIdPrefix?: string
}

/**
 * Input unifié pour les champs de suivi dans les tableaux procurement.
 * Utilisé par SuiviBcTab et potentiellement d'autres tabs.
 */
export function FollowupInput({
  rowId,
  field,
  value,
  placeholder,
  onSave,
  testIdPrefix = 'proc-followup',
}: FollowupInputProps) {
  return (
    <input
      key={`${rowId}-${field}-${value}`}
      className={`proc-cell-input${value.trim() ? ' filled' : ''}`}
      defaultValue={value}
      placeholder={placeholder}
      data-testid={`${testIdPrefix}-${field}-${rowId}`}
      onBlur={(e) => void onSave(e.target.value)}
    />
  )
}

export const FOLLOWUP_INPUT_CSS = `
.proc-cell-input {
  font-family: inherit;
  font-size: 12.5px;
  padding: 5px 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  width: 100%;
  min-width: 90px;
  color: #1e293b;
  background: #fff;
  box-sizing: border-box;
}
.proc-cell-input:focus {
  outline: 2px solid #bfdbfe;
  border-color: #93c5fd;
}
.proc-cell-input.filled {
  border-color: #a7f3d0;
  background: #f0fdf9;
}
`