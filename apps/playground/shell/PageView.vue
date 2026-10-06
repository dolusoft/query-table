<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch, type Component } from 'vue'

import { ScrollArea, ScrollBar } from '@/ui/scroll-area'

import ApiPanel from './ApiPanel.vue'
import InlineCode from './InlineCode.vue'
import RuleList from './RuleList.vue'
import type { PlaygroundPage } from '../manifest'
import { sectionAnchors } from '../search/anchors'

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
      <p class="pt-1 text-sm text-muted-foreground">
        <InlineCode :text="page.summary" />
      </p>
    </header>
    <section :id="sectionAnchors.example" aria-label="Example">
      <component :is="example" :key="page.id" />
    </section>
    <section :id="sectionAnchors.source" aria-label="Source">
      <h2 class="pb-2 text-lg font-semibold">Source</h2>
      <p class="pb-2 text-xs break-all text-muted-foreground">
        apps/playground/examples/{{ page.example }}.vue
      </p>
      <!-- shadcn-vue ScrollArea scrolls the source both ways. -->
      <ScrollArea
        class="rounded-md border bg-muted/50 *:data-[slot=scroll-area-viewport]:max-h-[32rem]"
      >
        <pre
          class="w-max p-4 text-xs leading-relaxed"
        ><code>{{ source }}</code></pre>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </section>
    <ApiPanel :members="page.api" />
    <RuleList :ids="page.rules" />
  </article>
</template>
