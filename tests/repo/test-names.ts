import ts from 'typescript'

// Reads the test structure of a spec file as a syntax tree, so a title is the
// first argument of a real `describe(`, `it(` or `test(` call (including
// `.each(...)(` and `.only`), and a `describe` is known by the tests inside it.

interface FoundTest {
  /** The title of the `it`/`test` call itself. */
  name: string
  /** Titles of the `describe` blocks around it, outermost first. */
  groups: string[]
}

export interface FoundSuite {
  /** The titles of every `describe`, empty or not. */
  groups: string[]
  /** Runnable tests: `it`/`test` calls that are not `.skip` or `.todo`. */
  tests: FoundTest[]
}

type Kind = 'describe' | 'it' | 'test'

const KINDS = new Set<string>(['describe', 'it', 'test'])
const NOT_RUN = new Set(['skip', 'todo'])

/** `it`, `it.only`, `it.each(rows)` ... -> the call's kind and modifiers. */
const classify = (
  callee: ts.Expression
): { kind: Kind; modifiers: string[] } | null => {
  const modifiers: string[] = []
  let node: ts.Expression = callee
  for (;;) {
    if (ts.isCallExpression(node)) {
      node = node.expression
    } else if (ts.isPropertyAccessExpression(node)) {
      modifiers.push(node.name.text)
      node = node.expression
    } else {
      break
    }
  }
  return ts.isIdentifier(node) && KINDS.has(node.text)
    ? { kind: node.text as Kind, modifiers }
    : null
}

const titleOf = (call: ts.CallExpression): string | null => {
  const [first] = call.arguments
  if (
    first &&
    (ts.isStringLiteralLike(first) || ts.isTemplateExpression(first))
  ) {
    return ts.isStringLiteralLike(first) ? first.text : first.getText()
  }
  return null
}

export const collectSuite = (source: string, fileName = 'x.spec.ts') => {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.ES2022,
    true
  )
  const suite: FoundSuite = { groups: [], tests: [] }

  const visit = (node: ts.Node, groups: string[]) => {
    if (ts.isCallExpression(node)) {
      const found = classify(node.expression)
      const title = found ? titleOf(node) : null
      if (found && title !== null) {
        if (found.kind === 'describe') {
          suite.groups.push(title)
          node.forEachChild(child => visit(child, [...groups, title]))
          return
        }
        if (!found.modifiers.some(modifier => NOT_RUN.has(modifier))) {
          suite.tests.push({ name: title, groups })
        }
      }
    }
    node.forEachChild(child => visit(child, groups))
  }
  visit(file, [])
  return suite
}

/**
 * Every rule ID that a runnable test stands under: in its own title or in the
 * title of a `describe` around it. An empty `describe('C-01 ...')` gives none.
 */
export const coveredIds = (suite: FoundSuite): Set<string> => {
  const ids = new Set<string>()
  for (const test of suite.tests) {
    for (const title of [...test.groups, test.name]) {
      for (const match of title.matchAll(/\bC-\d{2,}\b/g)) {
        ids.add(match[0])
      }
    }
  }
  return ids
}

/** Every rule ID named anywhere in a title, tests and groups alike. */
export const namedIds = (suite: FoundSuite): string[] =>
  [...suite.groups, ...suite.tests.map(test => test.name)].flatMap(title =>
    [...title.matchAll(/\bC-\d{2,}\b/g)].map(match => match[0])
  )

/**
 * Where a rule's behavior comes from: `tanstack` when TanStack does it,
 * configured; `own` when our code does it. A rule may name both (TanStack
 * with an override of ours).
 */
export const ruleSources = ['tanstack', 'own'] as const

const tagPattern = /\[(tanstack|own|[a-z-]+)\]/g

/**
 * The `Source:` line under each `### C-nn` heading of `contract/rules.md`,
 * as written (`Source: tanstack, own` gives both). Rules without one are left
 * out.
 */
export const sourcesOf = (rules: string): Map<string, string[]> => {
  const found = new Map<string, string[]>()
  let current: string | null = null
  for (const line of rules.split(/\r?\n/)) {
    const heading = /^### (C-\d+) /.exec(line)
    if (heading) {
      current = heading[1]
      continue
    }
    const source = /^Source:\s*(.+)$/.exec(line)
    if (current && source) {
      found.set(
        current,
        source[1].split(',').map(part => part.trim().toLowerCase())
      )
    }
  }
  return found
}

/**
 * Every `[tag]` a runnable test carries (in its own title or a `describe`
 * around it), paired with each rule ID it stands under.
 */
export const taggedIds = (
  suite: FoundSuite
): Array<{ id: string; tag: string }> =>
  suite.tests.flatMap(test => {
    const titles = [...test.groups, test.name]
    const tags = titles.flatMap(title =>
      [...title.matchAll(tagPattern)].map(match => match[1])
    )
    const ids = titles.flatMap(title =>
      [...title.matchAll(/\bC-\d{2,}\b/g)].map(match => match[0])
    )
    return ids.flatMap(id => tags.map(tag => ({ id, tag })))
  })
