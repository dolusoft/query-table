import { makeColumns, makeRows, mountTable, type Row } from './mount-table'

/**
 * The DOM of a table with a pinned column and `rowKey` after its mount and
 * after each of 20 live updates (changed cells and, every fourth update, a
 * new row at the top), joined into one text. C-95 compares it with the DOM
 * of the 3.2 build (tests/contract/unit/__snapshots__/flash-off-dom.html).
 */
export const liveUpdateDom = async (
  props: Record<string, unknown>
): Promise<string> => {
  const columns = makeColumns().map(column =>
    column.field === 'id' ? { ...column, pinned: 'left' as const } : column
  )
  const mounted = mountTable({ rowKey: 'id', columns, ...props })
  // Comments are not the DOM a skin sees, and a development build keeps the
  // template's comments where a production build has empty ones.
  // The whitespace between tags is the serializer's; one tag a line.
  const dom = () =>
    mounted.wrapper
      .html()
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\s+/g, ' ')
      .replace(/>\s*</g, '>\n<')
  const html = [dom()]
  let rows: Row[] = makeRows()
  for (let i = 0; i < 20; i++) {
    const id = (i % 5) + 1
    rows = rows.map(row => (row.id === id ? { ...row, age: 50 + i } : row))
    if (i % 4 === 0) {
      rows = [
        { id: 100 + i, name: `New ${i}`, age: i, joined: '2024-05-01' },
        ...rows
      ]
    }
    await mounted.wrapper.setProps({ rows })
    html.push(dom())
  }
  mounted.wrapper.unmount()
  return html.join('\n<!-- update -->\n')
}
