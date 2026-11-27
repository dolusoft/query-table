import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { RuleTester } from 'oxlint/plugins-dev'
import { describe, expect, it } from 'vitest'

// The layering fence of the v3 packages (ADR 0003): the oxlint JS plugin
// oxlint-plugins/layers.mjs on code placed at a given path. Re-exports,
// dynamic imports and type imports count like imports.

type Rule = Parameters<RuleTester['run']>[1]

const root = join(import.meta.dirname, '..', '..')
const { default: layers } = (await import(
  pathToFileURL(join(root, 'oxlint-plugins', 'layers.mjs')).href
)) as { default: { rules: { boundaries: Rule } } }

RuleTester.describe = describe
// A case fails by throwing: checked with `expect`, a valid case counts as an
// assertion for `expect.requireAssertions` (vitest.config.ts).
RuleTester.it = (name, run) =>
  it(name, () => {
    expect(run).not.toThrow()
  })
const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } }
})

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** `code` at `path` (from the repo root) passes. */
const ok = (path: string, code: string): RuleTester.ValidTestCase => ({
  name: `${path}: ${code}`,
  code,
  filename: join(root, path)
})
/** `code` at `path` fails: once per message part, or `count` times. */
const bad = (
  path: string,
  code: string,
  ...expected: (string | number)[]
): RuleTester.InvalidTestCase => ({
  name: `${path}: ${code}`,
  code,
  filename: join(root, path),
  errors:
    typeof expected[0] === 'number'
      ? expected[0]
      : expected.map(part => ({
          message: new RegExp(escape(String(part)))
        }))
})

const core = 'packages/query-table-core/src'
const protocol = 'packages/query-protocol/src'
const vue = 'packages/vue/src'
const serverQuery = `${core}/features/server-query/index.ts`
const crossFeature = 'the server-query feature may not import'
const fence = 'the local evaluator is reached only through its own entry (C-75)'

describe('layers/boundaries', () => {
  tester.run('lets the protocol import only itself', layers.rules.boundaries, {
    valid: [ok(`${protocol}/index.ts`, `import './grammar/draft'`)],
    invalid: [
      bad(
        `${protocol}/grammar/draft.ts`,
        `import { h } from 'vue'`,
        'query-protocol may import no package'
      ),
      bad(`${protocol}/index.ts`, `export * from '@tanstack/table-core'`, 1)
    ]
  })

  tester.run(
    'lets the core import the protocol and table-core, nothing else',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${core}/features/server-query/server-query-feature.ts`,
          `import { sameQuery } from '@dolusoft/query-protocol'
import { functionalUpdate } from '@tanstack/table-core'
import type { Table } from '@tanstack/table-core'`
        )
      ],
      invalid: [
        bad(
          `${core}/features/server-query/server-query-feature.ts`,
          `import { ref } from 'vue'`,
          1
        ),
        bad(
          `${core}/features/server-query/server-query-feature.ts`,
          `import x from '@tanstack/vue-table'`,
          1
        )
      ]
    }
  )

  tester.run(
    'keeps one feature out of another, re-exports and dynamic imports included',
    layers.rules.boundaries,
    {
      valid: [],
      invalid: [
        `import { filterInputFeature } from '../filter-input'`,
        `export { filterInputFeature } from '../filter-input'`,
        `export * from '../filter-input/types'`,
        `void import('../filter-input')`,
        `type T = import('../filter-input/types').FilterDrafts`
      ].map(code => bad(serverQuery, code, crossFeature))
    }
  )

  tester.run(
    'checks require() and import = require() like imports',
    layers.rules.boundaries,
    {
      valid: [ok(serverQuery, `const x = require('@tanstack/table-core')`)],
      invalid: [
        bad(serverQuery, `const x = require('../filter-input')`, crossFeature),
        bad(
          serverQuery,
          `import x = require('vue')`,
          'query-table-core may import'
        ),
        bad(
          serverQuery,
          `const x = require(name)`,
          'must name a literal module'
        )
      ]
    }
  )

  tester.run('refuses import.meta.glob', layers.rules.boundaries, {
    valid: [],
    invalid: [
      bad(
        `${core}/features/filter-input/index.ts`,
        `const all = import.meta.glob('../*/index.ts')`,
        'import.meta.glob'
      )
    ]
  })

  tester.run(
    'rejects a dynamic import that is not a literal',
    layers.rules.boundaries,
    {
      valid: [],
      invalid: [
        bad(
          `${core}/features/filter-input/index.ts`,
          `void import(name)`,
          'must name a literal module'
        )
      ]
    }
  )

  tester.run(
    'lets a feature use shared/, never the other way',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${core}/features/filter-input/filter-input-feature.ts`,
          `import { dispatch } from '../../shared'
import { recordOf } from '../../shared/registry'`
        )
      ],
      invalid: [
        bad(
          `${core}/shared/action.ts`,
          `import { serverQueryFeature } from '../features/server-query'`,
          'shared/ may not import'
        )
      ]
    }
  )

  tester.run(
    'lets the row-change module import only the protocol and itself (P14)',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${core}/row-changes/tracker.ts`,
          `import { sameQuery } from '@dolusoft/query-protocol'
import { sameValue } from './same-value'`
        )
      ],
      invalid: [
        bad(
          `${core}/row-changes/tracker.ts`,
          `import { constructTable } from '@tanstack/table-core'`,
          'row-change module'
        ),
        bad(
          `${core}/row-changes/tracker.ts`,
          `import { dispatch } from '../shared'`,
          'row-change module'
        ),
        bad(
          `${core}/features/server-query/server-query-feature.ts`,
          `import { sameValue } from '../../row-changes'`,
          'may not import'
        )
      ]
    }
  )

  tester.run(
    'lets the entry files gather every part of the core',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${core}/index.ts`,
          `export * from './features/server-query'
export * from './features/filter-input'
export { dispose } from './shared'`
        )
      ],
      invalid: []
    }
  )

  tester.run(
    'keeps a package from reaching into another by path',
    layers.rules.boundaries,
    {
      valid: [],
      invalid: [
        bad(
          `${core}/shared/action.ts`,
          `import { sameQuery } from '../../../query-protocol/src'`,
          'leaves packages/query-table-core/src'
        )
      ]
    }
  )

  tester.run(
    'leaves files outside packages/*/src alone',
    layers.rules.boundaries,
    { valid: [ok('src/index.ts', `import { ref } from 'vue'`)], invalid: [] }
  )
})

// C-75: the local evaluator is a separate part of the protocol and of the
// Vue package. It reaches only the protocol's types, constants and query
// helpers, and nothing outside it reaches it except through its own entry.
describe('local evaluator layers', () => {
  tester.run(
    'lets the protocol evaluator import only the protocol basics and itself',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${protocol}/local/x.ts`,
          `import type { Query } from '../protocol/types'
import { filterConditions } from '../protocol/constants'
import { rulesOf } from '../protocol/query'
import { foldText } from './text'`
        )
      ],
      invalid: [
        `import { parseDraft } from '../grammar/draft'`,
        `import { sameQuery } from '../index'`,
        `import { parseDraft } from '../protocol/../grammar/draft'`,
        `import { ref } from 'vue'`,
        `import { sameQuery } from '@dolusoft/query-protocol'`
      ].map(code => bad(`${protocol}/local/x.ts`, code, 1))
    }
  )

  tester.run(
    'keeps the rest of the protocol out of the evaluator',
    layers.rules.boundaries,
    {
      valid: [],
      invalid: [
        ...[
          [`${protocol}/protocol/x.ts`, '../local'],
          [`${protocol}/index.ts`, './local']
        ].flatMap(([file, dir]) =>
          [
            `import { foldText } from '${dir}/text'`,
            `import { profiles } from '@dolusoft/query-protocol/local'`
          ].map(code => bad(file, code, fence))
        ),
        bad(
          `${protocol}/index.ts`,
          `import { profiles } from './local'`,
          fence
        ),
        bad(`${protocol}/index.ts`, `export * from './local'`, fence)
      ]
    }
  )

  tester.run(
    'keeps the core away from the evaluator and the suite',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${core}/x.ts`,
          `import { sameQuery } from '@dolusoft/query-protocol'
import { functionalUpdate } from '@tanstack/table-core'`
        )
      ],
      invalid: [
        bad(
          `${core}/x.ts`,
          `import { profiles } from '@dolusoft/query-protocol/local'`,
          fence
        ),
        bad(
          `${core}/x.ts`,
          `import manifest from '@dolusoft/query-protocol/conformance/manifest.json'`,
          1
        )
      ]
    }
  )

  tester.run(
    'keeps the Vue table away from its local binding',
    layers.rules.boundaries,
    {
      valid: [],
      invalid: [
        `import { profiles } from '@dolusoft/query-protocol/local'`,
        `import { useLocalQuery } from './local'`,
        `import { useLocalQuery } from './local/index'`,
        `void import('./local')`,
        `export { useLocalQuery } from './local'`
      ].map(code => bad(`${vue}/x.ts`, code, fence))
    }
  )

  tester.run(
    'lets the Vue binding import vue and the protocol entries only',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${vue}/local/x.ts`,
          `import { computed } from 'vue'
import type { Query } from '@dolusoft/query-protocol'
import { applyQuery } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from './use-local-query'`
        )
      ],
      invalid: [
        `import { columnOf } from '../core/column'`,
        `import { serverQueryFeature } from '@dolusoft/query-table-core'`,
        `import { useVueTable } from '@tanstack/vue-table'`,
        `import { QueryTable } from '../index'`
      ].map(code => bad(`${vue}/local/x.ts`, code, 1))
    }
  )

  tester.run(
    'leaves the playground and the consumer fixtures alone',
    layers.rules.boundaries,
    {
      valid: ['apps/playground/x.ts', 'fixtures/consumer/x.ts'].map(file =>
        ok(
          file,
          `import { profiles } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
import { QueryTable } from '@dolusoft/query-table'
import { DataTable } from '@dolusoft/query-table/data-table'`
        )
      ),
      invalid: []
    }
  )
})

describe('DataTable layers (ADR 0021, K319-7)', () => {
  const dataTableFence =
    'DataTable is reached only through its own entry (ADR 0021)'

  tester.run(
    'lets DataTable import the table, the binding, vue and the protocol entries',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${vue}/data-table/x.ts`,
          `import { computed } from 'vue'
import { columnTypeOf } from '@dolusoft/query-protocol'
import { defineDataset } from '@dolusoft/query-protocol/local'
import { QueryTable } from '../index'
import type { Column } from '../contract'
import { useLocalQuery } from '../local'
import { datasetOf } from './derive-dataset'`
        )
      ],
      invalid: [
        `import { serverQueryFeature } from '@dolusoft/query-table-core'`,
        `import { useVueTable } from '@tanstack/vue-table'`,
        `import { useLocalQuery } from '@dolusoft/query-table/local'`
      ].map(code => bad(`${vue}/data-table/x.ts`, code, 1))
    }
  )

  tester.run(
    'keeps the table and the binding away from DataTable',
    layers.rules.boundaries,
    {
      valid: [],
      invalid: [
        [`${vue}/x.ts`, './data-table'],
        [`${vue}/body/x.ts`, '../data-table'],
        [`${vue}/local/x.ts`, '../data-table']
      ].flatMap(([file, dir]) =>
        [
          `import { DataTable } from '${dir}'`,
          `export { DataTable } from '${dir}/index'`,
          `void import('${dir}/data-table.vue')`
        ].map(code => bad(file, code, dataTableFence))
      )
    }
  )
})

describe('cell component layers (ADR 0022, K320-6)', () => {
  const cellsFence =
    'the cell components are reached only through their own entry (ADR 0022)'

  tester.run(
    'lets the cell components import vue, themselves and core/table-labels only',
    layers.rules.boundaries,
    {
      valid: [
        ok(
          `${vue}/cells/x.ts`,
          `import { computed } from 'vue'
import type { CellBadgeTone } from './contract'
import { useTableLabels } from '../core/table-labels'`
        )
      ],
      invalid: [
        `import { resolveLabels } from '../core/labels'`,
        `import { QueryTable } from '../index'`,
        `import { DataTable } from '../data-table'`,
        `import { useLocalQuery } from '../local'`,
        `import { columnTypeOf } from '@dolusoft/query-protocol'`,
        `import { useVueTable } from '@tanstack/vue-table'`
      ].map(code => bad(`${vue}/cells/x.ts`, code, 1))
    }
  )

  tester.run(
    'keeps the table, the binding and DataTable away from the cell components',
    layers.rules.boundaries,
    {
      valid: [],
      invalid: [
        [`${vue}/x.ts`, './cells'],
        [`${vue}/body/x.ts`, '../cells'],
        [`${vue}/local/x.ts`, '../cells'],
        [`${vue}/data-table/x.ts`, '../cells']
      ].flatMap(([file, dir]) =>
        [
          `import { CellCopy } from '${dir}'`,
          `export { CellCopy } from '${dir}/index'`
        ].map(code => bad(file, code, cellsFence))
      )
    }
  )
})
