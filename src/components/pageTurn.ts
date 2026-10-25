// Page-turn transition between screens, like turning a page on an e-reader.
//
// When a screen unmounts, its DOM is still on the page during its layout-effect cleanup, so we copy it
// then (capturePage). When the next screen mounts, the copy is laid over it and turned away (playTurn),
// revealing the new screen underneath.

/** The app's reading order. Moving to a later screen turns forward; an earlier one turns back. */
const ORDER = [
  '/welcome', '/signup', '/login', '/check-email',
  '/onboarding/profile', '/onboarding/avatar', '/onboarding/joined',
  '/front', '/comics', '/stars',
  '/my-week', '/my-week/write', '/my-week/review',
  '/papers', '/papers/join', '/back-issues', '/settings',
]

const rank = (path: string) => {
  const i = ORDER.indexOf(path)
  return i < 0 ? ORDER.length : i
}

/** Sign-up, sign-in and onboarding screens change without the page turn. */
const NO_TURN = ['/welcome', '/signup', '/login', '/check-email', '/onboarding/profile', '/onboarding/avatar', '/onboarding/joined']
const turns = (path: string) => !NO_TURN.includes(path)

const DURATION_MS = 850
const SVG = 'http://www.w3.org/2000/svg'

let pending: { path: string; leaf: HTMLElement; left: number; width: number } | null = null
let active: { layer: HTMLElement; frame: number } | null = null
let ids = 0

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Copies the outgoing screen (page, dock and tab bar) just before it is removed. */
export function capturePage(path: string, main: HTMLElement | null) {
  if (!main || reducedMotion() || !turns(path)) return
  const app = main.closest('.app') ?? main
  const appRect = app.getBoundingClientRect()
  const mainRect = main.getBoundingClientRect()

  const leaf = document.createElement('div')
  leaf.className = 'page-leaf'
  const page = main.cloneNode(true) as HTMLElement
  page.classList.add('page-copy')
  page.style.top = `${mainRect.top}px`
  leaf.append(page)
  // Fixed bars belong to the outgoing screen too; inside the leaf they stay pinned to its edges.
  for (const bar of document.querySelectorAll<HTMLElement>('.dock, .tabbar')) leaf.append(bar.cloneNode(true))

  pending = { path, leaf, left: appRect.left, width: appRect.width }
}

type Pt = [number, number]

/** Keeps the part of a convex polygon where side(p) >= 0 (one Sutherland–Hodgman pass). */
function clip(poly: Pt[], side: (p: Pt) => number): Pt[] {
  const out: Pt[] = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!
    const sa = side(a)
    const sb = side(b)
    if (sa >= 0) out.push(a)
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  })
  return out
}

const pts = (poly: Pt[]) => poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
const css = (poly: Pt[]) => (poly.length ? `polygon(${poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})` : 'polygon(0 0, 0 0, 0 0)')
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const el = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  return el
}

/**
 * Peels the captured page away from one bottom corner to the opposite top corner, like a sticky note
 * or a book page: the part past the fold is cut from the page and drawn mirrored as the paper's back.
 */
export function playTurn(path: string) {
  const p = pending
  pending = null
  // React's development double-mount captures and remounts the same screen; nothing to turn then.
  if (!p || p.path === path || !turns(path)) return

  if (active) { cancelAnimationFrame(active.frame); active.layer.remove() }
  // The new screen is already in place under the peeling page, so it skips its own entrance.
  for (const el of document.querySelectorAll<HTMLElement>('.app > .screen, .app > .dock')) el.style.animation = 'none'

  const forward = rank(path) >= rank(p.path)
  const W = p.width
  const H = window.innerHeight
  const id = `peel-${ids++}`

  const layer = document.createElement('div')
  layer.className = 'page-turn'
  layer.setAttribute('aria-hidden', 'true')
  layer.inert = true
  layer.style.left = `${p.left}px`
  layer.style.width = `${W}px`

  // Shadow on the uncovered new page, the curled-back flap, and a soft shadow under the flap.
  const svg = svgEl('svg', { class: 'page-peel', width: W, height: H, viewBox: `0 0 ${W} ${H}` })
  const under = svgEl('linearGradient', { id: `${id}-under`, gradientUnits: 'userSpaceOnUse' })
  under.append(svgEl('stop', { offset: 0, 'stop-color': '#000', 'stop-opacity': 0.28 }), svgEl('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0 }))
  const back = svgEl('linearGradient', { id: `${id}-back`, gradientUnits: 'userSpaceOnUse' })
  back.append(
    svgEl('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.55 }),
    svgEl('stop', { offset: 0.35, 'stop-color': '#000', 'stop-opacity': 0.04 }),
    svgEl('stop', { offset: 1, 'stop-color': '#000', 'stop-opacity': 0.2 }),
  )
  const blur = svgEl('filter', { id: `${id}-shadow`, x: '-20%', y: '-20%', width: '140%', height: '140%' })
  blur.append(svgEl('feDropShadow', { dx: 0, dy: 2, stdDeviation: 6, 'flood-color': '#000', 'flood-opacity': 0.3 }))
  const defs = svgEl('defs', {})
  defs.append(under, back, blur)
  const shadow = svgEl('polygon', { fill: `url(#${id}-under)` })
  const flapGroup = svgEl('g', { filter: `url(#${id}-shadow)` })
  const flap = svgEl('polygon', { class: 'page-flap' })
  const flapShade = svgEl('polygon', { fill: `url(#${id}-back)` })
  flapGroup.append(flap, flapShade)
  svg.append(defs, shadow, flapGroup)

  layer.append(p.leaf, svg)
  document.body.append(layer)

  const rect: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]]
  const C: Pt = forward ? [W, H] : [0, H] // the corner that lifts
  const O: Pt = forward ? [0, 0] : [W, 0] // the corner it travels toward
  const L = Math.hypot(O[0] - C[0], O[1] - C[1])
  const d: Pt = [(O[0] - C[0]) / L, (O[1] - C[1]) / L]
  const along = (x: Pt) => (x[0] - C[0]) * d[0] + (x[1] - C[1]) * d[1]
  const at = (k: number): Pt => [C[0] + d[0] * k, C[1] + d[1] * k]

  const start = performance.now()
  const frame = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION_MS)
    // The fold sweeps a little past the far corner so the flap leaves the page completely.
    const s = (L + 40) * ease(t)
    const visible = clip(rect, x => along(x) - s)
    const lifted = clip(rect, x => s - along(x))
    const folded = lifted.map(([x, y]): Pt => {
      const k = 2 * (s - along([x, y]))
      return [x + d[0] * k, y + d[1] * k]
    })

    p.leaf.style.clipPath = css(visible)
    shadow.setAttribute('points', pts(lifted))
    flap.setAttribute('points', pts(folded))
    flapShade.setAttribute('points', pts(folded))
    const [fx, fy] = at(s)
    const [sx, sy] = at(Math.max(0, s - 70))
    const [tx, ty] = at(2 * s)
    under.setAttribute('x1', String(fx)); under.setAttribute('y1', String(fy))
    under.setAttribute('x2', String(sx)); under.setAttribute('y2', String(sy))
    back.setAttribute('x1', String(fx)); back.setAttribute('y1', String(fy))
    back.setAttribute('x2', String(tx)); back.setAttribute('y2', String(ty))

    if (t < 1) {
      active = { layer, frame: requestAnimationFrame(frame) }
    } else {
      layer.remove()
      if (active?.layer === layer) active = null
    }
  }
  active = { layer, frame: requestAnimationFrame(frame) }
}

/** The three reading pages, for swiping and arrow keys. */
export const READING = ['/front', '/comics', '/stars']
