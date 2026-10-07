<script setup lang="ts">
import { computed } from 'vue'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/ui/table'

import InlineCode from './InlineCode.vue'
import contractApi from '../../../contract/api.json'
import type { PageApi } from '../manifest'
import { memberAnchor, sectionAnchors } from '../search/anchors'

// The API members a page shows, read from contract/api.json, which
// scripts/gen-contract.mjs generates from the component and src/contract.ts.
// Nothing here is written by hand.
const props = defineProps<{ members: PageApi }>()

interface Row {
  name: string
  type: string
  default?: string | null
  description: string
}

const groups = computed(() => {
  const pick = <M extends { name: string }>(members: M[], names?: string[]) =>
    members.filter(member => names?.includes(member.name))
  return [
    {
      kind: 'props' as const,
      title: 'Props',
      typeLabel: 'Type',
      rows: pick(contractApi.props, props.members.props).map<Row>(prop => ({
        name: prop.name,
        type: prop.type,
        default: prop.required ? 'required' : prop.default,
        description: prop.description
      }))
    },
    {
      kind: 'emits' as const,
      title: 'Events',
      typeLabel: 'Arguments',
      rows: pick(contractApi.emits, props.members.emits)
    },
    {
      kind: 'slots' as const,
      title: 'Slots',
      typeLabel: 'Slot props',
      rows: pick(contractApi.slots, props.members.slots).map<Row>(slot => ({
        name: slot.name,
        type: slot.props || 'none',
        description: slot.description
      }))
    },
    {
      kind: 'exposed' as const,
      title: 'Exposed',
      typeLabel: 'Signature',
      rows: pick(contractApi.exposed, props.members.exposed)
    },
    {
      kind: 'functions' as const,
      title: 'Functions',
      typeLabel: 'Signature',
      rows: pick(contractApi.functions, props.members.functions)
    },
    {
      kind: 'types' as const,
      title: 'Types',
      typeLabel: 'Kind',
      rows: pick(contractApi.types, props.members.types).map<Row>(type => ({
        name: type.name,
        type: type.kind,
        description: type.description
      }))
    }
  ].filter(group => group.rows.length > 0)
})
</script>

<template>
  <section :id="sectionAnchors.api" aria-label="API" class="scroll-m-28">
    <h2 class="pb-4 text-xl font-medium tracking-tight">API on this page</h2>
    <div class="flex flex-col gap-4">
      <div v-for="group in groups" :key="group.title">
        <h3 class="pb-1 text-sm font-medium">{{ group.title }}</h3>
        <!-- shadcn-vue Table; long descriptions wrap instead of scrolling. -->
        <div class="rounded-md border">
          <Table class="[&_td]:align-top [&_td]:whitespace-normal">
            <TableHeader class="bg-muted/50">
              <TableRow class="hover:bg-transparent">
                <TableHead class="px-3">Name</TableHead>
                <TableHead class="px-3">{{ group.typeLabel }}</TableHead>
                <TableHead v-if="group.title === 'Props'" class="px-3">
                  Default
                </TableHead>
                <!-- The prose column takes half the width, not what the
                     auto layout leaves after the code columns. -->
                <TableHead class="w-1/2 min-w-64 px-3">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="row in group.rows"
                :id="memberAnchor(group.kind, row.name)"
                :key="row.name"
              >
                <TableCell class="px-3 font-mono text-xs">
                  {{ row.name }}
                </TableCell>
                <TableCell class="px-3 font-mono text-xs">
                  {{ row.type }}
                </TableCell>
                <TableCell
                  v-if="group.title === 'Props'"
                  class="px-3 font-mono text-xs"
                >
                  {{ (row as Row).default ?? '' }}
                </TableCell>
                <TableCell class="px-3 text-muted-foreground">
                  <InlineCode :text="row.description" />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  </section>
</template>
