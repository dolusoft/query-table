import { describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { renderTable, rule, shot, sleep } from '../support/helpers'

// Operator shortcuts typed into a text column's header filter (`*foo*`,
// `foo*`, `!foo`), with real keystrokes in a real browser.
//
// The table parses the shortcut into clean rules and keeps the typed text in
// the input: nothing is wiped, and the query never holds an operator.

// Keys arrive a few milliseconds apart; the debounce leaves room for a slow
// machine and the wait outlasts it.
const DEBOUNCE = 300
const WAIT = DEBOUNCE * 3

const typeTracking = async (
  input: ReturnType<Awaited<ReturnType<typeof renderTable>>['filterInput']>,
  text: string
) => {
  const el = input.element() as HTMLInputElement
  const afterEachKey: string[] = []
  await userEvent.click(input)
  for (const ch of text) {
    await userEvent.keyboard(ch)
    afterEachKey.push(el.value)
  }
  return { el, afterEachKey }
}

describe('C-15 operator shortcuts typed into the header filter', () => {
  test.each([
    ['*foo*', 'Contains'],
    ['foo*', 'StartsWith'],
    ['*foo', 'EndsWith'],
    ['!foo', 'NotEqual'],
    ['!*foo*', 'NotContains']
  ] as const)(
    '%s stays in the input and is applied once as %s',
    async (text, condition) => {
      const { filterInput, updates } = await renderTable({
        filterDebounce: DEBOUNCE
      })
      const { el, afterEachKey } = await typeTracking(filterInput('name'), text)
      // No keystroke wipes or rewrites the input.
      expect(afterEachKey).toEqual(
        [...text].map((_, i) => text.slice(0, i + 1))
      )
      await sleep(WAIT)
      expect(el.value).toBe(text)
      expect(updates).toHaveLength(1)
      expect(updates[0].reason).toBe('filter')
      expect(updates[0].query.filters).toEqual([rule('name', condition, 'foo')])
      await shot(`operator-shortcut-${condition.toLowerCase()}`)
    }
  )

  test('foo, a pause past the debounce, then *: the input keeps its text and the second rule follows', async () => {
    const { filterInput, updates } = await renderTable({
      filterDebounce: DEBOUNCE
    })
    const { el } = await typeTracking(filterInput('name'), 'foo')
    // The pause is built in: `*` is typed only once the debounce has applied
    // `foo`, however long that takes. Keys that arrive slowly may make more
    // than one update on the way, so the test looks at what was applied last,
    // not at how many updates there were.
    await expect
      .poll(() => updates.at(-1)?.query.filters)
      .toEqual([rule('name', 'Contains', 'foo')])
    const beforeStar = updates.length
    await userEvent.keyboard('*')
    await expect
      .poll(() => updates.at(-1)?.query.filters)
      .toEqual([rule('name', 'StartsWith', 'foo')])
    expect(el.value).toBe('foo*')
    // The star came after the applied `foo`: it made a new update.
    expect(updates.length).toBeGreaterThan(beforeStar)
    // The text with its operator never reaches the query.
    expect(JSON.stringify(updates.map(update => update.query))).not.toContain(
      '*'
    )
    // Nothing more follows once the debounce has run out.
    const settled = updates.length
    await sleep(WAIT)
    expect(updates).toHaveLength(settled)
    expect(el.value).toBe('foo*')
  })

  test('pasting the whole shortcut at once works the same way', async () => {
    const { filterInput, updates } = await renderTable({
      filterDebounce: DEBOUNCE
    })
    const input = filterInput('name')
    await userEvent.fill(input, '*foo*')
    await sleep(WAIT)
    expect((input.element() as HTMLInputElement).value).toBe('*foo*')
    expect(updates).toHaveLength(1)
    expect(updates[0].query.filters).toEqual([rule('name', 'Contains', 'foo')])
  })

  test('a list of shortcuts makes one rule each and stays as typed', async () => {
    const { filterInput, updates } = await renderTable({
      filterDebounce: DEBOUNCE
    })
    const { el } = await typeTracking(filterInput('name'), '!*ads*,vimeo*')
    await sleep(WAIT)
    expect(el.value).toBe('!*ads*,vimeo*')
    expect(updates.at(-1)!.query.filters).toEqual([
      rule('name', 'NotContains', 'ads'),
      rule('name', 'StartsWith', 'vimeo')
    ])
  })
})
