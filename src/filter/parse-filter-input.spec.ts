import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('C-53 Filter parser', () => {
  it('imports no Vue and no DOM', () => {
    // The function and the modules it pulls in are plain TypeScript.
    const here = dirname(fileURLToPath(import.meta.url))
    const files = [
      'parse-filter-input.ts',
      'filter-draft.ts',
      'filter-input-parser.ts',
      'filter-conditions.ts',
      '../core/column.ts'
    ]
    for (const file of files) {
      const source = readFileSync(join(here, file), 'utf8')
      const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1])
      expect(
        imports.filter(path => !path.startsWith('.')),
        file
      ).toEqual([])
      expect(source, file).not.toMatch(/\b(document|window)\./)
    }
  })
})
