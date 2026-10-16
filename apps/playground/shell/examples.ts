import type { Component } from 'vue'

import { pages } from '../manifest'

const components = import.meta.glob<Component>('../examples/*.vue', {
  import: 'default'
})
const sources = import.meta.glob<string>('../examples/*.vue', {
  query: '?raw',
  import: 'default'
})

interface Example {
  example: Component
  source: string
}

const pending = new Map<string, Promise<Example>>()
const ready = new Map<string, Example>()

// Resolve both imports before committing the route. The old page remains
// mounted while the chunks load; the new preview never paints an empty frame.
export const loadExample = (name: string): Promise<Example> => {
  const cached = pending.get(name)
  if (cached) {
    return cached
  }
  const path = `../examples/${name}.vue`
  const promise = Promise.all([components[path](), sources[path]()])
    .then(([example, source]) => {
      const loaded = { example, source }
      ready.set(name, loaded)
      return loaded
    })
    .catch((error: unknown) => {
      pending.delete(name)
      throw error
    })
  pending.set(name, promise)
  return promise
}

export const resolvedExample = (name: string): Example => {
  const loaded = ready.get(name)
  if (!loaded) {
    throw new Error(`Example not resolved before navigation: ${name}`)
  }
  return loaded
}

export const prefetchPage = (id: string) => {
  const page = pages.find(entry => entry.id === id)
  if (page) {
    void loadExample(page.example).catch(() => {})
  }
}

// One speculative import per idle callback; cancel when leaving the docs.
export const prefetchExamplesWhenIdle = () => {
  let stopped = false
  let index = 0
  let cancel = () => {}
  const schedule = () => {
    if (stopped || index === pages.length) {
      return
    }
    const run = () => {
      if (stopped) {
        return
      }
      const page = pages[index++]
      void loadExample(page.example)
        .catch(() => {})
        .finally(schedule)
    }
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run)
      cancel = () => window.cancelIdleCallback(id)
    } else {
      const id = globalThis.setTimeout(run, 500)
      cancel = () => globalThis.clearTimeout(id)
    }
  }
  schedule()
  return () => {
    stopped = true
    cancel()
  }
}
