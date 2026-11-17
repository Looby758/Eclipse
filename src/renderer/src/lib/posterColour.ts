import { imageUrl } from '@core/tmdb'

/**
 * The glow colour for a poster: its average colour, made vivid. Kept cool on purpose (no browns
 * or oranges): warm or muddy posters fall back to Eclipse's violet.
 */
export interface Hsl {
  h: number
  s: number
  l: number
}

export const DEFAULT_GLOW: Hsl = { h: 268, s: 90, l: 62 }

const cache = new Map<string, Promise<Hsl>>()

function toHsl(r: number, g: number, b: number): Hsl {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h *= 60
  return { h, s: s * 100, l: l * 100 }
}

/** Makes a sampled colour into a glow: vivid, and never brown, orange or dark green. */
export function glowFrom(sample: Hsl): Hsl {
  if (sample.s < 18) return DEFAULT_GLOW
  let h = sample.h
  // Warm (red-orange to yellow) and green hues are steered to the nearest cool neighbour.
  if (h >= 15 && h < 70) h = 340
  else if (h >= 70 && h < 160) h = 175
  return { h: Math.round(h), s: 90, l: 62 }
}

export function posterGlow(path: string | null): Promise<Hsl> {
  const url = imageUrl(path, 'w92')
  if (!url) return Promise.resolve(DEFAULT_GLOW)
  let job = cache.get(url)
  if (!job) {
    job = new Promise<Hsl>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 12
          const ctx = canvas.getContext('2d', { willReadFrequently: true })!
          ctx.drawImage(img, 0, 0, 12, 12)
          const data = ctx.getImageData(0, 0, 12, 12).data
          // Weight colourful pixels more, so a poster's accent beats its dark background.
          let r = 0
          let g = 0
          let b = 0
          let w = 0
          for (let i = 0; i < data.length; i += 4) {
            const px = toHsl(data[i], data[i + 1], data[i + 2])
            const weight = 0.2 + (px.s / 100) * (1 - Math.abs(px.l - 50) / 50)
            r += data[i] * weight
            g += data[i + 1] * weight
            b += data[i + 2] * weight
            w += weight
          }
          resolve(glowFrom(toHsl(r / w, g / w, b / w)))
        } catch {
          resolve(DEFAULT_GLOW)
        }
      }
      img.onerror = () => resolve(DEFAULT_GLOW)
      img.src = url
    })
    cache.set(url, job)
  }
  return job
}

export const hsl = (c: Hsl, alpha = 1): string => `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`
