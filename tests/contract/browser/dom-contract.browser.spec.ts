import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import type { FilterMenuSlotProps, TableQuery } from '@dolusoft/query-table'
import QueryTable from '@dolusoft/query-table'

import {
  domAttributes,
  domClasses,
  domInlineStyles
} from '../../../contract/dom'
import { columns, makeQuery, rows, rule } from '../../support/fixtures'

// C-40: the table renders exactly the classes and attributes of the DOM
// contract, and every entry of the contract shows up in some state. The table
// is rendered bare: its own output only, no consumer styling or slot widgets
// beyond the trigger it hands out.

const slots = {
  'filter-menu': (menu: FilterMenuSlotProps) => h(menu.trigger),
  empty: () => h('span', 'nothing'),
  loading: () => h('span', 'loading'),
  subtable: () => h('b', 'detail'),
  pagination: () => h('span', 'pages')
}

const renderTable = (props: Record<string, unknown>) =>
  render(QueryTable as never, {
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
  ...document.querySelectorAll('.qt-datatable, .qt-datatable *')
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
      if (!name.startsWith('qt-')) {
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
    resizable: true,
    columns: [
      { field: 'id', title: 'ID', type: 'number', width: '80px' },
      { field: 'name', title: 'Name', pinned: 'left' },
      { field: 'age', title: 'Age', type: 'number' },
      { field: 'joined', title: 'Joined', type: 'date' },
      { field: 'active', title: 'Active', type: 'bool', sortable: false }
    ],
    footerRows: [{ cells: [{ field: 'id', text: 'Total' }] }]
  })
  await userEvent.click(document.querySelector('.qt-expand')!)
  // The pin offsets are measured after layout.
  await new Promise(resolve => requestAnimationFrame(resolve))
  await new Promise(resolve => requestAnimationFrame(resolve))
  collect()
  cleanup()

  await renderTable({ rows: [], totalRows: 0 })
  await expect
    .element(document.querySelector<HTMLElement>('.qt-empty-row'))
    .toBeInTheDocument()
  collect()
  cleanup()

  // Loading over the rows (C-52).
  await renderTable({ loading: true, hasSubtable: true })
  await expect
    .element(document.querySelector<HTMLElement>('.qt-loading-row'))
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

  // C-31: only the listed inline styles, each on its element, and each one
  // written by some state.
  expect(seen.styled.length).toBeGreaterThan(0)
  const writtenStyles = new Set<string>()
  for (const element of seen.styled) {
    const style = (element as HTMLElement).style
    for (let i = 0; i < style.length; i++) {
      const property = style.item(i)
      const entry = domInlineStyles.find(e => e.property === property)
      expect(entry, `inline ${property}`).toBeDefined()
      expect(element.matches(entry!.on), `${property} on ${entry!.on}`).toBe(
        true
      )
      writtenStyles.add(property)
    }
  }
  expect([...writtenStyles].sort()).toEqual(
    domInlineStyles.map(entry => entry.property).sort()
  )
})
