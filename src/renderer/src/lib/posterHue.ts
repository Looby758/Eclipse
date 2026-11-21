import { imageUrl } from '@core/tmdb'
import type { PosterColour } from '../lib/wall'

/**
 * Phase 62, the rainbow wall: each poster's main colour, picked once from a tiny copy of it and
 * remembered on this computer, so the wall can be arranged by colour.
 */

const STORE = 'eclipse.posterColours'
const MAX_SAVED = 3000

let saved: Record<string, PosterColour> | null = null

function store(): Record<string, PosterColour> {
  if (saved) return saved
  try {
    saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Record<string, PosterColour>
  } catch {
    saved = {}
  }
  return saved
}

let writeTimer = 0
function save(): void {
  window.clearTimeout(writeTimer)
  writeTimer = window.setTimeout(() => {
    try {
      const all = Object.entries(store())
      localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(all.slice(-MAX_SAVED))))
    } catch {
      // Not remembered; worked out again next time.
    }
  }, 500)
}

/** The colour already known for a poster, if any. */
export const knownColour = (path: string): PosterColour | undefined => store()[path]

const jobs = new Map<string, Promise<PosterColour | null>>()

/**
 * A poster's main colour: the hue most of its colourful pixels share (so a dark poster with a
 * red title counts as red), with how colourful and how light it is overall.
 */
export function posterColour(path: string): Promise<PosterColour | null> {
  const known = store()[path]
  if (known) return Promise.resolve(known)
  const url = imageUrl(path, 'w92')
  if (!url) return Promise.resolve(null)
  let job = jobs.get(path)
  if (!job) {
    job = new Promise<PosterColour | null>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const W = 16
          const H = 24
          const canvas = document.createElement('canvas')
          canvas.width = W
          canvas.height = H
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(img, 0, 0, W, H)
          const data = ctx.getImageData(0, 0, W, H).data
          const bins = new Array<number>(36).fill(0)
          let sat = 0
          let light = 0
          const n = data.length / 4
          for (let i = 0; i < data.length; i += 4) {
            const { h, s, l } = toHsl(data[i], data[i + 1], data[i + 2])
            sat += s
            light += l
            // Colourful, mid-light pixels say most about a poster's colour.
            const weight = s * (1 - Math.abs(l - 0.5) * 2)
            bins[Math.floor(h / 10) % 36] += weight
          }
          // Smooth neighbouring bins so a hue split across two bins still wins.
          const smooth = bins.map((v, i) => v + 0.5 * (bins[(i + 35) % 36] + bins[(i + 1) % 36]))
          const best = smooth.indexOf(Math.max(...smooth))
          const colour: PosterColour = { h: best * 10 + 5, s: Math.round((sat / n) * 100), l: Math.round((light / n) * 100), c: Math.round((bins[best] / n) * 1000) }
          store()[path] = colour
          save()
          resolve(colour)
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => resolve(null)
      img.src = url
    })
    jobs.set(path, job)
  }
  return job
}

function toHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return { h, s, l }
}
