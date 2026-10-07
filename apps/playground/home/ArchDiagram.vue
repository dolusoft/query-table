<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useId
} from 'vue'

import {
  GROUND_SQUASH,
  VIEW,
  buildLagoon,
  planLoop,
  ringSize,
  sample,
  stillFrame,
  type Frame
} from './lagoon-scene'

// The home page's architecture picture (lagoon-scene.ts). Animated, the JSON
// card hops from a table through the Query hub to a back end; still, it rests
// on the hub with its JSON shown. Black and white, with no backdrop: the
// island sits straight on the page.
const props = withDefaults(defineProps<{ animated?: boolean }>(), {
  animated: true
})

const lagoon = buildLagoon()
const clock = planLoop(lagoon)
const root = ref<HTMLDivElement | null>(null)

const uid = 'lg' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
const ids = {
  title: `${uid}-title`,
  desc: `${uid}-desc`
}

// Pill widths: estimated first, then measured once the font is in.
const width = reactive<Record<string, number>>({})
for (const l of lagoon.labels) {
  width[l.key] = l.text.length * 6.7
}
width.hubTitle = 38
width.hubCaption = 62
width.badge = 139
const hubWidth = computed(() => Math.max(width.hubTitle, width.hubCaption) + 26)

const RINGS = 6

// The scene scales with its box, but the words should read like the page
// around them: a label is the page's button text (Geist 14px, 500) and the
// mono lines its code text (12px), at most; a narrow screen shrinks them to
// 11px at least. `fit` scales each label group about its own centre to undo
// the scene's scale, so pills, dots and text stay in proportion.
const LABEL_PX = { max: 14, min: 11 }
const LABEL_UNITS = 12 // .lg-label-text font size in scene units
const fit = ref(1)
let resize: ResizeObserver | null = null

function fitLabels(svg: Element) {
  const scale = svg.getBoundingClientRect().width / VIEW.w
  if (!scale) {
    return
  }
  const px = Math.min(LABEL_PX.max, Math.max(LABEL_PX.min, LABEL_UNITS * scale))
  fit.value = px / (LABEL_UNITS * scale)
}

const around = (x: number, y: number) =>
  `translate(${x} ${y}) scale(${fit.value}) translate(${-x} ${-y})`

// Drawing: the clock gives a Frame, the Frame is written straight onto the
// SVG nodes, so Vue does not re-render sixty times a second.
interface Nodes {
  card: SVGGElement
  body: SVGGElement
  badge: SVGGElement
  shadow: SVGEllipseElement
  rings: SVGEllipseElement[]
  lit: Element[][]
  stones: Map<string, Element>
}
let nodes: Nodes | null = null

function collect(el: HTMLElement): Nodes {
  const one = <T extends Element>(s: string) => el.querySelector(s) as T
  const stones = new Map<string, Element>()
  el.querySelectorAll('[class*="lg-st-"]').forEach(n => {
    const m = n.getAttribute('class')?.match(/lg-st-(\d+-\d+)/)
    if (m) {
      stones.set(m[1], n)
    }
  })
  return {
    card: one('.lg-card'),
    body: one('.lg-card-body'),
    badge: one('.lg-badge'),
    shadow: one('.lg-card-shadow'),
    rings: [...el.querySelectorAll<SVGEllipseElement>('.lg-ring')],
    lit: Array.from({ length: 7 }, (_, i) => [
      ...el.querySelectorAll(`.lg-lit-r${i}, .lg-pill-lit-${i}`)
    ]),
    stones
  }
}

const lastStones = new Set<string>()
function draw(f: Frame) {
  if (!nodes) {
    return
  }
  const n = nodes
  n.card.setAttribute('transform', `translate(${f.card.x} ${f.card.y})`)
  n.card.style.opacity = String(f.card.opacity)
  n.body.setAttribute('transform', `scale(${f.card.sx} ${f.card.sy})`)
  n.badge.style.opacity = String(f.badge)
  n.shadow.setAttribute(
    'transform',
    `translate(${f.shadow.x} ${f.shadow.y}) scale(${f.shadow.scale})`
  )
  n.shadow.style.opacity = String(f.card.opacity)
  n.lit.forEach((els, i) =>
    els.forEach(e => ((e as SVGElement).style.opacity = String(f.lit[i])))
  )
  for (const key of lastStones) {
    if (!f.stones.has(key)) {
      ;(n.stones.get(key) as SVGElement | undefined)?.style.setProperty(
        'opacity',
        '0'
      )
    }
  }
  lastStones.clear()
  for (const [key, v] of f.stones) {
    ;(n.stones.get(key) as SVGElement | undefined)?.style.setProperty(
      'opacity',
      String(v)
    )
    lastStones.add(key)
  }
  const rings = [...f.rings]
  n.rings.forEach((ring, i) => {
    const entry = rings[i]
    if (!entry) {
      ring.style.opacity = '0'
      return
    }
    const [key, age] = entry
    const [leg, k] = key.split('-').map(Number)
    const p = lagoon.legs[leg][k + 1]
    const { rx, opacity } = ringSize(age)
    ring.setAttribute('cx', String(p.x))
    ring.setAttribute('cy', String(p.y + 2))
    ring.setAttribute('rx', String(rx))
    ring.setAttribute('ry', String(rx * GROUND_SQUASH))
    ring.style.opacity = String(opacity)
  })
}

// The clock runs only while the picture is on screen, the tab is visible and
// the reader has not asked for less motion; it resumes where it stopped.
const reducedMotion = ref(false)
let onScreen = false
let raf = 0
let last = 0
let time = 0

function tick(now: number) {
  time += Math.min(now - last, 100) / 1000
  last = now
  draw(sample(lagoon, clock, time))
  raf = requestAnimationFrame(tick)
}

function update() {
  const run =
    props.animated &&
    onScreen &&
    !reducedMotion.value &&
    document.visibilityState === 'visible'
  if (run && !raf) {
    last = performance.now()
    raf = requestAnimationFrame(tick)
  } else if (!run && raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  if (!run && (!props.animated || reducedMotion.value)) {
    draw(stillFrame(lagoon))
  }
}

let observer: IntersectionObserver | null = null
let motionQuery: MediaQueryList | null = null
function onMotion() {
  reducedMotion.value = motionQuery?.matches ?? false
  update()
}

onMounted(async () => {
  const el = root.value
  if (!el) {
    return
  }
  nodes = collect(el)
  motionQuery = matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = motionQuery.matches
  motionQuery.addEventListener('change', onMotion)
  document.addEventListener('visibilitychange', update)
  observer = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting
    update()
  })
  observer.observe(el)
  update()

  const svg = el.querySelector('.lg-svg')
  if (svg) {
    resize = new ResizeObserver(() => fitLabels(svg))
    resize.observe(svg)
    fitLabels(svg)
  }

  await (document.fonts?.ready ?? Promise.resolve())
  await nextTick()
  el.querySelectorAll<SVGTextElement>('text[data-measure]').forEach(t => {
    const length = t.getComputedTextLength()
    if (length > 0 && t.dataset.measure) {
      width[t.dataset.measure] = length
    }
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  raf = 0
  observer?.disconnect()
  resize?.disconnect()
  motionQuery?.removeEventListener('change', onMotion)
  document.removeEventListener('visibilitychange', update)
})
</script>

<template>
  <div ref="root" class="lg">
    <svg
      class="lg-svg"
      :viewBox="`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`"
      role="img"
      :aria-labelledby="ids.title"
      :aria-describedby="ids.desc"
    >
      <title :id="ids.title">
        Every table and every back end speak the same Query
      </title>
      <desc :id="ids.desc">
        A small lagoon of hexagon islands. Three table front ends, QueryTable,
        useQueryTable and TanStack table, sit on the far shore; the Query hub,
        plain JSON, sits in the middle; three back ends, a REST API, GraphQL and
        in-browser filtering, sit on the near shore. A JSON card hops along
        stepping stones from a table to the hub and on to a back end.
      </desc>

      <g>
        <!-- Islands and stepping stones, back to front -->
        <g aria-hidden="true">
          <g v-for="s in lagoon.shapes" :key="s.key">
            <template v-for="(p, i) in s.parts" :key="i">
              <polygon
                v-if="p.kind === 'poly'"
                :class="['lg-solid', p.cls]"
                :points="p.points"
                :style="{ fill: p.fill, stroke: p.fill, strokeWidth: p.sw }"
              />
              <circle
                v-else
                :class="p.cls"
                :cx="p.cx"
                :cy="p.cy"
                :r="p.r"
                :style="{ fill: p.fill }"
              />
            </template>
          </g>
        </g>

        <g aria-hidden="true">
          <ellipse
            v-for="i in RINGS"
            :key="'r' + i"
            class="lg-ring"
            rx="4"
            ry="2"
          />
        </g>

        <!-- The query card; until the clock runs it rests on the hub. -->
        <ellipse
          class="lg-card-shadow"
          rx="13"
          ry="4.5"
          :transform="`translate(${lagoon.hubTop.x} ${lagoon.hubTop.y})`"
          aria-hidden="true"
        />
        <g
          class="lg-card"
          :transform="`translate(${lagoon.hubTop.x} ${lagoon.hubTop.y})`"
          aria-hidden="true"
        >
          <g class="lg-card-body">
            <rect
              class="lg-card-side"
              x="-15"
              y="-8"
              width="30"
              height="8"
              rx="3"
            />
            <rect
              class="lg-card-top"
              x="-15"
              y="-21"
              width="30"
              height="16"
              rx="3.5"
            />
            <rect
              class="lg-card-spine"
              x="-15"
              y="-21"
              width="3.5"
              height="16"
              rx="1.75"
            />
            <rect
              class="lg-card-line"
              x="-6"
              y="-17.5"
              width="15"
              height="2"
              rx="1"
            />
            <rect
              class="lg-card-line"
              x="-6"
              y="-14"
              width="12"
              height="2"
              rx="1"
            />
            <rect
              class="lg-card-line"
              x="-6"
              y="-10.5"
              width="9"
              height="2"
              rx="1"
            />
          </g>
          <g class="lg-badge" :transform="around(0, -29)">
            <rect
              class="lg-pill"
              :x="-(width.badge + 18) / 2"
              y="-48"
              :width="width.badge + 18"
              height="19"
              rx="9.5"
            />
            <text
              class="lg-badge-text"
              data-measure="badge"
              y="-35"
              text-anchor="middle"
            >
              { sort, filter, page }
            </text>
          </g>
        </g>

        <!-- Labels -->
        <g
          v-for="l in lagoon.labels"
          :key="l.key"
          :transform="around(l.x, l.y)"
        >
          <rect
            class="lg-pill"
            :x="l.x - (width[l.key] + 32) / 2"
            :y="l.y - 10"
            :width="width[l.key] + 32"
            height="20"
            rx="10"
          />
          <rect
            :class="['lg-pill-lit', `lg-pill-lit-${l.role}`]"
            :x="l.x - (width[l.key] + 32) / 2"
            :y="l.y - 10"
            :width="width[l.key] + 32"
            height="20"
            rx="10"
            :style="{ stroke: `var(--lg-ring, var(--lg-r${l.role}))` }"
          />
          <circle
            :cx="l.x - (width[l.key] + 32) / 2 + 12"
            :cy="l.y"
            r="3.6"
            :style="{ fill: `var(--lg-dot, var(--lg-r${l.role}))` }"
          />
          <text
            class="lg-label-text"
            :data-measure="l.key"
            :x="l.x - (width[l.key] + 32) / 2 + 21"
            :y="l.y + 4.2"
          >
            {{ l.text }}
          </text>
        </g>

        <g :transform="around(lagoon.hubLabel.x, lagoon.hubLabel.y)">
          <rect
            class="lg-pill"
            :x="lagoon.hubLabel.x - hubWidth / 2"
            :y="lagoon.hubLabel.y - 14"
            :width="hubWidth"
            height="32"
            rx="9"
          />
          <rect
            class="lg-pill-lit lg-pill-lit-3"
            :x="lagoon.hubLabel.x - hubWidth / 2"
            :y="lagoon.hubLabel.y - 14"
            :width="hubWidth"
            height="32"
            rx="9"
            style="stroke: var(--lg-ring, var(--lg-r3))"
          />
          <text
            class="lg-hub-title"
            data-measure="hubTitle"
            :x="lagoon.hubLabel.x"
            :y="lagoon.hubLabel.y + 1"
            text-anchor="middle"
          >
            Query
          </text>
          <text
            class="lg-hub-caption"
            data-measure="hubCaption"
            :x="lagoon.hubLabel.x"
            :y="lagoon.hubLabel.y + 13"
            text-anchor="middle"
          >
            plain JSON
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style>
.lg-svg {
  display: block;
  width: 100%;
  height: auto;
  font-family: var(--font-sans);
}
.lg-solid {
  stroke-linejoin: round;
  stroke-width: 2.5;
}
.lg-lit {
  opacity: 0;
  fill-opacity: var(--lg-lit-alpha);
  stroke-opacity: var(--lg-lit-alpha);
}
.lg-cushion {
  opacity: var(--lg-cushion-alpha);
}
.lg-ring {
  fill: none;
  stroke: var(--lg-ripple);
  stroke-width: 1.6;
  opacity: 0;
}
.lg-card-shadow {
  fill: var(--lg-shadow);
}
.lg-card-side {
  fill: color-mix(in oklch, var(--lg-card) 72%, var(--lg-shade));
}
.lg-card-top {
  fill: var(--lg-card);
}
/* The card is light in both themes, so its spine is one grey in both. */
.lg-card-spine {
  fill: #9a9a9a;
}
.lg-card-line {
  fill: var(--lg-card-line);
}
.lg-pill {
  fill: var(--lg-pill);
  stroke: var(--lg-pill-stroke);
  stroke-width: 1;
}
.lg-pill-lit {
  fill: none;
  stroke-width: 1.8;
  opacity: 0;
}
/* Sizes in scene units; `fit` turns 12 units into the page's 14px, so the
   mono lines at 12 * 12 / 14 units come out at 12px. */
.lg-label-text {
  font-size: 12px;
  font-weight: 500;
  fill: var(--lg-pill-ink);
}
.lg-hub-title {
  font-size: 12px;
  font-weight: 600;
  fill: var(--lg-pill-ink);
}
.lg-hub-caption,
.lg-badge-text {
  font-family: var(--font-mono);
  font-size: 10.3px;
  fill: var(--lg-pill-muted);
}
.lg-badge-text {
  fill: var(--lg-pill-ink);
}

/* The page's dark theme follows the OS unless <html data-theme> pins one
   (skin/test-skin.css). The picture takes the same theme as a color-scheme,
   so every colour below is light-dark(light, dark). */
.lg {
  color-scheme: light;
}
[data-theme='dark'] .lg {
  color-scheme: dark;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .lg {
    color-scheme: dark;
  }
}

/* Black and white: paper and ink, inverted in the dark. The hub and the lit
   tiles are the ink. A few touches of colour: the grass tufts and the lines
   on the card take the page's emerald, the flowers beside them keep Hivebound's pastels
   (zernonia/hivebound, MIT), and the splash where the card lands is a pale
   blue. */
.lg {
  --lg-soil: light-dark(#d4d4d4, #2c2c2c);
  --lg-ripple: light-dark(oklch(0.72 0.09 235), oklch(0.68 0.09 235));
  --lg-tuft: light-dark(oklch(0.696 0.17 162.48), oklch(0.596 0.145 163.225));
  --lg-meadow: light-dark(#e2e2e2, #343434);
  --lg-grass: light-dark(#d8d8d8, #2f2f2f);
  --lg-honey: light-dark(#171717, #f5f5f5);
  --lg-honey-soft: light-dark(#cfcfcf, #4a4a4a);
  --lg-r0: light-dark(#fbfbfb, #5c5c5c);
  --lg-r1: light-dark(#fbfbfb, #5c5c5c);
  --lg-r2: light-dark(#fbfbfb, #5c5c5c);
  --lg-r3: light-dark(#171717, #f5f5f5);
  --lg-r4: light-dark(#fbfbfb, #5c5c5c);
  --lg-r5: light-dark(#fbfbfb, #5c5c5c);
  --lg-r6: light-dark(#fbfbfb, #5c5c5c);
  --lg-lit: light-dark(#171717, #fafafa);
  --lg-lit-alpha: 0.9;
  --lg-cushion-alpha: 0.35;
  --lg-card: light-dark(#ffffff, #f0f0f0);
  --lg-card-line: var(--lg-tuft);
  --lg-pill: light-dark(rgb(255 255 255 / 0.94), rgb(23 23 23 / 0.94));
  --lg-pill-stroke: light-dark(#e0e0e0, rgb(255 255 255 / 0.14));
  --lg-pill-ink: light-dark(#171717, #fafafa);
  --lg-pill-muted: light-dark(#737373, #a3a3a3);
  --lg-ring: light-dark(#171717, #fafafa);
  --lg-dot: light-dark(#171717, #fafafa);
  --lg-shadow: light-dark(rgb(0 0 0 / 0.13), rgb(0 0 0 / 0.5));
  --lg-flower-a: light-dark(#f7a8c4, #d98aa8);
  --lg-flower-b: light-dark(#f7c873, #e6dc8f);
  --lg-flower-c: light-dark(#c6b3e6, #a996d6);
  --lg-shade: #000000;
}
</style>
