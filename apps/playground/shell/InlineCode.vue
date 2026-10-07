<script setup lang="ts">
import { computed } from 'vue'

// Text from contract/api.json or the manifest marks code with backticks, as
// Markdown does. Odd parts of the split are code. The code takes the
// foreground color: inside muted text, muted-foreground on bg-muted gives
// 4.35:1 in the light theme, under the 4.5:1 of WCAG 1.4.3.
const props = defineProps<{ text: string }>()
const parts = computed(() =>
  props.text.split('`').map((text, index) => ({ text, code: index % 2 === 1 }))
)
</script>

<template>
  <template v-for="(part, index) in parts" :key="index"
    ><code
      v-if="part.code"
      class="rounded-sm bg-muted px-1 text-foreground py-0.5 font-mono text-[0.85em]"
      >{{ part.text }}</code
    ><template v-else>{{ part.text }}</template></template
  >
</template>
