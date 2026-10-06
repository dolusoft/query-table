import MiniSearch from 'minisearch'

import { memberAnchor, ruleAnchor, type MemberKind } from './anchors'
import api from '../../contract/api.json'
import { pages as manifestPages, type PlaygroundPage } from '../manifest'

// The documentation search index. Every document is derived from
// contract/api.json (generated from the component and src/contract.ts) and
// playground/manifest.ts, so the index follows the contract with no data
// written here by hand.

export type DocKind =
  'page' | 'prop' | 'event' | 'slot' | 'method' | 'function' | 'type' | 'rule'

export interface SearchDoc {
  /** Unique per page and entry. */
  id: string
  kind: DocKind
  /** The member name, the rule id and title, or the page title. */
  title: string
  /** Signature, rule title or the page's section headings. */
  heading: string
  /** Description, rule text or page summary. */
  body: string
  pageId: string
  pageTitle: string
  /** The element id to scroll to; empty for the page itself. */
  anchor: string
}

export interface SearchHit extends SearchDoc {
  score: number
  /** Lower-case indexed terms that matched, for highlighting. */
  terms: string[]
}

export const memberKinds: Record<MemberKind, DocKind> = {
  props: 'prop',
  emits: 'event',
  slots: 'slot',
  exposed: 'method',
  functions: 'function',
  types: 'type'
}

const groupHeadings: Record<MemberKind, string> = {
  props: 'Props',
  emits: 'Events',
  slots: 'Slots',
  exposed: 'Exposed',
  functions: 'Functions',
  types: 'Types'
}

const plain = (text: string) => text.replaceAll('`', '')

const memberSignature = (kind: MemberKind, name: string): string => {
  if (kind === 'slots') {
    return api.slots.find(slot => slot.name === name)?.props ?? ''
  }
  if (kind === 'types') {
    return api.types.find(type => type.name === name)?.kind ?? ''
  }
  return api[kind].find(member => member.name === name)?.type ?? ''
}

const memberDescription = (kind: MemberKind, name: string): string =>
  api[kind].find(member => member.name === name)?.description ?? ''

/** All documents of the playground: one per page and per page entry. */
export const buildDocuments = (
  pages: PlaygroundPage[] = manifestPages
): SearchDoc[] =>
  pages.flatMap(page => {
    const base = { pageId: page.id, pageTitle: page.title }
    const kinds = (Object.keys(memberKinds) as MemberKind[]).filter(
      kind => (page.api[kind] ?? []).length > 0
    )
    const headings = [
      'Example',
      'Source',
      'API on this page',
      ...kinds.map(kind => groupHeadings[kind]),
      'Covered rules'
    ]
    const pageDoc: SearchDoc = {
      ...base,
      id: `page:${page.id}`,
      kind: 'page',
      title: page.title,
      heading: headings.join(' · '),
      body: plain(page.summary),
      anchor: ''
    }
    const members = kinds.flatMap(kind =>
      (page.api[kind] ?? []).map<SearchDoc>(name => ({
        ...base,
        id: `${page.id}:${kind}:${name}`,
        kind: memberKinds[kind],
        title: name,
        heading: memberSignature(kind, name),
        body: plain(memberDescription(kind, name)),
        anchor: memberAnchor(kind, name)
      }))
    )
    const rules = page.rules.flatMap<SearchDoc>(id => {
      const rule = api.rules.find(candidate => candidate.id === id)
      return rule
        ? [
            {
              ...base,
              id: `${page.id}:rule:${id}`,
              kind: 'rule',
              title: `${rule.id} ${rule.title}`,
              heading: rule.title,
              body: plain(rule.text),
              anchor: ruleAnchor(rule.id)
            }
          ]
        : []
    })
    return [pageDoc, ...members, ...rules]
  })

// Words split on anything but letters and digits; camelCase parts are added
// too, so `rows` finds `totalRows` and `C-01` finds rule C-01.
const tokenize = (text: string) =>
  text
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .flatMap(word => {
      const parts = word.split(/(?<=[a-z0-9])(?=[A-Z])/)
      return parts.length > 1 ? [word, ...parts] : [word]
    })

export const createSearchIndex = (documents = buildDocuments()) => {
  const index = new MiniSearch<SearchDoc>({
    fields: ['title', 'heading', 'body'],
    storeFields: [
      'kind',
      'title',
      'heading',
      'body',
      'pageId',
      'pageTitle',
      'anchor'
    ],
    tokenize,
    searchOptions: {
      boost: { title: 4, heading: 2, body: 1 },
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND'
    }
  })
  index.addAll(documents)
  return index
}

export const searchDocs = (
  index: MiniSearch<SearchDoc>,
  query: string,
  limit = 40
): SearchHit[] => {
  if (!query.trim()) {
    return []
  }
  return index
    .search(query)
    .slice(0, limit)
    .map(result => ({
      id: String(result.id),
      kind: result.kind as DocKind,
      title: result.title as string,
      heading: result.heading as string,
      body: result.body as string,
      pageId: result.pageId as string,
      pageTitle: result.pageTitle as string,
      anchor: result.anchor as string,
      score: result.score,
      terms: Object.keys(result.match)
    }))
}

/** Hits grouped by page, pages in the order of their best hit. */
export const groupByPage = (hits: SearchHit[]) => {
  const groups = new Map<string, { pageTitle: string; hits: SearchHit[] }>()
  for (const hit of hits) {
    const group = groups.get(hit.pageId) ?? {
      pageTitle: hit.pageTitle,
      hits: []
    }
    group.hits.push(hit)
    groups.set(hit.pageId, group)
  }
  return [...groups].map(([pageId, group]) => ({ pageId, ...group }))
}

export interface Segment {
  text: string
  match: boolean
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `text` split into plain parts and parts that match one of `terms`. */
export const highlight = (text: string, terms: string[]): Segment[] => {
  const words = terms.filter(Boolean).sort((a, b) => b.length - a.length)
  if (words.length === 0) {
    return [{ text, match: false }]
  }
  const lower = new Set(words.map(word => word.toLowerCase()))
  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'iu')
  return text
    .split(pattern)
    .filter(Boolean)
    .map(part => ({ text: part, match: lower.has(part.toLowerCase()) }))
}

/** A short piece of `text` around its first match. */
export const snippet = (text: string, terms: string[], size = 140) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLowerCase()
  const found = terms
    .map(term => lower.indexOf(term.toLowerCase()))
    .filter(at => at >= 0)
  const start = found.length > 0 ? Math.max(0, Math.min(...found) - 40) : 0
  const end = start + size
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}
