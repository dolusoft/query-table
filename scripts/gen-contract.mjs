// Generates CONTRACT.md from the code:
//   - props, events and slots of the component, read with vue-component-meta
//     (types, defaults and JSDoc as the TypeScript checker sees them);
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
  return doc?.comment ? ts.getTextOfJSDocComment(doc.comment) ?? '' : ''
}

const nameOf = member => {
  if (member.name) {
    return ts.isStringLiteral(member.name)
      ? member.name.text
      : member.name.getText()
  }
  // Index signature: `[key: `cell-${string}`]`.
  const key = member.parameters?.[0]?.type
  return key ? key.getText().replace(/^`|`$/g, '').replace('${string}', '<field>') : '?'
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
const meta = checker.getComponentMeta(at('src', 'components', 'custom-table.vue'))

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
  `<!-- Generated by scripts/gen-contract.mjs. Do not edit: change src/contract.ts, the component, contract/rules.md or contract/dom.ts and run \`pnpm contract:gen\`. -->`,
  'This is the public contract of `@dolusoft/vue-server-table`: the component surface, the types, the behavior rules and the DOM the component renders. A test or a check covers each part; see the end of this file.',
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
      code(slot.type.replace(/^\(props: (.*)\) => unknown$/, '$1').replace(/^\(\) => unknown$/, 'none')),
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
    domClasses.map(entry => [code(entry.name), code(entry.on), entry.description])
  ),
  '### Attributes',
  table(
    ['Attribute', 'Element', 'Description'],
    domAttributes.map(entry => [code(entry.name), code(entry.on), entry.description])
  ),
  '### Inline style',
  `The only inline style is \`${domInlineStyle.property}\` on \`${domInlineStyle.on}\`: ${domInlineStyle.description}`,
  '## How the contract is kept',
  [
    '- `pnpm contract:check` regenerates this file and fails if it differs, so the component, `src/contract.ts`, the rules and the DOM list cannot change without it.',
    '- `pnpm api:check` compares the built declarations with `etc/vue-server-table.api.md`.',
    '- `tests/contract-traceability.spec.ts` fails when a rule has no test named after it, or a test names an unknown rule.',
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
    console.error('CONTRACT.md is stale. Run `pnpm contract:gen` and commit it.')
    process.exit(1)
  }
  console.log('CONTRACT.md is up to date')
} else {
  writeFileSync(target, output)
  console.log('wrote CONTRACT.md')
}
