<script setup lang="ts">
import { Badge } from '@/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/ui/table'

import {
  availabilityLabels,
  featureGroups,
  features,
  groupNotes,
  groupTitles,
  serverModeLabels,
  type Availability,
  type ServerMode
} from './feature-matrix'
import { blobUrl, guidePages } from './guides'
import { tanstackFeatureGuides } from './tanstack'
import { pages } from '../manifest'
import DocHeader from '../shell/DocHeader.vue'
import InlineCode from '../shell/InlineCode.vue'

// The feature matrix page: one table per group, all drawn from
// feature-matrix.ts. A group is a wide part of the page (`data-wide`), as an
// example's preview is: its table takes the column's width, up to 64rem,
// while the group's heading and note keep the 40rem reading measure. In the
// 40rem measure every table scrolled sideways even on a wide screen. Where
// the column is narrower than a table, only the table's own bordered box
// scrolls, never the page: on a phone, and on a tablet while the sidebar is
// open (769px to about 980px), where the column is narrower than 41rem.
const page = guidePages.find(guide => guide.id === 'features')!

const pageTitle = (id: string) => pages.find(entry => entry.id === id)?.title
// A repository path breaks after a slash, never inside a name.
const pathParts = (path: string) => path.split(/(?<=\/)/)
const guideOf = (id: string | null) =>
  tanstackFeatureGuides.find(guide => guide.id === id)

const availabilityVariant = (value: Availability) =>
  value === 'yes' ? 'default' : value === 'no' ? 'outline' : 'secondary'
const modeVariant = (value: ServerMode) =>
  value === 'server' ? 'default' : value === 'backend' ? 'secondary' : 'outline'
</script>

<template>
  <article class="flex flex-col gap-10">
    <DocHeader :title="page.title" :summary="page.summary" />
    <section
      v-for="group in featureGroups"
      :id="`group-${group}`"
      :key="group"
      :aria-labelledby="`group-${group}-title`"
      data-wide
      class="flex scroll-m-28 flex-col gap-3"
    >
      <div class="max-w-160">
        <h2
          :id="`group-${group}-title`"
          class="flex items-center gap-2 text-xl font-medium tracking-tight"
        >
          {{ groupTitles[group] }}
          <Badge v-if="group === 'own'" data-testid="own-badge"
            >Query Table only</Badge
          >
        </h2>
        <p class="pt-2">
          <InlineCode :text="groupNotes[group]" />
        </p>
      </div>
      <!-- The table's own container scrolls; this box only draws the border
           and clips the rows to its rounded corners. -->
      <div
        data-feature-table
        class="@container overflow-hidden rounded-md border"
      >
        <!-- In a box narrower than 53rem (the widest table with one-line
             headings) a heading may break onto two lines and a repository
             path breaks after a slash. The widest table then needs about
             41rem at the least: it fits the column of a 768px tablet without
             the sidebar and of a 1024px window with it, and scrolls in a
             column narrower than 41rem. From 53rem the headings stay on one
             line. -->
        <Table :labelledby="`group-${group}-title`">
          <TableHeader>
            <TableRow
              class="hover:bg-transparent [&>th]:py-2 [&>th]:whitespace-normal @min-[53rem]:[&>th]:whitespace-nowrap"
            >
              <TableHead class="min-w-44">Feature</TableHead>
              <TableHead>In TanStack</TableHead>
              <TableHead>QueryTable</TableHead>
              <TableHead>TanStack path</TableHead>
              <TableHead>With a server</TableHead>
              <TableHead>See it</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="feature in features.filter(entry => entry.group === group)"
              :id="`feature-${feature.id}`"
              :key="feature.id"
              :data-feature="feature.id"
              class="align-top"
            >
              <TableCell class="max-w-md whitespace-normal">
                <span class="block font-medium">{{ feature.title }}</span>
                <span class="block text-xs text-muted-foreground">
                  <InlineCode :text="feature.summary" />
                </span>
              </TableCell>
              <TableCell>
                <template v-if="guideOf(feature.tanstack)">
                  <a
                    :href="guideOf(feature.tanstack)?.url"
                    target="_blank"
                    rel="noopener"
                    class="underline underline-offset-4"
                    >Yes</a
                  >
                </template>
                <span v-else class="text-muted-foreground">No</span>
              </TableCell>
              <TableCell>
                <Badge :variant="availabilityVariant(feature.component)">{{
                  availabilityLabels[feature.component]
                }}</Badge>
              </TableCell>
              <TableCell>
                <Badge :variant="availabilityVariant(feature.tanstackPath)">{{
                  availabilityLabels[feature.tanstackPath]
                }}</Badge>
              </TableCell>
              <TableCell>
                <Badge
                  v-if="feature.mode"
                  :variant="modeVariant(feature.mode)"
                  :data-mode="feature.mode"
                  >{{ serverModeLabels[feature.mode] }}</Badge
                >
                <span v-else class="text-muted-foreground">Not applicable</span>
              </TableCell>
              <TableCell class="whitespace-normal">
                <RouterLink
                  v-if="feature.example"
                  :to="`/${feature.example}`"
                  class="underline underline-offset-4"
                  >{{ pageTitle(feature.example) }}</RouterLink
                >
                <a
                  v-else-if="feature.repoPath"
                  :href="blobUrl(feature.repoPath)"
                  target="_blank"
                  rel="noopener"
                  class="underline underline-offset-4"
                  ><template
                    v-for="(part, index) in pathParts(feature.repoPath)"
                    :key="index"
                    ><wbr v-if="index" />{{ part }}</template
                  ></a
                >
                <span v-else class="text-muted-foreground"
                  >No live example</span
                >
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </section>
  </article>
</template>
