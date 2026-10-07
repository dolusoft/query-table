<script setup lang="ts">
import { useEventListener, useMutationObserver } from '@vueuse/core'
import { ref } from 'vue'

// "On This Page", after the shadcn-vue docs: the sections of the page in the
// column next to it. A section is a `section[id]` directly in the page's
// `article`; its title is its `h2` or, for one without (the example), its
// `aria-label`. The page renders after the route changes and an example
// mounts later still, so the list is read again when the column changes.
// The entry of the last section whose top has passed the header is active.
const props = defineProps<{ root: HTMLElement | null }>()

interface Entry {
  id: string
  title: string
}
const entries = ref<Entry[]>([])
const active = ref('')

const read = () => {
  const sections = props.root?.querySelectorAll<HTMLElement>(
    'article > section[id]'
  )
  const next = [...(sections ?? [])].map(section => ({
    id: section.id,
    title:
      section.querySelector('h2')?.textContent?.trim() ||
      section.getAttribute('aria-label') ||
      section.id
  }))
  if (JSON.stringify(next) !== JSON.stringify(entries.value)) {
    entries.value = next
  }
  spy()
}

const offset = 112
const spy = () => {
  let current = entries.value[0]?.id ?? ''
  for (const entry of entries.value) {
    const element = document.getElementById(entry.id)
    if (element && element.getBoundingClientRect().top <= offset) {
      current = entry.id
    }
  }
  active.value = current
}

let queued = false
const schedule = () => {
  if (!queued) {
    queued = true
    requestAnimationFrame(() => {
      queued = false
      read()
    })
  }
}
useMutationObserver(() => props.root, schedule, {
  childList: true,
  subtree: true
})
useEventListener(window, 'scroll', spy, { passive: true })
</script>

<template>
  <nav
    v-if="entries.length > 1"
    aria-label="On this page"
    class="flex flex-col gap-2 p-4 pt-0 text-sm"
  >
    <p class="h-6 text-xs font-medium text-muted-foreground">On This Page</p>
    <a
      v-for="entry in entries"
      :key="entry.id"
      :href="`#${$route.path}#${entry.id}`"
      :data-active="entry.id === active"
      class="text-[0.8rem] text-muted-foreground no-underline transition-colors hover:text-foreground data-[active=true]:font-medium data-[active=true]:text-foreground"
      @click.prevent="
        ($router.replace({ hash: `#${entry.id}` }).catch(() => {}),
        (active = entry.id))
      "
      >{{ entry.title }}</a
    >
  </nav>
</template>
