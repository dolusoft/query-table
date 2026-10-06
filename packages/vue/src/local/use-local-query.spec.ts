import type { PageQuery, Query } from '@dolusoft/query-protocol'
import {
  applyQuery,
  defineDataset,
  type Dataset
} from '@dolusoft/query-protocol/local'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  effectScope,
  nextTick,
  reactive,
  readonly,
  ref,
  shallowRef,
  type EffectScope
} from 'vue'

import {
  useLocalQuery,
  type LocalQuery,
  type UseLocalQueryOptions
} from './use-local-query'
import people from '../../../query-protocol/conformance/data/people.json'

type Row = { id: number; name: string }
const rows: Row[] = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Zeki' },
  { id: 3, name: 'Bora' }
]
const dataset = defineDataset<Row>({
  key: 'id',
  fields: { id: { type: 'integer' }, name: { type: 'string', search: true } }
})
const page = (): PageQuery => ({
  page: 1,
  pageSize: 1,
  sort: { field: 'name', direction: 'asc' },
  filters: []
})
const scopes: EffectScope[] = []
const local = <T>(
  options: Omit<UseLocalQueryOptions<T>, 'profile'> & {
    profile?: UseLocalQueryOptions<T>['profile']
  }
) => {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useLocalQuery({ profile: 'tr-1', ...options }))!
}
const equal = <T>(
  state: LocalQuery<T>,
  input: readonly T[],
  query: Query,
  schema: Dataset<T>,
  paginate = true
) => {
  const expected = applyQuery(input, query, schema, {
    profile: 'tr-1',
    paginate
  })
  expect({
    rows: state.rows.value,
    totalRows: state.totalRows.value,
    error: state.error.value
  }).toEqual(
    expected.ok
      ? { rows: expected.rows, totalRows: expected.totalRows, error: null }
      : { rows: [], totalRows: 0, error: expected.error }
  )
}
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('C-81 useLocalQuery [own]', () => {
  it('equals applyQuery for twenty seeded queries over people', () => {
    const schema = defineDataset(
      people.dataset as Parameters<
        typeof defineDataset<(typeof people.rows)[number]>
      >[0]
    )
    const query = ref(page())
    const paginate = ref(true)
    const state = local({
      allRows: people.rows,
      dataset: schema,
      query,
      paginate
    })
    let seed = 81
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed
    }
    for (let i = 0; i < 20; i++) {
      query.value = {
        page: (random() % 6) + 1,
        pageSize: (random() % 5) + 1,
        sort:
          i % 3 === 0
            ? null
            : {
                field: i % 2 ? 'name' : 'age',
                direction: i % 2 ? 'asc' : 'desc'
              },
        filters:
          i % 4 === 0
            ? [{ field: 'age', condition: 'GreaterThan', value: random() % 60 }]
            : [],
        search: i % 5 === 0 ? 'i' : ''
      }
      paginate.value = i % 3 !== 0
      equal(state, people.rows, query.value, schema, paginate.value)
    }
  })

  it('does not read fields again for page, pageSize or paginate changes with a new query object', () => {
    let reads = 0
    const schema = defineDataset<Row>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        name: {
          type: 'string',
          get: row => {
            reads++
            return row.name
          }
        }
      }
    })
    const query = ref(page())
    const paginate = ref(true)
    const state = local({ allRows: rows, dataset: schema, query, paginate })
    expect(state.rows.value).toEqual([rows[0]])
    const count = reads
    query.value = {
      ...query.value,
      page: 2,
      sort: { ...query.value.sort! },
      filters: []
    }
    expect(state.rows.value).toEqual([rows[2]])
    query.value.pageSize = 2
    expect(state.rows.value).toEqual([rows[1]])
    paginate.value = false
    expect(state.rows.value).toEqual([rows[0], rows[2], rows[1]])
    expect(reads).toBe(count)
    query.value.page = 99
    paginate.value = true
    expect(state.rows.value).toEqual([])
    expect(state.totalRows.value).toBe(3)
    expect(query.value.page).toBe(99)
    expect(reads).toBe(count)
  })

  it('in-place changes of the query are seen', () => {
    const query = ref(page())
    const state = local({ allRows: rows, dataset, query })
    equal(state, rows, query.value, dataset)
    query.value.filters.push({
      field: 'name',
      condition: 'NotEqual',
      value: 'Ada'
    })
    equal(state, rows, query.value, dataset)
    query.value.sort!.direction = 'desc'
    equal(state, rows, query.value, dataset)
    query.value.page = 2
    equal(state, rows, query.value, dataset)
    const rule = query.value.filters[0] as (typeof query.value.filters)[0] & {
      extra: { token: number }
    }
    rule.extra = { token: 1 }
    equal(state, rows, query.value, dataset)
    rule.extra.token = 2
    equal(state, rows, query.value, dataset)
    query.value.filters[0].value = 'Zeki'
    equal(state, rows, query.value, dataset)
  })

  it('reevaluates deep reactive rows and shallowRef replacements, but not shallow mutations', () => {
    let reads = 0
    const schema = defineDataset<Row>({
      key: 'id',
      fields: {
        id: { type: 'integer' },
        name: {
          type: 'string',
          get: row => {
            reads++
            return row.name
          }
        }
      }
    })
    const deep = reactive(rows.map(row => ({ ...row })))
    const state = local({ allRows: deep, dataset: schema, query: page() })
    expect(state.rows.value[0].id).toBe(1)
    const count = reads
    deep[1].name = 'A'
    expect(state.rows.value[0]).toBe(deep[1])
    expect(reads).toBeGreaterThan(count)
    const shallow = shallowRef(rows.map(row => ({ ...row })))
    const other = local({ allRows: shallow, dataset, query: page() })
    expect(other.rows.value[0].id).toBe(1)
    shallow.value[1].name = 'A'
    expect(other.rows.value[0].id).toBe(1)
    shallow.value = [...shallow.value]
    expect(other.rows.value[0]).toBe(shallow.value[1])
  })

  it('replaces dataset and rows together in one assignment', () => {
    const source = shallowRef({ rows, dataset })
    const state = local({
      allRows: () => source.value.rows,
      dataset: () => source.value.dataset,
      query: page()
    })
    expect(state.rows.value[0].id).toBe(1)
    source.value = {
      rows: [
        { id: 4, name: 'D' },
        { id: 5, name: 'E' }
      ],
      dataset: defineDataset<Row>({
        key: 'id',
        fields: {
          id: { type: 'integer' },
          name: { type: 'string', get: row => (row.name === 'D' ? 'Z' : 'A') }
        }
      })
    }
    expect(state.rows.value[0].id).toBe(5)
  })

  it('checks invalid pages and cursors before cached data errors and recovers after errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const input = shallowRef([{ id: 1, name: 42 }] as unknown as Row[])
    const query = ref<Query>(page())
    const paginate = ref(false)
    const state = local({ allRows: input, dataset, query, paginate })
    expect(state.error.value?.code).toBe('invalid-data')
    query.value = { ...page(), page: 0 }
    expect(state.error.value?.code).toBe('invalid-page')
    expect(state.rows.value).toEqual([])
    expect(state.totalRows.value).toBe(0)
    query.value = { cursor: null, pageSize: 1, sort: null, filters: [] }
    expect(state.error.value?.code).toBe('cursor-not-supported')
    query.value = page()
    expect(state.error.value?.code).toBe('invalid-data')
    input.value = rows
    expect(state.error.value).toBeNull()
    expect(state.totalRows.value).toBe(3)
    for (const bad of [
      null,
      { ...page(), filters: null },
      { ...page(), sort: [] },
      { ...page(), search: 1 },
      { ...page(), filters: [null] },
      { ...page(), sorts: [] }
    ]) {
      query.value = bad as unknown as Query
      equal(state, input.value, query.value, dataset, false)
    }
    query.value = page()
    expect(state.error.value).toBeNull()
  })

  it('accepts a dataset held in ref() and readonly inputs without any write', () => {
    let writes = 0
    const frozen = rows.map(row => Object.freeze({ ...row }))
    const input = new Proxy(Object.freeze(frozen), {
      set() {
        writes++
        return false
      }
    })
    const query = readonly(ref(page()))
    const schema = ref(dataset)
    const state = local({
      allRows: readonly(input),
      query: () => query.value as PageQuery,
      dataset: schema
    })
    equal(state, input, query.value as PageQuery, dataset)
    expect(schema.value).toBe(dataset)
    const frozenQuery = Object.freeze({
      ...page(),
      filters: Object.freeze([]),
      sort: Object.freeze({ field: 'name', direction: 'asc' as const })
    })
    const second = local({
      allRows: input,
      dataset,
      query: frozenQuery as unknown as Query
    })
    expect(second.rows.value).toEqual([input[0]])
    expect(writes).toBe(0)
  })

  it('returns exactly the supplied row objects including reactive proxies', () => {
    const input = reactive(rows.map(row => ({ ...row })))
    const state = local({
      allRows: input,
      dataset,
      query: { ...page(), sort: null },
      paginate: false
    })
    expect(state.rows.value).not.toBe(input)
    state.rows.value.forEach((row, index) => expect(row).toBe(input[index]))
  })

  it('logs each new error once in development and stays silent in production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const query = ref({ ...page(), page: 0 })
    const state = local({ allRows: rows, dataset, query })
    expect(log).toHaveBeenCalledTimes(1)
    query.value = { ...query.value }
    expect(state.error.value?.code).toBe('invalid-page')
    await nextTick()
    expect(log).toHaveBeenCalledTimes(1)
    query.value = { ...page(), pageSize: 0 }
    await nextTick()
    expect(log).toHaveBeenCalledTimes(2)
    query.value = page()
    await nextTick()
    query.value.pageSize = 0
    await nextTick()
    expect(log).toHaveBeenCalledTimes(3)
    vi.stubEnv('NODE_ENV', 'production')
    log.mockClear()
    const prod = local({
      allRows: rows,
      dataset,
      query: { ...page(), page: 0 }
    })
    expect(prod.error.value?.code).toBe('invalid-page')
    expect(log).not.toHaveBeenCalled()
    vi.stubGlobal('process', undefined)
    try {
      const raw = local({
        allRows: rows,
        dataset,
        query: { ...page(), page: 0 }
      })
      expect(raw.error.value?.code).toBe('invalid-page')
    } finally {
      vi.unstubAllGlobals()
    }
    expect(log).toHaveBeenCalledTimes(1)
  })
})
