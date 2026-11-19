import { useEffect, useRef } from 'react'
import { useApp, type View } from '../store/app'

/**
 * Phase 56: opening a poster zooms into it. Clicking a poster anywhere (the wall, the shelf, a list,
 * Home, search) grows a copy of it smoothly from where it sat until it fills the window, and the
 * title's page comes up through it, so it feels like stepping into the poster rather than a page
 * loading. Going back shrinks it into the same place. With "Keep the poster wall still" (or the
 * computer's reduce-animations setting) it's a simple fade instead.
 *
 * Nothing needs wiring up where posters are: a click is noted on its way down, and if it opens a
 * title page straight after, the poster image inside what was clicked is the one that grows.
 */

const GROW_MS = 1400
const SHRINK_MS = 950
/** A click only counts as opening the page if the page opens this soon after it. */
const CLICK_WINDOW_MS = 600

type Origin = { rect: DOMRect; src: string; radius: string }

const isTitle = (v: View | undefined): boolean => v?.name === 'title'

/** The poster image a click landed on: the lifted tile on the wall, or a portrait picture inside the button clicked. */
function posterUnder(target: Element | null): HTMLImageElement | null {
  const root = document.documentElement
  if (root.classList.contains('wall-pointing')) {
    const tile = document.querySelector('.wall-tile.lifted')
    if (tile instanceof HTMLImageElement) return tile
  }
  if (!target) return null
  if (target instanceof HTMLImageElement && portrait(target)) return target
  const holder = target.closest('button, a, [role="button"], li')
  if (!holder) return null
  for (const img of holder.querySelectorAll('img')) if (portrait(img)) return img
  return null
}

const portrait = (img: HTMLImageElement): boolean => {
  const r = img.getBoundingClientRect()
  return r.width > 20 && r.height > r.width * 1.2 && !!img.currentSrc
}

const calm = (): boolean => document.documentElement.hasAttribute('data-still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A bigger copy of the poster to swap in while it grows, so it isn't blurry at full size. */
const bigger = (src: string): string => src.replace(/\/t\/p\/w\d+\//, '/t/p/w780/')

export default function ZoomLayer(): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let press: { target: Element | null; at: number } = { target: null, at: 0 }
    // Where each title page was opened from, by its place in the history.
    const origins = new Map<number, Origin>()

    const note = (e: Event): void => {
      press = { target: e.target instanceof Element ? e.target : null, at: performance.now() }
    }
    window.addEventListener('click', note, true)

    const ghost = (src: string, from: DOMRect | null, to: DOMRect | null, radius: string, ms: number, done: () => void): void => {
      const el = host.current
      if (!el) return
      const growing = !!from && !to
      // A dark veil over everything else, so the eye follows the poster.
      const veil = document.createElement('div')
      veil.className = 'zoom-veil'
      const img = document.createElement('img')
      img.className = 'zoom-ghost'
      img.alt = ''
      img.src = src
      el.append(veil, img)
      const full = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      const a = from ?? full
      const b = to ?? full
      type Box = { left: number; top: number; width: number; height: number }
      const lifted = (r: Box): Box => ({ left: r.left - r.width * 0.04, top: r.top - r.height * 0.04, width: r.width * 1.08, height: r.height * 1.08 })
      const frame = (r: Box, rad: string, opacity: number, offset: number, easing = 'cubic-bezier(0.65, 0, 0.35, 1)'): Keyframe => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: rad, opacity, offset, easing })
      const anim = img.animate(
        growing
          ? [
              // Lift off the page, hold a beat, sweep out to fill the window, then dissolve into the page.
              frame(a, radius, 1, 0, 'ease-out'),
              frame(lifted(a), radius, 1, 0.14),
              frame(lifted(a), radius, 1, 0.22),
              frame(b, '0px', 1, 0.7, 'ease-in'),
              frame(b, '0px', 0, 1)
            ]
          : [frame(a, '0px', 0, 0, 'ease-out'), frame(a, '0px', 1, 0.18), frame(lifted(b), radius, 1, 0.78, 'ease-out'), frame(b, radius, 1, 0.9), frame(b, radius, 0, 1)],
        { duration: ms, fill: 'forwards' }
      )
      veil.animate(growing ? [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }] : [{ opacity: 0.9 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0 }], { duration: ms, fill: 'forwards' })
      if (growing) {
        // Swap in the bigger picture once it has loaded, so the full-window frame isn't blurry.
        const big = new Image()
        big.onload = () => img.isConnected && (img.src = big.src)
        big.src = bigger(src)
      }
      const finish = (): void => {
        img.remove()
        veil.remove()
        done()
      }
      anim.onfinish = finish
      anim.oncancel = finish
    }

    const fade = (): void => {
      const root = document.documentElement
      root.classList.remove('page-fade')
      void root.offsetWidth
      root.classList.add('page-fade')
      window.setTimeout(() => root.classList.remove('page-fade'), 260)
    }

    const stop = useApp.subscribe((s, prev) => {
      if (s.history === prev.history) return
      const grew = s.history.length > prev.history.length || (s.history.length === prev.history.length && s.history[s.history.length - 1] !== prev.history[prev.history.length - 1])
      const top = s.history[s.history.length - 1]
      const index = s.history.length - 1
      if (grew && isTitle(top)) {
        origins.delete(index)
        if (performance.now() - press.at > CLICK_WINDOW_MS) return
        const img = posterUnder(press.target)
        press = { target: null, at: 0 }
        if (!img) return
        if (calm()) return fade()
        const rect = img.getBoundingClientRect()
        const radius = getComputedStyle(img).borderRadius || '12px'
        origins.set(index, { rect, src: img.currentSrc, radius })
        document.documentElement.classList.add('zooming')
        ghost(img.currentSrc, rect, null, radius, GROW_MS, () => document.documentElement.classList.remove('zooming'))
        return
      }
      if (!grew) {
        // Going back from a title page that was opened from a poster: shrink into where it came from.
        const left = prev.history.length - 1
        const origin = origins.get(left)
        for (const k of [...origins.keys()]) if (k >= s.history.length) origins.delete(k)
        if (!origin || !isTitle(prev.history[left])) return
        if (calm()) return fade()
        ghost(origin.src, null, origin.rect, origin.radius, SHRINK_MS, () => undefined)
      }
    })
    return () => {
      stop()
      window.removeEventListener('click', note, true)
    }
  }, [])

  return <div className="zoom-layer" ref={host} aria-hidden />
}
