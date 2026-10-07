<script setup lang="ts">
import { CheckIcon, CopyIcon } from '@lucide/vue'
import { useClipboard } from '@vueuse/core'
import { ref, watch } from 'vue'

import { Button } from '@/ui/button'

import { highlightVue } from './highlight'

// An example's source as on the shadcn-vue docs: the file name and a copy
// button above the code, the code in Geist Mono with shiki's colors. Until
// the colors have loaded (or if they fail to) the plain text shows.
const props = defineProps<{ source: string; file: string }>()

const html = ref('')
watch(
  () => props.source,
  async source => {
    html.value = ''
    if (source) {
      try {
        html.value = await highlightVue(source)
      } catch {
        // The plain text stays.
      }
    }
  },
  { immediate: true }
)

const { copy, copied } = useClipboard({ copiedDuring: 1500 })
</script>

<template>
  <figure class="overflow-hidden rounded-xl border bg-muted/50">
    <figcaption
      class="flex h-11 items-center gap-2 border-b px-4 font-mono text-xs text-muted-foreground"
    >
      <span class="min-w-0 flex-1 truncate">{{ file }}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        :aria-label="copied ? 'Copied' : 'Copy the source'"
        class="-mr-2 size-11 lg:size-7"
        @click="copy(source)"
      >
        <component :is="copied ? CheckIcon : CopyIcon" />
      </Button>
    </figcaption>
    <!-- eslint-disable vue/no-v-html -- shiki's escaped output of our own example file -->
    <div
      v-if="html"
      class="max-h-[32rem] overflow-auto font-mono text-sm leading-relaxed [&_pre]:w-max [&_pre]:min-w-full [&_pre]:bg-transparent! [&_pre]:px-4 [&_pre]:py-3.5"
      tabindex="0"
      v-html="html"
    />
    <!-- eslint-enable vue/no-v-html -->
    <pre
      v-else
      class="max-h-[32rem] overflow-auto px-4 py-3.5 font-mono text-sm leading-relaxed"
      tabindex="0"
    ><code>{{ source }}</code></pre>
  </figure>
</template>
