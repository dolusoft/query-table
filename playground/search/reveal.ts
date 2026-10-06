import { nextTick } from 'vue'

// Scrolls to an element of the page that just opened and marks it for a
// moment. The page renders after the route changes, so the element is
// waited for over a few frames. Pages share anchor ids (`section-api` is on
// every page): right after a navigation the outgoing page can still be in the
// DOM, so the caller passes its element as `stale` and it is skipped.
const highlightMs = 1600

const waitFor = (id: string, stale: Element | null, timeoutMs = 2000) =>
  new Promise<HTMLElement | null>(resolve => {
    const started = performance.now()
    const look = () => {
      const element = document.getElementById(id)
      if (element && element !== stale) {
        return resolve(element)
      }
      if (performance.now() - started > timeoutMs) {
        return resolve(null)
      }
      requestAnimationFrame(look)
    }
    look()
  })

export const revealAnchor = async (
  id: string,
  stale: Element | null = null
) => {
  if (!id) {
    window.scrollTo({ top: 0 })
    return null
  }
  await nextTick()
  const element = await waitFor(id, stale)
  if (!element) {
    return null
  }
  // A rule is a closed Accordion item: press its trigger so its text shows.
  element
    .querySelector<HTMLElement>(
      '[data-slot="accordion-trigger"][aria-expanded="false"]'
    )
    ?.click()
  element.scrollIntoView({ block: 'center' })
  element.setAttribute('data-search-target', '')
  window.setTimeout(
    () => element.removeAttribute('data-search-target'),
    highlightMs
  )
  return element
}
