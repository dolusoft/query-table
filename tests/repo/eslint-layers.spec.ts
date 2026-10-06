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
