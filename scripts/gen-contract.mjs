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
// It also writes contract/api.json: props, events, slots, the exposed surface,
// the exported functions, the public types and the rules as data, read by the playground (API panels, coverage
// manifest).
//
//   node scripts/gen-contract.mjs           write CONTRACT.md and contract/api.json
//   node scripts/gen-contract.mjs --check   fail when either file is stale
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import ts from 'typescript'
import { parse as parseSfc } from 'vue/compiler-sfc'
import { createChecker } from 'vue-component-meta'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const at = (...parts) => join(root, ...parts)
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

// Node strips the types of this data file on import (Node 22.18+).
const { domAttributes, domClasses, domInlineStyles } = await import(
  pathToFileURL(at('contract', 'dom.ts')).href
)

// ---------------------------------------------------------------------------
// contract.ts: JSDoc and type text of the members of a few declarations
// ---------------------------------------------------------------------------

const contractPath = at('packages', 'vue', 'src', 'contract.ts')
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

const isDeclaredType = statement =>
  ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)

const typeEntry = statement => ({
  name: statement.name.text,
  kind: ts.isInterfaceDeclaration(statement) ? 'interface' : 'type',
  description: docOf(statement)
})

// The query types are the protocol's: contract.ts re-exports them and the
// protocol declares them. They stay in the contract's type list.
const protocolTypesPath = at(
  'packages',
  'query-protocol',
  'src',
  'protocol',
  'types.ts'
)
// `RowsUpdate` is the core's row-change module's (C-92), exported again the
// same way.
const rowChangesTypesPath = at(
  'packages',
  'query-table-core',
  'src',
  'row-changes',
  'tracker.ts'
)
const reexportsOf = (module, path) => {
  const file = ts.createSourceFile(
    path,
    read(path),
    ts.ScriptTarget.ES2022,
    true
  )
  const names = contractFile.statements
    .filter(
      statement =>
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier?.text === module &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
    )
    .flatMap(statement =>
      statement.exportClause.elements.map(element => element.name.text)
    )
  const found = file.statements.filter(
    statement =>
      isDeclaredType(statement) && names.includes(statement.name.text)
  )
  for (const name of names) {
    if (!found.some(statement => statement.name.text === name)) {
      throw new Error(
        `contract.ts re-exports ${name}, which ${relative(root, path)} does not declare`
      )
    }
  }
  return found
}
const reexported = reexportsOf('@dolusoft/query-protocol', protocolTypesPath)
const reexportedCore = reexportsOf(
  '@dolusoft/query-table-core/row-changes',
  rowChangesTypesPath
)

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
const meta = checker.getComponentMeta(
  at('packages', 'vue', 'src', 'query-table.vue')
)

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
const exposed = membersOf('QueryTableExpose')

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
  slots
    // Dynamic slots (`cell-<field>`, `header-<field>`) are not in the meta.
    .filter(slot => !slot.name.endsWith('-<field>'))
    .map(slot => slot.name)
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
  exposedKeysOf(at('packages', 'vue', 'src', 'query-table.vue')),
  exposed.map(item => item.name)
)

// ---------------------------------------------------------------------------
// Functions: the value exports of src/index.ts besides the component
// (`export { name } from './path'`), with signature and JSDoc read from the
// function declaration in the module they come from.
// ---------------------------------------------------------------------------

const functionsOf = indexPath => {
  const indexFile = ts.createSourceFile(
    indexPath,
    read(indexPath),
    ts.ScriptTarget.ES2022,
    true
  )
  return indexFile.statements
    .filter(
      statement =>
        ts.isExportDeclaration(statement) &&
        !statement.isTypeOnly &&
        statement.moduleSpecifier &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
    )
    .flatMap(statement => {
      const modulePath = join(
        dirname(indexPath),
        `${statement.moduleSpecifier.text.replace(/^\.\//, '')}.ts`
      )
      const file = ts.createSourceFile(
        modulePath,
        read(modulePath),
        ts.ScriptTarget.ES2022,
        true
      )
      // Inline type specifiers (`type X`) are types, not functions.
      const values = statement.exportClause.elements.filter(
        element => !element.isTypeOnly
      )
      return values.map(element => {
        const name = (element.propertyName ?? element.name).text
        const found = file.statements.find(
          node => ts.isFunctionDeclaration(node) && node.name?.text === name
        )
        if (!found) {
          throw new Error(
            `${relative(root, indexPath)} exports ${name}, but ${modulePath} declares no function of that name`
          )
        }
        const parameters = found.parameters
          .map(parameter =>
            parameter.initializer
              ? `${parameter.name.getText()}?: ${parameter.type?.getText() ?? 'unknown'}`
              : parameter.getText()
          )
          .join(', ')
        return {
          name: element.name.text,
          type: `(${parameters}) => ${found.type?.getText() ?? 'void'}`.replace(
            /\s+/g,
            ' '
          ),
          description: docOf(found)
        }
      })
    })
}
const functionEntries = [
  at('packages', 'vue', 'src', 'index.ts'),
  at('packages', 'vue', 'src', 'local', 'index.ts')
].map(functionsOf)
const functions = functionEntries.flat()

// ---------------------------------------------------------------------------
// DataTable (`@dolusoft/query-table/data-table`, ADR 0021): its surface is the
// component's with the difference declared in src/data-table/contract.ts
// (C-124); that difference is listed here.
// ---------------------------------------------------------------------------

const dataTablePath = at('packages', 'vue', 'src', 'data-table', 'contract.ts')
const dataTableText = read(dataTablePath)
const dataTableFile = ts.createSourceFile(
  dataTablePath,
  dataTableText,
  ts.ScriptTarget.ES2022,
  true
)
const dataTableDeclaration = name => {
  const found = dataTableFile.statements.find(
    statement => isDeclaredType(statement) && statement.name.text === name
  )
  if (!found) {
    throw new Error(`src/data-table/contract.ts declares no ${name}`)
  }
  return found
}
const dataTableMembersOf = name =>
  dataTableDeclaration(name).members.map(member => ({
    name: nameOf(member),
    type: ts.isMethodSignature(member)
      ? `(${member.parameters.map(parameter => parameter.getText()).join(', ')}) => ${member.type?.getText() ?? 'void'}`
      : (member.type?.getText() ?? 'unknown'),
    required: !member.questionToken,
    description: docOf(member)
  }))
const omittedProps = dataTableDeclaration(
  'DataTableOmittedProp'
).type.types.map(type => type.literal.text)
const dataTable = {
  name: 'DataTable',
  entry: '@dolusoft/query-table/data-table',
  description:
    'Rows held in the page: `useLocalQuery` and `QueryTable` composed (ADR 0021). It takes the surface of `QueryTable` with the props, the left-out props and the slot below (C-124).',
  props: dataTableMembersOf('DataTableProps'),
  omitted: omittedProps,
  // Its events are those of QueryTable: none of its own.
  emits: [],
  slots: dataTableMembersOf('DataTableSlots').map(
    ({ name, type, description }) => ({
      name,
      props: type.replace(/^\(props: (.*)\) => unknown$/, '$1'),
      description
    })
  )
}
const exportedTypesOf = file =>
  file.statements
    .filter(
      statement =>
        isDeclaredType(statement) &&
        statement.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
        )
    )
    .map(typeEntry)
const dataTableTypes = exportedTypesOf(dataTableFile)

// ---------------------------------------------------------------------------
// The cell components (`@dolusoft/query-table/cells`, ADR 0022): their props
// from src/cells/contract.ts, their events and slots as C-128 and C-129 say.
// ---------------------------------------------------------------------------

const cellsPath = at('packages', 'vue', 'src', 'cells', 'contract.ts')
const cellsText = read(cellsPath)
const cellsFile = ts.createSourceFile(
  cellsPath,
  cellsText,
  ts.ScriptTarget.ES2022,
  true
)
const cellPropsOf = name => {
  const found = cellsFile.statements.find(
    statement =>
      ts.isInterfaceDeclaration(statement) && statement.name.text === name
  )
  if (!found) {
    throw new Error(`src/cells/contract.ts declares no ${name}`)
  }
  return found.members.map(member => ({
    name: nameOf(member),
    type: member.type?.getText() ?? 'unknown',
    required: !member.questionToken,
    description: docOf(member)
  }))
}
/**
 * The events of a cell component, read from the `defineEmits` type literal of
 * its SFC (each member with its JSDoc), so the contract follows the source.
 */
const cellEmitsOf = name => {
  const file = `${name.replace(/^Cell/, 'cell-').toLowerCase()}.vue`
  const source = read(at('packages', 'vue', 'src', 'cells', file))
  const block = /defineEmits<\{([\s\S]*?)\}>\(\)/.exec(source)
  if (!block) {
    return []
  }
  return [
    ...block[1].matchAll(/\/\*\*([\s\S]*?)\*\/\s*(\w+):\s*\[([^\]]*)\]/g)
  ].map(([, doc, event, args]) => ({
    name: event,
    type: `[${args.trim()}]`,
    description: doc.replace(/\s*\n\s*\*?\s*/g, ' ').trim()
  }))
}
const cellComponent = (name, propsType, description, cellSlots = []) => ({
  name,
  entry: '@dolusoft/query-table/cells',
  description,
  props: propsType ? cellPropsOf(propsType) : [],
  omitted: [],
  emits: cellEmitsOf(name),
  slots: cellSlots
})
const cellComponents = [
  cellComponent(
    'CellStack',
    'CellStackProps',
    'Two lines: `span.qt-cell-stack` with `.qt-cell-primary` and, when given, `.qt-cell-secondary` (C-128).',
    [
      { name: 'primary', props: '', description: 'Replaces `primary`.' },
      { name: 'secondary', props: '', description: 'Replaces `secondary`.' }
    ]
  ),
  cellComponent(
    'CellCopy',
    'CellCopyProps',
    "A value in `code.qt-cell-copy-text` and `button.qt-cell-copy-button`, named by `labels.copyValue`. A press emits `copy` with the value as a string; the clipboard is the consumer's (C-128, C-129)."
  ),
  cellComponent(
    'CellPreview',
    'CellPreviewProps',
    'A text in `span.qt-cell-preview-text` and `button.qt-cell-preview-button`, named by `labels.previewValue`. A press emits `preview` with the text as a string (C-128, C-129).'
  ),
  cellComponent(
    'CellBadge',
    'CellBadgeProps',
    'A short status: `span.qt-cell-badge` with `data-tone` (C-128).',
    [{ name: 'default', props: '', description: 'Replaces `text`.' }]
  ),
  cellComponent(
    'CellValue',
    'CellValueProps',
    "The value as a cell draws it, or `span.qt-cell-empty` with `labels.emptyValue` for `null`, `undefined` and `''` (C-128, C-129)."
  ),
  cellComponent(
    'CellActions',
    null,
    'The group of actions: `span.qt-cell-actions` around its slot (C-128).',
    [{ name: 'default', props: '', description: 'The `CellAction` buttons.' }]
  ),
  cellComponent(
    'CellAction',
    'CellActionProps',
    'One action: `button.qt-cell-action` with `type="button"` and `data-kind`; attributes and listeners go to the button (C-128).',
    [{ name: 'default', props: '', description: "The button's text." }]
  )
]
const cellsTypes = exportedTypesOf(cellsFile)

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
  '# QueryTable contract',
  '<!-- Generated by scripts/gen-contract.mjs. Do not edit: change src/contract.ts, the component, contract/rules.md or contract/dom.ts and run `pnpm contract:gen`. -->',
  'This is the public contract of `@dolusoft/query-table`: the component surface, the types, the behavior rules and the DOM the component renders. A check or a test is tied to each part; see the end of this file. A behavior rule is traced when a test names its ID. That shows every rule has a test, not that the test covers the rule: traceability is not coverage.',
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
  '### Functions',
  'Exported from the package entry point next to the component.',
  table(
    ['Name', 'Signature', 'Description'],
    functionEntries[0].map(item => [
      code(item.name),
      code(item.type),
      item.description
    ])
  ),
  '### Local evaluation (`@dolusoft/query-table/local`)',
  'Opt-in data-source helpers, separate from the component and the default entry.',
  table(
    ['Name', 'Signature', 'Description'],
    functionEntries[1].map(item => [
      code(item.name),
      code(item.type),
      item.description
    ])
  ),
  '### DataTable (`@dolusoft/query-table/data-table`)',
  `${dataTable.description} Its events and exposed methods are those of \`QueryTable\`. Not taken: ${dataTable.omitted.map(code).join(', ')}.`,
  table(
    ['Prop', 'Type', 'Required', 'Description'],
    dataTable.props.map(prop => [
      code(prop.name),
      code(prop.type),
      prop.required ? 'yes' : '',
      prop.description
    ])
  ),
  table(
    ['Added slot', 'Props', 'Description'],
    dataTable.slots.map(slot => [
      code(slot.name),
      code(slot.props),
      slot.description
    ])
  ),
  '### Cell components (`@dolusoft/query-table/cells`)',
  'Unstyled components for a `cell-<field>` slot or any other place (ADR 0022). Their texts come from the `labels` of the table they sit in (C-129).',
  table(
    ['Component', 'Props', 'Events', 'Description'],
    cellComponents.map(component => [
      code(component.name),
      component.props
        .map(
          prop =>
            `${code(`${prop.name}${prop.required ? '' : '?'}: ${prop.type}`)}`
        )
        .join(', '),
      component.emits
        .map(event => code(`${event.name}: ${event.type}`))
        .join(', '),
      component.description
    ])
  ),
  '## Types',
  'Exported from the package entry point (`packages/vue/src/contract.ts`).',
  '```ts\n' + contractText.trim() + '\n```',
  'Exported from `@dolusoft/query-table/data-table` (`packages/vue/src/data-table/contract.ts`).',
  '```ts\n' + dataTableText.trim() + '\n```',
  'Exported from `@dolusoft/query-table/cells` (`packages/vue/src/cells/contract.ts`).',
  '```ts\n' + cellsText.trim() + '\n```',
  'The query types below are declared by `@dolusoft/query-protocol` (`packages/query-protocol/src/protocol/types.ts`); `contract.ts` exports them again, so they are also exported from this package.',
  '```ts\n' +
    reexported.map(statement => statement.getFullText().trim()).join('\n\n') +
    '\n```',
  'The type below is declared by the row-change module of `@dolusoft/query-table-core` (`packages/query-table-core/src/row-changes/tracker.ts`, C-92); `contract.ts` exports it again.',
  '```ts\n' +
    reexportedCore
      .map(statement => statement.getFullText().trim())
      .join('\n\n') +
    '\n```',
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
  'These are the only inline styles the table writes. A custom property carries data; positioning, layers and backgrounds stay in your CSS.',
  table(
    ['Property', 'Element', 'Description'],
    domInlineStyles.map(entry => [
      code(entry.property),
      code(entry.on),
      entry.description
    ])
  ),
  '## How the contract is kept',
  [
    '- `pnpm contract:check` regenerates this file and fails if it differs, so the component, `packages/vue/src/contract.ts`, the rules and the DOM list cannot change without it.',
    '- `pnpm api:check` compares the built declarations with `etc/query-table.api.md`.',
    '- `pnpm contract:gen` also checks that the keys the component exposes equal the exposed list of `packages/vue/src/contract.ts`.',
    '- `tests/repo/contract-traceability.spec.ts` fails when a rule has no test named after it, or a test names an unknown rule. That is traceability, not coverage: it does not say the test proves the rule.',
    '- The browser tests compare the rendered DOM with the DOM contract and check that the test skin selects only what it lists.'
  ].join('\n')
]

// ---------------------------------------------------------------------------
// contract/api.json: the same surface as data, for the playground's API
// panels and its coverage manifest (apps/playground/manifest.ts)
// ---------------------------------------------------------------------------

// Each `### C-nn Title` heading starts a rule; its text runs to the next one.
const ruleEntries = rules
  .split(/^(?=### C-\d+ )/m)
  .filter(part => part.startsWith('### '))
  .map(part => {
    const [heading, ...body] = part.split('\n')
    const [, id, title] = /^### (C-\d+) (.+)$/.exec(heading)
    return {
      id,
      title: title.trim(),
      text: body
        .join('\n')
        .trim()
        .replace(/\s*\n\s*/g, ' ')
    }
  })

// Every `### ` heading must be a rule the split above parsed: a heading with
// a typo in its ID would otherwise drop out of the rules without an error.
const headingCount = (rules.match(/^### /gm) ?? []).length
if (headingCount !== ruleEntries.length) {
  throw new Error(
    `contract/rules.md has ${headingCount} headings, but ${ruleEntries.length} parse as "### C-nn Title" rules`
  )
}

// The exported types of src/contract.ts, with their JSDoc summary.
const types = [
  ...reexported.map(typeEntry),
  ...reexportedCore.map(typeEntry),
  ...contractFile.statements
    .filter(
      statement =>
        isDeclaredType(statement) &&
        statement.modifiers?.some(
          modifier => modifier.kind === ts.SyntaxKind.ExportKeyword
        )
    )
    .map(typeEntry)
]

const api = {
  $comment:
    'Generated by scripts/gen-contract.mjs (pnpm contract:gen). Do not edit.',
  props: props.map(prop => ({
    name: prop.name,
    type: prop.type,
    required: prop.required,
    default: prop.default ?? null,
    description: prop.description
  })),
  emits: emits.map(({ name, type, description }) => ({
    name,
    type,
    description
  })),
  slots: slots.map(({ name, type, description }) => ({
    name,
    props: type
      .replace(/^\(\(?props: (.*?)\) => unknown\)?$/, '$1')
      .replace(/^\(\) => unknown$/, ''),
    description
  })),
  exposed: exposed.map(({ name, type, description }) => ({
    name,
    type,
    description
  })),
  functions,
  components: [dataTable, ...cellComponents],
  types: [...types, ...dataTableTypes, ...cellsTypes],
  rules: ruleEntries
}

const outputs = [
  {
    target: at('CONTRACT.md'),
    name: 'CONTRACT.md',
    text: sections.join('\n\n') + '\n'
  },
  {
    target: at('contract', 'api.json'),
    name: 'contract/api.json',
    text: JSON.stringify(api, null, 2) + '\n'
  }
]

if (process.argv.includes('--check')) {
  let stale = false
  for (const { target, name, text } of outputs) {
    let current = ''
    try {
      current = read(target)
    } catch {
      // Missing file counts as stale.
    }
    if (current !== text) {
      console.error(
        `${name} is stale. Run \`pnpm contract:gen\` and commit it.`
      )
      stale = true
    } else {
      console.log(`${name} is up to date`)
    }
  }
  if (stale) {
    process.exit(1)
  }
} else {
  for (const { target, name, text } of outputs) {
    writeFileSync(target, text)
    console.log(`wrote ${name}`)
  }
}
