// The guides promise that their code samples compile and work. Compiling is
// `pnpm typecheck` (tsconfig.json includes docs/guide); this file keeps the
// Markdown honest: a fenced block marked `<!-- snippet: file#region -->` is
// exactly that part of the file, the JSON queries match the JSON Schema, and
// the examples run.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'

import { cursorTour, filterInputTour } from './examples/api-tour'
import { createCursorPager } from './examples/cursor-stack'
import { typeIntoName } from './examples/filter-input-alone'
import { mountAndLeave } from './examples/lifecycle'
import { replaceTheHandler } from './examples/owned-handlers'
import {
  ageRules,
  describePaging,
  firstCursorPage,
  firstPage,
  nameRules,
  nextCursorPage,
  noRules,
  reasons
} from './examples/queries'
import {
  answer,
  BadQuery,
  handle,
  matches,
  parseQuery,
  people
} from './examples/server'
import { createServerTable } from './examples/table'
import schema from '../../packages/query-protocol/query.schema.json' with { type: 'json' }

const guide = import.meta.dirname
const examples = join(guide, 'examples')
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const pages = readdirSync(guide).filter(name => name.endsWith('.md'))

/** The lines between `#region name` and `#endregion name`, dedented. */
const region = (text: string, name: string): string => {
  const lines = text.split('\n')
  const from = lines.findIndex(line => line.trim().endsWith(`#region ${name}`))
  const to = lines.findIndex(line => line.trim().endsWith(`#endregion ${name}`))
  if (from < 0 || to < from) {
    throw new Error(`no region ${name}`)
  }
  const body = lines.slice(from + 1, to)
  const indent = Math.min(
    ...body
      .filter(line => line.trim() !== '')
      .map(line => /^ */.exec(line)![0].length)
  )
  return body.map(line => line.slice(indent)).join('\n')
}

describe('Markdown snippets are the compiled example code', () => {
  const marker =
    /<!-- snippet: ([\w./-]+?)(?:#([\w-]+))? -->\n```\w*\n([\s\S]*?)\n```/g

  it.each(pages)('%s', page => {
    const text = read(join(guide, page))
    let count = 0
    for (const [, file, name, block] of text.matchAll(marker)) {
      const source = read(join(examples, file))
      const expected = name ? region(source, name) : source
      expect(block, `${file}#${name ?? ''}`).toBe(expected.trimEnd())
      count += 1
    }
    // every marker is followed by a fence the pattern understood
    expect(count).toBe((text.match(/<!-- snippet:/g) ?? []).length)
  })

  it('has snippets in the guides that carry code', () => {
    const all = pages.map(page => read(join(guide, page))).join('\n')
    expect((all.match(/<!-- snippet:/g) ?? []).length).toBeGreaterThan(10)
  })
})

describe('relative links resolve', () => {
  // Written for the playground of PR-C; it does not exist before it lands.
  const later = ['../../apps/playground/public/architecture.svg']

  it.each(pages)('%s', page => {
    const text = read(join(guide, page))
    const links = [...text.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)]
      .map(match => match[1])
      .filter(link => !later.includes(link))
    for (const link of links) {
      expect(existsSync(join(guide, link)), link).toBe(true)
    }
  })
})

describe('the JSON Schema and the documented queries', () => {
  const ajv = new Ajv2020({ strict: false })
  const validate = ajv.compile(schema)
  const files = (kind: string) =>
    readdirSync(join(examples, 'json', kind)).map(name => [name, kind])
  const load = (kind: string, name: string) =>
    JSON.parse(read(join(examples, 'json', kind, name))) as unknown

  it.each(files('valid'))('%s is valid', (name, kind) => {
    expect(validate(load(kind, name)), ajv.errorsText(validate.errors)).toBe(
      true
    )
  })

  it.each(files('invalid'))('%s is invalid', (name, kind) => {
    expect(validate(load(kind, name))).toBe(false)
  })

  it('the TypeScript literals are valid too', () => {
    for (const query of [firstPage, firstCursorPage, nextCursorPage]) {
      expect(validate(query), ajv.errorsText(validate.errors)).toBe(true)
    }
  })
})

describe('queries.ts', () => {
  it('narrows and parses', () => {
    expect(describePaging(firstPage)).toBe('page 1')
    expect(describePaging(firstCursorPage)).toBe('cursor (first page)')
    expect(describePaging(nextCursorPage)).toBe('cursor eyJpZCI6NDJ9')
    expect(nameRules).toEqual([
      { field: 'name', condition: 'StartsWith', value: 'ali' },
      { field: 'name', condition: 'NotEqual', value: 'veli' }
    ])
    expect(ageRules).toEqual([{ field: 'age', condition: 'Equal', value: 18 }])
    expect(noRules).toEqual([])
    expect(reasons).toEqual([
      'page',
      'pageSize',
      'sort',
      'filter',
      'reset',
      'search'
    ])
  })
})

describe('server.ts', () => {
  const base = { sort: null, filters: [] }
  const ids = (rows: Array<{ id: number }>) => rows.map(row => row.id)

  it('pages, sorts and filters', () => {
    const page = answer({ page: 2, pageSize: 4, ...base })
    expect(page.total).toBe(6)
    expect(ids(page.rows)).toEqual([5, 6])
    const sorted = answer({
      page: 1,
      pageSize: 2,
      sort: { field: 'age', direction: 'desc' },
      filters: []
    })
    expect(ids(sorted.rows)).toEqual([3, 4])
    const filtered = answer({
      page: 1,
      pageSize: 10,
      sort: null,
      filters: [
        { field: 'name', condition: 'StartsWith', value: 'a' },
        { field: 'name', condition: 'Contains', value: 'eli' },
        { field: 'age', condition: 'GreaterThanOrEqual', value: 30 }
      ]
    })
    // (a* OR *eli*) AND age >= 30: Ali (31), Veli (45)
    expect(ids(filtered.rows)).toEqual([1, 3])
  })

  it('rules of one field: OR, and AND when all are negative', () => {
    const rule = (condition: 'Equal' | 'NotEqual', value: string) =>
      ({ field: 'name', condition, value }) as const
    const veli = people.find(row => row.name === 'Veli')!
    expect(matches(veli, [rule('Equal', 'Ali'), rule('Equal', 'Veli')])).toBe(
      true
    )
    expect(
      matches(veli, [rule('NotEqual', 'Ali'), rule('NotEqual', 'Veli')])
    ).toBe(false)
  })

  it('searches', () => {
    const found = answer({ page: 1, pageSize: 10, ...base, search: 'zey' })
    expect(ids(found.rows)).toEqual([4])
  })

  it('walks the cursors forward and back', () => {
    const first = answer({ cursor: null, pageSize: 2, ...base })
    expect(ids(first.rows)).toEqual([1, 2])
    expect(first.cursors.prev).toBeNull()
    const second = answer({
      cursor: { token: first.cursors.next!, direction: 'next' },
      pageSize: 2,
      ...base
    })
    expect(ids(second.rows)).toEqual([3, 4])
    expect(second.cursors.prev).not.toBeNull()
    const back = answer({
      cursor: { token: second.cursors.prev!, direction: 'prev' },
      pageSize: 2,
      ...base
    })
    expect(ids(back.rows)).toEqual([1, 2])
    const last = answer({
      cursor: { token: second.cursors.next!, direction: 'next' },
      pageSize: 2,
      ...base
    })
    expect(ids(last.rows)).toEqual([5, 6])
    expect(last.cursors.next).toBeNull()
  })

  it('validates what the schema cannot', () => {
    const query = { page: 1, pageSize: 20, sort: null, filters: [] }
    expect(parseQuery(query)).toEqual(query)
    expect(() => parseQuery({ ...query, pageSize: 500 })).toThrow(BadQuery)
    expect(() =>
      parseQuery({
        ...query,
        filters: [{ field: 'password', condition: 'Equal', value: 'x' }]
      })
    ).toThrow('unknown field')
    expect(() => parseQuery({ page: 1 })).toThrow(BadQuery)
  })

  it('handles a request', () => {
    const body = JSON.parse(
      read(join(examples, 'json', 'valid', 'page-extra-keys.json'))
    ) as unknown
    const ok = handle(body)
    expect(ok.status).toBe(200)
    expect(ok.json).toMatchObject({ tenant: 7 })
    expect(handle({ page: 1 }).status).toBe(400)
  })
})

describe('table.ts: the controlled loop', () => {
  const start = { page: 1, pageSize: 2, sort: null, filters: [] }

  it('page mode: sort, page, filter, search, selection', () => {
    const t = createServerTable(start)
    expect(t.rows).toHaveLength(2)
    expect(t.table.getPageCount()).toBe(3)

    t.table.getColumn('age')!.toggleQuerySorting()
    t.table.nextPage()
    t.table.getColumn('name')!.setFilterInput('a')
    t.table.setGlobalFilter('li')
    expect(t.updates.map(([, reason]) => reason)).toEqual([
      'sort',
      'page',
      'filter',
      'search'
    ])
    expect(t.query).toMatchObject({ page: 1, search: 'li' })

    t.table.getRow('1').toggleSelected(true)
    expect(t.selection).toEqual({ '1': true })
    expect(t.updates).toHaveLength(4)
  })

  it('cursor mode: the cursors drive the page steps', () => {
    const t = createServerTable({
      cursor: null,
      pageSize: 2,
      sort: null,
      filters: []
    })
    expect(t.table.getCanNextPage()).toBe(true)
    expect(t.table.getCanPreviousPage()).toBe(false)
    t.table.nextPage()
    expect(t.updates[0][1]).toBe('page')
    expect(t.rows.map(row => row.id)).toEqual([3, 4])
    t.table.previousPage()
    expect(t.rows.map(row => row.id)).toEqual([1, 2])
  })

  it('an outside change emits nothing', () => {
    const t = createServerTable(start)
    t.setQuery({ ...start, page: 3 })
    expect(t.updates).toEqual([])
    expect(t.rows.map(row => row.id)).toEqual([5, 6])
  })
})

describe('the other examples', () => {
  it('a forward-only backend gets a prev cursor from the consumer', () => {
    const data = [1, 2, 3, 4, 5]
    const pager = createCursorPager<number>({
      fetch: (token, size) => {
        const at = token === null ? 0 : Number(token)
        const rows = data.slice(at, at + size)
        return {
          rows,
          next: at + size < data.length ? String(at + size) : null
        }
      }
    })
    const base = { pageSize: 2, sort: null, filters: [] }
    const one = pager({ cursor: null, ...base })
    expect(one).toEqual({ rows: [1, 2], cursors: { next: '2', prev: null } })
    const two = pager({ cursor: { token: '2', direction: 'next' }, ...base })
    expect(two).toEqual({ rows: [3, 4], cursors: { next: '4', prev: '' } })
    const three = pager({ cursor: { token: '4', direction: 'next' }, ...base })
    expect(three.cursors).toEqual({ next: null, prev: '2' })
    const back = pager({ cursor: { token: '2', direction: 'prev' }, ...base })
    expect(back.rows).toEqual([3, 4])
    const first = pager({ cursor: { token: '', direction: 'prev' }, ...base })
    expect(first).toEqual({ rows: [1, 2], cursors: { next: '2', prev: null } })
  })

  it('filterInputFeature alone writes TanStack column filters', () => {
    expect(typeIntoName()).toEqual([
      {
        id: 'name',
        value: [
          { field: 'name', condition: 'StartsWith', value: 'ali' },
          { field: 'name', condition: 'NotEqual', value: 'veli' }
        ]
      }
    ])
  })

  it('replacing an owned handler throws', () => {
    expect(replaceTheHandler()).toContain('owns onSortingChange')
  })

  it('the API tours run', () => {
    expect(() => filterInputTour()).not.toThrow()
    const updates = cursorTour()
    expect(updates).toHaveLength(1)
    expect(updates[0][1]).toBe('page')
    expect(updates[0][0]).toMatchObject({
      cursor: { direction: 'next' }
    })
  })

  it('a disposed table is inert', () => {
    expect(mountAndLeave()).toHaveLength(1)
  })
})
