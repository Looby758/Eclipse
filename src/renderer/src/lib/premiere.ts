import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { localDate, preferencesOf } from '@core/library'
import { premiereDays, premiereOf, premieresTonight, isReleaseOverride, type Premiere, type ReleaseOverride } from '@core/premiere'
import type { ComingSoon } from '@core/shelf'
import { serviceNameOf } from '@core/watching'
import type { MediaType, TitleDetails, WatchProviders } from '@core/types'
import { useApp } from '../store/app'

/**
 * Premiere night (phase 50) on Spotlight Home: which seasons you've been waiting for are out today,
 * when (in UK time), and the posters the wall shows while one is.
 */

/** The wall's posters while a premiere is on Home, and the show clicking them opens. Null the rest of the time. */
export const usePremiereWall = create<{ posters: string[] | null; show: { type: MediaType; id: number } | null; set(posters: string[] | null, show?: { type: MediaType; id: number } | null): void }>((set) => ({
  posters: null,
  show: null,
  set: (posters, show = null) => set({ posters, show })
}))

const TIMES = 'eclipse.premiereTimes'
const HIDDEN = 'eclipse.premiereHidden'

const read = <T>(key: string): Record<string, T> => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {}
  } catch {
    return {}
  }
}
const write = (key: string, value: Record<string, unknown>): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Not remembered; it still applies until Eclipse closes.
  }
}

/** One season's id for the times and "usual Home" remembered on this computer. */
export const seasonId = (p: Premiere): string => `${p.item.key}:S${p.item.season ?? 0}`

/** What Home needs for each show out today. */
export interface PremiereInfo {
  details: TitleDetails | null
  providers: WatchProviders | null
}

/**
 * The seasons out today, next one first, with what Home needs for each. Times you set and
 * "Usual Home for today" are remembered on this computer only (they only matter for a day).
 */
export function usePremieres(now: Date): {
  list: Premiere[]
  /** Every season out today or tomorrow, whatever day Home is on (for the shelf's stickers). */
  all: Premiere[]
  info: Record<string, PremiereInfo>
  hidden: (p: Premiere) => boolean
  hide(p: Premiere): void
  setTime(p: Premiere, time: ReleaseOverride | null): void
} {
  const library = useApp((s) => s.library)
  const [soon, setSoon] = useState<ComingSoon[]>([])
  const [info, setInfo] = useState<Record<string, PremiereInfo>>({})
  const [times, setTimes] = useState(() => read<ReleaseOverride>(TIMES))
  const [hiddenOn, setHiddenOn] = useState(() => read<string>(HIDDEN))
  const today = localDate(now)

  // Worked out again when the library changes (ticking the first episode ends premiere night) and each new day.
  useEffect(() => {
    let live = true
    window.api.comingSoon().then((r) => live && r.ok && setSoon(r.value))
    return () => {
      live = false
    }
  }, [library, today])

  // Only shows out today (or yesterday by TMDB's date, for ones out here the morning after) are looked at more closely.
  const near = useMemo(() => soon.filter((s) => s.type === 'tv' && premiereDays(s).includes(today)), [soon, today])
  const nearKeys = near.map((s) => s.key).join(',')
  useEffect(() => {
    let live = true
    for (const s of near) {
      if (info[s.key]) continue
      Promise.all([window.api.details('tv', s.id), window.api.providers('tv', s.id)]).then(([d, p]) => {
        if (live) setInfo((m) => ({ ...m, [s.key]: { details: d.ok ? d.value.data : null, providers: p.ok ? p.value.data : null } }))
      })
    }
    return () => {
      live = false
    }
  }, [nearKeys])

  const mine = preferencesOf(library).services
  const all = useMemo(() => {
    const all: Premiere[] = []
    for (const s of near) {
      const i = info[s.key]
      if (!i) continue
      const p = premiereOf(s, serviceFor(library.entries[s.key]?.links?.service, i.providers, mine), null)
      if (!p) continue
      const own = times[seasonId(p)]
      all.push(own && isReleaseOverride(own) ? premiereOf(s, p.service, own)! : p)
    }
    return all
  }, [near, info, times, mine.join(','), library])
  // `now` changes every minute on Home: enough for the day turning and the order once one is out.
  const list = useMemo(() => premieresTonight(all, now, localDate), [all, now])

  return {
    list,
    all,
    info,
    hidden: (p) => hiddenOn[seasonId(p)] === today,
    hide: (p) => {
      // Days gone by are tidied away as a new one is added.
      const next = Object.fromEntries(Object.entries(hiddenOn).filter(([, day]) => day >= today))
      next[seasonId(p)] = today
      setHiddenOn(next)
      write(HIDDEN, next)
    },
    setTime: (p, time) => {
      const next = { ...times }
      if (time) next[seasonId(p)] = time
      else delete next[seasonId(p)]
      setTimes(next)
      write(TIMES, next)
    }
  }
}

/** Where it's on: where you've watched it, else one of your services that has it, else the first service that does. */
function serviceFor(watchedOn: string | undefined, providers: WatchProviders | null, mine: number[]): string | null {
  if (watchedOn) return watchedOn
  const stream = providers?.stream ?? []
  const p = stream.find((x) => mine.includes(x.id)) ?? stream[0] ?? providers?.free[0]
  return p ? serviceNameOf(p.name) : null
}
