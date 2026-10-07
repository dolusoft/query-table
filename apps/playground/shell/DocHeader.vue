<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon } from '@lucide/vue'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/ui/breadcrumb'
import { Button } from '@/ui/button'

import { neighbours } from './docs-nav'
import InlineCode from './InlineCode.vue'

// The top of a documentation page, after the shadcn-vue docs: a breadcrumb,
// the title with the previous and next page as icon buttons at its end, and
// the summary as the lead paragraph.
defineProps<{ title: string; summary: string }>()

const route = useRoute()
const around = computed(() => neighbours(route.path))
</script>

<template>
  <header class="flex flex-col gap-2">
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink as-child>
            <RouterLink to="/overview">Docs</RouterLink>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{{ title }}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <div class="flex items-start justify-between gap-2">
      <h1 class="scroll-m-24 text-3xl font-semibold tracking-tight">
        {{ title }}
      </h1>
      <div class="flex shrink-0 items-center gap-2 pt-0.5">
        <Button
          v-if="around.previous"
          as-child
          variant="secondary"
          size="icon"
          class="size-11 lg:pointer-fine:size-8"
        >
          <RouterLink
            :to="`/${around.previous.id}`"
            :aria-label="`Previous: ${around.previous.title}`"
          >
            <ArrowLeftIcon />
          </RouterLink>
        </Button>
        <Button
          v-if="around.next"
          as-child
          variant="secondary"
          size="icon"
          class="size-11 lg:pointer-fine:size-8"
        >
          <RouterLink
            :to="`/${around.next.id}`"
            :aria-label="`Next: ${around.next.title}`"
          >
            <ArrowRightIcon />
          </RouterLink>
        </Button>
      </div>
    </div>
    <p class="text-base text-muted-foreground">
      <InlineCode :text="summary" />
    </p>
  </header>
</template>
