import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// PRINCIPLES.md P11: no runtime dependency, `vue` is the only peer.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const manifest = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8')
) as Record<string, unknown>

describe('package manifest', () => {
  it('has no runtime dependencies', () => {
    expect(manifest.dependencies ?? {}).toEqual({})
    expect(manifest.optionalDependencies ?? {}).toEqual({})
    expect(manifest.bundleDependencies ?? []).toEqual([])
  })

  it('has vue as its only peer dependency', () => {
    expect(Object.keys(manifest.peerDependencies as object)).toEqual(['vue'])
  })

  it('publishes only dist', () => {
    expect(manifest.files).toEqual(['dist'])
  })
})
