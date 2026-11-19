import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { domAttributes, domClasses } from '../../../contract/dom'

// The product skin (#203) holds to the DOM contract as the test skin does
// (C-41): it selects only the listed classes and attributes, plus
// `data-theme` on <html>, and every token it reads is defined.

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'skin.css'), 'utf8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** The selectors of the style rules; at-rules and keyframe steps are left out. */
const selectors = (() => {
  const found: string[] = []
  let prelude = ''
  let keyframes = 0
  let depth = 0
  for (const char of css) {
    if (char === '{') {
      const selector = prelude.trim()
      depth++
      if (selector.startsWith('@keyframes')) {
        keyframes = depth
      } else if (!selector.startsWith('@') && keyframes === 0) {
        found.push(...selector.split(',').map(part => part.trim()))
      }
      prelude = ''
    } else if (char === '}') {
      if (depth === keyframes) {
        keyframes = 0
      }
      depth--
      prelude = ''
    } else if (char === ';') {
      prelude = ''
    } else {
      prelude += char
    }
  }
  return found
})()

/** The tokens the table writes itself (C-31). */
const writtenByTable = new Set([
  '--qt-pin-left',
  '--qt-pin-right',
  '--qt-flash-elapsed'
])

describe('product skin', () => {
  it('reads its rules', () => {
    expect(selectors.length).toBeGreaterThan(40)
  })

  it('selects only the classes of the DOM contract (C-41)', () => {
    const known = new Set(domClasses.map(entry => entry.name))
    const used = selectors.flatMap(selector =>
      [...selector.matchAll(/\.([\w-]+)/g)].map(match => match[1])
    )
    expect(used.filter(name => !known.has(name))).toEqual([])
    expect(new Set(used).size).toBeGreaterThan(20)
  })

  it('selects only the attributes of the DOM contract and data-theme (C-41)', () => {
    const known = new Set([
      ...domAttributes.map(entry => entry.name),
      'data-theme'
    ])
    const used = selectors.flatMap(selector =>
      [...selector.matchAll(/\[([\w-]+)/g)].map(match => match[1])
    )
    expect(used.filter(name => !known.has(name))).toEqual([])
  })

  it('defines every --qt-* token it reads', () => {
    const defined = new Set(
      [...css.matchAll(/(--qt-[\w-]+)\s*:/g)].map(match => match[1])
    )
    const read = new Set(
      [...css.matchAll(/var\((--qt-[\w-]+)/g)].map(match => match[1])
    )
    const missing = [...read].filter(
      token => !defined.has(token) && !writtenByTable.has(token)
    )
    expect(missing).toEqual([])
  })

  it('gives the dark theme the same tokens under the OS and under data-theme', () => {
    const block = (opener: string) => {
      const start = css.indexOf(opener)
      const end = css.indexOf('}', start)
      return [
        ...css.slice(start, end).matchAll(/(--qt-[\w-]+)\s*:\s*([^;]+);/g)
      ]
        .map(match => `${match[1]}: ${match[2].trim()}`)
        .sort()
    }
    const os = block(":root:not([data-theme='light'])")
    expect(os.length).toBeGreaterThan(10)
    expect(block(":root[data-theme='dark']")).toEqual(os)
  })
})
