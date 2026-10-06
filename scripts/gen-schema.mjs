// `pnpm schema:gen`: writes the JSON Schema of the query (draft 2020-12) to
// packages/query-protocol/query.schema.json, for backends that validate what
// a table sends (ADR 0002). The closed vocabularies (conditions, directions,
// reasons) come from packages/query-protocol/src/protocol/constants.ts, the
// same lists the TypeScript types are built from; the shape below follows
// src/protocol/types.ts, and packages/query-protocol/tests/schema.spec.ts
// checks the two against each other.
//
//   --check  exit 1 when the checked-in file differs (CI)
//   --copy   also copy it into dist/ (the package build)
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = join(import.meta.dirname, '..')
const pkg = join(root, 'packages', 'query-protocol')
const file = join(pkg, 'query.schema.json')

// Node strips the types of constants.ts on import (it imports nothing).
const { filterConditions, sortDirections, cursorDirections } = await import(
  pathToFileURL(join(pkg, 'src', 'protocol', 'constants.ts')).href
)

const positiveInteger = { type: 'integer', minimum: 1 }

export const buildSchema = () => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/dolusoft/query-table/packages/query-protocol/query.schema.json',
  title: 'Query',
  description:
    'What a server-side table asks for: paging (a page number or a cursor), page size, sort, filter rules and search. Keys not listed here are allowed and must be kept as they are.',
  oneOf: [{ $ref: '#/$defs/PageQuery' }, { $ref: '#/$defs/CursorQuery' }],
  $defs: {
    FilterCondition: { enum: [...filterConditions] },
    FilterValue: {
      description:
        'A string for text, date and datetime columns, a number for number and integer columns, a boolean for bool columns.',
      type: ['string', 'number', 'boolean']
    },
    FilterRule: {
      type: 'object',
      description:
        'Rules of one field combine with OR, or with AND when all of them are negative (NotEqual, NotContains). Rules of different fields combine with AND.',
      required: ['field', 'condition', 'value'],
      properties: {
        field: { type: 'string', minLength: 1 },
        condition: { $ref: '#/$defs/FilterCondition' },
        value: { $ref: '#/$defs/FilterValue' }
      },
      additionalProperties: true
    },
    SortState: {
      type: 'object',
      required: ['field', 'direction'],
      properties: {
        field: { type: 'string', minLength: 1 },
        direction: { enum: [...sortDirections] }
      },
      additionalProperties: false
    },
    CursorRequest: {
      type: 'object',
      required: ['token', 'direction'],
      properties: {
        token: { type: 'string' },
        direction: { enum: [...cursorDirections] }
      },
      additionalProperties: false
    },
    QueryBase: {
      type: 'object',
      required: ['pageSize', 'sort', 'filters'],
      properties: {
        pageSize: positiveInteger,
        sort: {
          oneOf: [{ type: 'null' }, { $ref: '#/$defs/SortState' }]
        },
        filters: { type: 'array', items: { $ref: '#/$defs/FilterRule' } },
        search: {
          type: 'string',
          minLength: 1,
          description:
            'Absent means no search; an emitted query never holds an empty string.'
        }
      }
    },
    PageQuery: {
      description: 'Page mode: a 1-based page number.',
      allOf: [{ $ref: '#/$defs/QueryBase' }],
      required: ['page'],
      properties: { page: positiveInteger },
      not: { required: ['cursor'] }
    },
    CursorQuery: {
      description:
        'Cursor mode: the cursor to follow, `null` for the first page. The total may be unknown.',
      allOf: [{ $ref: '#/$defs/QueryBase' }],
      required: ['cursor'],
      properties: {
        cursor: {
          oneOf: [{ type: 'null' }, { $ref: '#/$defs/CursorRequest' }]
        }
      },
      not: { required: ['page'] }
    }
  }
})

const text = `${JSON.stringify(buildSchema(), null, 2)}\n`

if (process.argv[1] === import.meta.filename) {
  if (process.argv.includes('--check')) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (current.replace(/\r\n/g, '\n') !== text) {
      console.error(
        '[schema] packages/query-protocol/query.schema.json is out of date: run `pnpm schema:gen`.'
      )
      process.exit(1)
    }
    console.log('[schema] query.schema.json is up to date')
  } else if (process.argv.includes('--copy')) {
    mkdirSync(join(pkg, 'dist'), { recursive: true })
    copyFileSync(file, join(pkg, 'dist', 'query.schema.json'))
  } else {
    writeFileSync(file, text)
    console.log(`[schema] ${file}`)
  }
}
