import { describe, expect, it } from 'vitest'
import { reactive, readonly, ref } from 'vue'

import { applyQuery } from './apply-query'
import type { Dataset } from './dataset'
import { defineDataset, fieldOf, isBranded } from './dataset'

const definition = (): Dataset<{ id: number; name: string }> => ({
  key: 'id',
  fields: {
    id: { type: 'integer' },
    name: { type: 'string', search: true }
  }
})

const query = { page: 1, pageSize: 10, sort: null, filters: [] }

describe('C-77 Structural errors [own]: a malformed definition throws', () => {
  const bad: [string, unknown][] = [
    ['not an object', null],
    ['fields missing', { key: 'id' }],
    ['fields an array', { key: 'id', fields: [] }],
    ['fields not plain', { key: 'id', fields: new Map() }],
    ['a field not an object', { key: 'id', fields: { id: 'integer' } }],
    ['an unknown type', { key: 'id', fields: { id: { type: 'text' } } }],
    [
      'get not a function',
      { key: 'id', fields: { id: { type: 'integer', get: 'id' } } }
    ],
    [
      'search not a boolean',
      { key: 'id', fields: { id: { type: 'string', search: 1 } } }
    ],
    [
      'sortable not a boolean',
      { key: 'id', fields: { id: { type: 'integer', sortable: 'no' } } }
    ],
    [
      'filterable not a boolean',
      { key: 'id', fields: { id: { type: 'integer', filterable: null } } }
    ],
    [
      'search on a number',
      {
        key: 'id',
        fields: { id: { type: 'integer' }, n: { type: 'number', search: true } }
      }
    ],
    [
      'an offset outside datetime',
      {
        key: 'id',
        fields: { id: { type: 'integer' }, d: { type: 'date', offset: 'Z' } }
      }
    ],
    [
      'an offset of -00:00',
      {
        key: 'id',
        fields: {
          id: { type: 'integer' },
          t: { type: 'datetime', offset: '-00:00' }
        }
      }
    ],
    [
      'an offset over 14:00',
      {
        key: 'id',
        fields: {
          id: { type: 'integer' },
          t: { type: 'datetime', offset: '+14:01' }
        }
      }
    ],
    [
      'a key that is no field',
      { key: 'nr', fields: { id: { type: 'integer' } } }
    ],
    ['a key not a string', { key: 1, fields: { 1: { type: 'integer' } } }],
    ['a number key', { key: 'id', fields: { id: { type: 'number' } } }],
    ['a date key', { key: 'id', fields: { id: { type: 'date' } } }],
    [
      'an inherited key',
      { key: 'toString', fields: { id: { type: 'integer' } } }
    ]
  ]
  it.each(bad)('%s', (_, value) => {
    expect(() => defineDataset(value as Dataset)).toThrow(TypeError)
  })

  it('accepts a null-prototype fields object and every column type', () => {
    const fields = Object.assign(Object.create(null) as object, {
      id: { type: 'string' },
      n: { type: 'number' },
      i: { type: 'integer' },
      d: { type: 'date' },
      t: { type: 'datetime', offset: '+03:00' },
      b: { type: 'bool' }
    }) as Dataset['fields']
    expect(() => defineDataset({ key: 'id', fields })).not.toThrow()
  })
})

describe('defineDataset', () => {
  it('returns a frozen, branded copy and leaves the definition alone', () => {
    const given = definition()
    const dataset = defineDataset(given)
    expect(dataset).not.toBe(given)
    expect(dataset).toEqual(given)
    expect(Object.isFrozen(dataset)).toBe(true)
    expect(Object.isFrozen(dataset.fields)).toBe(true)
    expect(Object.isFrozen(dataset.fields.name)).toBe(true)
    expect(Object.isFrozen(given)).toBe(false)
    expect(Object.isFrozen(given.fields.name)).toBe(false)
    expect(isBranded(dataset)).toBe(true)
    expect(isBranded(given)).toBe(false)
  })

  it('does not see later changes to the definition', () => {
    const given = definition()
    const dataset = defineDataset(given)
    ;(given.fields.name as { type: string }).type = 'number'
    expect(dataset.fields.name.type).toBe('string')
  })

  it('looks fields up as own properties only', () => {
    const dataset = defineDataset(definition())
    expect(fieldOf(dataset, 'name')).toBe(dataset.fields.name)
    expect(fieldOf(dataset, 'toString')).toBeUndefined()
    expect(fieldOf(dataset, '__proto__')).toBeUndefined()
  })

  it('keeps a field named __proto__ as a field', () => {
    const fields = JSON.parse(
      '{"id":{"type":"integer"},"__proto__":{"type":"string"}}'
    ) as Dataset['fields']
    const dataset = defineDataset({ key: 'id', fields })
    expect(fieldOf(dataset, '__proto__')).toEqual({ type: 'string' })
    expect(Object.getPrototypeOf(dataset.fields)).toBe(Object.prototype)
  })
})

describe('C-77 Structural errors [own]: the brand survives Vue wrappers', () => {
  it('a frozen branded dataset survives reactive()', () => {
    const dataset = defineDataset(definition())
    expect(reactive(dataset)).toBe(dataset)
    expect(readonly(dataset)).toBe(dataset)
    expect(ref(dataset).value).toBe(dataset)
    const result = applyQuery(
      [{ id: 1, name: 'a' }],
      query,
      reactive(dataset),
      {
        profile: 'tr-1'
      }
    )
    expect(result.ok).toBe(true)
  })
})
