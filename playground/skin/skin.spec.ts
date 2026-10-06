import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { buildSkin, skinPath } from './gen-skin'
import { domAttributes, domClasses } from '../../contract/dom'

const here = dirname(fileURLToPath(import.meta.url))
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

/**
 * The selectors of a stylesheet: the text before each `{` that opens a style
 * rule. A nested `&...` selector adds to its parent's, and at-rules
 * (`@theme`, `@layer`, `@custom-variant`, `@import`) are skipped.
 */
const selectorsOf = (css: string): string[] => {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@apply[^;]*;/g, '')
  const found: string[] = []
  let prelude = ''
  for (const char of text) {
    if (char === '{') {
      const selector = prelude.trim()
      if (selector !== '' && !selector.startsWith('@')) {
        found.push(...selector.split(',').map(part => part.trim()))
      }
      prelude = ''
    } else if (char === '}' || char === ';') {
      prelude = ''
    } else {
      prelude += char
    }
  }
  return found
}

// The theme the shadcn-vue CLI writes styles the page itself.
const themeSelectors = new Set([':root', '*', 'body'])

const classNames = new Set(domClasses.map(entry => entry.name))
// `data-theme` is the page's switch for the skin's light and dark theme, set
// by whoever renders the table, never by the table.
const attributeNames = new Set([
  ...domAttributes.map(entry => entry.name),
  'data-theme'
])

describe('C-41 the test skin selects only the DOM contract', () => {
  const skin = read(skinPath)
  const selectors = selectorsOf(skin)

  it('has selectors to check', () => {
    expect(selectors.length).toBeGreaterThan(20)
    expect(selectors).toContain('.qt-filter-input')
  })

  it('uses only contract classes and attributes in a selector', () => {
    const outside: string[] = []
    for (const selector of selectors) {
      if (themeSelectors.has(selector)) {
        continue
      }
      for (const match of selector.matchAll(/\.([\w-]+)/g)) {
        if (!classNames.has(match[1])) {
          outside.push(`${selector}: class .${match[1]}`)
        }
      }
      for (const match of selector.matchAll(/\[([\w-]+)/g)) {
        if (!attributeNames.has(match[1])) {
          outside.push(`${selector}: attribute [${match[1]}]`)
        }
      }
      // An id, or a class-less selector made of anything but plain elements.
      if (/#[\w-]/.test(selector)) {
        outside.push(`${selector}: id`)
      }
    }
    expect(outside).toEqual([])
  })

  it('has no hand-written color: the theme comes from the shadcn-vue CLI output', () => {
    const mapping = read(join(here, 'mapping.css'))
    expect(mapping).not.toMatch(/#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch)a?\(/i)
  })

  it('draws with the theme tokens, not with pasted utility class strings', () => {
    const mapping = read(join(here, 'mapping.css'))
    expect(mapping).not.toContain('@apply')
    expect(mapping).toContain('var(--border)')
  })

  it('follows the OS theme and lets data-theme on <html> override it', () => {
    expect(skin).toContain('@media (prefers-color-scheme: dark)')
    expect(skin).toContain(':root:not([data-theme="light"])')
    expect(skin).toContain(':root[data-theme="dark"]')
    expect(skin).not.toMatch(/^\.dark \{/m)
  })

  it('keeps the mapping in the components layer, so Tailwind utilities override it', () => {
    const start = skin.indexOf('@layer components {')
    expect(start).toBeGreaterThan(-1)
    // Everything of mapping.css sits inside the layer: the layer opens before
    // the first mapping rule and the file ends with its closing brace.
    expect(skin.indexOf('.qt-datatable {')).toBeGreaterThan(start)
    expect(skin.trimEnd().endsWith('}')).toBe(true)
    // No rule of the mapping is left outside a layer, where it would beat
    // every utility.
    const before = skin.slice(0, start)
    expect(before).not.toContain('.qt-')
  })

  it('is generated from theme.css and mapping.css', () => {
    expect(skin).toBe(buildSkin())
  })
})
