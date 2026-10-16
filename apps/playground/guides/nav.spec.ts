// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { aiNav, aiSections, blobUrl, guidePages, rawUrl } from './guides'
import { pages } from '../manifest'
import {
  navigation,
  navigationGroups,
  neighbours,
  sequence
} from '../shell/docs-nav'
import { externalLinks, hrefOf } from '../shell/external-links'

describe('documentation reading order', () => {
  it('groups every example and guide exactly once, with AI last', () => {
    expect(navigationGroups.map(group => group.title)).toEqual([
      'Getting started',
      'Data & query',
      'Columns',
      'Rows',
      'Scrolling',
      'Cells & display',
      'Guides'
    ])
    const ids = sequence.map(page => page.id)
    expect(ids).toHaveLength(new Set(ids).size)
    expect([...ids].sort()).toEqual(
      [...pages, ...guidePages].map(page => page.id).sort()
    )
    expect(ids.at(-1)).toBe('ai')
    expect(navigation).toEqual(navigationGroups.flatMap(group => group.pages))
  })

  it('keeps the pager in group order, including group boundaries and AI', () => {
    sequence.forEach((page, index) => {
      expect(neighbours(`/${page.id}`)).toEqual({
        previous: sequence[index - 1],
        next: sequence[index + 1]
      })
    })
    expect(neighbours('/unknown')).toEqual({
      previous: undefined,
      next: undefined
    })
  })

  it('shortens sidebar labels without changing page and pager titles', () => {
    const page = navigation.find(entry => entry.id === 'row-kind')!
    expect(page.navTitle).toBe('Row kinds')
    expect(page.title).toBe('Row kinds & rows that cannot expand')
    expect(neighbours('/row-expansion').next?.title).toBe(page.title)
  })
})

describe('AI sidebar group', () => {
  it('points at the AI page and at sections that exist on it', () => {
    const ids = aiSections.map(section => section.id)
    for (const entry of aiNav) {
      const [path, hash] = entry.to.split('#')
      expect(path, entry.id).toBe('/ai')
      if (hash) {
        expect(ids, entry.id).toContain(hash)
      }
    }
    expect(guidePages.some(page => page.id === 'ai')).toBe(true)
    expect(aiNav.map(entry => entry.id)).toContain('ai-skill')
    expect(aiNav.map(entry => entry.id)).toContain('ai-llms')
  })
})

describe('external links', () => {
  it('has TanStack Table and GitHub, over https', () => {
    const ids = externalLinks.map(link => link.id)
    expect(ids).toEqual(expect.arrayContaining(['tanstack', 'github']))
    for (const link of externalLinks.filter(entry => !entry.local)) {
      expect(link.url, link.id).toMatch(/^https:\/\//)
    }
  })

  it.each(['/query-table/', '/query-table/next/'])(
    'resolves a local file against the site base %s',
    base => {
      const llms = externalLinks.find(link => link.id === 'llms')!
      expect(hrefOf(llms, base)).toBe(`${base}llms.txt`)
    }
  )

  it('defaults repository documentation links to the release branch', () => {
    expect(rawUrl('README.md')).toBe(
      'https://raw.githubusercontent.com/dolusoft/query-table/main/README.md'
    )
    expect(blobUrl('README.md')).toBe(
      'https://github.com/dolusoft/query-table/blob/main/README.md'
    )
  })
})
