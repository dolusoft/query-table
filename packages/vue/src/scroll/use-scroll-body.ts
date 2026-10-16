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
  /** The table of the body rows: its layout is checked once (C-101). */
  bodyTable: () => HTMLTableElement | null
}

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
        console.warn(
          '[QueryTable] `scrollBody` with `table-layout: auto` on the body table: its columns follow its rows, not the header. Set `table-layout: fixed` (C-101).'
        )
      }
    },
    { flush: 'post', immediate: true }
  )

  onBeforeUnmount(detach)
}
