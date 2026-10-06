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

// The v3 packages (ADR 0003): the protocol depends on nothing, the core
// only on the protocol and an exact @tanstack/table-core.
const workspacePackage = (dir: string) =>
  JSON.parse(
    readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8')
  ) as Record<string, unknown>

describe.each([
  {
    dir: 'query-protocol',
    name: '@dolusoft/query-protocol',
    dependencies: {},
    subpaths: ['.', './query.schema.json']
  },
  {
    dir: 'query-table-core',
    name: '@dolusoft/query-table-core',
    dependencies: {
      '@dolusoft/query-protocol': 'workspace:*',
      '@tanstack/table-core': '9.2.6'
    },
    subpaths: ['.', './server-query', './filter-input']
  }
])('$name manifest', ({ dir, name, dependencies, subpaths }) => {
  const pkg = workspacePackage(dir)

  it('has its name and a 3.x version', () => {
    expect(pkg.name).toBe(name)
    expect(pkg.version).toMatch(/^3\.\d+\.\d+(-[\w.]+)?$/)
  })

  it('depends on the allowed packages only, TanStack at an exact version', () => {
    expect(pkg.dependencies ?? {}).toEqual(dependencies)
    expect(pkg.peerDependencies ?? {}).toEqual({})
    expect(pkg.optionalDependencies ?? {}).toEqual({})
  })

  it('publishes only dist, ESM only, without side effects', () => {
    expect(pkg.files).toEqual(['dist'])
    expect(pkg.type).toBe('module')
    expect(pkg.sideEffects).toBe(false)
    expect(pkg.engines).toEqual({ node: '>=22.12' })
    expect(JSON.stringify(pkg)).not.toMatch(/\.c?cjs|\.d\.cts|"require"/)
  })

  it('exports its subpaths into dist, each script entry with its types', () => {
    const exports = pkg.exports as Record<
      string,
      string | { types: string; default: string }
    >
    expect(Object.keys(exports)).toEqual(subpaths)
    for (const target of Object.values(exports)) {
      if (typeof target === 'string') {
        expect(target).toMatch(/^\.\/dist\//)
        continue
      }
      expect(Object.keys(target)).toEqual(['types', 'default'])
      expect(target.types).toMatch(/^\.\/dist\/types\/.+\.d\.ts$/)
      expect(target.default).toMatch(/^\.\/dist\/[\w-]+\.js$/)
    }
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
