<script setup lang="ts">
import { computed } from 'vue'

import { Badge } from '@/ui/badge'

import api from '../../../contract/api.json'
import { ruleAnchor, sectionAnchors } from '../search/anchors'

// The behavior rules (contract/rules.md) this page shows, with their text
// from contract/api.json.
const props = defineProps<{ ids: string[] }>()
const rules = computed(() =>
  api.rules.filter(rule => props.ids.includes(rule.id))
)
</script>

<template>
  <section :id="sectionAnchors.rules" aria-label="Covered rules">
    <h2 class="pb-2 text-lg font-semibold">Covered rules</h2>
    <ul class="flex flex-col gap-2">
      <li
        v-for="rule in rules"
        :id="ruleAnchor(rule.id)"
        :key="rule.id"
        class="rounded-md text-sm"
      >
        <details class="rounded-md border px-3 py-2">
          <summary class="cursor-pointer">
            <Badge variant="outline" class="mr-1 font-mono">{{
              rule.id
            }}</Badge>
            {{ rule.title }}
          </summary>
          <p class="pt-2 text-muted-foreground">{{ rule.text }}</p>
        </details>
      </li>
    </ul>
  </section>
</template>
