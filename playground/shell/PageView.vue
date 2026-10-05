<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch, type Component } from 'vue'

import ApiPanel from './ApiPanel.vue'
import RuleList from './RuleList.vue'
import type { PlaygroundPage } from '../manifest'

// One page: the live example, its source (the same file, imported raw), the
// API members it shows and the behavior rules it covers.
const props = defineProps<{ page: PlaygroundPage }>()

const examples = import.meta.glob<Component>('../examples/*.vue', {
  import: 'default'
})
const sources = import.meta.glob<string>('../examples/*.vue', {
  query: '?raw',
  import: 'default'
})
const path = computed(() => `../examples/${props.page.example}.vue`)

const example = computed(() =>
  defineAsyncComponent(() => examples[path.value]())
)
const source = ref('')
watch(
  path,
  async file => {
    source.value = ''
    source.value = await sources[file]()
  },
  { immediate: true }
)
</script>

<template>
  <article class="flex max-w-6xl flex-col gap-8">
    <header>
      <h1 class="text-2xl font-semibold tracking-tight">{{ page.title }}</h1>
      <p class="pt-1 text-sm text-muted-foreground">{{ page.summary }}</p>
    </header>
    <section aria-label="Example">
      <component :is="example" :key="page.id" />
    </section>
    <section aria-label="Source">
      <h2 class="pb-2 text-lg font-semibold">Source</h2>
      <p class="pb-2 text-xs text-muted-foreground">
        playground/examples/{{ page.example }}.vue
      </p>
      <pre
        class="max-h-[32rem] overflow-auto rounded-md border bg-muted/50 p-4 text-xs leading-relaxed"
      ><code>{{ source }}</code></pre>
    </section>
    <ApiPanel :members="page.api" />
    <RuleList :ids="page.rules" />
  </article>
</template>
