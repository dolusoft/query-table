import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'

import {
  caseName,
  filterInputCases,
  filterInputColumn,
  rulesOf,
  type FilterInputCase
} from '../../tests/support/filter-input-cases'
import { mountTable, type Mounted } from '../../tests/support/mount-table'
import type { Column, FilterMenuSlotProps, FilterRule } from '../contract'
import { parseFilterInput } from '../index'

let mounted: Mounted | null = null

afterEach(() => {
  mounted?.wrapper.unmount()
  mounted = null
})

/** What the table emits for `text` typed into the filter of the column. */
const typedRules = async (item: FilterInputCase): Promise<FilterRule[]> => {
  let menu: FilterMenuSlotProps | null = null
  mounted = mountTable(
    {
      columns: [filterInputColumn(item.type)],
      rows: [],
      filterable: true,
      filterDebounce: 0
    },
    {
      slots: {
        'filter-menu': (props: FilterMenuSlotProps) => {
          menu = props
          return h('span')
        }
      }
    }
  )
  if (item.condition) {
    // A pick without a value only waits for one (C-20).
    menu!.setCondition(item.condition)
  }
  await mounted.wrapper.find('.qt-filter-input').setValue(item.text)
  const last = mounted.events.at(-1)
  return last ? last[0].filters : []
}

describe('C-53 Filter parser', () => {
  describe.each(filterInputCases.map(item => [caseName(item), item] as const))(
    '%s',
    (_, item) => {
      const expected = rulesOf(item.expected)

      it('parseFilterInput returns the rules of the table', () => {
        expect(
          parseFilterInput(
            item.text,
            filterInputColumn(item.type),
            item.condition
          )
        ).toEqual(expected)
      })

      it('typing it into the filter input emits the same rules', async () => {
        expect(await typedRules(item)).toEqual(expected)
      })
    }
  )

  it('reads the column type case-insensitively and uses the column field', () => {
    const column = {
      field: 'a.b',
      type: 'NUMBER' as Column['type']
    }
    expect(parseFilterInput('7', column)).toEqual([
      { field: 'a.b', condition: 'Equal', value: 7 }
    ])
  })

  it('never throws on input that is not text, and does not write the column', () => {
    const column = Object.freeze(filterInputColumn('string'))
    expect(parseFilterInput(undefined as unknown as string, column)).toEqual([])
    expect(parseFilterInput(42 as unknown as string, column)).toEqual([])
    expect(parseFilterInput('x', column, null)).toEqual([
      { field: 'value', condition: 'Contains', value: 'x' }
    ])
  })

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
