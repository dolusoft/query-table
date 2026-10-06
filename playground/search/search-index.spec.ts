import { describe, expect, it } from 'vitest'

import {
  buildDocuments,
  createSearchIndex,
  groupByPage,
  highlight,
  memberKinds,
  searchDocs,
  snippet
} from './search-index'
import api from '../../contract/api.json'
import { pages } from '../manifest'

// The search index is built from contract/api.json and the manifest: every
// API member and rule must be findable, on the page that documents it.

const documents = buildDocuments()
const index = createSearchIndex(documents)

describe('documentation search index', () => {
  it.each(Object.keys(memberKinds) as Array<keyof typeof memberKinds>)(
    'contains every %s member of the contract',
    kind => {
      const indexed = new Set(
        documents
          .filter(doc => doc.kind === memberKinds[kind])
          .map(doc => doc.title)
      )
      const missing = api[kind]
        .map(member => member.name)
        .filter(name => !indexed.has(name))
      expect(missing).toEqual([])
    }
  )

  it('contains every rule with its text', () => {
    const rules = documents.filter(doc => doc.kind === 'rule')
    for (const rule of api.rules) {
      const doc = rules.find(candidate => candidate.title.startsWith(rule.id))
      expect(doc, rule.id).toBeDefined()
      expect(doc!.body).toBe(rule.text.replaceAll('`', ''))
    }
  })

  it('contains every page with its title', () => {
    const titles = documents
      .filter(doc => doc.kind === 'page')
      .map(doc => doc.title)
    expect(titles).toEqual(pages.map(page => page.title))
  })

  it('maps each entry to the page that lists it', () => {
    for (const doc of documents) {
      const page = pages.find(candidate => candidate.id === doc.pageId)!
      if (doc.kind === 'rule') {
        expect(page.rules).toContain(doc.title.split(' ')[0])
      }
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
