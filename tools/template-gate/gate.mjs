// The template gate: checks of a Vue SFC that oxlint cannot make, because
// oxlint reads only the <script> blocks. One @vue/compiler-sfc parse per file,
// then a walk over the template AST (and the script imports for
// `no-unused-imports`).
//
// A finding can be silenced for the next element only, with a reason:
//   <!-- template-gate-disable-next-line no-v-html -- why -->
// A directive that silences nothing is a finding itself.
import { NodeTypes } from '@vue/compiler-dom'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseScript, parseExpression } from '@babel/parser'

/** Every gate this tool knows, with its message. */
export const gateMessages = {
  'no-v-html':
    'v-html renders raw HTML: an XSS risk. Render text, or justify it with a disable comment.',
  'require-v-for-key': 'An element with v-for needs a :key.',
  'no-v-if-with-v-for':
    'v-if and v-for on the same element: v-if runs first in Vue 3. Filter the list in a computed, or move v-if to a wrapper.',
  'valid-v-model': 'Invalid v-model',
  'no-unused-imports': 'Unused import'
}

const directivePattern =
  /^\s*template-gate-disable-next-line\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s*(?:--\s*(\S.*))?$/

/** An SFC that cannot be parsed: the CLI exits with 2. */
export class GateParseError extends Error {}

const isDirective = (prop, name) =>
  prop.type === NodeTypes.DIRECTIVE && prop.name === name

// Only a bound :key counts: a static key="x" is the same for every row.
const hasKey = element =>
  element.props.some(
    prop =>
      isDirective(prop, 'bind') &&
      prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION &&
      prop.arg.isStatic &&
      prop.arg.content === 'key'
  )

const nativeModelTags = new Set(['input', 'select', 'textarea'])
const nativeModifiers = new Set(['lazy', 'number', 'trim'])

/** The names a v-for declares (`(item, index) in list` -> item, index). */
const vForAliases = prop => {
  const match = /^\s*\(?([^)]*?)\)?\s+(?:in|of)\s+/.exec(
    prop.exp?.content ?? ''
  )
  return match ? (match[1].match(/[A-Za-z_$][\w$]*/g) ?? []) : []
}

/** Why a v-model is invalid, or null. */
const vModelProblem = (element, prop, aliases) => {
  const source = prop.exp?.content?.trim()
  if (!source) {
    return 'v-model needs an expression'
  }
  const isNative = element.tagType === 0 && element.tag !== 'component'
  if (isNative && !nativeModelTags.has(element.tag)) {
    return `v-model is not supported on <${element.tag}>`
  }
  if (isNative && prop.arg) {
    return 'v-model on a native element takes no argument'
  }
  // A component defines its own modifiers; a native element knows three.
  const unknownModifier = isNative
    ? (prop.modifiers ?? [])
        .map(modifier => modifier.content ?? modifier)
        .find(modifier => !nativeModifiers.has(modifier))
    : undefined
  if (unknownModifier) {
    return `v-model has no modifier ".${unknownModifier}" on <${element.tag}>`
  }
  if (
    element.tag === 'input' &&
    element.props.some(
      other =>
        other.type === NodeTypes.ATTRIBUTE &&
        other.name === 'type' &&
        other.value?.content === 'file'
    )
  ) {
    return 'v-model cannot bind <input type="file">'
  }
  let expression
  try {
    expression = parseExpression(source, { plugins: ['typescript'] })
  } catch {
    return `v-model expression "${source}" does not parse`
  }
  while (
    expression.type === 'TSAsExpression' ||
    expression.type === 'TSNonNullExpression' ||
    expression.type === 'TSSatisfiesExpression'
  ) {
    expression = expression.expression
  }
  if (
    expression.type !== 'Identifier' &&
    expression.type !== 'MemberExpression'
  ) {
    return `v-model needs an assignable expression, not "${source}"`
  }
  if (expression.type === 'Identifier' && aliases.has(expression.name)) {
    return `v-model cannot assign the v-for variable "${expression.name}"`
  }
  return null
}

const identifierPattern = /[A-Za-z_$][\w$]*/g
const pascal = name =>
  name.replace(/(?:^|-)([a-z0-9])/g, (_, letter) => letter.toUpperCase())
const camel = name => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())

/**
 * Whether an identifier at `key` of `parent` names something rather than a
 * property: `a.b` and `{ b: 1 }` reference `a` only.
 */
const isReference = (parent, key) => {
  if (!parent) {
    return true
  }
  switch (parent.type) {
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return key !== 'property' || parent.computed
    case 'ObjectProperty':
    case 'ObjectMethod':
    case 'ClassProperty':
    case 'ClassMethod':
    case 'ClassAccessorProperty':
    case 'TSPropertySignature':
    case 'TSMethodSignature':
      return key !== 'key' || parent.computed
    case 'TSQualifiedName':
      return key !== 'right'
    case 'TSEnumMember':
      return key !== 'id'
    case 'LabeledStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return key !== 'label'
    default:
      return true
  }
}

/**
 * Names a Babel AST references outside its import declarations: identifiers
 * in a reference position, not property names or string contents.
 */
const referencedNames = (node, names = new Set(), parent, parentKey) => {
  if (!node || typeof node.type !== 'string') {
    return names
  }
  if (node.type === 'ImportDeclaration') {
    return names
  }
  if (
    (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
    isReference(parent, parentKey)
  ) {
    names.add(node.name)
  }
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    ) {
      continue
    }
    const value = node[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        referencedNames(item, names, node, key)
      }
    } else if (value && typeof value === 'object') {
      referencedNames(value, names, node, key)
    }
  }
  return names
}

/**
 * The names a template expression references. An expression that does not
 * parse (it should not, the compiler accepted it) falls back to a token scan,
 * which may count too much but never too little.
 */
const expressionNames = (source, names) => {
  const options = { plugins: ['typescript'] }
  let ast
  try {
    ast = parseExpression(source, options)
  } catch {
    try {
      // v-on handlers may hold statements: `a++; b()`.
      ast = parseScript(source, options).program
    } catch {
      for (const name of source.match(identifierPattern) ?? []) {
        names.add(name)
      }
      return
    }
  }
  referencedNames(ast, names)
}

/**
 * What a binding pattern (a slot's props, a v-for alias) declares, and the
 * names its default values and computed keys reference. A pattern that does
 * not parse declares nothing and references every token in it.
 */
const patternScope = source => {
  const bound = new Set()
  const references = new Set()
  let params
  try {
    params = parseExpression(`(${source}) => 0`, {
      plugins: ['typescript']
    }).params
  } catch {
    for (const name of source.match(identifierPattern) ?? []) {
      references.add(name)
    }
    return { bound, references }
  }
  const walk = node => {
    switch (node?.type) {
      case 'Identifier':
        bound.add(node.name)
        break
      case 'AssignmentPattern':
        walk(node.left)
        referencedNames(node.right, references)
        break
      case 'ObjectPattern':
        for (const property of node.properties) {
          if (property.type === 'RestElement') {
            walk(property.argument)
            continue
          }
          if (property.computed) {
            referencedNames(property.key, references)
          }
          walk(property.value)
        }
        break
      case 'ArrayPattern':
        node.elements.forEach(walk)
        break
      case 'RestElement':
        walk(node.argument)
        break
      default:
    }
  }
  params.forEach(walk)
  return { bound, references }
}

/**
 * The names a template can reach from the script: the references in its
 * expressions that no slot binding or v-for alias around them shadows,
 * component tags and custom directives (`v-focus` -> `vFocus`).
 */
const templateNames = root => {
  const names = new Set()
  const addFrom = (found, shadowed) => {
    for (const name of found) {
      if (!shadowed.has(name)) {
        names.add(name)
      }
    }
  }
  const expression = (source, shadowed) => {
    const found = new Set()
    expressionNames(source, found)
    addFrom(found, shadowed)
  }
  const walk = (node, shadowed) => {
    if (node.type === NodeTypes.INTERPOLATION) {
      expression(node.content.content ?? '', shadowed)
    }
    let inner = shadowed
    if (node.type === NodeTypes.ELEMENT) {
      names.add(node.tag)
      names.add(pascal(node.tag))
      names.add(camel(node.tag))
      // <Form.Input />: a namespaced component uses its root binding.
      if (node.tag.includes('.')) {
        names.add(node.tag.split('.')[0])
      }
      // v-for aliases cover the element itself; slot props its children.
      let own = shadowed
      const vFor = node.props.find(prop => isDirective(prop, 'for'))
      if (vFor?.exp) {
        const source = vFor.exp.content ?? vFor.exp.loc.source
        const match = /^\s*([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)$/.exec(source)
        if (match) {
          const alias = match[1].replace(/^\(([\s\S]*)\)$/, '$1')
          const scope = patternScope(alias)
          addFrom(scope.references, shadowed)
          expression(match[2], shadowed)
          own = new Set([...shadowed, ...scope.bound])
        } else {
          expression(source, shadowed)
        }
      }
      inner = own
      for (const prop of node.props) {
        if (prop.type !== NodeTypes.DIRECTIVE) {
          continue
        }
        names.add(camel(`v-${prop.name}`))
        if (prop.arg && !prop.arg.isStatic) {
          expression(prop.arg.content ?? '', own)
        }
        if (!prop.exp || prop.name === 'for') {
          continue
        }
        const source = prop.exp.content ?? prop.exp.loc.source
        if (prop.name === 'slot') {
          const scope = patternScope(source)
          addFrom(scope.references, own)
          inner = new Set([...inner, ...scope.bound])
          continue
        }
        expression(source, own)
      }
    }
    for (const child of node.children ?? []) {
      walk(child, inner)
    }
  }
  walk(root, new Set())
  return names
}

/** The import bindings of a script block, at their place in the file. */
const scriptImports = (block, file) => {
  let ast
  try {
    ast = parseScript(block.content, {
      sourceType: 'module',
      plugins: ['typescript', ...(block.lang === 'tsx' ? ['jsx'] : [])]
    })
  } catch (error) {
    throw new GateParseError(
      `${file}: <script> does not parse: ${error.message}`
    )
  }
  const imports = []
  for (const statement of ast.program.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue
    }
    for (const specifier of statement.specifiers) {
      const { line, column } = specifier.local.loc.start
      imports.push({
        name: specifier.local.name,
        line: block.loc.start.line + line - 1,
        column: (line === 1 ? block.loc.start.column - 1 : 0) + column + 1
      })
    }
  }
  return { ast, imports }
}

/**
 * Checks one SFC. Returns findings `{ line, column, gate, message }` (1-based)
 * for the enabled `gates`; throws GateParseError when the file does not parse.
 */
export const checkSfc = (source, file, gates) => {
  const enabled = new Set(gates)
  const { descriptor, errors } = parseSfc(source, { filename: file })
  if (errors.length) {
    const [error] = errors
    const where = error.loc
      ? `:${error.loc.start.line}:${error.loc.start.column}`
      : ''
    throw new GateParseError(`${file}${where}: ${error.message}`)
  }
  const findings = []
  const report = (gate, loc, detail) => {
    if (enabled.has(gate)) {
      findings.push({
        line: loc.start.line,
        column: loc.start.column,
        offset: loc.start.offset,
        gate,
        message: detail
          ? `${gateMessages[gate]}: ${detail}`
          : gateMessages[gate]
      })
    }
  }

  // Disable comments: each covers the next sibling element, by its offsets,
  // so a sibling on the same line stays checked.
  const directives = []
  const template = descriptor.template?.ast
  const visit = (node, aliases) => {
    const children = node.children ?? []
    children.forEach((child, index) => {
      if (child.type === NodeTypes.COMMENT) {
        const match = directivePattern.exec(child.content)
        if (match) {
          const target = children
            .slice(index + 1)
            .find(next => next.type === NodeTypes.ELEMENT)
          directives.push({
            loc: child.loc,
            gates: match[1].split(',').map(gate => gate.trim()),
            reason: match[2],
            from: target?.loc.start.offset ?? -1,
            to: target?.loc.end.offset ?? -1,
            used: false
          })
        }
      }
    })
    if (node.type === NodeTypes.ELEMENT) {
      const vFor = node.props.find(prop => isDirective(prop, 'for'))
      const vIf = node.props.find(prop => isDirective(prop, 'if'))
      const own = new Set(aliases)
      if (vFor) {
        for (const alias of vForAliases(vFor)) {
          own.add(alias)
        }
        // A <template v-for> passes with its own key or with keys on its
        // element children; <slot> outlets take no key.
        const keyed =
          hasKey(node) ||
          (node.tag === 'template' &&
            node.children
              .filter(
                child =>
                  child.type === NodeTypes.ELEMENT && child.tag !== 'slot'
              )
              .every(hasKey))
        if (!keyed && node.tag !== 'slot') {
          report('require-v-for-key', vFor.loc)
        }
        if (vIf) {
          report('no-v-if-with-v-for', vIf.loc)
        }
      }
      for (const prop of node.props) {
        if (isDirective(prop, 'html')) {
          report('no-v-html', prop.loc)
        }
        if (isDirective(prop, 'model')) {
          const problem = vModelProblem(node, prop, own)
          if (problem) {
            report('valid-v-model', prop.loc, problem)
          }
        }
      }
      for (const child of children) {
        visit(child, own)
      }
      return
    }
    for (const child of children) {
      visit(child, aliases)
    }
  }
  if (template) {
    visit(template, new Set())
  }

  if (enabled.has('no-unused-imports')) {
    const used = template ? templateNames(template) : new Set()
    const blocks = [descriptor.script, descriptor.scriptSetup].filter(Boolean)
    const parsed = blocks.map(block => scriptImports(block, file))
    for (const { ast } of parsed) {
      referencedNames(ast.program, used)
    }
    // <script setup generic="T extends Query"> uses imports too.
    const generic = String(descriptor.scriptSetup?.attrs.generic ?? '')
    for (const name of generic.match(identifierPattern) ?? []) {
      used.add(name)
    }
    for (const { imports } of parsed) {
      for (const binding of imports) {
        if (!used.has(binding.name)) {
          findings.push({
            line: binding.line,
            column: binding.column,
            gate: 'no-unused-imports',
            message: `${gateMessages['no-unused-imports']}: "${binding.name}" is used neither in the script nor in the template`
          })
        }
      }
    }
  }

  const kept = findings.filter(finding => {
    const directive = directives.find(
      candidate =>
        candidate.gates.includes(finding.gate) &&
        finding.offset >= candidate.from &&
        finding.offset < candidate.to
    )
    if (directive) {
      directive.used = true
    }
    return !directive
  })
  for (const finding of kept) {
    delete finding.offset
  }
  for (const directive of directives) {
    const problem = !directive.reason
      ? 'a disable comment needs a reason after "--"'
      : directive.gates.some(gate => !(gate in gateMessages))
        ? `unknown gate in "${directive.gates.join(', ')}"`
        : !directive.used
          ? `"${directive.gates.join(', ')}" is disabled but nothing is reported on the next element`
          : null
    if (problem) {
      kept.push({
        line: directive.loc.start.line,
        column: directive.loc.start.column,
        gate: 'disable-directive',
        message: problem
      })
    }
  }
  return kept.sort((a, b) => a.line - b.line || a.column - b.column)
}
