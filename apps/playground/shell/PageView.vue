<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch, type Component } from 'vue'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/tabs'

import ApiPanel from './ApiPanel.vue'
import CodeBlock from './CodeBlock.vue'
import DocHeader from './DocHeader.vue'
import RuleList from './RuleList.vue'
import type { PlaygroundPage } from '../manifest'
import { datasetId } from '../scenarios/datasets'
import { sectionAnchors } from '../search/anchors'

// One page: the live example and its source (the same file, imported raw)
// as Preview and Code tabs, the API members it shows and the behavior rules
// it covers. The preview stays mounted behind the Code tab, so the example
// keeps its state when the reader looks at the code and back.
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
  <article class="flex flex-col gap-10">
    <DocHeader :title="page.title" :summary="page.summary" />
    <section
      :id="sectionAnchors.example"
      aria-label="Example"
      data-wide
      class="scroll-m-28"
    >
      <Tabs default-value="preview" class="gap-4">
        <TabsList
          variant="line"
          class="justify-start group-data-horizontal/tabs:h-11 lg:group-data-horizontal/tabs:h-8"
        >
          <TabsTrigger value="preview" class="h-11 flex-none px-2 lg:h-7">
            Preview
          </TabsTrigger>
          <TabsTrigger value="code" class="h-11 flex-none px-2 lg:h-7">
            Code
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="preview"
          force-mount
          class="min-w-0 rounded-xl border p-4 data-[state=inactive]:hidden"
        >
          <!-- A new example per page and per demo dataset: the example reads
               the dataset once, so a new choice mounts it again. -->
          <component :is="example" :key="`${page.id}:${datasetId()}`" />
        </TabsContent>
        <TabsContent :id="sectionAnchors.source" value="code" class="min-w-0">
          <CodeBlock
            :source="source"
            :file="`apps/playground/examples/${page.example}.vue`"
          />
        </TabsContent>
      </Tabs>
    </section>
    <ApiPanel :members="page.api" />
    <RuleList :ids="page.rules" />
  </article>
</template>
