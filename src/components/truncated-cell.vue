<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    value: any
    truncate: boolean
    html?: boolean
    maxLength?: number
  }>(),
  {
    maxLength: 150
  }
)

// Full text for tooltip
const fullText = computed(() => String(props.value ?? ''))

// Text is cut only when truncation is on and it is longer than maxLength;
// the full text then goes into the tooltip.
const isTruncated = computed(
  () => props.truncate && fullText.value.length > props.maxLength
)

const displayText = computed(() =>
  isTruncated.value
    ? fullText.value.substring(0, props.maxLength) + '...'
    : fullText.value
)
</script>

<template>
  <span :title="isTruncated ? fullText : ''">
    <template v-if="html">
      <span v-html="displayText"></span>
    </template>
    <template v-else>
      {{ displayText }}
    </template>
  </span>
</template>
