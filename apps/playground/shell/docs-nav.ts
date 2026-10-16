import { guidePages } from '../guides/guides'
import { pages } from '../manifest'

export interface DocLink {
  id: string
  title: string
  navTitle?: string
}

// Sidebar groups and the pager share one reading order. AI section links
// live in guides.ts; only the AI page belongs in the pager.
const groups = [
  {
    title: 'Getting started',
    ids: ['overview', 'local-query', 'tanstack-path']
  },
  {
    title: 'Data & query',
    ids: [
      'query-model',
      'filtering',
      'filter-parser',
      'sorting',
      'pagination',
      'search-selection-cursors'
    ]
  },
  {
    title: 'Columns',
    ids: [
      'column-layout',
      'column-pinning',
      'column-resizing',
      'column-auto-width',
      'header-slot',
      'header-context-menu'
    ]
  },
  {
    title: 'Rows',
    ids: [
      'row-expansion',
      'row-kind',
      'row-pinning',
      'grouped-rows',
      'footer-rows'
    ]
  },
  {
    title: 'Scrolling',
    ids: ['scroll-body', 'virtual-scroll', 'infinite-scroll']
  },
  {
    title: 'Cells & display',
    ids: [
      'custom-cells',
      'change-flash',
      'empty-state',
      'loading-state',
      'loading-skeleton',
      'programmatic-control',
      'labels'
    ]
  },
  { title: 'Guides', ids: ['features', 'tanstack'] }
]

const allPages: DocLink[] = [...pages, ...guidePages]
export const navigationGroups = groups.map(group => ({
  title: group.title,
  pages: group.ids.map(id => {
    const page = allPages.find(entry => entry.id === id)
    if (!page) {
      throw new Error(`Unknown documentation page: ${id}`)
    }
    return page
  })
}))

export const navigation = navigationGroups.flatMap(group => group.pages)
export const sequence: DocLink[] = [
  ...navigation,
  ...guidePages.filter(page => page.id === 'ai')
]

/** The page before and after `path` (`/<page id>`) in the reading order. */
export const neighbours = (path: string) => {
  const index = sequence.findIndex(page => `/${page.id}` === path)
  return {
    previous: index > 0 ? sequence[index - 1] : undefined,
    next:
      index >= 0 && index < sequence.length - 1
        ? sequence[index + 1]
        : undefined
  }
}
