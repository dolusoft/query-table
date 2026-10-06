<script setup lang="ts">
import { SearchIcon } from '@lucide/vue'
import { ListboxFilter } from 'reka-ui'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { Badge } from '@/ui/badge'
import {
  CommandDialog,
  CommandGroup,
  CommandItem,
  CommandList
} from '@/ui/command'
import { InputGroup, InputGroupAddon } from '@/ui/input-group'
import { ScrollArea } from '@/ui/scroll-area'

import { readRecent, rememberSearch } from './recent'
import { revealAnchor } from './reveal'
import {
  createSearchIndex,
  groupByPage,
  highlight,
  searchDocs,
  snippet,
  type SearchHit
} from './search-index'
import { pages } from '../manifest'

// The documentation search dialog: shadcn-vue `CommandDialog` (reka-ui
// Dialog + Listbox) over a MiniSearch index of the contract. The Command's
// own substring filter stays idle (its search text is never set); the
// MiniSearch results are the items.
const open = defineModel<boolean>('open', { required: true })

const router = useRouter()
const index = createSearchIndex()
const query = ref('')
const recent = ref<string[]>([])

watch(open, isOpen => {
  if (isOpen) {
    query.value = ''
    recent.value = readRecent()
  }
})

const hits = computed(() => searchDocs(index, query.value))
const groups = computed(() => groupByPage(hits.value))

const go = async (pageId: string, anchor: string) => {
  open.value = false
  // The element of the page being left, when another page is opened: the
  // new page can carry the same anchor id.
  const leaving = router.currentRoute.value.path !== `/${pageId}`
  const stale = leaving && anchor ? document.getElementById(anchor) : null
  await router.push(`/${pageId}`)
  await revealAnchor(anchor, stale)
}

const choose = (hit: SearchHit) => {
  recent.value = rememberSearch(query.value)
  void go(hit.pageId, hit.anchor)
}
</script>

<template>
  <CommandDialog
    v-model:open="open"
    title="Search the documentation"
    description="Props, events, slots, methods, types, rules and pages"
    class="top-[12vh] sm:max-w-xl max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:rounded-none!"
  >
    <div data-slot="command-input-wrapper" class="p-1 pb-0">
      <InputGroup
        class="h-9! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!"
      >
        <ListboxFilter
          v-model="query"
          data-slot="command-input"
          data-testid="doc-search-input"
          auto-focus
          placeholder="Search props, events, rules…"
          aria-label="Search the documentation"
          class="w-full bg-transparent text-sm outline-hidden"
        />
        <InputGroupAddon>
          <SearchIcon class="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
    <!-- shadcn-vue ScrollArea scrolls the results; the list itself grows. -->
    <ScrollArea
      class="max-sm:min-h-0 max-sm:flex-1 *:data-[slot=scroll-area-viewport]:max-h-[min(70vh,32rem)] max-sm:*:data-[slot=scroll-area-viewport]:max-h-none"
    >
      <CommandList
        class="max-h-none overflow-visible **:data-[slot=command-group-heading]:px-2 **:data-[slot=command-group-heading]:py-1.5 **:data-[slot=command-group-heading]:text-xs **:data-[slot=command-group-heading]:font-medium **:data-[slot=command-group-heading]:text-muted-foreground"
        data-testid="doc-search-results"
      >
        <template v-if="query.trim()">
          <p
            v-if="hits.length === 0"
            class="py-6 text-center text-sm text-muted-foreground"
            data-testid="doc-search-empty"
          >
            No results for “{{ query.trim() }}”.
          </p>
          <CommandGroup
            v-for="group in groups"
            :key="group.pageId"
            :heading="group.pageTitle"
          >
            <CommandItem
              v-for="hit in group.hits"
              :key="hit.id"
              :value="hit.id"
              :data-doc-id="hit.id"
              class="items-start"
              @select="choose(hit)"
            >
              <Badge
                variant="outline"
                class="mt-0.5 w-16 font-mono text-[10px] text-muted-foreground uppercase"
                >{{ hit.kind }}</Badge
              >
              <span class="flex min-w-0 flex-col">
                <span
                  class="truncate font-medium"
                  :class="
                    hit.kind !== 'page' &&
                    hit.kind !== 'rule' &&
                    'font-mono text-xs'
                  "
                >
                  <template
                    v-for="(part, i) in highlight(hit.title, hit.terms)"
                    :key="i"
                    ><mark
                      v-if="part.match"
                      class="rounded-sm bg-yellow-200/70 text-inherit dark:bg-yellow-500/30"
                      >{{ part.text }}</mark
                    ><template v-else>{{ part.text }}</template></template
                  >
                </span>
                <span
                  v-if="hit.body"
                  class="line-clamp-2 text-xs text-muted-foreground"
                >
                  <template
                    v-for="(part, i) in highlight(
                      snippet(hit.body, hit.terms),
                      hit.terms
                    )"
                    :key="i"
                    ><mark
                      v-if="part.match"
                      class="rounded-sm bg-yellow-200/70 text-inherit dark:bg-yellow-500/30"
                      >{{ part.text }}</mark
                    ><template v-else>{{ part.text }}</template></template
                  >
                </span>
              </span>
            </CommandItem>
          </CommandGroup>
        </template>
        <template v-else>
          <CommandGroup v-if="recent.length > 0" heading="Recent searches">
            <CommandItem
              v-for="item in recent"
              :key="item"
              :value="`recent:${item}`"
              @select.prevent="query = item"
            >
              <SearchIcon class="opacity-50" />
              {{ item }}
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Pages">
            <CommandItem
              v-for="page in pages"
              :key="page.id"
              :value="`page:${page.id}`"
              @select="go(page.id, '')"
            >
              <Badge
                variant="outline"
                class="w-16 font-mono text-[10px] text-muted-foreground uppercase"
                >page</Badge
              >
              {{ page.title }}
            </CommandItem>
          </CommandGroup>
        </template>
      </CommandList>
    </ScrollArea>
  </CommandDialog>
</template>
