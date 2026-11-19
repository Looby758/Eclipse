import { describe, expect, it } from 'vitest'
import { emptyLibrary, setEpisodes, setStatus } from './library'
import { buildStarMap, focusOf, STAR_MAPS, starMapFor, starTitle, type StarMapLayout } from './starmaps'
import { GUIDES, guideById } from './guides'
import { episodeKey, type TitleKey, type TitleRef } from './types'

const today = '2026-11-19'

/** Every star of a layout, flat. */
const spots = (m: StarMapLayout) => m.groups.flatMap((g) => g.stars)

/** Rows for a layout as if every title had come back from TMDB (one per star). */
function rowsFor(m: StarMapLayout, date = '2020-01-01'): TitleRef[] {
  return spots(m).map(([key]) => {
    const [t, s] = key.split('#s')
    const [type, id] = t.split(':')
    return { key: t as TitleKey, type: type as 'movie' | 'tv', id: Number(id), name: t, year: 2020, posterPath: null, date, ...(s ? { season: Number(s), episodes: 10 } : {}) }
  })
}

/** Do two straight segments cross (not just touch at an end)? */
function crosses(a: number[], b: number[]): boolean {
  const [x1, y1, x2, y2] = a
  const [x3, y3, x4, y4] = b
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3)
  if (!d) return false
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98
}

describe('star maps', () => {
  it('has a sky for every watch order, using only titles in it', () => {
    expect(GUIDES.map((g) => g.id).sort()).toEqual(STAR_MAPS.map((m) => m.guideId).sort())
    for (const m of STAR_MAPS) {
      const g = guideById(m.guideId)!
      const keys = new Set(g.entries.map((e) => `${e.type}:${e.id}`))
      for (const [key] of spots(m)) expect(keys, `${m.guideId} ${key}`).toContain(starTitle(key))
      // Each guide title is on the map somewhere.
      const placed = new Set(spots(m).map(([k]) => starTitle(k)))
      for (const k of keys) expect(placed, `${m.guideId} is missing ${k}`).toContain(k)
      // No star twice.
      expect(new Set(spots(m).map(([k]) => k)).size).toBe(spots(m).length)
    }
  })

  it('links only stars that are on the map', () => {
    for (const m of STAR_MAPS) {
      const keys = new Set(spots(m).map(([k]) => k))
      for (const l of m.links) {
        expect(keys, `${m.guideId} ${l.from}`).toContain(l.from)
        expect(keys, `${m.guideId} ${l.to}`).toContain(l.to)
      }
    }
  })

  // Lines meeting at the same star may touch there.
  it('keeps stars apart and lines from crossing', () => {
    for (const m of STAR_MAPS) {
      const all = spots(m)
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i][1] - all[j][1], all[i][2] - all[j][2]), `${m.guideId} ${all[i][0]} / ${all[j][0]}`).toBeGreaterThan(14)
      const at = new Map(all.map((s) => [s[0], s]))
      const segs: { name: string; s: number[]; ends: string[] }[] = []
      for (const g of m.groups) for (let i = 1; i < g.stars.length; i++) segs.push({ name: `${g.id} ${i}`, s: [g.stars[i - 1][1], g.stars[i - 1][2], g.stars[i][1], g.stars[i][2]], ends: [g.stars[i - 1][0], g.stars[i][0]] })
      for (const l of m.links) {
        const a = at.get(l.from)!
        const b = at.get(l.to)!
        // The real line is a curve: follow it in short pieces.
        const bend = l.bend ?? 0.06
        const cx = (a[1] + b[1]) / 2 - (b[2] - a[2]) * bend
        const cy = (a[2] + b[2]) / 2 + (b[1] - a[1]) * bend
        const pt = (t: number) => [(1 - t) ** 2 * a[1] + 2 * (1 - t) * t * cx + t * t * b[1], (1 - t) ** 2 * a[2] + 2 * (1 - t) * t * cy + t * t * b[2]]
        for (let k = 0; k < 8; k++) segs.push({ name: `${l.from}→${l.to}`, s: [...pt(k / 8), ...pt((k + 1) / 8)], ends: k === 0 ? [l.from] : k === 7 ? [l.to] : [] })
      }
      for (let i = 0; i < segs.length; i++)
        for (let j = i + 1; j < segs.length; j++) if (segs[i].name !== segs[j].name && !segs[i].ends.some((e) => segs[j].ends.includes(e))) expect(crosses(segs[i].s, segs[j].s), `${m.guideId}: ${segs[i].name} × ${segs[j].name}`).toBe(false)
    }
  })

  it('lights what you have seen, part-lights what you are partway through, and marks what is next', () => {
    const m = starMapFor('walking-dead')!
    const rows = rowsFor(m)
    const s1 = rows.find((r) => r.key === 'tv:1402' && r.season === 1)!
    const s2 = rows.find((r) => r.key === 'tv:1402' && r.season === 2)!
    const item = { key: 'tv:1402' as const, type: 'tv' as const, id: 1402, title: { name: 'TWD', year: 2010, posterPath: null } }
    let lib = setStatus(emptyLibrary(), item, 'watching')
    lib = setEpisodes(lib, item, [...Array(10)].map((_, i) => episodeKey(1, i + 1)), true)
    lib = setEpisodes(lib, item, [episodeKey(2, 1), episodeKey(2, 2)], true)
    const later = rows.map((r) => (r.key === 'tv:1402' && r.season === 11 ? { ...r, date: '2027-01-01' } : r))
    const map = buildStarMap(m, later, lib, today, s2)
    const star = (k: string) => map.groups.flatMap((g) => g.stars).find((s) => s.key === k)!
    expect(star(`tv:1402#s1`)).toMatchObject({ state: 'seen', fraction: 1 })
    expect(star(`tv:1402#s2`)).toMatchObject({ state: 'partial', fraction: 0.2, next: true })
    expect(star(`tv:1402#s3`).state).toBe('unseen')
    expect(star(`tv:1402#s11`).state).toBe('soon')
    expect(map.next?.key).toBe('tv:1402#s2')
    expect(map.seen).toBe(1)
    expect(map.partial).toBe(1)
    expect(s1).toBeTruthy()
  })

  it('puts a new season next to the show’s others', () => {
    const m = starMapFor('walking-dead')!
    const rows = rowsFor(m)
    const daryl = rows.filter((r) => r.key === starTitle(m.groups.find((g) => g.id === 'daryl')!.stars[0][0]))
    const last = daryl[daryl.length - 1]
    const extra = { ...last, season: (last.season ?? 0) + 1 }
    const map = buildStarMap(m, [...rows, extra], emptyLibrary(), today)
    const g = map.groups.find((x) => x.id === 'daryl')!
    const placed = g.stars[g.stars.length - 1]
    expect(placed.key).toBe(`${extra.key}#s${extra.season}`)
    const prev = g.stars[g.stars.length - 2]
    expect(placed.x).not.toBe(prev.x)
  })

  it('knows where a title sits and what is linked to it', () => {
    const m = starMapFor('walking-dead')!
    const map = buildStarMap(m, rowsFor(m), emptyLibrary(), today)
    const { here, near } = focusOf(map, 'tv:1402')
    expect([...here]).toEqual(['twd'])
    expect(near.size).toBeGreaterThanOrEqual(3)
    expect(near.has('twd')).toBe(false)
  })
})
