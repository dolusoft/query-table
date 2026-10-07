import { shallowRef } from 'vue'

import type { Dataset, DatasetId } from './dataset'
import { harbor } from './harbor'
import { ticker } from './ticker'
import { vigil } from './vigil'

// The demo dataset of the whole playground: one choice, made in the header,
// that every example page and the home page table read. The choice lives in
// the browser (localStorage); `?dataset=vigil|ticker|harbor` picks one on
// load, the way `?theme=` does. Storage may be unavailable (a private
// window, blocked site data): the playground then starts on the default.

export const datasets: readonly Dataset[] = [vigil, ticker, harbor]

export const defaultDatasetId: DatasetId = 'vigil'

const storageKey = 'query-table-playground:dataset'

const isDatasetId = (value: unknown): value is DatasetId =>
  datasets.some(dataset => dataset.id === value)

/** The dataset a page load starts on: the URL, then storage, then the default. */
export const savedDatasetId = (): DatasetId => {
  const asked = new URLSearchParams(location.search).get('dataset')
  if (isDatasetId(asked)) {
    return asked
  }
  try {
    const saved = localStorage.getItem(storageKey)
    if (isDatasetId(saved)) {
      return saved
    }
  } catch {
    // No storage: keep the default.
  }
  return defaultDatasetId
}

const selected = shallowRef<DatasetId>(savedDatasetId())

/** The id of the selected dataset; reactive. */
export const datasetId = () => selected.value

/**
 * The selected dataset. Pages read it once, in setup: the shell mounts them
 * again when the choice changes, so a page never swaps data under a query.
 */
export const currentDataset = (): Dataset =>
  datasets.find(dataset => dataset.id === selected.value) ?? vigil

export const selectDataset = (id: DatasetId) => {
  selected.value = id
  try {
    localStorage.setItem(storageKey, id)
  } catch {
    // No storage: the choice holds until the page reloads.
  }
}

/** Back to the default and nothing stored (tests start from here). */
export const resetDataset = () => {
  selected.value = defaultDatasetId
  try {
    localStorage.removeItem(storageKey)
  } catch {
    // No storage: nothing to remove.
  }
}
