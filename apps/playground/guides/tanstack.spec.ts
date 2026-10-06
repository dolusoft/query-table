import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  tanstackFeatureGuides,
  tanstackGeneralLinks,
  tanstackVersions,
  usedTanstackFeatures
} from './tanstack'
import core from '../../../packages/query-table-core/package.json'
import vue from '../../../packages/vue/package.json'

const root = resolve(import.meta.dirname, '../../..')
const source = readFileSync(
  resolve(root, 'packages/vue/src/use-query-table.ts'),
  'utf8'
)

// The `tableFeatures({ ... })` call of useQueryTable(), in order.
const registered = /tableFeatures\(\{([^}]*)\}\)/s
  .exec(source)![1]
  .split('\n')
  .map(line =>
    line
      .replace(/\/\/.*$/, '')
      .replace(/,/g, '')
      .trim()
  )
  .filter(Boolean)

describe('TanStack page data', () => {
  it('reads the versions from the package manifests', () => {
    expect(tanstackVersions.tableCore).toBe(
      core.dependencies['@tanstack/table-core']
    )
    expect(tanstackVersions.vueTable).toBe(
      vue.dependencies['@tanstack/vue-table']
    )
    // Pinned: an exact version, no range.
    expect(tanstackVersions.tableCore).toMatch(/^9\.\d+\.\d+$/)
    expect(tanstackVersions.vueTable).toMatch(/^9\.\d+\.\d+$/)
  })

  it('lists the features useQueryTable() registers, minus our two plugins', () => {
    const ours = ['serverQueryFeature', 'filterInputFeature']
    expect(usedTanstackFeatures.map(used => used.feature)).toEqual(
      registered.filter(name => !ours.includes(name))
    )
    expect(registered).toEqual(expect.arrayContaining(ours))
  })

  it('points every used feature at a known guide', () => {
    for (const used of usedTanstackFeatures) {
      const guide = tanstackFeatureGuides.find(entry => entry.id === used.guide)
      expect(guide, used.feature).toBeDefined()
      expect(guide?.feature, used.feature).toBe(used.feature)
    }
  })

  it('has unique link ids and https v9 URLs', () => {
    const links = [...tanstackGeneralLinks, ...tanstackFeatureGuides]
    const ids = links.map(link => link.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const link of links) {
      expect(link.url, link.id).toMatch(
        /^https:\/\/tanstack\.com\/table\/v9\/docs\//
      )
    }
  })
})
