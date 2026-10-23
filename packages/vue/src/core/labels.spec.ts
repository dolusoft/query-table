import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { TableLabels } from '../contract'
import { resolveLabels } from './labels'

const src = join(dirname(fileURLToPath(import.meta.url)), '..')
const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    return statSync(path).isDirectory()
      ? vueFiles(path)
      : entry.endsWith('.vue')
        ? [path]
        : []
  })

describe('C-44 Labels', () => {
  it('has no literal aria-label in a component template', () => {
    const offenders = vueFiles(src).filter(file =>
      /\saria-label="/.test(readFileSync(file, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  // Every entry of 3.12, none of 3.13: still a `TableLabels` (typecheck runs
  // over this file), and the bound names take their defaults.
  const labels312: TableLabels = {
    clearAllFilters: 'Tüm filtreleri temizle',
    expandRow: 'Satırı aç',
    openRightPanel: 'Sağ paneli aç',
    filterInput: column => `${column} filtresi`,
    filterOptions: column => `${column} filtre seçenekleri`,
    resizeColumn: column => `${column} genişliği`,
    moveColumn: column => `${column} taşı`,
    filterCondition: condition => condition,
    boolAll: 'Tümü',
    boolTrue: 'Evet',
    boolFalse: 'Hayır',
    selectRow: 'Satırı seç',
    selectAllRows: 'Tüm satırları seç'
  }

  it('fills the 3.13 entries a complete 3.12 object leaves out', () => {
    const labels = resolveLabels(labels312)
    expect(labels.filterInput('Yaş')).toBe('Yaş filtresi')
    expect(labels.filterInputFrom('Yaş')).toBe('Filter Yaş from')
    expect(labels.filterInputTo('Yaş')).toBe('Filter Yaş to')
  })
})
