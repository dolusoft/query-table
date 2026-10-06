import { describe, expect, it } from 'vitest'

import {
  buildDocuments,
  createSearchIndex,
  groupByPage,
  highlight,
  homePageId,
  memberKinds,
  searchDocs,
  snippet
} from './search-index'
import api from '../../../contract/api.json'
import { features } from '../guides/feature-matrix'
import { aiSections, guidePages } from '../guides/guides'
import { tanstackFeatureGuides, tanstackGeneralLinks } from '../guides/tanstack'
import { homeSections } from '../home/home-content'
import { pages, pendingRules } from '../manifest'

// The search index is built from contract/api.json and the manifest: every
// API member and rule must be findable, on the page that documents it.

const documents = buildDocuments()
const index = createSearchIndex(documents)

describe('documentation search index', () => {
  it.each(Object.keys(memberKinds) as Array<keyof typeof memberKinds>)(
    'contains every %s member of the contract',
    kind => {
      const indexed = documents
        .filter(doc => doc.kind === memberKinds[kind])
        .map(doc => doc.title)
      expect([...indexed].sort()).toEqual(
        api[kind].map(member => member.name).sort()
      )
    }
  )

  it('contains every rule with its text', () => {
    const rules = documents.filter(doc => doc.kind === 'rule')
    // A pending rule has no page yet, so nothing indexes it (manifest.ts).
    const shown = api.rules.filter(rule => !pendingRules.includes(rule.id))
    for (const rule of shown) {
      const docs = rules.filter(
        candidate => candidate.title.split(' ')[0] === rule.id
      )
      expect(docs, rule.id).toHaveLength(1)
      expect(docs[0]?.body).toBe(rule.text.replaceAll('`', ''))
    }
    expect(rules).toHaveLength(shown.length)
  })

  it('contains the home page and every page with its title', () => {
    const titles = documents
      .filter(doc => doc.kind === 'page')
      .map(doc => doc.title)
    expect(titles).toEqual([
      'Home',
      ...pages.map(page => page.title),
      ...guidePages.map(page => page.title)
    ])
  })

  it('contains every feature row, TanStack link and AI section of the guide pages', () => {
    const ids = new Set(documents.map(doc => doc.id))
    for (const feature of features) {
      expect(ids, feature.id).toContain(`features:${feature.id}`)
    }
    for (const link of [...tanstackGeneralLinks, ...tanstackFeatureGuides]) {
      expect(ids, link.id).toContain(`tanstack:link:${link.id}`)
    }
    for (const section of aiSections) {
      expect(ids, section.id).toContain(`ai:${section.id}`)
    }
    expect(ids.size).toBe(documents.length)
  })

  it('finds the guide pages by what they say', () => {
    const first = (query: string) => searchDocs(index, query)[0]
    // The playground page of row pinning comes first; the feature row is
    // still found.
    expect(first('row pinning')?.pageId).toBe('row-pinning')
    expect(
      searchDocs(index, 'row pinning')
        .slice(0, 10)
        .map(hit => hit.id)
    ).toContain('features:row-pinning')
    expect(
      searchDocs(index, 'faceting').find(hit => hit.pageId === 'features')?.id
    ).toBe('features:faceting')
    expect(first('virtual scrolling')?.id).toBe('features:virtualization')
    expect(first('llms.txt')?.pageId).toBe('ai')
    expect(first('custom features')?.id).toBe('tanstack:link:custom-features')
    expect(
      searchDocs(index, 'table-core').some(
        hit => hit.id === 'tanstack:versions'
      )
    ).toBe(true)
  })

  it('contains every home page section, on the home page', () => {
    const sections = documents.filter(
      doc => doc.kind === 'section' && doc.pageId === homePageId
    )
    expect(sections.map(doc => doc.anchor)).toEqual(
      homeSections.map(section => section.id)
    )
    for (const doc of sections) {
      expect(doc.pageId, doc.id).toBe(homePageId)
    }
    expect(sections.map(doc => doc.anchor)).toContain('architecture')
  })

  it('finds the home page and its sections', () => {
    // Other pages say "install" too (the TanStack installation guide).
    expect(
      searchDocs(index, 'install')
        .slice(0, 3)
        .map(hit => hit.id)
    ).toContain('page:home')
    expect(searchDocs(index, 'headless')[0]?.anchor).toBe('principle-headless')
    expect(searchDocs(index, 'architecture')[0]?.anchor).toBe('architecture')
  })

  it('maps each entry to the first page that lists it', () => {
    const kinds = Object.keys(memberKinds) as Array<keyof typeof memberKinds>
    const apiKinds: string[] = [...Object.values(memberKinds), 'rule']
    for (const doc of documents.filter(entry =>
      apiKinds.includes(entry.kind)
    )) {
      const kind = kinds.find(candidate => memberKinds[candidate] === doc.kind)
      const first = pages.find(page =>
        kind
          ? (page.api[kind] ?? []).includes(doc.title)
          : page.rules.includes(doc.title.split(' ')[0] ?? '')
      )
      expect(doc.pageId, doc.id).toBe(first?.id)
    }
  })

  it('shows a member or rule listed on several pages once', () => {
    const titles = searchDocs(index, 'collapse').map(hit => hit.title)
    expect(titles.filter(title => title === 'collapseAll')).toHaveLength(1)
    for (const id of ['C-26', 'C-33']) {
      const hits = searchDocs(index, id).filter(
        hit => hit.kind === 'rule' && hit.title.startsWith(`${id} `)
      )
      expect(hits, id).toHaveLength(1)
    }
  })

  it('finds a prop by name, prefix and a typo', () => {
    for (const query of ['footerRows', 'footerR', 'footrRows']) {
      const hits = searchDocs(index, query)
      expect(hits[0]?.id, query).toBe('footer-rows:props:footerRows')
    }
  })

  it('finds a rule by id and camelCase parts', () => {
    expect(searchDocs(index, 'C-53')[0]?.kind).toBe('rule')
    expect(
      searchDocs(index, 'rows').some(hit => hit.title === 'totalRows')
    ).toBe(true)
    expect(searchDocs(index, '   ')).toEqual([])
  })

  it('groups hits by page and highlights matches', () => {
    const groups = groupByPage(searchDocs(index, 'collapseAll'))
    expect(groups.map(group => group.pageId)).toContain('row-expansion')
    expect(highlight('totalRows here', ['totalrows'])).toEqual([
      { text: 'totalRows', match: true },
      { text: ' here', match: false }
    ])
    expect(highlight('plain', [])).toEqual([{ text: 'plain', match: false }])
    expect(snippet('a '.repeat(100) + 'needle', ['needle'])).toMatch(
      /^….*needle$/
    )
  })
})
