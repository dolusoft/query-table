import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import { columns, makeQuery, rows, rule } from './helpers'
import { domAttributes, domClasses, domInlineStyle } from '../../contract/dom'
import VueServerTable from '../../src/components/index'
import type { FilterMenuSlotProps, TableQuery } from '../../src/contract'

// C-40: the table renders exactly the classes and attributes of the DOM
// contract, and every entry of the contract shows up in some state. The table
// is rendered bare: its own output only, no consumer styling or slot widgets
// beyond the trigger it hands out.

const slots = {
  'filter-menu': (menu: FilterMenuSlotProps) => h(menu.trigger),
  loader: () => h('span', 'loading'),
  empty: () => h('span', 'nothing'),
  subtable: () => h('b', 'detail'),
  pagination: () => h('span', 'pages')
}

const renderTable = (props: Record<string, unknown>) =>
  render(VueServerTable as never, {
    props: {
      columns: [
        ...columns(),
        { field: 'active', title: 'Active', type: 'bool' }
      ],
      rows: rows(3),
      totalRows: 3,
      query: makeQuery(),
      sortable: true,
      filterable: true,
      ...props
    } as never,
    slots: slots
  })

const filtered: TableQuery = makeQuery({
  sort: { field: 'age', direction: 'desc' },
  filters: [rule('name', 'Contains', 'Name')]
})

/** Every element the table rendered in the current document. */
const rendered = () => [
  ...document.querySelectorAll('.bh-datatable, .bh-datatable *')
]

interface Seen {
  classes: Set<string>
  /** attribute name -> elements that carry it */
  attributes: Map<string, Element[]>
  styled: Element[]
}

const seen: Seen = { classes: new Set(), attributes: new Map(), styled: [] }
const unknownClasses: string[] = []
const unmatchedClasses: string[] = []
const unknownAttributes: string[] = []
const unmatchedAttributes: string[] = []

const knownClass = new Map(domClasses.map(entry => [entry.name, entry]))
const attributeEntries = (name: string) =>
  domAttributes.filter(entry => entry.name === name)

const collect = () => {
  for (const element of rendered()) {
    for (const name of element.classList) {
      if (!name.startsWith('bh-')) {
        unknownClasses.push(`${element.tagName.toLowerCase()}.${name}`)
        continue
      }
      const entry = knownClass.get(name)
      if (!entry) {
        unknownClasses.push(`.${name}`)
        continue
      }
      seen.classes.add(name)
      if (!element.matches(entry.on)) {
        unmatchedClasses.push(
          `.${name} is on ${element.tagName.toLowerCase()}, not ${entry.on}`
        )
      }
    }
    for (const attribute of element.getAttributeNames()) {
      if (attribute === 'class' || attribute === 'style') {
        continue
      }
      const entries = attributeEntries(attribute)
      if (entries.length === 0) {
        // Plain HTML the markup needs (type, title, colspan, aria-*, ...).
        if (attribute.startsWith('data-')) {
          unknownAttributes.push(
            `${element.tagName.toLowerCase()}[${attribute}]`
          )
        }
        continue
      }
      const list = seen.attributes.get(attribute) ?? []
      list.push(element)
      seen.attributes.set(attribute, list)
      if (!entries.some(entry => element.matches(entry.on))) {
        unmatchedAttributes.push(
          `${element.tagName.toLowerCase()}[${attribute}]`
        )
      }
    }
    if (element.hasAttribute('style')) {
      seen.styled.push(element)
    }
  }
}

test('C-40 the rendered DOM matches the DOM contract in every state', async () => {
  // A full table: sorted, filtered, with both utility columns, a footer, an
  // expanded row and a column that defines a width.
  await renderTable({
    hasSubtable: true,
    hasRightPanel: true,
    query: filtered,
    rowKey: 'id',
    columns: [
      { field: 'id', title: 'ID', type: 'number', width: '80px' },
      { field: 'name', title: 'Name' },
      { field: 'age', title: 'Age', type: 'number' },
      { field: 'joined', title: 'Joined', type: 'date' },
      { field: 'active', title: 'Active', type: 'bool', sortable: false }
    ],
    footerRows: [{ cells: [{ field: 'id', text: 'Total' }] }]
  })
  await userEvent.click(document.querySelector('.bh-expand')!)
  collect()
  cleanup()

  await renderTable({ loading: true, rows: [] })
  await expect
    .element(document.querySelector<HTMLElement>('.bh-loader-row'))
    .toBeInTheDocument()
  collect()
  cleanup()

  await renderTable({ rows: [], totalRows: 0 })
  await expect
    .element(document.querySelector<HTMLElement>('.bh-empty-row'))
    .toBeInTheDocument()
  collect()
  cleanup()

  // The rendered DOM uses nothing outside the contract.
  expect(unknownClasses).toEqual([])
  expect(unmatchedClasses).toEqual([])
  expect(unknownAttributes).toEqual([])
  expect(unmatchedAttributes).toEqual([])

  // Every entry of the contract is rendered by some state.
  expect(
    domClasses.map(entry => entry.name).filter(name => !seen.classes.has(name))
  ).toEqual([])
  const attributeNames = [...new Set(domAttributes.map(entry => entry.name))]
  expect(attributeNames.filter(name => !seen.attributes.has(name))).toEqual([])
  // ... including each placement of an attribute listed more than once.
  for (const entry of domAttributes) {
    const elements = seen.attributes.get(entry.name) ?? []
    expect(
      elements.some(element => element.matches(entry.on)),
      `${entry.name} on ${entry.on}`
    ).toBe(true)
  }

  // The one inline style: width on a header cell.
  expect(seen.styled.length).toBeGreaterThan(0)
  for (const element of seen.styled) {
    expect(element.matches(domInlineStyle.on)).toBe(true)
    const style = (element as HTMLElement).style
    expect(style.length).toBe(1)
    expect(style.item(0)).toBe(domInlineStyle.property)
  }
})
