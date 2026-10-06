import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

// PRINCIPLES.md P11: the protocol depends on nothing, the core on the
// protocol and an exact @tanstack/table-core, the Vue package on both plus an
// exact @tanstack/vue-table, with `vue` as its only peer. P9: the three are
// versioned together. The root is a private workspace that publishes nothing.

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (...path: string[]) =>
  JSON.parse(readFileSync(join(root, ...path), 'utf8')) as Record<
    string,
    unknown
  >
const workspace = read('package.json')

describe('workspace root manifest', () => {
  it('is private and publishes nothing', () => {
    expect(workspace.private).toBe(true)
    expect(workspace.files).toBeUndefined()
    expect(workspace.exports).toBeUndefined()
    expect(workspace.main).toBeUndefined()
  })

  it('has no runtime or peer dependencies', () => {
    expect(workspace.dependencies ?? {}).toEqual({})
    expect(workspace.peerDependencies ?? {}).toEqual({})
  })

  it('declares the Node ranges and the pnpm version', () => {
    expect(workspace.engines).toEqual({ node: '>=22.12' })
    expect(workspace.devEngines).toEqual({
      runtime: { name: 'node', version: '>=24', onFail: 'error' }
    })
    expect(workspace.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
  })
})

const packages = [
  {
    dir: 'query-protocol',
    name: '@dolusoft/query-protocol',
    dependencies: {},
    peers: {},
    subpaths: ['.', './local', './query.schema.json']
  },
  {
    dir: 'query-table-core',
    name: '@dolusoft/query-table-core',
    dependencies: {
      '@dolusoft/query-protocol': 'workspace:*',
      '@tanstack/table-core': '9.2.6'
    },
    peers: {},
    subpaths: ['.', './server-query', './filter-input']
  },
  {
    dir: 'vue',
    name: '@dolusoft/query-table',
    dependencies: {
      '@dolusoft/query-protocol': 'workspace:*',
      '@dolusoft/query-table-core': 'workspace:*',
      '@tanstack/vue-table': '9.2.6'
    },
    peers: { vue: '^3.5.0' },
    subpaths: ['.']
  }
]

describe.each(packages)(
  '$name manifest',
  ({ dir, name, dependencies, peers, subpaths }) => {
    const pkg = read('packages', dir, 'package.json')

    it('has its name and the version of the workspace', () => {
      expect(pkg.name).toBe(name)
      expect(pkg.private).toBe(false)
      expect(pkg.version).toMatch(/^3\.\d+\.\d+(-[\w.]+)?$/)
      expect(pkg.version).toBe(workspace.version)
    })

    it('depends on the allowed packages only, TanStack at an exact version', () => {
      expect(pkg.dependencies ?? {}).toEqual(dependencies)
      expect(pkg.peerDependencies ?? {}).toEqual(peers)
      expect(pkg.optionalDependencies ?? {}).toEqual({})
      expect(pkg.bundleDependencies ?? []).toEqual([])
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

    it('points its repository at its own directory', () => {
      expect(pkg.repository).toEqual({
        type: 'git',
        url: 'git+https://github.com/dolusoft/query-table.git',
        directory: `packages/${dir}`
      })
    })
  }
)

describe('README install lines', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const urls = [
    ...readme.matchAll(
      /releases\/download\/v([\w.-]+)\/dolusoft-(query-[\w-]+?)-(\d[\w.-]*)\.tgz/g
    )
  ]

  it('names each package once, at the version of the workspace', () => {
    expect(urls.map(([, , file]) => file).sort()).toEqual(
      ['query-protocol', 'query-table', 'query-table-core'].sort()
    )
    for (const [, tag, , file] of urls) {
      expect(tag).toBe(workspace.version)
      expect(file).toBe(workspace.version)
    }
  })
})
