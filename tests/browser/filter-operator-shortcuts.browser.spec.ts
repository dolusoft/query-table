import { describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { renderTable, shot, sleep } from './helpers'

// Operator shortcuts typed into a text column's header filter (`*foo*`,
// `foo*`, `!foo`), with real keystrokes in a real browser.
//
// What happens today: the keystroke that makes the parser detect an operator
// (`*` or `!`) writes `column.condition` synchronously. The header's "external
// column value" watch sees that change, compares `column.value` (still the
// last emitted value, '' at first) with the input, decides the value was set
// from outside and copies it back into the input. The input loses its text
// and the pending debounce is cancelled, so nothing is emitted for it.
//
// The `current behavior` tests pin that down keystroke by keystroke. The
// `expected` tests describe the correct behavior and are marked `test.fails`:
// they pass while the bug exists and start failing (and must be flipped to
// plain `test`) once it is fixed, together with the `current behavior` block.

const DEBOUNCE = 100

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

describe('operator shortcuts typed into the header filter', () => {
  describe('current behavior (bug)', () => {
    test('*foo*: each star wipes the input, nothing is emitted', async () => {
      const { filterInput, changes } = await renderTable()
      const { el, afterEachKey } = await typeTracking(
        filterInput('name'),
        '*foo*'
      )
      expect(afterEachKey).toEqual(['', 'f', 'fo', 'foo', ''])
      await sleep(DEBOUNCE * 3)
      expect(el.value).toBe('')
      expect(changes).toHaveLength(0)
      await shot('operator-shortcut-star-foo-star')
    })

    test('foo*: the trailing star wipes the input, nothing is emitted', async () => {
      const { filterInput, changes } = await renderTable()
      const { el, afterEachKey } = await typeTracking(
        filterInput('name'),
        'foo*'
      )
      expect(afterEachKey).toEqual(['f', 'fo', 'foo', ''])
      await sleep(DEBOUNCE * 3)
      expect(el.value).toBe('')
      expect(changes).toHaveLength(0)
    })

    test('!foo: the bang is swallowed, "foo" is emitted with a stale NotEqual', async () => {
      const { filterInput, filterOf, changes } = await renderTable()
      const { el, afterEachKey } = await typeTracking(
        filterInput('name'),
        '!foo'
      )
      expect(afterEachKey).toEqual(['', 'f', 'fo', 'foo'])
      await sleep(DEBOUNCE * 3)
      expect(el.value).toBe('foo')
      expect(changes).toHaveLength(1)
      // The condition left behind by the swallowed "!" happens to match the
      // intent, but the input shows "foo" and no parsed rules are sent.
      expect(filterOf(changes[0], 'name')).toMatchObject({
        value: 'foo',
        condition: 'NotEqual'
      })
      expect(filterOf(changes[0], 'name').parsedFilterRules).toBeUndefined()
    })

    test('foo, pause past the debounce, then *: input snaps back to "foo"', async () => {
      const { filterInput, filterOf, changes } = await renderTable()
      const { el } = await typeTracking(filterInput('name'), 'foo')
      await sleep(DEBOUNCE * 3)
      expect(changes).toHaveLength(1)
      expect(filterOf(changes[0], 'name')).toMatchObject({
        value: 'foo',
        condition: 'Contains'
      })
      await userEvent.keyboard('*')
      await sleep(DEBOUNCE * 3)
      // The star flips the condition, the sync watch restores the last
      // emitted value, and the StartsWith filter is never sent.
      expect(el.value).toBe('foo')
      expect(changes).toHaveLength(1)
    })

    test('pasting the whole shortcut at once is wiped the same way', async () => {
      const { filterInput, changes } = await renderTable()
      const input = filterInput('name')
      await userEvent.fill(input, '*foo*')
      await sleep(DEBOUNCE * 3)
      expect((input.element() as HTMLInputElement).value).toBe('')
      expect(changes).toHaveLength(0)
    })
  })

  describe('expected', () => {
    test.fails.each([
      ['*foo*', 'Contains'],
      ['foo*', 'StartsWith'],
      ['!foo', 'NotEqual']
    ])(
      '%s stays in the input and is emitted once as %s',
      async (text, condition) => {
        const { filterInput, filterOf, changes } = await renderTable()
        const { el } = await typeTracking(filterInput('name'), text)
        await sleep(DEBOUNCE * 3)
        expect(el.value).toBe(text)
        expect(changes).toHaveLength(1)
        expect(filterOf(changes[0], 'name')).toMatchObject({
          value: text,
          condition,
          parsedFilterRules: [{ value: 'foo', condition }]
        })
      }
    )
  })
})
