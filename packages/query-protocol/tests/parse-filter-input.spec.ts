import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  caseName,
  filterInputCases,
  rulesOf
} from '../../../tests/support/filter-input-cases'
import { parseFilterInput } from '../src'

describe('C-53 Filter parser', () => {
  it.each(filterInputCases.map(item => [caseName(item), item] as const))(
    '%s',
    (_, item) => {
      expect(
        parseFilterInput(
          item.text,
          { field: 'value', type: item.type },
          item.condition
        )
      ).toEqual(rulesOf(item.expected))
    }
  )

  it('does not write to the column', () => {
    const column = Object.freeze({ field: 'value', type: 'string' as const })
    expect(parseFilterInput('a,b', column)).toHaveLength(2)
  })
})

describe('the protocol depends on nothing (P11)', () => {
  it('imports only its own modules and touches no DOM', () => {
    const srcDir = join(import.meta.dirname, '..', 'src')
    const files = readdirSync(srcDir, {
      recursive: true,
      encoding: 'utf8'
    }).filter(file => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    expect(files.length).toBeGreaterThan(5)
    for (const file of files) {
      const source = readFileSync(join(srcDir, file), 'utf8')
      const imports = [...source.matchAll(/from '([^']+)'/g)].map(m => m[1])
      expect(
        imports.filter(path => !path.startsWith('.')),
        file
      ).toEqual([])
      expect(source, file).not.toMatch(/\b(document|window)\./)
    }
  })
})
