import {
  createCommentVNode,
  createElementBlock,
  createElementVNode,
  defineComponent,
  Fragment,
  mergeProps,
  openBlock,
  renderList,
  renderSlot,
  toDisplayString,
  withModifiers,
  type PropType,
  type Slots,
  type VNode
} from 'vue'

import type { PinSide } from '../columns/column-layout'
import type { CellSlotProps, Column } from '../contract'
import { valueAt } from '../core/column'
import type { RowFlash } from '../flash/use-change-flash'

/**
 * One drawn column of a data row, kept by value by the body (K311-2): the
 * same object while its column, place, type, pinning, slot and role stay.
 */
export interface RowCell {
  field: string
  column: Column
  /** The column's position in `columns`, hidden ones included. */
  index: number
  type: string
  side: PinSide
  offset: number | undefined
  role: string | undefined
  /** `cell-<field>` when the consumer gives that slot, else `null`. */
  slot: string | null
  /** The `td` attributes before `data-flash`, in the order 3.10 wrote them. */
  attrs: Record<string, unknown>
}

/**
 * The utility cells of a data row (C-46, C-59, C-98): the attributes of
 * each one drawn, `null` for one that is not. Kept by value by the body.
 */
export interface RowUtilities {
  panel: Record<string, unknown> | null
  expand: Record<string, unknown> | null
  select: Record<string, unknown> | null
  /** What the attributes were made from: equal keys, equal cells. */
  signature: string
}

type RowPinned = CellSlotProps<object>['rowPinned']
type PinRow = (
  row: object,
  index: number,
  position: 'top' | 'bottom' | false
) => void

// Any value, no runtime type check: the body is the only caller.
const value = <V>() => ({ type: null as unknown as PropType<V> })
const needed = <V>() => ({
  type: null as unknown as PropType<V>,
  required: true as const
})

// The empty comment of a branch that is off, as the library build writes
// it (a development build of a template writes `v-if`, C-108).
const off = () => createCommentVNode('', true)

const panelIcon = () =>
  createElementVNode(
    'svg',
    {
      width: '14',
      height: '14',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'aria-hidden': 'true'
    },
    [
      createElementVNode('line', { x1: '12', y1: '5', x2: '12', y2: '19' }),
      createElementVNode('line', { x1: '5', y1: '12', x2: '19', y2: '12' })
    ],
    -1 /* CACHED */
  )

const expandIcon = {
  width: '14',
  height: '14',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true'
}
const chevronDown = { key: 0, points: '6 9 12 15 18 9' }
const chevronRight = { key: 1, points: '9 6 15 12 9 18' }

const rowDynamic = [
  'role',
  'data-row-index',
  'aria-rowindex',
  'data-pinned-row',
  'data-row-kind',
  'data-expanded',
  'data-selected',
  'data-flash'
]
const panelDynamic = ['aria-label', 'onClick']
const expandDynamic = ['aria-expanded', 'aria-label', 'onClick']
const selectDynamic = ['aria-label', 'checked', 'onChange']

/** Text of a cell, whole: the table never cuts it. */
const cellText = (row: object, column: Column) =>
  // A cell value may be any type; its string form is what the table shows.
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  String(valueAt(row, column.field) ?? '')

/**
 * One data row of the body (ADR 0017, C-106 to C-108): its `tr`, the
 * utility cells and the column cells with their `cell-<field>` slots.
 * Internal: not exported from the package.
 *
 * Every prop is a value the body computed for this row (K311-2), so Vue
 * skips a row whose props did not change; the row's render calls no
 * function that reads shared state. Its cell slots are called here, so what
 * a slot reads reactively belongs to this row (K311-4). The render is
 * written with the helpers compiled templates use, and draws the vnodes the
 * `tr` branch of the body's template drew in 3.10 (C-108).
 */
export const tableRow = defineComponent({
  name: 'TableRow',
  inheritAttrs: false,
  props: {
    row: needed<object>(),
    /** The row's key, as the body keys it (C-26). */
    rowKey: needed<string | number>(),
    /** `data-row-index`: the row's index in `rows`. */
    index: needed<number>(),
    /** `aria-rowindex`, with `virtual` only (C-86). */
    aria: value<number | undefined>(),
    pinned: needed<RowPinned>(),
    /** `data-row-kind` (C-97); `undefined` for none. */
    kind: value<string | undefined>(),
    selected: needed<boolean>(),
    expanded: needed<boolean>(),
    /** An expand button is drawn (C-98). */
    expandable: needed<boolean>(),
    /** The row's flash marks (C-94), or `undefined`. */
    flash: value<RowFlash | undefined>(),
    cells: needed<readonly RowCell[]>(),
    utilities: needed<RowUtilities>(),
    labelPanel: needed<string>(),
    labelExpand: needed<string>(),
    labelSelect: needed<string>(),
    /** `scrollBody`: the ARIA roles of C-102. */
    roles: value<boolean | undefined>(),
    /** The body's slots object: the same object for the body's life (K311-3). */
    slots: needed<Slots>(),
    /** With `flash`: binds the elapsed time after a render (K311-6). */
    flashBind: value<
      ((el: HTMLElement, key: string | number) => void) | undefined
    >(),
    pinRow: needed<PinRow>()
  },
  emits: ['toggle', 'toggleSelected', 'rightPanel'],
  setup(props, { emit }) {
    // Stable for the row's life, so a render patches nothing for them.
    const onPanel = withModifiers(() => emit('rightPanel'), ['stop'])
    const onToggle = () => emit('toggle')
    const onSelect = () => emit('toggleSelected')
    // Called by Vue right after the row's `tr` is mounted or patched, while
    // the row's render effect is active: it reads only this row's props.
    const bind = (vnode: VNode) => {
      props.flashBind?.(vnode.el as HTMLElement, props.rowKey)
    }
    // The compiler's per-instance cache of static content (`_cache`).
    let panelCache: VNode[] | null = null

    return () => {
      const { row, index, pinned, cells, utilities, flash, slots } = props
      const cellFlash = flash?.cells
      return (
        openBlock(),
        createElementBlock(
          'tr',
          {
            role: props.roles ? 'row' : undefined,
            'data-row-index': index,
            'aria-rowindex': props.aria,
            'data-pinned-row': pinned || undefined,
            'data-row-kind': props.kind,
            'data-expanded': props.expanded ? '' : undefined,
            'data-selected': props.selected ? '' : undefined,
            'data-flash': flash?.row,
            // Read from the vnode by Vue, never patched as attributes: they
            // stay out of the dynamic props below, so no DOM listener is
            // made of them (C-108).
            onVnodeBeforeMount: props.flashBind ? bind : undefined,
            onVnodeUpdated: props.flashBind ? bind : undefined
          },
          [
            utilities.panel
              ? (openBlock(),
                createElementBlock(
                  'td',
                  mergeProps({ key: 0 }, utilities.panel),
                  [
                    createElementVNode(
                      'button',
                      {
                        type: 'button',
                        class: 'qt-right-panel-button',
                        'aria-label': props.labelPanel,
                        onClick: onPanel
                      },
                      [...(panelCache ??= [panelIcon()])],
                      8 /* PROPS */,
                      panelDynamic
                    )
                  ],
                  16 /* FULL_PROPS */
                ))
              : off(),
            utilities.expand
              ? (openBlock(),
                createElementBlock(
                  'td',
                  mergeProps({ key: 1 }, utilities.expand),
                  [
                    props.expandable
                      ? (openBlock(),
                        createElementBlock(
                          'button',
                          {
                            key: 0,
                            type: 'button',
                            class: 'qt-expand',
                            'aria-expanded': props.expanded,
                            'aria-label': props.labelExpand,
                            onClick: onToggle
                          },
                          [
                            (openBlock(),
                            createElementBlock('svg', expandIcon, [
                              props.expanded
                                ? (openBlock(),
                                  createElementBlock('polyline', chevronDown))
                                : (openBlock(),
                                  createElementBlock('polyline', chevronRight))
                            ]))
                          ],
                          8 /* PROPS */,
                          expandDynamic
                        ))
                      : off()
                  ],
                  16 /* FULL_PROPS */
                ))
              : off(),
            utilities.select
              ? (openBlock(),
                createElementBlock(
                  'td',
                  mergeProps({ key: 2 }, utilities.select),
                  [
                    createElementVNode(
                      'input',
                      {
                        type: 'checkbox',
                        class: 'qt-select-row',
                        'aria-label': props.labelSelect,
                        checked: props.selected,
                        onChange: onSelect
                      },
                      null,
                      40 /* PROPS, NEED_HYDRATION */,
                      selectDynamic
                    )
                  ],
                  16 /* FULL_PROPS */
                ))
              : off(),
            (openBlock(true),
            createElementBlock(
              Fragment,
              null,
              renderList(
                cells,
                cell => (
                  openBlock(),
                  createElementBlock(
                    Fragment,
                    { key: cell.field },
                    [
                      cell.slot
                        ? (openBlock(),
                          createElementBlock(
                            'td',
                            mergeProps({ key: 0 }, cell.attrs, {
                              'data-flash': cellFlash?.[cell.field]
                            }),
                            [
                              renderSlot(slots, cell.slot, {
                                row,
                                rowIndex: index,
                                column: cell.column,
                                cellValue: valueAt(row, cell.field),
                                rowPinned: pinned,
                                pinRow: position =>
                                  props.pinRow(row, index, position)
                              } satisfies CellSlotProps<object>)
                            ],
                            16 /* FULL_PROPS */
                          ))
                        : (openBlock(),
                          createElementBlock(
                            'td',
                            mergeProps({ key: 1 }, cell.attrs, {
                              'data-flash': cellFlash?.[cell.field]
                            }),
                            toDisplayString(cellText(row, cell.column)),
                            17 /* TEXT, FULL_PROPS */
                          ))
                    ],
                    64 /* STABLE_FRAGMENT */
                  )
                )
              ),
              128 /* KEYED_FRAGMENT */
            ))
          ],
          8 /* PROPS */,
          rowDynamic
        )
      )
    }
  }
})
