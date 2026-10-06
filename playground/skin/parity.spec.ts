import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const classesOf = (list: string): string[] =>
  list.trim().split(/\s+/).filter(Boolean)

/**
 * A parity block of mapping.css:
 *
 *   / * shadcn: table/TableHead.vue [data-slot=...]
 *      excluded:
 *        <class>  <reason>
 *   * /
 *   <selector> {
 *     @apply <classes>;
 *   }
 *
 * The optional `[data-slot=...]` picks a static `class="..."` element of the
 * component instead of its `cn('...')` call.
 */
interface ParityBlock {
  component: string
  slot: string | undefined
  excluded: string[]
  selector: string
  applied: string[]
}

const BLOCK =
  /\/\*\s*shadcn:\s+([\w/-]+\.vue)(?:\s+\[data-slot=([\w-]+)\])?([\s\S]*?)\*\/\s*([^{}]+?)\s*\{\s*@apply\s+([^;]+);\s*\}/g

const parityBlocks = (css: string): ParityBlock[] =>
  [...css.matchAll(BLOCK)].map(
    ([, component, slot, notes, selector, applied]) => {
      const marker = notes.indexOf('excluded:')
      const excluded =
        marker === -1
          ? []
          : notes
              .slice(marker + 'excluded:'.length)
              .split('\n')
              .map(line => line.trim().split(/\s+/)[0])
              .filter(Boolean)
      return {
        component,
        slot,
        excluded,
        selector: selector.replace(/\s+/g, ' '),
        applied: classesOf(applied)
      }
    }
  )

/** The classes shadcn-vue gives the part: the first argument of `cn('...')`,
 *  or the static `class="..."` of the element carrying `data-slot`. */
const shadcnClasses = (
  component: string,
  slot: string | undefined
): string[] => {
  const source = read(join(here, 'ui', component))
  const found = slot
    ? new RegExp(`data-slot="${slot}"[^>]*?\\sclass="([^"]*)"`).exec(source)
    : /\bcn\(\s*'([^']*)'/.exec(source)
  if (!found) {
    throw new Error(
      `${component}: no ${slot ? `class="..." on data-slot="${slot}"` : "cn('...') call"} found; the shadcn-vue source changed shape.`
    )
  }
  return classesOf(found[1])
}

describe('the table skin keeps class parity with shadcn-vue', () => {
  const mapping = read(join(here, 'mapping.css'))
  const blocks = parityBlocks(mapping)

  it('finds the parity blocks', () => {
    expect(blocks.map(block => block.component)).toEqual([
      'table/Table.vue',
      'table/Table.vue',
      'table/TableHeader.vue',
      'table/TableBody.vue',
      'table/TableRow.vue',
      'table/TableHead.vue',
      'table/TableCell.vue'
    ])
  })

  it('applies every @apply of mapping.css in a parity block', () => {
    // A stray @apply would be a pasted class string nobody checks.
    expect(mapping.match(/^\s*@apply\s/gm)?.length).toBe(blocks.length)
  })

  for (const block of parityBlocks(read(join(here, 'mapping.css')))) {
    const name = `${block.component}${block.slot ? ` [data-slot=${block.slot}]` : ''} -> ${block.selector}`
    it(name, () => {
      const source = shadcnClasses(block.component, block.slot)
      const stale = block.excluded.filter(cls => !source.includes(cls))
      const expected = source.filter(cls => !block.excluded.includes(cls))
      const missing = expected.filter(cls => !block.applied.includes(cls))
      const extra = block.applied.filter(cls => !expected.includes(cls))
      expect(
        { missing, extra, stale },
        `${name}: shadcn-vue has \`${source.join(' ')}\`.\n` +
          '  missing: in shadcn, not applied by mapping.css (add it or list it under excluded:)\n' +
          '  extra:   applied by mapping.css, not in shadcn (shadcn dropped it, or it was pasted by hand)\n' +
          '  stale:   listed under excluded:, no longer in shadcn (drop it from the list)'
      ).toEqual({ missing: [], extra: [], stale: [] })
    })
  }
})
