import { expect } from 'vitest'

import { domAttributes, domClasses, domInlineStyles } from '../../contract/dom'

// Shared by the DOM contract specs (C-40, C-66): collects what the table
// rendered and compares it with `contract/dom.ts`.

/** Every element the table rendered in the current document. */
const rendered = () => [
  ...document.querySelectorAll('.qt-datatable, .qt-datatable *')
]

const knownClass = new Map(domClasses.map(entry => [entry.name, entry]))
const attributeEntries = (name: string) =>
  domAttributes.filter(entry => entry.name === name)

export const createCollector = () => {
  const classes = new Set<string>()
  /** attribute name -> elements that carry it */
  const attributes = new Map<string, Element[]>()
  const styled: Element[] = []
  const unknownClasses: string[] = []
  const unmatchedClasses: string[] = []
  const unknownAttributes: string[] = []
  const unmatchedAttributes: string[] = []

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
        classes.add(name)
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
        const list = attributes.get(attribute) ?? []
        list.push(element)
        attributes.set(attribute, list)
        if (!entries.some(entry => element.matches(entry.on))) {
          unmatchedAttributes.push(
            `${element.tagName.toLowerCase()}[${attribute}]`
          )
        }
      }
      if (element.hasAttribute('style')) {
        styled.push(element)
      }
    }
  }

  /** The rendered DOM uses nothing outside the contract. */
  const expectNothingOutsideContract = () => {
    expect(unknownClasses).toEqual([])
    expect(unmatchedClasses).toEqual([])
    expect(unknownAttributes).toEqual([])
    expect(unmatchedAttributes).toEqual([])
  }

  /**
   * Every entry that `include` accepts is rendered by some state, each
   * placement of an attribute listed more than once included.
   */
  const expectEntriesRendered = (
    include: (entry: { addedBy?: string }) => boolean
  ) => {
    expect(
      domClasses
        .filter(include)
        .map(entry => entry.name)
        .filter(name => !classes.has(name))
    ).toEqual([])
    const wanted = domAttributes.filter(include)
    const names = [...new Set(wanted.map(entry => entry.name))]
    expect(names.filter(name => !attributes.has(name))).toEqual([])
    for (const entry of wanted) {
      const elements = attributes.get(entry.name) ?? []
      expect(
        elements.some(element => element.matches(entry.on)),
        `${entry.name} on ${entry.on}`
      ).toBe(true)
    }
  }

  /**
   * C-31: only the listed inline styles, each on its element, and each one
   * written by some state.
   */
  const expectInlineStyles = () => {
    expect(styled.length).toBeGreaterThan(0)
    const written = new Set<string>()
    for (const element of styled) {
      const style = (element as HTMLElement).style
      for (let i = 0; i < style.length; i++) {
        const property = style.item(i)
        const entry = domInlineStyles.find(e => e.property === property)
        expect(entry, `inline ${property}`).toBeDefined()
        expect(element.matches(entry!.on), `${property} on ${entry!.on}`).toBe(
          true
        )
        written.add(property)
      }
    }
    expect([...written].sort()).toEqual(
      domInlineStyles.map(entry => entry.property).sort()
    )
  }

  return {
    collect,
    expectNothingOutsideContract,
    expectEntriesRendered,
    expectInlineStyles
  }
}
