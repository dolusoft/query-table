import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { type ESLint, Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import { describe, expect, it } from 'vitest'

// The layering fence of the v3 packages (ADR 0003): scripts/eslint-layers.mjs
// run through ESLint on code placed at a given path. Re-exports, dynamic
// imports and type imports count like imports.

const root = join(import.meta.dirname, '..', '..')
const { default: layers } = (await import(
  pathToFileURL(join(root, 'scripts', 'eslint-layers.mjs')).href
)) as { default: ESLint.Plugin }

const linter = new Linter({ configType: 'flat', cwd: root })
const config: Linter.Config[] = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { layers },
    rules: { 'layers/boundaries': 'error' }
  }
]

/** The layer messages for `code` in the file at `path` (from the repo root). */
const lint = (path: string, code: string) =>
  linter
    .verify(code, config, { filename: join(root, path) })
    .map(message => message.message)

const core = 'packages/query-table-core/src'
const protocol = 'packages/query-protocol/src'

describe('layers/boundaries', () => {
  it('lets the protocol import only itself', () => {
    expect(lint(`${protocol}/index.ts`, `import './grammar/draft'`)).toEqual([])
    expect(
      lint(`${protocol}/grammar/draft.ts`, `import { h } from 'vue'`)
    ).toEqual([expect.stringContaining('query-protocol may import no package')])
    expect(
      lint(`${protocol}/index.ts`, `export * from '@tanstack/table-core'`)
    ).toHaveLength(1)
  })

  it('lets the core import the protocol and table-core, nothing else', () => {
    const file = `${core}/features/server-query/server-query-feature.ts`
    expect(
      lint(
        file,
        `import { sameQuery } from '@dolusoft/query-protocol'
import { functionalUpdate } from '@tanstack/table-core'
import type { Table } from '@tanstack/table-core'`
      )
    ).toEqual([])
    expect(lint(file, `import { ref } from 'vue'`)).toHaveLength(1)
    expect(lint(file, `import x from '@tanstack/vue-table'`)).toHaveLength(1)
  })

  it('keeps one feature out of another, re-exports and dynamic imports included', () => {
    const file = `${core}/features/server-query/index.ts`
    const message: unknown = expect.stringContaining(
      'the server-query feature may not import'
    )
    expect(
      lint(file, `import { filterInputFeature } from '../filter-input'`)
    ).toEqual([message])
    expect(
      lint(file, `export { filterInputFeature } from '../filter-input'`)
    ).toEqual([message])
    expect(lint(file, `export * from '../filter-input/types'`)).toEqual([
      message
    ])
    expect(lint(file, `void import('../filter-input')`)).toEqual([message])
    expect(
      lint(file, `type T = import('../filter-input/types').FilterDrafts`)
    ).toEqual([message])
  })

  it('checks require() and import = require() like imports', () => {
    const file = `${core}/features/server-query/index.ts`
    expect(lint(file, `const x = require('../filter-input')`)).toEqual([
      expect.stringContaining('the server-query feature may not import')
    ])
    expect(lint(file, `import x = require('vue')`)).toEqual([
      expect.stringContaining('query-table-core may import')
    ])
    expect(lint(file, `const x = require(name)`)).toEqual([
      expect.stringContaining('must name a literal module')
    ])
    expect(lint(file, `const x = require('@tanstack/table-core')`)).toEqual([])
  })

  it('refuses import.meta.glob', () => {
    expect(
      lint(
        `${core}/features/filter-input/index.ts`,
        `const all = import.meta.glob('../*/index.ts')`
      )
    ).toEqual([expect.stringContaining('import.meta.glob')])
  })

  it('rejects a dynamic import that is not a literal', () => {
    expect(
      lint(`${core}/features/filter-input/index.ts`, `void import(name)`)
    ).toEqual([expect.stringContaining('must name a literal module')])
  })

  it('lets a feature use shared/, never the other way', () => {
    expect(
      lint(
        `${core}/features/filter-input/filter-input-feature.ts`,
        `import { dispatch } from '../../shared'
import { recordOf } from '../../shared/registry'`
      )
    ).toEqual([])
    expect(
      lint(
        `${core}/shared/action.ts`,
        `import { serverQueryFeature } from '../features/server-query'`
      )
    ).toEqual([expect.stringContaining('shared/ may not import')])
  })

  it('lets the row-change module import only the protocol and itself (P14)', () => {
    const file = `${core}/row-changes/tracker.ts`
    expect(
      lint(
        file,
        `import { sameQuery } from '@dolusoft/query-protocol'
import { sameValue } from './same-value'`
      )
    ).toEqual([])
    expect(
      lint(file, `import { constructTable } from '@tanstack/table-core'`)
    ).toEqual([expect.stringContaining('row-change module')])
    expect(lint(file, `import { dispatch } from '../shared'`)).toEqual([
      expect.stringContaining('row-change module')
    ])
    expect(
      lint(
        `${core}/features/server-query/server-query-feature.ts`,
        `import { sameValue } from '../../row-changes'`
      )
    ).toEqual([expect.stringContaining('may not import')])
  })

  it('lets the entry files gather every part of the core', () => {
    expect(
      lint(
        `${core}/index.ts`,
        `export * from './features/server-query'
export * from './features/filter-input'
export { dispose } from './shared'`
      )
    ).toEqual([])
  })

  it('keeps a package from reaching into another by path', () => {
    expect(
      lint(
        `${core}/shared/action.ts`,
        `import { sameQuery } from '../../../query-protocol/src'`
      )
    ).toEqual([expect.stringContaining('leaves packages/query-table-core/src')])
  })

  it('leaves files outside packages/*/src alone', () => {
    expect(lint('src/index.ts', `import { ref } from 'vue'`)).toEqual([])
  })
})

// C-75: the local evaluator is a separate part of the protocol and of the
// Vue package. It reaches only the protocol's types, constants and query
// helpers, and nothing outside it reaches it except through its own entry.
describe('local evaluator layers', () => {
  const vue = 'packages/vue/src'
  const fence: unknown = expect.stringContaining(
    'the local evaluator is reached only through its own entry (C-75)'
  )

  it('lets the protocol evaluator import only the protocol basics and itself', () => {
    const file = `${protocol}/local/x.ts`
    expect(
      lint(
        file,
        `import type { Query } from '../protocol/types'
import { filterConditions } from '../protocol/constants'
import { rulesOf } from '../protocol/query'
import { foldText } from './text'`
      )
    ).toEqual([])
    for (const code of [
      `import { parseDraft } from '../grammar/draft'`,
      `import { sameQuery } from '../index'`,
      `import { parseDraft } from '../protocol/../grammar/draft'`,
      `import { ref } from 'vue'`,
      `import { sameQuery } from '@dolusoft/query-protocol'`
    ]) {
      expect(lint(file, code), code).toHaveLength(1)
    }
  })

  it('keeps the rest of the protocol out of the evaluator', () => {
    for (const [file, dir] of [
      [`${protocol}/protocol/x.ts`, '../local'],
      [`${protocol}/index.ts`, './local']
    ]) {
      for (const code of [
        `import { foldText } from '${dir}/text'`,
        `import { profiles } from '@dolusoft/query-protocol/local'`
      ]) {
        expect(lint(file, code), `${file}: ${code}`).toEqual([fence])
      }
    }
    expect(
      lint(`${protocol}/index.ts`, `import { profiles } from './local'`)
    ).toEqual([fence])
    expect(lint(`${protocol}/index.ts`, `export * from './local'`)).toEqual([
      fence
    ])
  })

  it('keeps the core away from the evaluator and the suite', () => {
    const file = `${core}/x.ts`
    expect(
      lint(file, `import { profiles } from '@dolusoft/query-protocol/local'`)
    ).toEqual([fence])
    expect(
      lint(
        file,
        `import manifest from '@dolusoft/query-protocol/conformance/manifest.json'`
      )
    ).toHaveLength(1)
    expect(
      lint(
        file,
        `import { sameQuery } from '@dolusoft/query-protocol'
import { functionalUpdate } from '@tanstack/table-core'`
      )
    ).toEqual([])
  })

  it('keeps the Vue table away from its local binding', () => {
    const file = `${vue}/x.ts`
    for (const code of [
      `import { profiles } from '@dolusoft/query-protocol/local'`,
      `import { useLocalQuery } from './local'`,
      `import { useLocalQuery } from './local/index'`,
      `void import('./local')`,
      `export { useLocalQuery } from './local'`
    ]) {
      expect(lint(file, code), code).toEqual([fence])
    }
  })

  it('lets the Vue binding import vue and the protocol entries only', () => {
    const file = `${vue}/local/x.ts`
    expect(
      lint(
        file,
        `import { computed } from 'vue'
import type { Query } from '@dolusoft/query-protocol'
import { applyQuery } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from './use-local-query'`
      )
    ).toEqual([])
    for (const code of [
      `import { columnOf } from '../core/column'`,
      `import { serverQueryFeature } from '@dolusoft/query-table-core'`,
      `import { useVueTable } from '@tanstack/vue-table'`,
      `import { QueryTable } from '../index'`
    ]) {
      expect(lint(file, code), code).toHaveLength(1)
    }
  })

  it('leaves the playground and the consumer fixtures alone', () => {
    for (const file of ['apps/playground/x.ts', 'fixtures/consumer/x.ts']) {
      expect(
        lint(
          file,
          `import { profiles } from '@dolusoft/query-protocol/local'
import { useLocalQuery } from '@dolusoft/query-table/local'
import { QueryTable } from '@dolusoft/query-table'`
        )
      ).toEqual([])
    }
  })
})
