import type { SearchDoc } from './search-index'
import {
  featureGroups,
  features,
  groupTitles,
  serverModeLabels
} from '../guides/feature-matrix'
import { aiSections, guidePages } from '../guides/guides'
import {
  tanstackFeatureGuides,
  tanstackGeneralLinks,
  tanstackVersions,
  usedTanstackFeatures
} from '../guides/tanstack'

// The search documents of the guide pages (features, TanStack, AI): derived
// from the same data files the pages draw, so a row, a link or a section the
// page shows is findable and nothing is written twice.

const plain = (text: string) => text.replaceAll('`', '')

const pageOf = (id: string) => {
  const page = guidePages.find(guide => guide.id === id)!
  return { pageId: page.id, pageTitle: page.title }
}

export const guideDocuments = (): SearchDoc[] => {
  const matrix = pageOf('features')
  const tanstack = pageOf('tanstack')
  const ai = pageOf('ai')
  return [
    ...guidePages.map<SearchDoc>(page => ({
      pageId: page.id,
      pageTitle: page.title,
      id: `page:${page.id}`,
      kind: 'page',
      title: page.title,
      heading: '',
      body: plain(page.summary),
      anchor: ''
    })),
    ...features.map<SearchDoc>(feature => ({
      ...matrix,
      id: `features:${feature.id}`,
      kind: 'feature',
      title: feature.title,
      heading: [
        groupTitles[feature.group],
        feature.mode ? serverModeLabels[feature.mode] : ''
      ]
        .filter(Boolean)
        .join(' · '),
      body: plain(feature.summary),
      anchor: `feature-${feature.id}`
    })),
    ...featureGroups.map<SearchDoc>(group => ({
      ...matrix,
      id: `features:group:${group}`,
      kind: 'section',
      title: groupTitles[group],
      heading: 'Features',
      body: '',
      anchor: `group-${group}`
    })),
    {
      ...tanstack,
      id: 'tanstack:versions',
      kind: 'section',
      title: 'Pinned versions',
      heading: 'TanStack Table',
      body: `@tanstack/table-core ${tanstackVersions.tableCore} @tanstack/vue-table ${tanstackVersions.vueTable}`,
      anchor: 'tanstack-versions'
    },
    ...usedTanstackFeatures.map<SearchDoc>(used => ({
      ...tanstack,
      id: `tanstack:used:${used.guide}`,
      kind: 'feature',
      title: used.feature,
      heading: 'TanStack features we use',
      body: plain(used.role),
      anchor: `tanstack-used-${used.guide}`
    })),
    ...[...tanstackGeneralLinks, ...tanstackFeatureGuides].map<SearchDoc>(
      link => ({
        ...tanstack,
        id: `tanstack:link:${link.id}`,
        kind: 'link',
        title: `TanStack: ${link.title}`,
        heading: link.url,
        body: plain(link.about),
        anchor: `tanstack-link-${link.id}`
      })
    ),
    ...aiSections.map<SearchDoc>(section => ({
      ...ai,
      id: `ai:${section.id}`,
      kind: 'section',
      title: section.title,
      heading: 'Use with AI',
      body: plain(section.text),
      anchor: section.id
    }))
  ]
}
