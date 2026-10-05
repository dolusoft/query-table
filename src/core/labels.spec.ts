import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import {
  makeColumns,
  mountTable,
  type Mounted
} from '../../tests/support/mount-table'
import type { FilterMenuSlotProps } from '../contract'

let mounted: Mounted | null = null
const mountIt = (...args: Parameters<typeof mountTable>) => {
  mounted = mountTable(...args)
  return mounted
}

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

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

const everything = {
  filterable: true,
  sortable: true,
  hasSubtable: true,
  hasRightPanel: true,
  columns: [
    ...makeColumns(),
    { field: 'active', title: 'Active', type: 'bool' }
  ]
}
const menu = {
  slots: { 'filter-menu': (p: FilterMenuSlotProps) => h(p.trigger) }
}

const names = (m: Mounted) =>
  m.wrapper.findAll('[aria-label]').map(el => el.attributes('aria-label'))

describe('C-44 Labels', () => {
  it('has no literal aria-label in a component template', () => {
    const offenders = vueFiles(src).filter(file =>
      /\saria-label="/.test(readFileSync(file, 'utf8'))
    )
    expect(offenders).toEqual([])
  })

  it('names every control in English by default', () => {
    const m = mountIt(everything, menu)
    expect(names(m)).toEqual(
      expect.arrayContaining([
        'Clear all filters',
        'Filter Name',
        'Filter options for Name',
        'Expand row',
        'Open right panel'
      ])
    )
    expect(
      m.wrapper.findAll('select.qt-filter-input option').map(o => o.text())
    ).toEqual(['All', 'True', 'False'])
  })

  it('takes every text from the labels prop', () => {
    const m = mountIt(
      {
        ...everything,
        labels: {
          clearAllFilters: 'Tüm filtreleri temizle',
          expandRow: 'Satırı aç',
          openRightPanel: 'Paneli aç',
          filterInput: (column: string) => `${column} filtresi`,
          filterOptions: (column: string) => `${column} filtre seçenekleri`,
          boolAll: 'Tümü',
          boolTrue: 'Evet',
          boolFalse: 'Hayır'
        }
      },
      menu
    )
    const all = names(m)
    expect(all).toEqual(
      expect.arrayContaining([
        'Tüm filtreleri temizle',
        'Name filtresi',
        'Name filtre seçenekleri',
        'Satırı aç',
        'Paneli aç'
      ])
    )
    expect(all.filter(name => /Filter|Expand|Open|Clear/.test(name!))).toEqual(
      []
    )
    expect(m.wrapper.find('.qt-clear-all-button').attributes('title')).toBe(
      'Tüm filtreleri temizle'
    )
    expect(
      m.wrapper.findAll('select.qt-filter-input option').map(o => o.text())
    ).toEqual(['Tümü', 'Evet', 'Hayır'])
  })

  it('keeps the English default of an entry that is not given', () => {
    const m = mountIt({ ...everything, labels: { expandRow: 'Aç' } }, menu)
    expect(names(m)).toEqual(
      expect.arrayContaining(['Aç', 'Open right panel', 'Filter Name'])
    )
  })

  it('names a column without a title by its field', () => {
    const m = mountIt({ filterable: true, columns: [{ field: 'city' }] }, menu)
    expect(names(m)).toEqual(['Filter city', 'Filter options for city'])
  })
})

describe('C-45 Header semantics', () => {
  it('marks every header cell as a column header', () => {
    const m = mountIt(everything)
    const cells = m.wrapper.findAll('thead th')
    // The columns and the utility cell that holds the clear-all button.
    expect(cells.length).toBe(everything.columns.length + 1)
    expect(cells.map(th => th.attributes('scope'))).toEqual(
      cells.map(() => 'col')
    )
    expect(cells[0].find('.qt-clear-all-button').exists()).toBe(true)
  })

  it('draws an empty utility header cell as a td, not an empty th', () => {
    const m = mountIt({ ...everything, filterable: false })
    expect(m.wrapper.findAll('thead th')).toHaveLength(
      everything.columns.length
    )
    const empty = m.wrapper.findAll('thead td')
    expect(empty).toHaveLength(2)
    expect(empty.map(td => td.element.childElementCount)).toEqual([0, 0])
  })

  it('names a sort button by its field when the column has no title', () => {
    const m = mountIt({
      sortable: true,
      columns: [{ field: 'city' }, { field: 'name', title: 'Name' }]
    })
    const buttons = m.wrapper.findAll('.qt-sort')
    expect(buttons[0].attributes('aria-label')).toBe('city')
    // A title is the button's own text, so it needs no aria-label.
    expect(buttons[1].attributes('aria-label')).toBeUndefined()
    expect(buttons[1].text()).toBe('Name')
  })
})
