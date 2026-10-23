import { onBeforeUnmount, watch } from 'vue'

// Replaced by the consumer's bundler, just as in Vue's esm-bundler build.
declare const process: { env: { NODE_ENV?: string } }

// A try/catch keeps the constant replacement in production builds.
const isDevelopment = (): boolean => {
  try {
    return process.env.NODE_ENV !== 'production'
  } catch {
    return true
  }
}

/** The wrappers of `scrollBody`, `null` while not drawn. */
interface ScrollBodyWrappers {
  head: HTMLElement | null
  body: HTMLElement | null
  foot: HTMLElement | null
}

export interface ScrollBodyOptions {
  /** The `scrollBody` prop. */
  enabled: () => boolean
  wrappers: () => ScrollBodyWrappers
  /** The table of the header cells, whose widths the body takes. */
  headTable: () => HTMLTableElement | null
  /** The table of the body rows: its layout is checked (C-101). */
  bodyTable: () => HTMLTableElement | null
  /** The `col` widths written to the body table, in pixels. */
  colWidths: () => readonly (number | undefined)[]
  /** Changes when the body rows do: their content can widen a column. */
  rows: () => unknown
}

const automaticLayout =
  '[QueryTable] `scrollBody`: the body table has the automatic layout, so its columns follow its rows, not the header. Give the body and footer tables `table-layout: fixed` and a width that is a length or a percentage, such as `width: 100%`: with `width: auto` or `max-content` the browser uses the automatic layout whatever `table-layout` says (C-101).'

/**
 * Header, body and footer of `scrollBody` scroll sideways together (C-101):
 * one passive `scroll` listener on each wrapper sets the `scrollLeft` of the
 * others to its own. A position written here is remembered, so the `scroll`
 * event it fires is not taken for one of the user's. The table writes no
 * style and no attribute to the wrappers. Off, nothing is listened to.
 */
export const useScrollBody = (options: ScrollBodyOptions) => {
  let attached: HTMLElement[] = []
  /** The `scrollLeft` this table wrote to a wrapper, until its event. */
  const written = new WeakMap<HTMLElement, number>()
  let warned = false
  let clamped = false

  /** Every wrapper but `source` to `left`, remembering what was written. */
  const follow = (source: HTMLElement, left: number) => {
    for (const element of attached) {
      if (element !== source && element.scrollLeft !== left) {
        element.scrollLeft = left
        written.set(element, element.scrollLeft)
        // A header or footer that stops short of the body: its scroll range
        // lacks the body's vertical scrollbar, and its columns end shifted.
        if (
          !clamped &&
          source === options.wrappers().body &&
          left - element.scrollLeft >= 1 &&
          isDevelopment()
        ) {
          clamped = true
          console.warn(
            '[QueryTable] `scrollBody`: `.qt-table-head` or `.qt-table-foot` cannot scroll sideways as far as `.qt-table-body`, so its columns end shifted. Give it a vertical scrollbar as wide as that of the body (`overflow-y: scroll`; a transparent `scrollbar-color` hides it) (C-101).'
          )
        }
      }
    }
  }

  const onScroll = (event: Event) => {
    const source = event.currentTarget as HTMLElement
    const left = source.scrollLeft
    const echo = written.get(source)
    written.delete(source)
    if (echo !== left) {
      follow(source, left)
    }
  }

  const detach = () => {
    for (const element of attached) {
      element.removeEventListener('scroll', onScroll)
    }
    attached = []
  }

  watch(
    () => (options.enabled() ? options.wrappers() : null),
    wrappers => {
      detach()
      if (!wrappers) {
        return
      }
      attached = [wrappers.head, wrappers.body, wrappers.foot].filter(
        (element): element is HTMLElement => element !== null
      )
      for (const element of attached) {
        element.addEventListener('scroll', onScroll, { passive: true })
      }
      // A wrapper drawn later (a footer) starts where the body is.
      if (wrappers.body) {
        follow(wrappers.body, wrappers.body.scrollLeft)
      }
      const table = options.bodyTable()
      if (
        table &&
        !warned &&
        isDevelopment() &&
        getComputedStyle(table).tableLayout !== 'fixed'
      ) {
        warned = true
        console.warn(automaticLayout)
      }
    },
    { flush: 'post', immediate: true }
  )

  /**
   * `table-layout: fixed` applies only to a table with a definite width:
   * under `width: auto` or `max-content` the browser lays the body out
   * automatically while `tableLayout` still reads `fixed`, and a cell wider
   * than its `col` widens its column and the table. That shows once the
   * rows hold such a cell, so it is checked whenever the rows or the `col`
   * widths change, against `col` widths that match the header cells (not
   * ones a change of the drawn columns has made stale until measured).
   */
  const checkLayout = () => {
    const head = options.headTable()
    const body = options.bodyTable()
    if (warned || !head || !body) {
      return
    }
    const cells = head.querySelectorAll(':scope > thead > tr > *')
    const widths = options.colWidths()
    if (
      cells.length === 0 ||
      cells.length !== widths.length ||
      [...cells].some((cell, i) => {
        const width = widths[i]
        return (
          width === undefined ||
          Math.abs(cell.getBoundingClientRect().width - width) >= 0.5
        )
      })
    ) {
      return
    }
    if (
      body.getBoundingClientRect().width - head.getBoundingClientRect().width >=
      1
    ) {
      warned = true
      console.warn(automaticLayout)
    }
  }

  if (isDevelopment()) {
    watch(
      () =>
        options.enabled()
          ? [options.colWidths(), options.rows(), options.bodyTable()]
          : null,
      sources => {
        if (sources) {
          checkLayout()
        }
      },
      { flush: 'post' }
    )
  }

  onBeforeUnmount(detach)
}
