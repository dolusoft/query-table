import { afterEach, describe, expect, test } from 'vitest'

import type { Dataset, DemoValue } from './dataset'
import {
  currentDataset,
  datasetId,
  datasets,
  defaultDatasetId,
  resetDataset,
  selectDataset
} from './datasets'

const typeOf = (value: DemoValue, type: string | undefined) => {
  switch (type ?? 'string') {
    case 'integer':
      return Number.isSafeInteger(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'bool':
      return typeof value === 'boolean'
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    case 'datetime':
      return (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)
      )
    default:
      return typeof value === 'string' && value.length > 0
  }
}

describe.each(datasets.map(data => [data.name, data] as [string, Dataset]))(
  'the %s demo dataset',
  (_name, data) => {
    test('has 200 repeatable rows with unique ids', () => {
      const rows = data.createRows()
      expect(rows).toHaveLength(200)
      expect(new Set(rows.map(row => row.id)).size).toBe(200)
      expect(data.createRows()).toEqual(rows)
    })

    test('every value has the type of its column', () => {
      for (const row of data.createRows()) {
        for (const [field, column] of Object.entries(data.columns)) {
          expect(typeOf(row[field], column.type), `${row.id}.${field}`).toBe(
            true
          )
        }
      }
    })

    test('covers every column type, and each role names a column', () => {
      const types = new Set(
        Object.values(data.columns).map(column => column.type ?? 'string')
      )
      expect([...types].sort()).toEqual(
        ['bool', 'date', 'datetime', 'integer', 'number', 'string'].sort()
      )
      const { fields, columns } = data
      expect(columns[fields.count].type).toBe('integer')
      expect(columns[fields.amount].type).toBe('number')
      expect(columns[fields.date].type).toBe('date')
      expect(columns[fields.datetime].type).toBe('datetime')
      expect(columns[fields.flag].type).toBe('bool')
      expect(columns[fields.primary].type ?? 'string').toBe('string')
      expect(columns[fields.category].type ?? 'string').toBe('string')
      for (const field of [
        ...(Object.values(fields) as string[]),
        ...data.list,
        ...data.wide,
        ...data.showcase,
        ...data.searchFields
      ]) {
        expect(columns[field], field).toBeDefined()
      }
      expect(data.wide).toContain(fields.category)
      expect(data.wide).toContain(fields.flag)
      expect(data.list).toContain(fields.category)
    })

    test('has Turkish text for the tr-1 local query page', () => {
      const text = data
        .createRows()
        .flatMap(row => data.searchFields.map(field => String(row[field])))
        .join(' ')
      expect(text).toMatch(/[ıİşŞğĞçÇöÖüÜ]/)
    })

    test('the samples of the filtering page match rows', () => {
      const rows = data.createRows()
      const { fields, samples } = data
      const text = (row: (typeof rows)[number], field: string) =>
        String(row[field]).toLowerCase()
      expect(
        rows.some(row => text(row, fields.primary).startsWith(samples.prefix))
      ).toBe(true)
      expect(rows.some(row => row[fields.primary] === samples.exact)).toBe(true)
      expect(rows.some(row => row[fields.category] === samples.category)).toBe(
        true
      )
    })

    test('detail rows are the same for the same row', () => {
      const [row] = data.createRows()
      const detail = data.detail.rows(row)
      expect(detail.length).toBeGreaterThan(1)
      expect(data.detail.rows(row)).toEqual(detail)
      const keys = data.detail.columns().map(column => column.field)
      expect(keys).toContain(data.detail.key)
      for (const line of detail) {
        for (const key of keys) {
          expect(line[key], key).toBeDefined()
        }
      }
    })
  }
)

describe('the dataset choice', () => {
  afterEach(() => resetDataset())

  test('starts on Vigil and keeps a new choice in localStorage', () => {
    resetDataset()
    expect(defaultDatasetId).toBe('vigil')
    expect(currentDataset().name).toBe('Vigil')
    selectDataset('harbor')
    expect(datasetId()).toBe('harbor')
    expect(currentDataset().name).toBe('Harbor Goods')
    expect(localStorage.getItem('query-table-playground:dataset')).toBe(
      'harbor'
    )
    resetDataset()
    expect(datasetId()).toBe('vigil')
    expect(localStorage.getItem('query-table-playground:dataset')).toBeNull()
  })
})
