import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { pages, type PageApi } from './manifest'
import api from '../../contract/api.json'

// The playground must show the whole public contract: every API member and
// every behavior rule has a page, and a page names only what exists.

const here = dirname(fileURLToPath(import.meta.url))
const kinds = [
  'props',
  'emits',
  'slots',
  'exposed',
  'functions',
  'types'
] as const satisfies Array<keyof PageApi>

describe('playground manifest', () => {
  it('reads the generated API and the rules', () => {
    expect(api.props.length).toBeGreaterThan(5)
    expect(api.rules.length).toBeGreaterThan(30)
  })

  it.each(kinds)('maps every %s member to a page', kind => {
    const mapped = new Set(pages.flatMap(page => page.api[kind] ?? []))
    const missing = api[kind]
      .map(member => member.name)
      .filter(name => !mapped.has(name))
    expect(missing).toEqual([])
  })

  it.each(kinds)('names only existing %s members', kind => {
    const known = new Set(api[kind].map(member => member.name))
    const unknown = pages.flatMap(page =>
      (page.api[kind] ?? [])
        .filter(name => !known.has(name))
        .map(name => `${page.id}: ${name}`)
    )
    expect(unknown).toEqual([])
  })

  it('maps every behavior rule to a page', () => {
    const mapped = new Set(pages.flatMap(page => page.rules))
    const missing = api.rules.map(rule => rule.id).filter(id => !mapped.has(id))
    expect(missing).toEqual([])
  })

  it('names only existing rules', () => {
    const known = new Set(api.rules.map(rule => rule.id))
    const unknown = pages.flatMap(page =>
      page.rules.filter(id => !known.has(id)).map(id => `${page.id}: ${id}`)
    )
    expect(unknown).toEqual([])
  })

  it('has unique page ids and an example file for every page', () => {
    expect(new Set(pages.map(page => page.id)).size).toBe(pages.length)
    const missing = pages
      .map(page => `examples/${page.example}.vue`)
      .filter(file => !existsSync(join(here, file)))
    expect(missing).toEqual([])
  })
})
