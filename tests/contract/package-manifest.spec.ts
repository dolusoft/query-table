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

  it('is ESM only: one import target, no require condition, no .cjs', () => {
    expect(manifest.type).toBe('module')
    expect(manifest.exports).toEqual({
      '.': {
        types: './dist/types/index.d.ts',
        default: './dist/query-table.js'
      }
    })
    expect(JSON.stringify(manifest)).not.toMatch(/\.c?cjs|\.d\.cts|"require"/)
  })

  it('declares the Node range, no side effects and the pnpm version', () => {
    expect(manifest.engines).toEqual({ node: '>=22.12' })
    expect(manifest.devEngines).toEqual({
      runtime: { name: 'node', version: '>=24', onFail: 'error' }
    })
    expect(manifest.sideEffects).toBe(false)
    expect(manifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
  })
})

describe('README install line', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const urls = [
    ...readme.matchAll(
      /releases\/download\/v([\w.-]+)\/dolusoft-query-table-([\w.-]+)\.tgz/g
    )
  ]

  it('names the version of package.json, in the tag and in the file', () => {
    expect(urls.length).toBeGreaterThan(0)
    for (const [, tag, file] of urls) {
      expect(tag).toBe(manifest.version)
      expect(file).toBe(manifest.version)
    }
  })
})
