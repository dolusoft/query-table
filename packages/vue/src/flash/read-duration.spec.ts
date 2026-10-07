import { describe, expect, it } from 'vitest'

import { parseDuration, readDuration } from './read-duration'

describe('flash duration', () => {
  it.each([
    ['500ms', 500],
    [' 2000ms ', 2000],
    ['2s', 2000],
    ['.5s', 500],
    ['1.5S', 1500],
    ['1e3ms', 1000],
    ['0ms', 0],
    ['0s', 0],
    ['-5ms', 0],
    ['500', 0],
    ['calc(1s * 2)', 0],
    ['', 0],
    ['fast', 0]
  ])('reads %j as %d ms', (text, ms) => {
    expect(parseDuration(text)).toBe(ms)
  })

  // Inheritance from above the root needs a real browser (happy-dom does not
  // inherit custom properties): flash.browser.spec.ts.
  it('reads the property on the table root', () => {
    const outer = document.createElement('div')
    outer.innerHTML =
      '<div class="qt-datatable" style="--qt-flash-duration: 750ms"><div><table class="qt-table"></table></div></div>'
    document.body.append(outer)
    const table = outer.querySelector('table')!
    expect(readDuration(table)).toBe(750)
    outer
      .querySelector<HTMLElement>('.qt-datatable')!
      .style.setProperty('--qt-flash-duration', '1s')
    expect(readDuration(table)).toBe(1000)
    outer.remove()
  })

  it('is 0 without a table or outside a table root', () => {
    expect(readDuration(null)).toBe(0)
    expect(readDuration(document.createElement('table'))).toBe(0)
  })
})
