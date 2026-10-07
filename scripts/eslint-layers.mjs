// A local ESLint plugin for the layering of the v3 packages (ADR 0003,
// PRINCIPLES P11, P14). `layers/boundaries` checks every module specifier of
// a file in packages/*/src: imports, `export ... from` re-exports, dynamic
// `import()`, `require()` and `import x = require()`, which must name a
// literal. `import.meta.glob` (and any `import.meta` call) is refused.
// Bare specifiers match exactly: a package sub-path is allowed only when it
// is listed.
//
//   protocol  packages/query-protocol/src          imports nothing outside itself
//     local/                                       itself and protocol/{types,constants,query} only (C-75)
//     the rest                                     never local/
//   core      packages/query-table-core/src        the protocol and @tanstack/table-core only
//     shared/                                      shared/ only (and the two packages)
//     features/<a>/                                features/<a>/ and shared/, never features/<b>/
//     row-changes/                                 itself and the protocol only (P14, ADR 0011)
//     the entry files (src/*.ts)                   anything in core
//   vue       packages/vue/src                     the protocol, the core, @tanstack/vue-table and vue
//     local/                                       itself, vue and the two protocol entries only (C-75)
//     the rest                                     never local/ nor the local evaluator
import { readFileSync } from 'node:fs'
import { dirname, posix, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** The published sub-paths of the core: its `exports` keys but `.`. */
const coreSubpaths = Object.keys(
  JSON.parse(
    readFileSync(
      resolve(root, 'packages/query-table-core/package.json'),
      'utf8'
    )
  ).exports
)
  .filter(key => key !== '.')
  .map(key => `@dolusoft/query-table-core${key.slice(1)}`)

/** The entries of the local evaluator and of its Vue binding (C-75). */
const localEntries = [
  '@dolusoft/query-protocol/local',
  '@dolusoft/query-table/local'
]

/** Bare specifiers each part may import, exactly. */
const allowedSpecifiers = {
  'query-protocol': [],
  'query-protocol:local': [],
  'query-table-core': ['@dolusoft/query-protocol', '@tanstack/table-core'],
  vue: [
    '@dolusoft/query-protocol',
    '@dolusoft/query-protocol/query.schema.json',
    '@dolusoft/query-table-core',
    ...coreSubpaths,
    '@tanstack/vue-table',
    'vue'
  ],
  'vue:local': [
    'vue',
    '@dolusoft/query-protocol',
    '@dolusoft/query-protocol/local'
  ]
}

/** The packages whose src/local/ is a part of its own. */
const localParts = new Set(['query-protocol', 'vue'])

/** The protocol modules the local evaluator may import (C-75). */
const protocolBasics = /^protocol\/(types|constants|query)(\.[jt]s)?$/

const localFence =
  'the local evaluator is reached only through its own entry (C-75)'

const toPosix = path => path.split(sep).join(posix.sep)

/**
 * Where a file sits: its package, its path under src/ (`rest`) and its part:
 * in query-table-core `shared`, `feature:<name>` or `entry`; in the protocol
 * and vue `local` (src/local/) or `main`. `null` outside packages/*\/src.
 */
export const layerOf = file => {
  const path = toPosix(relative(root, resolve(file)))
  const match = /^packages\/([^/]+)\/src\/(.+)$/.exec(path)
  if (!match) {
    return null
  }
  const [, pkg, rest] = match
  if (localParts.has(pkg)) {
    return { pkg, rest, part: /^local(\/|$)/.test(rest) ? 'local' : 'main' }
  }
  if (pkg !== 'query-table-core') {
    return { pkg, rest, part: 'all' }
  }
  if (/^shared(\/|$)/.test(rest)) {
    return { pkg, rest, part: 'shared' }
  }
  if (/^row-changes(\/|$)/.test(rest)) {
    return { pkg, rest, part: 'row-changes' }
  }
  const feature = /^features\/([^/]+)(\/|$)/.exec(rest)
  if (feature) {
    return { pkg, rest, part: `feature:${feature[1]}` }
  }
  return { pkg, rest, part: 'entry' }
}

const isBare = specifier =>
  !specifier.startsWith('.') && !specifier.startsWith('/')

/** Why `specifier` may not be imported from `file`, or `null`. */
export const violation = (file, specifier) => {
  const from = layerOf(file)
  if (!from) {
    return null
  }
  const rowChanges = `the row-change module may not import "${specifier}": it imports only the protocol and itself (P14)`
  if (from.part === 'row-changes' && isBare(specifier)) {
    return specifier === '@dolusoft/query-protocol' ? null : rowChanges
  }
  if (isBare(specifier)) {
    const local = from.part === 'local'
    const allowed = allowedSpecifiers[local ? `${from.pkg}:local` : from.pkg]
    if ((allowed ?? []).includes(specifier)) {
      return null
    }
    if (localEntries.includes(specifier)) {
      return localFence
    }
    const name = local ? `${from.pkg}/src/local` : from.pkg
    return `${name} may import ${allowed?.length ? allowed.join(' and ') : 'no package'}, not "${specifier}"`
  }
  const target = layerOf(resolve(dirname(file), specifier))
  if (!target || target.pkg !== from.pkg) {
    return `"${specifier}" leaves packages/${from.pkg}/src: import another package by its name`
  }
  if (from.part === 'main') {
    return target.part === 'local' ? localFence : null
  }
  if (from.part === 'local') {
    if (target.part === 'local') {
      return null
    }
    if (from.pkg === 'query-protocol' && protocolBasics.test(target.rest)) {
      return null
    }
    const reach =
      from.pkg === 'query-protocol'
        ? 'protocol/types, protocol/constants, protocol/query and itself'
        : 'itself'
    return `the local evaluator may not import "${specifier}": it reaches only ${reach} (C-75)`
  }
  if (from.part === 'all' || from.part === 'entry') {
    return null
  }
  if (from.part === 'row-changes') {
    return target.part === 'row-changes' ? null : rowChanges
  }
  if (target.part === 'row-changes') {
    return `the ${from.part.replace('feature:', '')} part may not import "${specifier}": the row-change module stands apart (ADR 0011)`
  }
  if (target.part === 'shared') {
    return null
  }
  if (from.part === 'shared') {
    return `shared/ may not import "${specifier}": the plugins build on shared/, not the other way`
  }
  if (target.part !== from.part) {
    const name = from.part.slice('feature:'.length)
    return `the ${name} feature may not import "${specifier}": features talk through shared/ only`
  }
  return null
}

const boundaries = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keeps the v3 layers pointing one way: protocol → core, features → shared/, the local evaluator apart.'
    },
    schema: [],
    messages: {
      layer: '{{reason}} (ADR 0003).',
      dynamic:
        'A dynamic import() or require() must name a literal module, so the layering can be checked.',
      glob: 'import.meta.glob and the other import.meta calls name no module, so the layering cannot be checked: import each module by name.'
    }
  },
  create(context) {
    const file = context.filename
    if (!layerOf(file)) {
      return {}
    }
    const check = (node, source) => {
      if (!source) {
        return
      }
      if (source.type !== 'Literal' || typeof source.value !== 'string') {
        context.report({ node, messageId: 'dynamic' })
        return
      }
      const reason = violation(file, source.value)
      if (reason) {
        context.report({ node, messageId: 'layer', data: { reason } })
      }
    }
    const isImportMeta = node =>
      node?.type === 'MetaProperty' &&
      node.meta.name === 'import' &&
      node.property.name === 'meta'
    return {
      // `require('x')` is an import too, in any form.
      CallExpression: node => {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require'
        ) {
          check(node, node.arguments[0] ?? { type: 'Missing' })
        } else if (
          node.callee.type === 'MemberExpression' &&
          isImportMeta(node.callee.object)
        ) {
          // import.meta.glob(...) names no module: nothing can be checked.
          context.report({ node, messageId: 'glob' })
        }
      },
      // `import x = require('x')`
      TSImportEqualsDeclaration: node => {
        if (node.moduleReference.type === 'TSExternalModuleReference') {
          check(node, node.moduleReference.expression)
        }
      },
      ImportDeclaration: node => check(node, node.source),
      ExportNamedDeclaration: node => check(node, node.source),
      ExportAllDeclaration: node => check(node, node.source),
      ImportExpression: node => check(node, node.source),
      TSImportType: node => check(node, node.source ?? node.argument?.literal)
    }
  }
}

export default { rules: { boundaries } }
