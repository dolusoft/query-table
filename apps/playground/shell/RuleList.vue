<script setup lang="ts">
import { computed } from 'vue'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/ui/accordion'
import { Badge } from '@/ui/badge'

import InlineCode from './InlineCode.vue'
import api from '../../../contract/api.json'
import { ruleAnchor, sectionAnchors } from '../search/anchors'

// The behavior rules (contract/rules.md) this page shows, with their text
// from contract/api.json, as a shadcn-vue Accordion: any number can be open.
const props = defineProps<{ ids: string[] }>()
const rules = computed(() =>
  api.rules.filter(rule => props.ids.includes(rule.id))
)
</script>

<template>
  <section :id="sectionAnchors.rules" aria-label="Covered rules">
    <h2 class="pb-2 text-lg font-semibold">Covered rules</h2>
    <Accordion type="multiple" class="rounded-md border px-3">
      <AccordionItem
        v-for="rule in rules"
        :id="ruleAnchor(rule.id)"
        :key="rule.id"
        :value="rule.id"
      >
        <AccordionTrigger class="items-center gap-2">
          <span class="flex-1">
            <Badge variant="outline" class="mr-1 font-mono">{{
              rule.id
            }}</Badge>
            {{ rule.title }}
          </span>
        </AccordionTrigger>
        <AccordionContent class="text-muted-foreground">
          <InlineCode :text="rule.text" />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </section>
</template>
