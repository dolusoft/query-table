import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as root from '@dolusoft/query-protocol'
import * as local from '@dolusoft/query-protocol/local'

// The local evaluator is a data-source helper, not table behaviour: it has
// its own entry and the default entry never exposes or imports it. The
// built module graph is checked by scripts/check-entry-graph.mjs, the
// imports by the layer rule (tests/repo/eslint-layers.spec.ts).

const pkgDir = join(import.meta.dirname, '..')

describe('C-75 The local evaluator is separate [own]', () => {
  it('is not exported from the root entry', () => {
    expect(Object.keys(local).length).toBeGreaterThan(0)
    for (const name of Object.keys(local)) {
      expect(Object.keys(root)).not.toContain(name)
    }
  })

  it('is published as its own subpath', () => {
    const pkg = JSON.parse(
      readFileSync(join(pkgDir, 'package.json'), 'utf8')
    ) as { exports: Record<string, unknown> }
    expect(pkg.exports['./local']).toEqual({
      types: './dist/types/local/index.d.ts',
      default: './dist/local.js'
    })
  })

  it('is not reached from the root source', () => {
    const index = readFileSync(join(pkgDir, 'src/index.ts'), 'utf8')
    expect(index).not.toMatch(/local/)
  })
})
