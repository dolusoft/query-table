// A local ESLint plugin for the layering of the v3 packages (ADR 0003,
// PRINCIPLES P11, P14). `layers/boundaries` checks every module specifier of
// a file in packages/*/src: imports, `export ... from` re-exports, dynamic
// `import()`, `require()` and `import x = require()`, which must name a
// literal. `import.meta.glob` (and any `import.meta` call) is refused.
//
//   protocol  packages/query-protocol/src          imports nothing outside itself
//   core      packages/query-table-core/src        the protocol and @tanstack/table-core only
//     shared/                                      shared/ only (and the two packages)
//     features/<a>/                                features/<a>/ and shared/, never features/<b>/
//     the entry files (src/*.ts)                   anything in core
import { dirname, posix, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** Bare specifiers each package may import. */
const allowedPackages = {
  'query-protocol': [],
  'query-table-core': ['@dolusoft/query-protocol', '@tanstack/table-core']
}

const toPosix = path => path.split(sep).join(posix.sep)

/**
 * Where a file sits: its package, and inside query-table-core its part
 * (`shared`, `feature:<name>` or `entry`). `null` outside packages/*\/src.
 */
export const layerOf = file => {
  const path = toPosix(relative(root, resolve(file)))
  const match = /^packages\/([^/]+)\/src\/(.+)$/.exec(path)
  if (!match) {
    return null
  }
  const [, pkg, rest] = match
  if (pkg !== 'query-table-core') {
    return { pkg, part: 'all' }
  }
  if (/^shared(\/|$)/.test(rest)) {
    return { pkg, part: 'shared' }
  }
  const feature = /^features\/([^/]+)(\/|$)/.exec(rest)
  if (feature) {
    return { pkg, part: `feature:${feature[1]}` }
  }
  return { pkg, part: 'entry' }
}

const isBare = specifier =>
  !specifier.startsWith('.') && !specifier.startsWith('/')

/** Why `specifier` may not be imported from `file`, or `null`. */
export const violation = (file, specifier) => {
  const from = layerOf(file)
  if (!from) {
    return null
  }
  if (isBare(specifier)) {
    const allowed = allowedPackages[from.pkg] ?? []
    const ok = allowed.some(
      name => specifier === name || specifier.startsWith(`${name}/`)
    )
    return ok
      ? null
      : `${from.pkg} may import ${allowed.length ? allowed.join(' and ') : 'no package'}, not "${specifier}"`
  }
  const target = layerOf(resolve(dirname(file), specifier))
  if (!target || target.pkg !== from.pkg) {
    return `"${specifier}" leaves packages/${from.pkg}/src: import another package by its name`
  }
  if (from.part === 'all' || from.part === 'entry') {
    return null
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
        'Keeps the v3 layers pointing one way: protocol → core, features → shared/.'
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
