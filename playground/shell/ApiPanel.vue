<script setup lang="ts">
import { computed } from 'vue'

import contractApi from '../../contract/api.json'
import type { PageApi } from '../manifest'

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
      title: 'Events',
      typeLabel: 'Arguments',
      rows: pick(contractApi.emits, props.members.emits)
    },
    {
      title: 'Slots',
      typeLabel: 'Slot props',
      rows: pick(contractApi.slots, props.members.slots).map<Row>(slot => ({
        name: slot.name,
        type: slot.props || 'none',
        description: slot.description
      }))
    },
    {
      title: 'Exposed',
      typeLabel: 'Signature',
      rows: pick(contractApi.exposed, props.members.exposed)
    },
    {
      title: 'Functions',
      typeLabel: 'Signature',
      rows: pick(contractApi.functions, props.members.functions)
    },
    {
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
  <section aria-label="API">
    <h2 class="pb-2 text-lg font-semibold">API on this page</h2>
    <div class="flex flex-col gap-4">
      <div v-for="group in groups" :key="group.title">
        <h3 class="pb-1 text-sm font-medium">{{ group.title }}</h3>
        <div class="overflow-x-auto rounded-md border">
          <table class="w-full text-left text-sm">
            <thead class="border-b bg-muted/50">
              <tr>
                <th class="px-3 py-2 font-medium">Name</th>
                <th class="px-3 py-2 font-medium">{{ group.typeLabel }}</th>
                <th
                  v-if="group.title === 'Props'"
                  class="px-3 py-2 font-medium"
                >
                  Default
                </th>
                <th class="px-3 py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in group.rows"
                :key="row.name"
                class="border-b last:border-0"
              >
                <td class="px-3 py-2 align-top font-mono text-xs">
                  {{ row.name }}
                </td>
                <td class="px-3 py-2 align-top font-mono text-xs">
                  {{ row.type }}
                </td>
                <td
                  v-if="group.title === 'Props'"
                  class="px-3 py-2 align-top font-mono text-xs"
                >
                  {{ (row as Row).default ?? '' }}
                </td>
                <td class="px-3 py-2 align-top text-muted-foreground">
                  {{ row.description }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>
