// Scrolls to an element of the page that just opened and marks it for a
// moment. The page renders after the route changes, so the element is
// waited for over a few frames.
const highlightMs = 1600

const waitFor = (id: string, timeoutMs = 2000) =>
  new Promise<HTMLElement | null>(resolve => {
    const started = performance.now()
    const look = () => {
      const element = document.getElementById(id)
      if (element) {
        return resolve(element)
      }
      if (performance.now() - started > timeoutMs) {
        return resolve(null)
      }
      requestAnimationFrame(look)
    }
    look()
  })

export const revealAnchor = async (id: string) => {
  if (!id) {
    window.scrollTo({ top: 0 })
    return null
  }
  const element = await waitFor(id)
  if (!element) {
    return null
  }
  // A rule sits in a closed <details>: open it so its text shows.
  const details = element.closest('details') ?? element.querySelector('details')
  if (details) {
    details.open = true
  }
  element.scrollIntoView({ block: 'center' })
  element.setAttribute('data-search-target', '')
  window.setTimeout(
    () => element.removeAttribute('data-search-target'),
    highlightMs
  )
  return element
}
