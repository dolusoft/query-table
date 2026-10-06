import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  availabilityLabels,
  featureGroups,
  features,
  groupTitles,
  serverModeLabels
} from './feature-matrix'
import { tanstackFeatureGuides } from './tanstack'
import { pages } from '../manifest'

const root = resolve(import.meta.dirname, '../../..')
const inGroup = (group: string) =>
  features.filter(feature => feature.group === group).map(feature => feature.id)

// The page draws feature-matrix.ts and this file checks the same data, so the
// page and the test cannot disagree.
describe('feature matrix data', () => {
  it('has unique ids, known groups, modes and availabilities', () => {
    const ids = features.map(feature => feature.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const feature of features) {
      expect(featureGroups, feature.id).toContain(feature.group)
      expect(Object.keys(availabilityLabels), feature.id).toContain(
        feature.component
      )
      expect(Object.keys(availabilityLabels), feature.id).toContain(
        feature.tanstackPath
      )
      if (feature.mode) {
        expect(Object.keys(serverModeLabels), feature.id).toContain(
          feature.mode
        )
      }
    }
    expect(Object.keys(groupTitles).sort()).toEqual([...featureGroups].sort())
  })

  it('has the rows of each group', () => {
    expect(inGroup('open')).toEqual([
      'sorting',
      'pagination',
      'column-filtering',
      'global-search',
      'row-selection',
      'row-expanding',
      'column-pinning-left',
      'column-sizing'
    ])
    expect(inGroup('planned')).toEqual([
      'column-visibility',
      'column-ordering',
      'column-pinning-right',
      'row-pinning'
    ])
    expect(inGroup('backend')).toEqual(['grouping', 'faceting'])
    expect(inGroup('client')).toEqual([
      'fuzzy-search',
      'client-functions',
      'virtualization'
    ])
    expect(inGroup('own')).toEqual([
      'filter-grammar',
      'query-protocol',
      'one-action-one-update',
      'cursor-protocol',
      'pin-offsets',
      'keyboard-resize',
      'phone-mode',
      'contract-tests'
    ])
  })

  it('marks the planned group as 3.1 for the component and usable on the TanStack path', () => {
    for (const feature of features.filter(entry => entry.group === 'planned')) {
      expect(feature.component, feature.id).toBe('planned')
      expect(feature.tanstackPath, feature.id).toBe('yes')
    }
  })

  it('gives every backend-dependent row the backend tag and no support today', () => {
    for (const feature of features.filter(entry => entry.group === 'backend')) {
      expect(feature.mode, feature.id).toBe('backend')
      expect(feature.component, feature.id).toBe('no')
    }
  })

  it('ties every TanStack feature to a known guide', () => {
    const guides = tanstackFeatureGuides.map(guide => guide.id)
    for (const feature of features) {
      if (feature.group === 'own') {
        expect(feature.tanstack, feature.id).toBeNull()
      } else {
        expect(guides, feature.id).toContain(feature.tanstack)
      }
    }
  })

  it('links to live example pages and repository files that exist', () => {
    const pageIds = pages.map(page => page.id)
    for (const feature of features) {
      if (feature.example) {
        expect(pageIds, feature.id).toContain(feature.example)
      }
      if (feature.repoPath) {
        expect(existsSync(resolve(root, feature.repoPath)), feature.id).toBe(
          true
        )
      }
    }
  })
})
