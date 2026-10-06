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
    for (const rule of api.rules) {
      const docs = rules.filter(
        candidate => candidate.title.split(' ')[0] === rule.id
      )
      expect(docs, rule.id).toHaveLength(1)
      expect(docs[0]?.body).toBe(rule.text.replaceAll('`', ''))
    }
    expect(rules).toHaveLength(api.rules.length)
  })

  it('contains every page with its title', () => {
    const titles = documents
      .filter(doc => doc.kind === 'page')
      .map(doc => doc.title)
    expect(titles).toEqual(pages.map(page => page.title))
  })

  it('maps each entry to the first page that lists it', () => {
    const kinds = Object.keys(memberKinds) as Array<keyof typeof memberKinds>
    for (const doc of documents.filter(entry => entry.kind !== 'page')) {
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
