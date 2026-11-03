import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseSpreadsheetImport, MAX_SPREADSHEET_BYTES } from './spreadsheetImportData.ts'

function workbook(rows: unknown[][], bookType: 'xlsx' | 'xls' = 'xlsx'): ArrayBuffer {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Import')
  return XLSX.write(book, { type: 'array', bookType }) as ArrayBuffer
}

test('catalogue XLSX/XLS : accents, unités et cellules vides préservés', () => {
  for (const format of ['xlsx', 'xls'] as const) {
    assert.deepEqual(parseSpreadsheetImport(workbook([
      ['Désignation', 'Unité', 'Catégorie'], ['Ciment', 'sac', ''], ['Fer', 'kg', 'Matériaux'],
    ], format), 'records'), [
      { Désignation: 'Ciment', Unité: 'sac', Catégorie: '' },
      { Désignation: 'Fer', Unité: 'kg', Catégorie: 'Matériaux' },
    ])
  }
})

test('journal : préserve les positions, nombres et cellules vides, ignore les lignes vides', () => {
  assert.deepEqual(parseSpreadsheetImport(workbook([['Ciment', '', 75000], [], ['Fer', 'kg', 5000]]), 'rows'), [
    ['Ciment', '', 75000], ['Fer', 'kg', 5000],
  ])
})

test('CSV : conserve les en-têtes et les nombres', () => {
  const data = new TextEncoder().encode('designation,unite,montant\nCiment,sac,75000\n')
  assert.deepEqual(parseSpreadsheetImport(data.buffer, 'records'), [{ designation: 'Ciment', unite: 'sac', montant: 75000 }])
})

test('rejette fichiers, lignes et colonnes dépassant les limites sans tronquer silencieusement', () => {
  assert.throws(() => parseSpreadsheetImport(new ArrayBuffer(MAX_SPREADSHEET_BYTES + 1), 'rows'), /10 Mo/)
  assert.throws(() => parseSpreadsheetImport(workbook(Array.from({ length: 5001 }, () => ['a'])), 'rows'), /5 000 lignes/)
  assert.throws(() => parseSpreadsheetImport(workbook([Array.from({ length: 101 }, () => 'a')]), 'rows'), /100 colonnes/)
})
