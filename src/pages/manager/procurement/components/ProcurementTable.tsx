
export interface ProcurementColumn<T> {
  key: string
  header: string
  width?: string
  render: (row: T, index: number) => React.ReactNode
  align?: 'left' | 'center' | 'right'
}

export interface ProcurementTableProps<T> {
  columns: ProcurementColumn<T>[]
  data: T[]
  rowKey: (row: T, index: number) => string | number
  emptyMessage?: string
  testId?: string
  maxHeight?: string
}

/**
 * Tableau générique pour les tabs procurement.
 * Remplace les tableaux répétés dans SuiviBcTab, ComptabiliteTab, etc.
 */
export function ProcurementTable<T>({
  columns,
  data,
  rowKey,
  emptyMessage = 'Aucune donnée',
  testId = 'proc-table',
  maxHeight,
}: ProcurementTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="proc-table-empty" data-testid={`${testId}-empty`}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="proc-table-wrap" data-testid={testId} style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table className="proc-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  textAlign: col.align ?? 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={rowKey(row, idx)} data-testid={`${testId}-row-${rowKey(row, idx)}`}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{ textAlign: col.align ?? 'left' }}
                >
                  {col.render(row, idx)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const PROCUREMENT_TABLE_CSS = `
.proc-table-wrap {
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.proc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.proc-table thead {
  position: sticky;
  top: 0;
  z-index: 1;
}
.proc-table th {
  text-align: left;
  padding: 12px 16px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 11px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  white-space: nowrap;
}
.proc-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: top;
}
.proc-table tbody tr:hover {
  background: #f9fafb;
}
.proc-table-empty {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px dashed #e5e7eb;
}
`