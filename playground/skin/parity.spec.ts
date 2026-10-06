import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { cn } from './lib/utils'
import { badgeVariants } from './ui/badge'
import { buttonVariants } from './ui/button'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const classesOf = (list: string): string[] =>
  list.trim().split(/\s+/).filter(Boolean)

/**
 * A top-level block of mapping.css (a rule or an at-rule with its nested
 * rules) with the comment right before it, if any.
 */
interface TopBlock {
  marker: string | undefined
  prelude: string
  body: string
}

const topBlocks = (css: string): TopBlock[] => {
  const blocks: TopBlock[] = []
  let i = 0
  let marker: string | undefined
  while (i < css.length) {
    if (/\s/.test(css[i])) {
      i++
    } else if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i)
      marker = css.slice(i + 2, end).trim()
      i = end + 2
    } else {
      const open = css.indexOf('{', i)
      let depth = 1
      let j = open + 1
      while (depth > 0 && j < css.length) {
        if (css.startsWith('/*', j)) {
          j = css.indexOf('*/', j) + 2
          continue
        }
        if (css[j] === '{') {
          depth++
        }
        if (css[j] === '}') {
          depth--
        }
        j++
      }
      blocks.push({
        marker,
        prelude: css.slice(i, open).trim().replace(/\s+/g, ' '),
        body: css.slice(open + 1, j - 1).trim()
      })
      marker = undefined
      i = j
    }
  }
  return blocks
}

/**
 * The classes shadcn-vue gives a part, named by a `shadcn:` marker:
 *   table/TableHead.vue                         the first argument of `cn('...')`
 *   table/Table.vue [data-slot=table-container] the static `class="..."` of that element
 *   buttonVariants({ variant: 'ghost', size: 'icon-xs' })
 *   badgeVariants({ variant: 'secondary' })     what Button and Badge render:
 *                                               `cn(xVariants({...}))`, so
 *                                               tailwind-merge drops the base
 *                                               classes a size overrides
 */
const variantFns = { buttonVariants, badgeVariants } as const

const shadcnClasses = (source: string): string[] => {
  const cva = /^(buttonVariants|badgeVariants)\(\{([^}]*)\}\)/.exec(source)
  if (cva) {
    const options = Object.fromEntries(
      [...cva[2].matchAll(/(\w+):\s*'([\w-]+)'/g)].map(([, key, value]) => [
        key,
        value
      ])
    )
    const fn = variantFns[cva[1] as keyof typeof variantFns] as (
      options: Record<string, string>
    ) => string
    return classesOf(cn(fn(options)))
  }
  const file = /^([\w/-]+\.vue)(?:\s+\[data-slot=([\w-]+)\])?/.exec(source)
  if (!file) {
    throw new Error(
      `shadcn: ${source}: not a component file or a variants call.`
    )
  }
  const text = read(join(here, 'ui', file[1]))
  const found = file[2]
    ? new RegExp(`data-slot="${file[2]}"[^>]*?\\sclass="([^"]*)"`).exec(text)
    : /\bcn\(\s*'([^']*)'/.exec(text)
  if (!found) {
    throw new Error(
      `${file[1]}: no ${file[2] ? `class="..." on data-slot="${file[2]}"` : "cn('...') call"} found; the shadcn-vue source changed shape.`
    )
  }
  return classesOf(found[1])
}

interface ParityBlock {
  source: string
  excluded: string[]
  selector: string
  applied: string[]
}

const parityOf = (block: TopBlock): ParityBlock => {
  const marker = block.marker ?? ''
  const head = marker.slice('shadcn:'.length).split('\n')[0].trim()
  const at = marker.indexOf('excluded:')
  const excluded =
    at === -1
      ? []
      : marker
          .slice(at + 'excluded:'.length)
          .split('\n')
          .map(line => line.trim().split(/\s+/)[0])
          .filter(Boolean)
  const apply = /^@apply\s+([^;]+);$/.exec(block.body)
  return {
    source: head,
    excluded,
    selector: block.prelude,
    applied: apply ? classesOf(apply[1]) : []
  }
}

describe('the table skin keeps class parity with shadcn-vue', () => {
  const mapping = read(join(here, 'mapping.css'))
  const blocks = topBlocks(mapping)

  it('finds the rules of mapping.css', () => {
    expect(blocks.length).toBeGreaterThan(40)
  })

  it('opens every rule with a `shadcn:` or `own:` marker', () => {
    const unmarked = blocks
      .filter(block => !/^(shadcn|own):/.test(block.marker ?? ''))
      .map(block => block.prelude)
    expect(
      unmarked,
      'each top-level rule of mapping.css needs a comment right before it: `shadcn: <source>` (parity-checked) or `own: <reason>`'
    ).toEqual([])
  })

  it('keeps a `shadcn:` rule to a single @apply and an `own:` rule free of utilities', () => {
    const wrong = blocks.flatMap(block => {
      const isShadcn = block.marker?.startsWith('shadcn:')
      const isApply = /^@apply\s+[^;]+;$/.test(block.body)
      if (isShadcn && !isApply) {
        return [`shadcn: ${block.prelude} is not a single @apply`]
      }
      if (!isShadcn && /@apply\b/.test(block.body)) {
        return [`own: ${block.prelude} uses @apply`]
      }
      return []
    })
    expect(wrong).toEqual([])
  })

  const parity = blocks
    .filter(block => block.marker?.startsWith('shadcn:'))
    .map(parityOf)

  it('derives the table, its rows and cells, the filter input, the buttons and the label from shadcn-vue', () => {
    expect(parity.map(block => block.source)).toEqual([
      'table/Table.vue [data-slot=table-container]',
      'table/Table.vue',
      'table/TableHeader.vue',
      'table/TableBody.vue',
      'table/TableRow.vue',
      'table/TableHead.vue',
      'table/TableCell.vue',
      'table/TableFooter.vue',
      'input/Input.vue',
      "buttonVariants({ variant: 'outline', size: 'icon' })",
      "badgeVariants({ variant: 'secondary' })",
      "buttonVariants({ variant: 'ghost', size: 'icon-xs' })"
    ])
  })

  for (const block of parity) {
    const name = `${block.source} -> ${block.selector}`
    it(name, () => {
      const source = shadcnClasses(block.source)
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
