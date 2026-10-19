/** The controls of `MeasureHost.vue` the row scenarios drive (ADR 0017). */
export interface MeasureApi {
  /** Replace the row at `index` with a new object; the others are kept. */
  replaceAt: (index: number) => void
  /** A new array of the same row objects. */
  sameObjects: () => void
  /** The scroll box of `virtual`. */
  box: () => HTMLElement | null
  /** Advance the clock some cell slots read. */
  tick: () => void
  /** Change a value of the page that the table does not read. */
  ownState: () => void
}
