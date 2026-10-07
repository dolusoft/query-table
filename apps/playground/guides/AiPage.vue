<script setup lang="ts">
import { CheckIcon, CopyIcon } from '@lucide/vue'
import { useClipboard } from '@vueuse/core'

import { Button } from '@/ui/button'

import {
  aiSections,
  guidePages,
  rawUrl,
  skillFiles,
  skillInstall
} from './guides'
import DocHeader from '../shell/DocHeader.vue'
import InlineCode from '../shell/InlineCode.vue'

// The "Use with AI" page: the skill, how to install it, its raw files and
// llms.txt. Text and links come from guides.ts.
const page = guidePages.find(guide => guide.id === 'ai')!
const section = (id: string) => aiSections.find(entry => entry.id === id)!
const { copy, copied } = useClipboard({ copiedDuring: 1500 })
const base = import.meta.env.BASE_URL
</script>

<template>
  <article class="flex flex-col gap-10">
    <DocHeader :title="page.title" :summary="page.summary" />
    <section
      v-for="id in ['ai-skill', 'ai-install']"
      :id="id"
      :key="id"
      class="flex scroll-m-28 flex-col gap-3"
    >
      <h2 class="text-xl font-medium tracking-tight">
        {{ section(id).title }}
      </h2>
      <p>
        <InlineCode :text="section(id).text" />
      </p>
      <div v-if="id === 'ai-install'" class="flex flex-col gap-2">
        <pre
          class="overflow-x-auto rounded-xl border bg-muted/50 px-4 py-3.5 text-sm"
          data-testid="skill-install"
          tabindex="0"
        ><code>{{ skillInstall }}</code></pre>
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="min-h-11 self-start sm:pointer-fine:min-h-7"
          @click="copy(skillInstall)"
        >
          <component :is="copied ? CheckIcon : CopyIcon" />
          {{ copied ? 'Copied' : 'Copy the commands' }}
        </Button>
      </div>
    </section>
    <section id="ai-files" class="flex scroll-m-28 flex-col gap-3">
      <h2 class="text-xl font-medium tracking-tight">
        {{ section('ai-files').title }}
      </h2>
      <p>
        {{ section('ai-files').text }}
      </p>
      <ul class="flex flex-col gap-1 text-sm">
        <li v-for="path in skillFiles" :key="path">
          <a
            :href="rawUrl(path)"
            target="_blank"
            rel="noopener"
            class="font-mono text-xs break-all underline underline-offset-4"
            >{{ path }}</a
          >
        </li>
      </ul>
    </section>
    <section id="ai-llms" class="flex scroll-m-28 flex-col gap-3">
      <h2 class="text-xl font-medium tracking-tight">
        {{ section('ai-llms').title }}
      </h2>
      <p>
        <InlineCode :text="section('ai-llms').text" />
      </p>
      <ul class="flex flex-col gap-1 text-sm">
        <li>
          <a
            :href="`${base}llms.txt`"
            target="_blank"
            rel="noopener"
            class="underline underline-offset-4"
            >llms.txt</a
          >
        </li>
        <li>
          <a
            :href="`${base}llms-full.txt`"
            target="_blank"
            rel="noopener"
            class="underline underline-offset-4"
            >llms-full.txt</a
          >
        </li>
      </ul>
    </section>
  </article>
</template>
