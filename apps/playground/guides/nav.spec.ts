// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { aiNav, aiSections, blobUrl, guidePages, rawUrl } from './guides'
import { externalLinks, hrefOf } from '../shell/external-links'

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
