import {
  CellAction,
  CellActions,
  CellBadge,
  CellCopy,
  CellPreview,
  CellStack,
  CellValue
} from '@dolusoft/query-table/cells'
import { test } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { h } from 'vue'

import QueryTable from '@dolusoft/query-table'

import { createCollector } from '../../support/dom-collector'
import { makeQuery } from '../../support/fixtures'

// C-128: the cell components in the cell slots of a table render every hook
// the DOM contract marks `addedBy` C-128, each on its element, and nothing
// outside the contract. Not compared with a 3.0.0 baseline
// (`ADDED_AFTER_BASELINE`).

test('C-128 the DOM of the cell components matches the DOM contract', async () => {
  const dom = createCollector()
  await render(QueryTable as never, {
    props: {
      columns: [
        { field: 'name', title: 'Ad' },
        { field: 'mappingId', title: 'Eşleşim Kimliği' },
        { field: 'template', title: 'Şablon' },
        { field: 'api', title: 'API Değişkeni' },
        { field: 'actions', title: 'İşlemler' }
      ],
      rows: [
        {
          name: 'AnaOfis',
          note: 'test',
          mappingId: 'eeba5a76',
          template: 'Default',
          api: null
        }
      ],
      totalRows: 1,
      query: makeQuery()
    } as never,
    slots: {
      'cell-name': ({ row }: { row: { name: string; note: string } }) =>
        h(CellStack, { primary: row.name, secondary: row.note }),
      'cell-mappingId': ({ row }: { row: { mappingId: string } }) =>
        h(CellCopy, { value: row.mappingId }),
      'cell-template': ({ row }: { row: { template: string } }) => [
        h(CellPreview, { text: row.template }),
        h(CellBadge, { tone: 'warning' }, () => 'Desteklenmiyor')
      ],
      'cell-api': ({ row }: { row: { api: string | null } }) =>
        h(CellValue, { value: row.api }),
      'cell-actions': () =>
        h(CellActions, null, () => [
          h(CellAction, { kind: 'primary' }, () => 'Düzenle'),
          h(CellAction, { kind: 'danger' }, () => 'Sil')
        ])
    }
  })
  dom.collect()
  cleanup()

  dom.expectNothingOutsideContract()
  dom.expectEntriesRendered(entry => entry.addedBy === 'C-128')
})
