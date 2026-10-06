<script setup lang="ts">
import { computed } from 'vue'

// Text from contract/api.json or the manifest marks code with backticks, as
// Markdown does. Odd parts of the split are code.
const props = defineProps<{ text: string }>()
const parts = computed(() =>
  props.text.split('`').map((text, index) => ({ text, code: index % 2 === 1 }))
)
</script>

<template>
  <template v-for="(part, index) in parts" :key="index"
    ><code
      v-if="part.code"
      class="rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.85em]"
      >{{ part.text }}</code
    ><template v-else>{{ part.text }}</template></template
  >
</template>
