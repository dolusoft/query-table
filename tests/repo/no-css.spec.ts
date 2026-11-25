import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

// No module imports the reference skin (P5, P14, ADR 0025): `pnpm
// check:package` (scripts/check-no-css.mjs) fails when a built `.js` or a
// `.d.ts` of a table package names a stylesheet specifier. This spec checks
// what it reads as one on sample text and needs no build.

const script = join(
  import.meta.dirname,
  '..',
  '..',
  'scripts',
  'check-no-css.mjs'
)
const { styleSpecifiersIn } = (await import(pathToFileURL(script).href)) as {
  styleSpecifiersIn: (code: string) => string[]
}

describe('stylesheet specifiers in built modules (P5, ADR 0025)', () => {
  it.each([
    ["import './table.css'", ['./table.css']],
    ['import "../styles/table.css";', ['../styles/table.css']],
    ["import sheet from './a.css?inline'", ['./a.css?inline']],
    ["export * from './b.scss'", ['./b.scss']],
    ["const load = () => import('./c.css')", ['./c.css']],
    [
      "require('@dolusoft/query-table/table.css')",
      ['@dolusoft/query-table/table.css']
    ],
    ["import { h } from 'vue'; import './x.js'", []],
    ["const name = 'table.css'; link.href = 'a.css'", []],
    ['export declare const css: string; import type { A } from "./d.js"', []]
  ])('reads %s as %j', (code, found) => {
    expect(styleSpecifiersIn(code)).toEqual(found)
  })
})
