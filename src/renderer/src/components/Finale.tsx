import { useEffect, useMemo, useRef, useState } from 'react'
import { daysBetween, finaleStats, finaleTimeline, themeShape, type FinaleStats, type FinaleTimeline } from '@core/finale'
import { isFavourite } from '@core/favourites'
import { formatDate, plural } from '@core/format'
import { localDate } from '@core/library'
import { refOf } from '@core/lists'
import { imageUrl } from '@core/tmdb'
import { parseEpisodeKey, type Episode, type TitleDetails } from '@core/types'
import { useApp } from '../store/app'
import { saveMuted, savedMuted, useFinale } from '../lib/finale'
import '../styles/finale.css'

/**
 * Phase 46: the send-off when you finish a show. A short "trailer" of your time with it (when you
 * started, who you watched it with, your longest night, your longest break, its best episode), set
 * to the show's own theme with the big moments landing on the music, then the numbers count up and
 * the finale hits on the theme's last big note with a soft chime: your seasons fly in as a wall,
 * the halo flares, and "COMPLETE". Then Copy image (for Discord), Save image, Add to favourites,
 * Watch again and Close. Pictures are only the show's posters and artwork, never anything from
 * inside an episode.
 */

type Highlight = { id: string; eb: string; big: string; sm: string }

const THEME_VOLUME = 0.3
/** How long to wait for the theme before starting without it. */
const THEME_WAIT_MS = 5000

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const weekday = (day: string): string => WEEKDAYS[new Date(`${day}T12:00:00`).getDay()]
const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
const names = (list: string[]): string => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`)

/** The highlights in story order, with the ones to keep first if time is short. */
function highlightsOf(s: FinaleStats, today: string): { story: Highlight[]; keep: string[] } {
  const story: Highlight[] = []
  const ago = daysBetween(s.startedOn, today)
  story.push({
    id: 'start',
    eb: ago > 1 ? `${ago} days ago` : 'Where it began',
    big: `It started on ${formatDate(s.startedOn)}`,
    sm: `Season ${s.firstEpisode.season}, episode ${s.firstEpisode.episode}${s.firstEpisode.name ? ` · ${s.firstEpisode.name}` : ''}`
  })
  if (s.together.length)
    story.push({ id: 'with', eb: 'Together', big: `You watched it with ${names(s.together.map((t) => t.who))}`, sm: `${plural(s.together.reduce((n, t) => n + t.episodes, 0), 'episode')} together` })
  if (s.longestNight)
    story.push({ id: 'night', eb: `${weekday(s.longestNight.day)} ${formatDate(s.longestNight.day)}`, big: `${s.longestNight.count} episodes in one night`, sm: 'your longest night with it' })
  if (s.longestBreak)
    story.push({ id: 'break', eb: `After season ${s.longestBreak.afterSeason}`, big: `${s.longestBreak.days} days away. Then you came back.`, sm: 'your longest break' })
  if (s.best) story.push({ id: 'best', eb: 'Its best episode', big: s.best.name, sm: `Season ${s.best.season}, episode ${s.best.episode} · rated ${s.best.rating} on TMDB` })
  return { story, keep: ['start', 'best', 'night', 'with', 'break'] }
}

// ---- Sound: the theme, and a soft chime (high and light, nothing low) ----

class Sound {
  ctx: AudioContext | null = null
  master: GainNode | null = null
  theme: { src: AudioBufferSourceNode; gain: GainNode } | null = null

  constructor(muted: boolean) {
    try {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = muted ? 0 : 1
      this.master.connect(this.ctx.destination)
    } catch {
      this.ctx = null
    }
  }

  async decode(bytes: Uint8Array | null): Promise<AudioBuffer | null> {
    if (!bytes || !this.ctx) return null
    try {
      return await this.ctx.decodeAudioData(bytes.slice().buffer)
    } catch {
      return null
    }
  }

  playTheme(buffer: AudioBuffer): void {
    if (!this.ctx || !this.master) return
    this.stopTheme(0)
    const src = this.ctx.createBufferSource()
    const gain = this.ctx.createGain()
    src.buffer = buffer
    const t = this.ctx.currentTime
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(THEME_VOLUME, t + 1.2)
    src.connect(gain)
    gain.connect(this.master)
    src.start()
    this.theme = { src, gain }
  }

  stopTheme(seconds: number): void {
    if (!this.theme || !this.ctx) return
    const { src, gain } = this.theme
    this.theme = null
    const t = this.ctx.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(gain.gain.value, t)
    gain.gain.linearRampToValueAtTime(0, t + Math.max(0.05, seconds))
    try {
      src.stop(t + Math.max(0.05, seconds) + 0.05)
    } catch {
      // Already stopped.
    }
  }

  chime(): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    for (const [f, v, d] of [[784, 0.07, 0], [1175, 0.05, 0.06], [1568, 0.035, 0.12], [2349, 0.02, 0.18]]) {
      const o = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t + d)
      g.gain.exponentialRampToValueAtTime(v, t + d + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 3.2)
      o.connect(g)
      g.connect(this.master)
      o.start(t + d)
      o.stop(t + d + 3.3)
    }
  }

  mute(on: boolean): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setValueAtTime(this.master.gain.value, t)
    this.master.gain.linearRampToValueAtTime(on ? 0 : 1, t + 0.3)
  }

  close(): void {
    this.stopTheme(0.3)
    const ctx = this.ctx
    this.ctx = null
    setTimeout(() => ctx?.close().catch(() => {}), 500)
  }
}

/** The theme's loudness, a value every 50 ms, to find its shape. */
function levelsOf(buffer: AudioBuffer, step = 0.05): number[] {
  const data = buffer.getChannelData(0)
  const n = Math.max(1, Math.round(buffer.sampleRate * step))
  const out: number[] = []
  for (let i = 0; i + n <= data.length; i += n) {
    let s = 0
    for (let j = i; j < i + n; j += 4) s += data[j] * data[j]
    out.push(Math.sqrt(s / (n / 4)))
  }
  return out
}

// ---- The screen ----

interface Loaded {
  details: TitleDetails
  stats: FinaleStats
  highlights: Highlight[]
  timeline: FinaleTimeline
  backdrops: string[]
  tiles: string[]
  theme: AudioBuffer | null
}

export default function Finale(): React.JSX.Element | null {
  const key = useFinale((s) => s.key)
  if (!key) return null
  return <FinaleScreen key={key} titleKey={key} />
}

function FinaleScreen({ titleKey }: { titleKey: string }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const setLibrary = useApp((s) => s.setLibrary)
  const close = useFinale((s) => s.close)
  const entry = library.entries[titleKey]
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [muted, setMuted] = useState(savedMuted)
  const [run, setRun] = useState(0)
  const [stage, setStage] = useState<{ hl: number; flash: number; count: boolean; finale: boolean; playing: boolean }>({ hl: -1, flash: 0, count: false, finale: false, playing: false })
  const [counts, setCounts] = useState([0, 0, 0])
  const [capturing, setCapturing] = useState(false)
  const [copied, setCopied] = useState<'copy' | 'save' | null>(null)
  const sound = useRef<Sound | null>(null)
  const timers = useRef<number[]>([])
  const still = useMemo(() => document.documentElement.hasAttribute('data-still') || matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  // Load everything first (most of it is already saved), the theme for at most a few seconds.
  useEffect(() => {
    let cancelled = false
    const s = new Sound(savedMuted())
    sound.current = s
    ;(async () => {
      if (!entry) return close()
      const r = await window.api.details('tv', entry.id)
      if (!r.ok) return close()
      const details = r.value.data
      const regular = details.seasons.filter((x) => x.number > 0)
      const [seasons, backdropOptions, bytes] = await Promise.all([
        Promise.all(regular.map((x) => window.api.season(details.id, x.number))),
        window.api.backdropOptions('tv', details.id),
        Promise.race([window.api.finaleTheme(details.id), new Promise<null>((res) => setTimeout(() => res(null), THEME_WAIT_MS))])
      ])
      const episodes: Episode[] = seasons.flatMap((x) => (x.ok ? x.value.data.episodes : []))
      const lib = useApp.getState().library
      const stats = finaleStats(lib, titleKey, details.seasons, episodes, details.runtime)
      if (!stats || cancelled) return cancelled ? undefined : close()
      const theme = await s.decode(bytes)
      const shape = theme ? themeShape(levelsOf(theme), 0.05) : null
      const { story, keep } = highlightsOf(stats, localDate(new Date()))
      let timeline = finaleTimeline(story.length, shape)
      let shown = story
      if (timeline.highlights.length < story.length) {
        const ids = new Set(keep.filter((id) => story.some((h) => h.id === id)).slice(0, timeline.highlights.length))
        shown = story.filter((h) => ids.has(h.id))
        timeline = finaleTimeline(shown.length, shape)
      }
      const chosen = lib.backdrops?.[titleKey]
      const paths = [chosen, details.backdropPath, ...(backdropOptions.ok ? backdropOptions.value.filter((o) => !o.language).map((o) => o.path) : [])].filter((p): p is string => !!p)
      const backdrops = [...new Set(paths)].map((p) => imageUrl(p, 'w1280')!)
      const posters = [lib.posters?.[titleKey] ?? details.posterPath, ...regular.map((x) => x.posterPath)].filter((p): p is string => !!p).map((p) => imageUrl(p, 'w342')!)
      const tiles = posters.length ? Array.from({ length: 24 }, (_, i) => posters[i % posters.length]) : []
      // Warm the pictures so the first highlight doesn't pop in.
      backdrops.slice(0, 5).forEach((u) => (new Image().src = u))
      if (!cancelled) setLoaded({ details, stats, highlights: shown, timeline, backdrops, tiles, theme })
    })()
    return () => {
      cancelled = true
      timers.current.forEach(clearTimeout)
      s.close()
    }
  }, [])

  // Play it (again).
  useEffect(() => {
    if (!loaded) return
    const s = sound.current!
    const t = loaded.timeline
    timers.current.forEach(clearTimeout)
    timers.current = []
    const at = (sec: number, fn: () => void): void => void timers.current.push(window.setTimeout(fn, sec * 1000))
    setStage({ hl: -1, flash: 0, count: false, finale: false, playing: !!loaded.theme })
    setCounts([0, 0, 0])
    if (loaded.theme) s.playTheme(loaded.theme)
    t.highlights.forEach((sec, i) => at(sec, () => setStage((x) => ({ ...x, hl: i, flash: sec === t.flashAt ? x.flash + 1 : x.flash }))))
    at(t.countAt, () => setStage((x) => ({ ...x, count: true })))
    at(t.finaleAt, finale)
    if (loaded.theme && t.themeOutAt != null) at(t.themeOutAt, () => fadeOut(t.themeOutFor))
  }, [loaded, run])

  function fadeOut(seconds: number): void {
    sound.current?.stopTheme(seconds)
    window.setTimeout(() => setStage((x) => ({ ...x, playing: false })), seconds * 1000)
  }

  function finale(): void {
    setStage((x) => ({ ...x, finale: true, count: false, flash: x.flash + 1 }))
    sound.current?.chime()
  }

  // The numbers count up while the music drops back.
  useEffect(() => {
    if (!stage.count || !loaded) return
    const target = [loaded.stats.episodes, Math.round(loaded.stats.minutes / 60), loaded.stats.days]
    const t0 = performance.now()
    const span = Math.max(1, (loaded.timeline.finaleAt - loaded.timeline.countAt - 0.4) * 1000)
    let raf = 0
    const step = (): void => {
      const k = Math.min(1, (performance.now() - t0) / span)
      const e = 1 - Math.pow(1 - k, 3)
      setCounts(target.map((n) => Math.round(n * e)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    if (still) setCounts(target)
    else raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [stage.count])

  // Escape closes it (before it can go back a page).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const skip = (): void => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    fadeOut(1)
    finale()
  }

  const toggleMute = (): void => {
    const on = !muted
    setMuted(on)
    saveMuted(on)
    sound.current?.mute(on)
  }

  const picture = async (how: 'copy' | 'save'): Promise<void> => {
    if (!loaded) return
    setCapturing(true)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    try {
      const r = await window.api.finaleImage(how, loaded.details.name)
      if (r.done) {
        setCopied(how)
        window.setTimeout(() => setCopied(null), 2200)
      }
    } finally {
      setCapturing(false)
    }
  }

  const fav = isFavourite(library, titleKey)
  const toggleFav = async (): Promise<void> => {
    if (entry) setLibrary(await window.api.setFavourite(refOf(entry), !fav))
  }

  const s = loaded?.stats
  const hours = s ? Math.round(s.minutes / 60) : 0
  const h = loaded && stage.hl >= 0 ? loaded.highlights[stage.hl] : null
  const bg = loaded && stage.hl >= 0 && loaded.backdrops.length ? loaded.backdrops[stage.hl % loaded.backdrops.length] : null
  const sparks = useMemo(
    () =>
      Array.from({ length: still ? 0 : 40 }, () => {
        const a = Math.random() * Math.PI * 2
        const r = 18 + Math.random() * 45
        return { x: `${Math.cos(a) * r}vw`, y: `${Math.sin(a) * r * 0.8}vh`, t: `${(1.2 + Math.random() * 1.4).toFixed(2)}s`, d: `${(Math.random() * 0.25).toFixed(2)}s` }
      }),
    [run]
  )
  const tileMotion = useMemo(
    () =>
      Array.from({ length: 24 }, () => {
        const a = Math.random() * Math.PI * 2
        const r = 60 + Math.random() * 30
        return { dx: `${Math.cos(a) * r}vw`, dy: `${Math.sin(a) * r}vh`, r: `${(Math.random() - 0.5) * 40}deg`, d: `${(Math.random() * 0.5).toFixed(2)}s` }
      }),
    [run]
  )
  // The episode that finished it: the furthest one in the show.
  const last = Object.keys(entry?.episodes ?? {})
    .map(parseEpisodeKey)
    .filter((x): x is { season: number; episode: number } => !!x && x.season > 0)
    .sort((a, b) => b.season - a.season || b.episode - a.episode)[0]

  return (
    <div className={`finale ${still ? 'still' : ''} ${capturing ? 'capturing' : ''}`} role="dialog" aria-label={`You finished ${loaded?.details.name ?? 'a show'}`}>
      {loaded && (
        <>
          {loaded.backdrops.length > 0 &&
            loaded.highlights.map((_, i) => (
              <div key={`${run}-${i}`} className={`fn-bg ${stage.hl === i && !stage.count && !stage.finale ? 'on' : ''}`} style={{ backgroundImage: `url(${loaded.backdrops[i % loaded.backdrops.length]})` }} />
            ))}
          {bg === null && stage.hl >= 0 && !stage.finale && <div className="fn-bg on plain" />}
          <div className="fn-vig" />
          {h && !stage.count && !stage.finale && (
            <div className="fn-hl" key={`${run}-${stage.hl}`}>
              <div className="eb">{h.eb}</div>
              <div className="big">{h.big}</div>
              <div className="sm">{h.sm}</div>
            </div>
          )}
          <div className={`fn-count ${stage.count ? 'on' : ''}`} aria-hidden={!stage.count}>
            <div><b>{counts[0]}</b><span>episodes</span></div>
            <div><b>{counts[1]}</b><span>hours</span></div>
            <div><b>{counts[2]}</b><span>days</span></div>
          </div>
          <div className="fn-flash" key={`flash-${stage.flash}`} data-on={stage.flash > 0 && !still ? '' : undefined} />
          <div className={`fn-fin ${stage.finale ? 'on' : ''}`} key={`fin-${run}`}>
            <div className="wall">
              {loaded.tiles.map((src, i) => (
                <i key={i} style={{ backgroundImage: `url(${src})`, ['--dx' as string]: tileMotion[i].dx, ['--dy' as string]: tileMotion[i].dy, ['--r' as string]: tileMotion[i].r, ['--d' as string]: tileMotion[i].d }} />
              ))}
            </div>
            <div className="dim" />
            <div className="rays" />
            <div className="shock" />
            <div className="shock b" />
            <div className="sparks">
              {sparks.map((p, i) => (
                <i key={i} style={{ ['--x' as string]: p.x, ['--y' as string]: p.y, ['--t' as string]: p.t, ['--d' as string]: p.d }} />
              ))}
            </div>
            <div className="ft">
              <div className="halo" />
              <small>You finished</small>
              <h2>{loaded.details.name}</h2>
              <div className="comp">Complete</div>
              {s && (
                <div className="line">
                  {plural(s.seasons, 'season')} · {plural(s.episodes, 'episode')} · {plural(hours, 'hour')} · {plural(s.days, 'day')}
                </div>
              )}
              <div className="acts">
                <button className="fn-btn pri" onClick={() => picture('copy')}>{copied === 'copy' ? 'Copied. Paste it into Discord' : 'Copy image'}</button>
                <button className="fn-btn" onClick={() => picture('save')}>{copied === 'save' ? 'Saved' : 'Save image'}</button>
                <button className={`fn-btn fav ${fav ? 'on' : ''}`} aria-pressed={fav} onClick={toggleFav}>{fav ? '♥ In your favourites' : '♡ Add to favourites'}</button>
                <button className="fn-btn" onClick={() => setRun((n) => n + 1)}>Watch again</button>
                <button className="fn-btn" onClick={close}>Close</button>
              </div>
            </div>
            {s && <div className="milestone">Your {ordinal(s.finishedCount)} finished show.</div>}
          </div>
        </>
      )}
      {!loaded && last && (
        <div className="fn-tick">
          <i>✓</i>
          <b>
            S{last.season} E{last.episode}
          </b>{' '}
          ticked
        </div>
      )}
      {loaded?.theme && (
        <div className={`fn-tune ${stage.playing ? 'playing' : ''}`}>
          <span className="bars"><i /><i /><i /><i /></span>
          <span>{loaded.details.name} · theme</span>
          <button onClick={toggleMute}>{muted ? 'Unmute' : 'Mute'}</button>
        </div>
      )}
      {loaded && !stage.finale && (
        <button className="fn-skip" onClick={skip}>
          Skip to the end
        </button>
      )}
    </div>
  )
}
