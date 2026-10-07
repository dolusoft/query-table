// The home page's architecture picture: a small isometric lagoon after
// Hivebound (zernonia/hivebound, MIT). Three table front ends sit on the far
// shore, the Query hub in the middle, three back ends on the near shore, and
// a JSON card hops along stepping stones from a table, through the hub, to a
// back end. Every colour is a CSS variable (ArchDiagram.vue), so the theme
// is pure CSS. No animation library: the whole scene is a
// function of one clock, drawn with requestAnimationFrame.

// The scene is drawn on a 520 x 316 plane; with no backdrop the view crops
// to the island, its labels and the card's highest hop (measured).
export const VIEW = { x: 76, y: 34, w: 380, h: 242 } as const

const S = 24 // px per world unit
const K = 0.72 // vertical squash of the ground plane (view elevation)
const CX = 260
const CY = 160

const TOP_LABELS = ['QueryTable', 'useQueryTable', 'TanStack table']
const BOTTOM_LABELS = ['REST API', 'GraphQL', 'In-browser']

interface Pt {
  x: number
  y: number
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** World (x across, z toward the viewer, y up) to SVG user units. */
function project(x: number, z: number, y = 0): Pt {
  return { x: r1(CX + x * S), y: r1(CY + z * S * K - y * S) }
}

type Part =
  | { kind: 'poly'; points: string; fill: string; cls?: string; sw?: number }
  | {
      kind: 'circle'
      cx: number
      cy: number
      r: number
      fill: string
      cls?: string
    }

interface Shape {
  key: string
  z: number
  parts: Part[]
}

const shade = (fill: string, keep = 70) =>
  `color-mix(in oklch, ${fill} ${keep}%, var(--lg-shade))`
const lighten = (fill: string) => `color-mix(in oklch, ${fill} 72%, white)`
const toPoints = (p: Pt[]) => p.map(q => `${q.x},${q.y}`).join(' ')

function corners(
  cx: number,
  cz: number,
  r: number,
  sx = 1,
  sz = 1
): [number, number][] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i
    return [cx + Math.cos(a) * r * sx, cz + Math.sin(a) * r * sz]
  })
}

/** Top face of a flat-top hexagon lying at height y. */
function face(
  cx: number,
  cz: number,
  r: number,
  y: number,
  fill: string,
  o: { cls?: string; sx?: number; sz?: number; sw?: number } = {}
): Part {
  const points = corners(cx, cz, r, o.sx, o.sz).map(([x, z]) =>
    project(x, z, y)
  )
  return { kind: 'poly', points: toPoints(points), fill, cls: o.cls, sw: o.sw }
}

/**
 * A hexagonal prism: the side band that faces the viewer (corners 0 to 3)
 * and the top. Each polygon gets a round-joined stroke in its own colour,
 * which softens the corners into a cushion without curve maths.
 */
function prism(
  cx: number,
  cz: number,
  r: number,
  top: number,
  bottom: number,
  fill: string,
  o: { sx?: number; sz?: number; sw?: number } = {}
): Part[] {
  const c = corners(cx, cz, r, o.sx, o.sz)
  const T = c.map(([x, z]) => project(x, z, top))
  const B = c.map(([x, z]) => project(x, z, bottom))
  const side = [T[0], B[0], B[1], B[2], B[3], T[3], T[2], T[1]]
  return [
    { kind: 'poly', points: toPoints(side), fill: shade(fill), sw: o.sw },
    { kind: 'poly', points: toPoints(T), fill, sw: o.sw }
  ]
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Axial hex coordinates of the seven islands: producers on the far edge, the
// hub (index 3) in the middle, readers on the near edge.
const SQRT3 = Math.sqrt(3)
const ROLE_HEX: [number, number][] = [
  [-3, 0],
  [0, -2],
  [3, -3],
  [0, 0],
  [-3, 3],
  [0, 2],
  [3, 0]
]
const SCALE = 1.22
const HUB = 3
const centres = ROLE_HEX.map(([q, r]) => ({
  x: 1.5 * q * SCALE,
  z: SQRT3 * (r + q / 2) * SCALE
}))
const roleH = (i: number) => (i === HUB ? 0.42 : 0.26)
const roleSize = (i: number) => (i === HUB ? 1.25 : 1)

const STONE_GAP = 0.95

interface Label {
  key: string
  role: number
  text: string
  x: number
  y: number
}

export interface Lagoon {
  shapes: Shape[]
  /** Landing points per leg: 0-2 producer to hub, 3-5 hub to reader. */
  legs: Pt[][]
  labels: Label[]
  hubLabel: Pt
  hubTop: Pt
}

export function buildLagoon(): Lagoon {
  const rnd = mulberry32(41)
  // No lagoon under the islands (no water, sand or soil): they stand on the
  // page itself.
  const shapes: Shape[] = []

  // Islands: the role tile and two meadow tiles behind it; a ring of honey
  // tiles round the hub.
  centres.forEach((c, i) => {
    const hub = i === HUB
    const tiles = [
      {
        dx: 0,
        dz: 0,
        y: roleH(i),
        s: roleSize(i),
        fill: `var(--lg-r${i})`,
        role: true
      }
    ]
    const ring = hub
      ? [
          [1.5, 0.866],
          [-1.5, 0.866],
          [1.5, -0.866],
          [-1.5, -0.866],
          [0, -1.732],
          [0, 1.732]
        ]
      : [
          [-0.75, -0.65],
          [0.8, -0.6]
        ]
    for (const [dx, dz] of ring) {
      const meadow = rnd() < 0.5 ? 'var(--lg-meadow)' : 'var(--lg-grass)'
      tiles.push({
        dx: dx * (hub ? 1.04 : 1),
        dz: dz * (hub ? 1.04 : 1),
        y: 0.1 + rnd() * 0.05,
        s: 0.62,
        fill: hub ? 'var(--lg-honey-soft)' : meadow,
        role: false
      })
    }
    tiles.forEach((t, k) => {
      const x = c.x + t.dx
      const z = c.z + t.dz
      const r = 0.96 * t.s
      const parts: Part[] = [
        ...prism(x, z, r * 0.94, t.y - 0.1, -0.12, 'var(--lg-soil)'),
        ...prism(x, z, r, t.y, t.y - 0.1, t.fill)
      ]
      if (t.role) {
        parts.push(
          face(x, z, r * 0.7, t.y, lighten(t.fill), { cls: 'lg-cushion' })
        )
        parts.push(
          face(x, z, r, t.y, 'var(--lg-lit)', { cls: `lg-lit lg-lit-r${i}` })
        )
      } else if (!hub) {
        // A few flowers and grass tufts.
        for (let n = 0; n < 3; n++) {
          const a = rnd() * Math.PI * 2
          const d = rnd() * 0.32
          const p = project(x + Math.cos(a) * d, z + Math.sin(a) * d, t.y)
          if (rnd() < 0.55) {
            parts.push({
              kind: 'circle',
              cx: p.x,
              cy: p.y - 1.5,
              r: 1.9,
              fill: `var(--lg-flower-${'abc'[n]})`
            })
          } else {
            const tuft = [
              [-2.4, 0],
              [-1, -5],
              [0, -1],
              [1.2, -5.5],
              [2.4, 0]
            ]
            parts.push({
              kind: 'poly',
              points: tuft.map(([u, v]) => `${p.x + u},${p.y + v}`).join(' '),
              fill: 'var(--lg-tuft)',
              sw: 0.6
            })
          }
        }
      }
      shapes.push({ key: `i${i}-${k}`, z, parts })
    })
  })

  // Stepping stones. Incoming ones shade from the producer's colour to honey,
  // outgoing ones from honey to the reader's colour; in black and white that
  // is a ramp from light to ink.
  const legs: Pt[][] = []
  for (let leg = 0; leg < 6; leg++) {
    const incoming = leg < 3
    const from = incoming ? leg : HUB
    const to = incoming ? HUB : leg + 1
    const a = centres[from]
    const b = centres[to]
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    const dx = (b.x - a.x) / length
    const dz = (b.z - a.z) / length
    const startGap = incoming ? 1.0 : 1.45
    const endGap = incoming ? 1.45 : 1.0
    const span = length - startGap - endGap
    const n = Math.max(2, Math.round(span / STONE_GAP) + 1)
    const bend = 0.35 * (leg % 2 ? 1 : -1)
    const points: Pt[] = [project(a.x, a.z, roleH(from) + 0.02)]
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1)
      const off = startGap + span * t
      const sway = Math.sin(t * Math.PI) * bend
      const x = a.x + dx * off - dz * sway
      const z = a.z + dz * off + dx * sway
      const fill = incoming
        ? `color-mix(in oklch, var(--lg-r${leg}) ${Math.round(100 - 80 * t)}%, var(--lg-honey))`
        : `color-mix(in oklch, var(--lg-honey) ${Math.round(100 - 55 * t)}%, var(--lg-r${leg + 1}))`
      shapes.push({
        key: `s${leg}-${k}`,
        z,
        parts: [
          ...prism(x, z, 0.3, 0.12, -0.08, fill, { sw: 2 }),
          face(x, z, 0.3, 0.12, 'var(--lg-lit)', {
            cls: `lg-lit lg-st-${leg}-${k}`,
            sw: 2
          })
        ]
      })
      points.push(project(x, z, 0.12))
    }
    points.push(project(b.x, b.z, roleH(to) + 0.02))
    legs.push(points)
  }

  shapes.sort((p, q) => p.z - q.z)

  const labels: Label[] = [
    ...TOP_LABELS.map((text, i) => {
      const p = project(centres[i].x, centres[i].z, roleH(i))
      return { key: `t${i}`, role: i, text, x: p.x, y: p.y - 30 }
    }),
    ...BOTTOM_LABELS.map((text, i) => {
      const role = i + 4
      const p = project(centres[role].x, centres[role].z, roleH(role))
      return { key: `b${i}`, role, text, x: p.x, y: p.y + 34 }
    })
  ]
  const hubGround = project(centres[HUB].x, centres[HUB].z, 0)

  return {
    shapes,
    legs,
    labels,
    hubLabel: { x: hubGround.x, y: hubGround.y + 22 },
    hubTop: legs[0][legs[0].length - 1]
  }
}

/**
 * All nine table and back end pairs. Neither row repeats a box back to back
 * (also across the loop), and the loop opens with crossing pairs so no column
 * reads as a fixed link.
 */
const PAIRS: [number, number][] = Array.from(
  { length: 9 },
  (_, k): [number, number] => [k % 3, (k + Math.floor(k / 3) + 1) % 3]
)

const HOP = 0.28 // one hop, seconds
const STEP = HOP + 0.04 // a hop and the settle after it
const LIFT = 17 // arc height, px
const DOCK = 0.9 // rest on the hub

interface Plan {
  start: number
  src: number
  dst: number
  /** Landing times, from the pair's start: incoming then outgoing. */
  inLand: number[]
  outLand: number[]
  dock: number
  leave: number
  arrive: number
  end: number
}

export interface Clock {
  plans: Plan[]
  loop: number
}

export function planLoop(lagoon: Lagoon): Clock {
  const plans: Plan[] = []
  let start = 0
  for (const [src, dst] of PAIRS) {
    const nIn = lagoon.legs[src].length - 1
    const nOut = lagoon.legs[dst + 3].length - 1
    const hopIn = 0.45
    const inLand = Array.from({ length: nIn }, (_, k) => hopIn + k * STEP + HOP)
    const dock = hopIn + nIn * STEP
    const leave = dock + DOCK
    const outLand = Array.from(
      { length: nOut },
      (_, k) => leave + k * STEP + HOP
    )
    const arrive = leave + nOut * STEP
    const end = arrive + 0.75
    plans.push({ start, src, dst, inLand, outLand, dock, leave, arrive, end })
    start += end
  }
  return { plans, loop: start }
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (t: number, from: number, length: number) =>
  clamp((t - from) / length)
const sineInOut = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2
const easeOut = (u: number) => 1 - (1 - u) ** 2
const backOut = (u: number) => {
  const c = 2.2
  return 1 + (c + 1) * (u - 1) ** 3 + c * (u - 1) ** 2
}

/** On between `on` and `off`, with fades of the given lengths. */
const pulse = (
  t: number,
  on: number,
  fadeIn: number,
  off: number,
  fadeOut: number
) => Math.min(ramp(t, on, fadeIn), 1 - ramp(t, off, fadeOut))

export interface Frame {
  card: { x: number; y: number; opacity: number; sx: number; sy: number }
  shadow: { x: number; y: number; scale: number }
  badge: number
  /** Light per island, index 0-6. */
  lit: number[]
  /** Light per stone, keyed `leg-k`. */
  stones: Map<string, number>
  /** Splash ring per stone: 0 is just landed, 1 is gone. */
  rings: Map<string, number>
}

/** Where the card is during one leg, `t` from the leg's first take-off. */
function onLeg(points: Pt[], t: number) {
  const k = Math.min(points.length - 2, Math.max(0, Math.floor(t / STEP)))
  const h = clamp((t - k * STEP) / HOP)
  const a = points[k]
  const b = points[k + 1]
  const e = sineInOut(h)
  const arc = Math.sin(Math.PI * h)
  const x = a.x + (b.x - a.x) * e
  const ground = a.y + (b.y - a.y) * e
  // Squash in the settle after a landing.
  const since = t - k * STEP - HOP
  const squash =
    since > 0 && since < 0.14 ? Math.sin((Math.PI * since) / 0.14) : 0
  return { x, ground, y: ground - LIFT * arc, arc, squash }
}

/** The still picture: the card rests on the hub, its JSON shown. */
export function stillFrame(lagoon: Lagoon): Frame {
  const { x, y } = lagoon.hubTop
  return {
    card: { x, y, opacity: 1, sx: 1, sy: 1 },
    shadow: { x, y, scale: 1 },
    badge: 1,
    lit: [0, 0, 0, 0, 0, 0, 0],
    stones: new Map(),
    rings: new Map()
  }
}

export function sample(lagoon: Lagoon, clock: Clock, time: number): Frame {
  const t = ((time % clock.loop) + clock.loop) % clock.loop
  const index = clock.plans.findIndex(p => t < p.start + p.end)
  const plan = clock.plans[index]
  const prev =
    clock.plans[(index + clock.plans.length - 1) % clock.plans.length]
  const u = t - plan.start
  const frame = stillFrame(lagoon)
  frame.badge = 0

  // The card.
  const inLeg = lagoon.legs[plan.src]
  const outLeg = lagoon.legs[plan.dst + 3]
  let pos
  if (u < plan.dock) {
    pos = onLeg(inLeg, u - 0.45)
  } else if (u < plan.leave) {
    const p = inLeg[inLeg.length - 1]
    pos = { x: p.x, ground: p.y, y: p.y, arc: 0, squash: 0 }
  } else {
    pos = onLeg(outLeg, u - plan.leave)
  }
  const appear = backOut(ramp(u, 0, 0.4))
  frame.card = {
    x: pos.x,
    y: pos.y,
    opacity: Math.min(ramp(u, 0, 0.3), 1 - ramp(u, plan.arrive + 0.4, 0.3)),
    sx: appear * (1 + 0.14 * pos.squash),
    sy: appear * (1 - 0.28 * pos.squash)
  }
  frame.shadow = { x: pos.x, y: pos.ground, scale: 1 - 0.45 * pos.arc }
  // The JSON opens while the card is docked, so it never covers a label.
  frame.badge = pulse(u, plan.dock - 0.04, 0.25, plan.leave + HOP * 0.4, 0.2)

  // Island light, the previous pair's reader still fading out.
  const lit = frame.lit
  lit[plan.src] = pulse(u, 0, 0.4, plan.dock, 0.5)
  lit[HUB] = Math.max(0, 1 - Math.abs(u - (plan.dock + 0.16)) / 0.22)
  const reader = plan.dst + 4
  const prevU = u + prev.end
  lit[prev.dst + 4] = Math.max(
    lit[prev.dst + 4],
    1 - ramp(prevU, prev.arrive + 0.9, 0.6)
  )
  lit[reader] = Math.max(
    lit[reader],
    ramp(u, plan.arrive - 0.06, 0.2) * (1 - ramp(u, plan.arrive + 0.9, 0.6))
  )

  // Stones and splash rings of this pair and the tail of the previous one.
  const stones = (p: Plan, local: number) => {
    const legsOf: [number, number[]][] = [
      [p.src, p.inLand],
      [p.dst + 3, p.outLand]
    ]
    for (const [leg, lands] of legsOf) {
      // The last landing is the island, not a stone.
      lands.slice(0, -1).forEach((land, k) => {
        const key = `${leg}-${k}`
        const light = pulse(local, land, 0.12, land + 0.5, 0.9)
        if (light > 0) {
          frame.stones.set(key, Math.max(frame.stones.get(key) ?? 0, light))
        }
        const age = (local - land) / 0.9
        if (age >= 0 && age < 1) {
          frame.rings.set(key, age)
        }
      })
    }
  }
  stones(prev, prevU)
  stones(plan, u)
  return frame
}

export const ringSize = (age: number) => ({
  rx: 4 + 15 * easeOut(age),
  opacity: 0.9 * (1 - easeOut(age))
})

export { K as GROUND_SQUASH }
