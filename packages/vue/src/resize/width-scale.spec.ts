import { afterEach, describe, expect, it, vi } from 'vitest'

import { identityScale, measureWidthScale, stretchedScale } from './width-scale'

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('C-49 Dragging a handle', () => {
  it('a stretched table draws a column by its share of the declared widths', () => {
    // Three columns declared 100px in 1000px: each is drawn 333.3px wide.
    const scale = stretchedScale(1000, 200)
    expect(scale.rendered(100)).toBeCloseTo(333.33, 2)
    expect(scale.declared(1000 / 3)).toBeCloseTo(100, 6)
    // Drawn 20px wider takes a declared 9px, not 20px.
    expect(scale.declared(1000 / 3 + 20)).toBeCloseTo(109.28, 2)
    // Once the columns fill the space, the declared width is the drawn one.
    expect(scale.declared(900)).toBe(900)
    expect(scale.rendered(900)).toBe(900)
    for (const declared of [40, 100, 250, 799.5]) {
      expect(scale.declared(scale.rendered(declared))).toBeCloseTo(declared, 6)
    }
  })

  it('no other column, or others that fill the space, never stretch', () => {
    expect(stretchedScale(1000, 0)).toBe(identityScale)
    expect(stretchedScale(1000, 1000)).toBe(identityScale)
    expect(stretchedScale(0, 0)).toBe(identityScale)
    expect(identityScale.declared(120)).toBe(120)
    expect(identityScale.rendered(120)).toBe(120)
  })

  /**
   * One header row whose cells happy-dom draws as `layout` says, from their
   * inline widths (`NaN` for a cell without one); the cells' `style`
   * attributes as they were before.
   */
  const row = (
    declared: (number | null)[],
    layout: (widths: number[]) => number[]
  ) => {
    const tr = document.createElement('tr')
    for (const width of declared) {
      const th = document.createElement('th')
      if (width !== null) {
        th.style.width = `${width}px`
      }
      tr.append(th)
    }
    document.body.append(tr)
    const cells = Array.from(tr.children) as HTMLElement[]
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const drawn = layout(cells.map(cell => parseFloat(cell.style.width)))
        return { width: drawn[cells.indexOf(this)] } as DOMRect
      }
    )
    return {
      th: cells[0],
      styles: cells.map(cell => cell.getAttribute('style'))
    }
  }

  /**
   * `table-layout: fixed` in a `space` wide container: the columns without a
   * width share what is left, else every column takes its share of it. A
   * column is never drawn narrower than `floor` declared pixels (its content).
   */
  const fixed =
    (space: number, floor = 0) =>
    (widths: number[]) => {
      const auto = widths.filter(Number.isNaN).length
      const firm = widths.map(width => Math.max(width, floor))
      const sum = firm.reduce((a, b) => (Number.isNaN(b) ? a : a + b), 0)
      return firm.map(width =>
        Number.isNaN(width)
          ? Math.max(0, space - sum) / auto
          : !auto && sum < space
            ? (width * space) / sum
            : width
      )
    }

  it('reads the stretch from the layout and puts every style back', () => {
    const { th, styles } = row([100, 100, 100], fixed(1000))
    const scale = measureWidthScale(th, 40)
    expect(scale.declared(1000 / 3 + 20)).toBeCloseTo(109.28, 2)
    expect(
      Array.from(th.parentElement!.children).map(cell =>
        cell.getAttribute('style')
      )
    ).toEqual(styles)
  })

  it('a table wider than its container stretches once the columns no longer fill it', () => {
    const { th } = row([400, 400, 400], fixed(1000))
    const scale = measureWidthScale(th, 40)
    expect(scale.declared(450)).toBe(450)
    // 800 declared beside it: drawn 150 takes 150 * 800 / 850.
    expect(scale.declared(150)).toBeCloseTo(141.18, 2)
  })

  it('content that keeps the column wider than the narrowest width still reads the stretch', () => {
    const { th } = row([400, 400, 400], fixed(1000, 88))
    expect(measureWidthScale(th, 40).declared(150)).toBeCloseTo(141.18, 2)
  })

  it.each([
    ['never stretches', [400, 400, 400], fixed(0)],
    [
      'gives what is left to one column without a width',
      [300, null],
      fixed(600)
    ],
    [
      'gives what is left to a column without a width among others',
      [300, 100, null],
      fixed(600)
    ]
  ])('a table that %s gets the identity', (_name, declared, layout) => {
    const { th } = row(declared, layout)
    expect(measureWidthScale(th, 40)).toBe(identityScale)
  })

  it('a layout the fit does not describe gets the identity', () => {
    // Every column drawn 50px wider than declared, the container aside.
    const { th } = row([100, 100, 100], widths =>
      widths.map(width => width + 50)
    )
    expect(measureWidthScale(th, 40)).toBe(identityScale)
  })
})
