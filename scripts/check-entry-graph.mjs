// The default entries never reach the local evaluator (C-75, P1, P14).
//   1. dist: from each default entry's file, follow its static and dynamic
//      imports through dist/*.js; no chunk on the way has a source map
//      `sources` entry under src/local/, and none names a /local entry.
//   2. fixtures: the size fixtures that use no /local entry bundle no module
//      of packages/*/dist/local.js or of a chunk only it imports.
// Run after `pnpm build`. Searching the output for the word "local" is not
// evidence; module ids and source maps are.
//
//   node scripts/check-entry-graph.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { buildFixture } from './fixture-build.mjs'
import { specifiersOf } from './specifiers.mjs'

const root = join(import.meta.dirname, '..')
const rel = path => relative(root, path).split(sep).join('/')

/** The entries of the local evaluator and of its Vue binding. */
const localEntries = [
  '@dolusoft/query-protocol/local',
  '@dolusoft/query-table/local'
]

// Relative specifiers of the built ES modules: `import … from './x.js'`,
// `export … from './x.js'`, `import './x.js'` and `import('./x.js')`. The
// dist is our own unminified Rolldown output, so a pattern is enough.
const relativePattern =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g

/** A built file that is only import and export statements (no code of its own). */
const onlyModuleSyntax = code =>
  code
    .replace(/\/\/#.*$/gm, '')
    .replace(/(?:import|export)\s*(?:[^;'"]*?\bfrom\s*)?['"][^'"]+['"];?/g, '')
    .replace(/export\s*\{[^}]*\};?/g, '')
    .trim() === ''

const problems = []

/** Local-evaluator sources in the source map of `file`, or `null` without one. */
const localSources = file => {
  const map = `${file}.map`
  if (!existsSync(map)) {
    return null
  }
  const { sources = [] } = JSON.parse(readFileSync(map, 'utf8'))
  return sources.filter(source => /(^|\/)src\/local\//.test(source))
}

const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(root, 'packages', entry.name))

// 1. The built module graph of each default entry.
let visitedFiles = 0
for (const dir of packages) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const target = manifest.exports['.']
  const entry = join(dir, typeof target === 'string' ? target : target.default)
  if (!existsSync(entry)) {
    problems.push(`${rel(entry)} is missing: run pnpm build first`)
    continue
  }
  const seen = new Set()
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift()
    if (seen.has(file)) {
      continue
    }
    seen.add(file)
    const code = readFileSync(file, 'utf8')
    const via = `${manifest.name} (${rel(entry)} → ${rel(file)})`
    for (const specifier of specifiersOf(code)) {
      if (localEntries.includes(specifier)) {
        problems.push(`${via} imports ${specifier}`)
      }
    }
    const sources = localSources(file)
    if (sources === null) {
      if (!onlyModuleSyntax(code)) {
        problems.push(
          `${via} has code and no source map: its sources cannot be checked`
        )
      }
    } else if (sources.length > 0) {
      problems.push(`${via} bundles ${sources.join(', ')}`)
    }
    for (const [, specifier] of code.matchAll(relativePattern)) {
      const next = join(dirname(file), specifier)
      if (!existsSync(next)) {
        problems.push(`${via} imports ${specifier}, which is missing`)
        continue
      }
      queue.push(next)
    }
  }
  visitedFiles += seen.size
}

// 2. The size fixtures that use only default entries.
const localFiles = packages
  .map(dir => join(dir, 'dist', 'local.js'))
  .filter(file => existsSync(file))
/** The chunks of the dist that only the local entry imports. */
const localOnly = new Set(localFiles)
for (const dir of packages) {
  const dist = join(dir, 'dist')
  if (!existsSync(dist)) {
    continue
  }
  const importers = new Map()
  const files = readdirSync(dist)
    .filter(name => name.endsWith('.js'))
    .map(name => join(dist, name))
  for (const file of files) {
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(
      relativePattern
    )) {
      const imported = join(dirname(file), specifier)
      importers.set(imported, [...(importers.get(imported) ?? []), file])
    }
  }
  let grew = true
  while (grew) {
    grew = false
    for (const [file, from] of importers) {
      if (!localOnly.has(file) && from.every(f => localOnly.has(f))) {
        localOnly.add(file)
        grew = true
      }
    }
  }
}

/** The local-only dist files among the modules of a fixture's build. */
const localModulesOf = async (name, directory) => {
  const chunks = await buildFixture(name, directory)
  const moduleIds = chunks.flatMap(chunk => chunk.moduleIds)
  if (moduleIds.length === 0) {
    problems.push(`fixture ${name} has no module ids`)
  }
  return moduleIds
    .map(id => resolve(id.split('?')[0]))
    .filter(id => localOnly.has(id))
}

const fixtures = ['protocol', 'server-query', 'filter-input', 'core']
for (const name of fixtures) {
  for (const id of await localModulesOf(name)) {
    problems.push(`fixture ${name} bundles ${rel(id)}`)
  }
}
for (const name of ['composable', 'component']) {
  for (const id of await localModulesOf(name, 'consumer')) {
    problems.push(`fixture ${name} bundles ${rel(id)}`)
  }
}
// The control: a fixture that does use /local must show it, or the check
// above could pass by not seeing the module ids at all.
const control = await localModulesOf('protocol-local')
if (control.length === 0) {
  problems.push(
    'fixture protocol-local bundles no dist/local.js: the module ids are not read right'
  )
}

const bindingControl = await localModulesOf('local-composable', 'consumer')
if (
  !bindingControl.some(
    file => file === join(root, 'packages', 'vue', 'dist', 'local.js')
  )
) {
  problems.push(
    'fixture local-composable bundles no Vue dist/local.js: the binding control is missing'
  )
}
if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`check-entry-graph: ${problem}`)
  }
  console.error(
    'check-entry-graph: a default entry reaches the local evaluator (C-75).'
  )
  process.exit(1)
}
console.log(
  `check-entry-graph: ${packages.length} default entries (${visitedFiles} built files) and ${fixtures.length + 2} fixtures reach no local evaluator (${localOnly.size} local-only file(s)).`
)
