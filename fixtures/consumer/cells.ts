// A consumer that draws the cell components on their own, importing them
// the way an application does (by name, through the `exports` map). Built
// by `pnpm measure:consumer-size`; never part of the package.
import { createApp, h } from 'vue'

import {
  CellAction,
  CellActions,
  CellBadge,
  CellCopy,
  CellPreview,
  CellStack,
  CellValue
} from '@dolusoft/query-table/cells'

createApp({
  render: () =>
    h('div', [
      h(CellStack, { primary: 'AnaOfis', secondary: 'test' }),
      h(CellCopy, { value: 'eeba5a76' }),
      h(CellPreview, { text: 'Default Template' }),
      h(CellBadge, { tone: 'warning', text: 'Desteklenmiyor' }),
      h(CellValue, { value: null }),
      h(CellActions, null, () => [
        h(CellAction, { kind: 'primary' }, () => 'Düzenle'),
        h(CellAction, { kind: 'danger' }, () => 'Sil')
      ])
    ])
}).mount('#app')
