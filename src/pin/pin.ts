/**
 * Attributes of a pinned cell (C-47): `data-pinned` and, once measured, the
 * `--qt-pin-left` offset in pixels. Nothing for a cell that is not pinned.
 */
export const pinAttrs = (
  pinned: boolean,
  offset: number | undefined
): Record<string, unknown> =>
  pinned
    ? {
        'data-pinned': '',
        style:
          offset === undefined ? undefined : { '--qt-pin-left': `${offset}px` }
      }
    : {}
