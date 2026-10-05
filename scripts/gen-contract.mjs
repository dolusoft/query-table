// Generates CONTRACT.md from the code:
//   - props, events and slots of the component, read with vue-component-meta
//     (types, defaults and JSDoc as the TypeScript checker sees them);
//   - the exposed surface, read from the `defineExpose` object literal in the
//     component source and compared with the contract;
//   - events, slots and the exposed surface again from src/contract.ts, where
//     vue-component-meta leaves descriptions out, cross-checked against the
//     component so the two cannot drift apart;
//   - every public type, verbatim from src/contract.ts;
//   - the behavior rules (contract/rules.md) and the DOM contract
//     (contract/dom.ts).
//
//   node scripts/gen-contract.mjs           write CONTRACT.md
//   node scripts/gen-contract.mjs --check   fail when CONTRACT.md is stale
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import ts from 'typescript'
import { parse as parseSfc } from 'vue/compiler-sfc'
import { createChecker } from 'vue-component-meta'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const at = (...parts) => join(root, ...parts)
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

// Node strips the types of this data file on import (Node 22.18+).
const { domAttributes, domClasses, domInlineStyle } = await import(
  pathToFileURL(at('contract', 'dom.ts')).href
)

// ---------------------------------------------------------------------------
// contract.ts: JSDoc and type text of the members of a few declarations
// ---------------------------------------------------------------------------

const contractPath = at('src', 'contract.ts')
const contractText = read(contractPath)
const contractFile = ts.createSourceFile(
  contractPath,
  contractText,
  ts.ScriptTarget.ES2022,
  true
)

const docOf = node => {
  const doc = node.jsDoc?.at(-1)
  return doc?.comment ? (ts.getTextOfJSDocComment(doc.comment) ?? '') : ''
}

const nameOf = member => {
  if (member.name) {
    return ts.isStringLiteral(member.name)
      ? member.name.text
      : member.name.getText()
  }
  // Index signature: `[key: `cell-${string}`]`.
  const key = member.parameters?.[0]?.type
  return key
    ? key.getText().replace(/^`|`$/g, '').replace('${string}', '<field>')
    : '?'
}

const declaration = name => {
  const found = contractFile.statements.find(
    statement =>
      (ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === name
  )
  if (!found) {
    throw new Error(`contract.ts has no declaration named ${name}`)
  }
  return found
}

const membersOf = name => {
  const node = declaration(name)
  const members = ts.isInterfaceDeclaration(node)
    ? node.members
    : node.type.members
  return members.map(member => {
    let type
    if (ts.isMethodSignature(member)) {
      const parameters = member.parameters.map(p => p.getText()).join(', ')
      type = `(${parameters}) => ${member.type?.getText() ?? 'void'}`
    } else if (ts.isIndexSignatureDeclaration(member)) {
      type = member.type.getText()
    } else {
      type = member.type?.getText() ?? ''
    }
    return {
      name: nameOf(member),
      type: type.replace(/\s+/g, ' ').replace(/ \| undefined$/, ''),
      description: docOf(member)
    }
  })
}

// ---------------------------------------------------------------------------
// vue-component-meta
// ---------------------------------------------------------------------------

const checker = createChecker(at('tsconfig.json'), {
  forceUseTs: true,
  schema: { ignore: [] }
})
const meta = checker.getComponentMeta(at('src', 'vue-server-table.vue'))

const props = meta.props
  .filter(prop => !prop.global)
  .map(prop => ({
    name: prop.name,
    type: prop.type.replace(/ \| undefined$/, ''),
    required: prop.required,
    default: prop.default,
    description: prop.description
  }))

const emits = membersOf('TableEmits')
const slots = membersOf('TableSlots')
const exposed = membersOf('VueServerTableExpose')

// The component and the contract file must describe the same surface.
const sameSet = (what, fromComponent, fromContract) => {
  const a = [...fromComponent].sort().join(', ')
  const b = [...fromContract].sort().join(', ')
  if (a !== b) {
    throw new Error(
      `${what} differ between the component and src/contract.ts:\n  component: ${a}\n  contract:  ${b}`
    )
  }
}
sameSet(
  'Events',
  meta.events.map(event => event.name),
  emits.map(event => event.name)
)
sameSet(
  'Slots',
  meta.slots.map(slot => slot.name),
  slots.filter(slot => !slot.name.startsWith('cell-')).map(slot => slot.name)
)
sameSet(
  'Props',
  props.map(prop => prop.name),
  membersOf('TableProps').map(prop => prop.name)
)

// The exposed surface is read from the component source: the keys of the
// object literal handed to `defineExpose` (directly or through a variable).
// vue-component-meta cannot report it for a generic component, and the types
// alone would not catch a key added to the literal by a cast.
const exposedKeysOf = path => {
  const { descriptor } = parseSfc(read(path))
  const setup = descriptor.scriptSetup
  if (!setup) {
    throw new Error(`${path} has no <script setup>`)
  }
  const file = ts.createSourceFile(
    'setup.ts',
    setup.content,
    ts.ScriptTarget.ES2022,
    true
  )
  const calls = []
  const declared = new Map()
  const visit = node => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineExpose'
    ) {
      calls.push(node)
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declared.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (calls.length !== 1) {
    throw new Error(
      `${path} must call defineExpose exactly once, found ${calls.length}`
    )
  }
  let [argument] = calls[0].arguments
  if (argument && ts.isIdentifier(argument)) {
    argument = declared.get(argument.text)
  }
  while (
    argument &&
    (ts.isAsExpression(argument) || ts.isSatisfiesExpression(argument))
  ) {
    argument = argument.expression
  }
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    throw new Error(`${path}: defineExpose must receive an object literal`)
  }
  return argument.properties.map(property => {
    if (!property.name) {
      throw new Error(`${path}: defineExpose has a spread or an unnamed member`)
    }
    return property.name.getText()
  })
}
sameSet(
  'Exposed keys',
  exposedKeysOf(at('src', 'vue-server-table.vue')),
  exposed.map(item => item.name)
)

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const cell = text =>
  String(text ?? '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
const code = text => (text ? `\`${String(text).replace(/`/g, "'")}\`` : '')

const table = (headers, rows) =>
  [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(cell).join(' | ')} |`)
  ].join('\n')

const rules = read(at('contract', 'rules.md')).trim()

const sections = [
  '# VueServerTable contract',
  '<!-- Generated by scripts/gen-contract.mjs. Do not edit: change src/contract.ts, the component, contract/rules.md or contract/dom.ts and run `pnpm contract:gen`. -->',
  'This is the public contract of `@dolusoft/vue-server-table`: the component surface, the types, the behavior rules and the DOM the component renders. A check or a test is tied to each part; see the end of this file. A behavior rule is traced when a test names its ID. That shows every rule has a test, not that the test covers the rule: traceability is not coverage.',
  '## Component',
  '### Props',
  table(
    ['Name', 'Type', 'Required', 'Default', 'Description'],
    props.map(prop => [
      code(prop.name),
      code(prop.type),
      prop.required ? 'yes' : '',
      code(prop.default),
      prop.description
    ])
  ),
  '### Events',
  table(
    ['Name', 'Arguments', 'Description'],
    emits.map(event => [code(event.name), code(event.type), event.description])
  ),
  '### Slots',
  table(
    ['Name', 'Props', 'Description'],
    slots.map(slot => [
      code(slot.name),
      code(
        slot.type
          .replace(/^\(props: (.*)\) => unknown$/, '$1')
          .replace(/^\(\) => unknown$/, 'none')
      ),
      slot.description
    ])
  ),
  '### Exposed',
  table(
    ['Name', 'Signature', 'Description'],
    exposed.map(item => [code(item.name), code(item.type), item.description])
  ),
  '## Types',
  'Exported from the package entry point (`src/contract.ts`).',
  '```ts\n' + contractText.trim() + '\n```',
  '## Behavior rules',
  rules.replace(/^### /gm, '#### '),
  '## DOM contract',
  'The classes and attributes below are the only hooks a skin can select. The table writes no stylesheet.',
  '### Classes',
  table(
    ['Class', 'Element', 'Description'],
    domClasses.map(entry => [
      code(entry.name),
      code(entry.on),
      entry.description
    ])
  ),
  '### Attributes',
  table(
    ['Attribute', 'Element', 'Description'],
    domAttributes.map(entry => [
      code(entry.name),
      code(entry.on),
      entry.description
    ])
  ),
  '### Inline style',
  `The only inline style is \`${domInlineStyle.property}\` on \`${domInlineStyle.on}\`: ${domInlineStyle.description}`,
  '## How the contract is kept',
  [
    '- `pnpm contract:check` regenerates this file and fails if it differs, so the component, `src/contract.ts`, the rules and the DOM list cannot change without it.',
    '- `pnpm api:check` compares the built declarations with `etc/vue-server-table.api.md`.',
    '- `pnpm contract:gen` also checks that the keys the component exposes equal the exposed list of `src/contract.ts`.',
    '- `tests/contract/contract-traceability.spec.ts` fails when a rule has no test named after it, or a test names an unknown rule. That is traceability, not coverage: it does not say the test proves the rule.',
    '- The browser tests compare the rendered DOM with the DOM contract and check that the test skin selects only what it lists.'
  ].join('\n')
]

const output = sections.join('\n\n') + '\n'
const target = at('CONTRACT.md')

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = read(target)
  } catch {
    // Missing file counts as stale.
  }
  if (current !== output) {
    console.error(
      'CONTRACT.md is stale. Run `pnpm contract:gen` and commit it.'
    )
    process.exit(1)
  }
  console.log('CONTRACT.md is up to date')
} else {
  writeFileSync(target, output)
  console.log('wrote CONTRACT.md')
}
