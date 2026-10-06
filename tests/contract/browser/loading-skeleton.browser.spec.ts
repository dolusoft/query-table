import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import '../../../apps/playground/playground.css'
import LoadingSkeleton from '../../../apps/playground/examples/LoadingSkeleton.vue'

// The "Loading & skeleton" page: the skeleton is the consumer's markup in
// placeholder rows; the table itself only reports `loading`.

const section = (name: string) =>
  document.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!
const bars = (name: string) =>
  section(name).querySelectorAll('[data-slot="skeleton"]').length
const bodyRows = (name: string) => [
  ...section(name).querySelectorAll<HTMLElement>('tbody > tr')
]
const names = (name: string) =>
  bodyRows(name).map(row => row.children[1]?.textContent?.trim())
const root = (name: string) =>
  section(name).querySelector<HTMLElement>('.qt-datatable')!

// A short server delay, and a new request on both tables: it replaces the
// ones the page sent on mount with the default delay, so no test waits 1.5 s.
const fast = async () => {
  await userEvent.selectOptions(
    page.getByRole('combobox', { name: 'Server delay' }),
    '300'
  )
  await userEvent.click(page.getByRole('button', { name: 'Reload' }))
  await userEvent.click(page.getByRole('button', { name: 'Load from empty' }))
}

test('the first load shows one skeleton row per row of the page, as tall as the people that replace them', async () => {
  await render(LoadingSkeleton)
  await fast()
  expect(root('First load').hasAttribute('data-loading')).toBe(true)
  expect(root('First load').getAttribute('aria-busy')).toBe('true')
  expect(bodyRows('First load')).toHaveLength(5)
  // Six columns, five rows; the cells hold bars and no text.
  expect(bars('First load')).toBe(30)
  expect(bodyRows('First load')[0].textContent?.trim()).toBe('')
  const heights = () =>
    bodyRows('First load').map(row =>
      Math.round(row.getBoundingClientRect().height)
    )
  const skeleton = heights()
  await expect.poll(() => bars('First load'), { timeout: 3000 }).toBe(0)
  expect(root('First load').hasAttribute('data-loading')).toBe(false)
  expect(names('First load')).toEqual([
    'Charlie',
    'Alice',
    'Bob',
    'Dave',
    'Eve'
  ])
  // Nothing moves when the people arrive.
  expect(heights()).toEqual(skeleton)
})

test('a refetch keeps the rows and dims them; the skeleton option swaps them', async () => {
  await render(LoadingSkeleton)
  await fast()
  await expect.poll(() => bars('Refetch'), { timeout: 3000 }).toBe(0)
  const before = names('Refetch')
  expect(before).toHaveLength(5)

  await userEvent.click(page.getByRole('button', { name: 'Reload' }))
  expect(root('Refetch').hasAttribute('data-loading')).toBe(true)
  expect(names('Refetch')).toEqual(before)
  expect(bars('Refetch')).toBe(0)
  await expect
    .poll(
      () => getComputedStyle(section('Refetch').querySelector('tbody')!).opacity
    )
    .toBe('0.6')
  await expect
    .poll(() => root('Refetch').hasAttribute('data-loading'), { timeout: 3000 })
    .toBe(false)

  await userEvent.selectOptions(
    page.getByRole('combobox', { name: 'While refetching' }),
    'skeleton'
  )
  await userEvent.click(page.getByRole('button', { name: 'Reload' }))
  expect(bars('Refetch')).toBe(30)
  await expect.poll(() => bars('Refetch'), { timeout: 3000 }).toBe(0)
  expect(names('Refetch')).toEqual(before)
})

test('keep loading on holds the skeleton of both tables', async () => {
  await render(LoadingSkeleton)
  await fast()
  await expect.poll(() => bars('Refetch'), { timeout: 3000 }).toBe(0)
  await userEvent.click(page.getByRole('checkbox', { name: 'Keep loading on' }))
  expect(bars('First load')).toBe(30)
  expect(root('Refetch').getAttribute('aria-busy')).toBe('true')
  // Rows of the second table stay, dimmed, in the default refetch style.
  expect(names('Refetch')).toHaveLength(5)
  await userEvent.click(page.getByRole('checkbox', { name: 'Keep loading on' }))
  expect(bars('First load')).toBe(0)
  expect(root('First load').hasAttribute('data-loading')).toBe(false)
})

test('on a phone the skeleton table scrolls inside its box and the page does not', async () => {
  await page.viewport(375, 812)
  await render(LoadingSkeleton)
  await userEvent.click(page.getByRole('checkbox', { name: 'Keep loading on' }))
  expect(bars('First load')).toBe(30)
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375)
})
