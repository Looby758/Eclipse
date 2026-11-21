import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { formatDate, plural } from '@core/format'
import { activeEntry, showProgress } from '@core/library'
import type { BoxSetCard } from '@core/shelf'
import { formatHours } from '@core/time'
import { REACTION_LIST, REACTIONS, type Reaction, type TitleRef } from '@core/types'
import { useApp } from '../store/app'
import Poster from './Poster'
import MyTerms from './MyTerms'

/**
 * Phase 65, "Posters with a back": turn any poster over and the back is yours, like a trading
 * card: when you started and finished it, the hours, how episodes hit you, rewatches and who you
 * watched it with. Opened from a poster's right-click menu, by right-clicking a poster in Library
 * and lists, or with F on a focused poster.
 */

export const usePosterFlip = create<{ title: TitleRef | null; open(title: TitleRef): void; close(): void }>((set) => ({
  title: null,
  open: (title) => set({ title }),
  close: () => set({ title: null })
}))

export const flipPoster = (title: TitleRef): void => usePosterFlip.getState().open(title)

export default function PosterFlip(): React.JSX.Element | null {
  const title = usePosterFlip((s) => s.title)
  if (!title) return null
  return <FlipCard key={title.key} title={title} />
}

function FlipCard({ title: t }: { title: TitleRef }): React.JSX.Element {
  const close = usePosterFlip((s) => s.close)
  const entry = useApp((s) => s.library.entries[t.key])
  const [turned, setTurned] = useState(false)
  const [card, setCard] = useState<BoxSetCard | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const back = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Turn over a moment after it appears, so you see it flip.
    const still = document.documentElement.hasAttribute('data-still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setTurned(true), still ? 0 : 120)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopImmediatePropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    back.current?.focus()
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  useEffect(() => {
    if (!entry) return
    let live = true
    window.api.boxSet(t.key).then((r) => {
      if (live && r.ok) setCard(r.value)
    })
    if (t.type === 'tv')
      window.api.details('tv', t.id).then((r) => {
        if (live && r.ok) setTotal(showProgress(activeEntry(entry), r.value.data.seasons).total)
      })
    return () => {
      live = false
    }
  }, [t.key, !!entry])

  const open = (): void => {
    close()
    useApp.getState().go({ name: 'title', type: t.type, id: t.id })
  }

  // How episodes hit you (phase 47), every watch counted.
  const felt = new Map<Reaction, number>()
  for (const r of [entry?.reactions ?? {}, ...(entry?.rewatches ?? []).map((w) => w.reactions ?? {})]) for (const v of Object.values(r)) felt.set(v, (felt.get(v) ?? 0) + 1)
  const reactions = REACTION_LIST.filter((r) => felt.get(r))

  const facts: [string, string][] = []
  if (entry && card) {
    const going = entry.status === 'watching' || entry.status === 'stopped'
    if (card.type === 'tv') {
      if (card.started) facts.push(['Started', formatDate(card.started)])
      if (card.finished && !going) facts.push(['Finished', formatDate(card.finished)])
      else if (card.finished) facts.push(['Last watched', formatDate(card.finished)])
    } else if (card.finished) facts.push(['Watched', formatDate(card.finished)])
    if (card.seenBefore && !card.started) facts.push(['Seen', 'before Eclipse'])
    if (card.binge && card.binge.episodes > 1) facts.push(['Most in one day', `${plural(card.binge.episodes, 'episode')}, ${formatDate(card.binge.day)}`])
    if (card.with.length) facts.push(['Watched with', card.with.join(', ')])
    if (card.rating) facts.push(['Your rating', `${card.rating} / 10`])
    if (card.from) facts.push(['Recommended by', card.from])
  }
  const rewatches = card?.watches.filter((w) => w.label !== 'First time') ?? []
  const status = entry ? { want: 'On your watchlist', watching: 'Watching', watched: 'Watched', stopped: 'Stopped' }[entry.status] : 'Not in your library'
  const seen = entry && t.type === 'tv' ? Object.keys(activeEntry(entry)!.episodes ?? {}).length : 0

  return createPortal(
    <>
      <div className="flip-scrim" onClick={close} aria-hidden />
      <div className={`flip ${turned ? 'turned' : ''}`} role="dialog" aria-modal="true" aria-label={`${t.name}: the back of the poster`}>
        <div className="flip-inner">
          <div className="flip-face flip-front" aria-hidden>
            <Poster path={t.posterPath} type={t.type} id={t.id} name={t.name} size="w500" />
          </div>
          <div className="flip-face flip-back">
            <span className="flip-kicker">{status}</span>
            <h2>
              {t.name} {t.year ? <span>{t.year}</span> : null}
            </h2>
            {!entry ? (
              <p className="muted small">Nothing on the back yet: add it to your library and it fills in as you watch.</p>
            ) : !card ? (
              <p className="muted small">Turning it over…</p>
            ) : (
              <>
                <div className="flip-stats">
                  <div>
                    <b>{card.minutes ? formatHours(card.minutes) : '—'}</b>
                    <span>{card.estimated ? 'about this long' : 'spent on it'}</span>
                  </div>
                  {t.type === 'tv' && (
                    <div>
                      <b>
                        {seen}
                        {total ? <small> / {total}</small> : null}
                      </b>
                      <span>episodes</span>
                    </div>
                  )}
                  {card.timesThrough > 1 && (
                    <div>
                      <b>{card.timesThrough}×</b>
                      <span>all the way through</span>
                    </div>
                  )}
                </div>
                {facts.length > 0 && (
                  <dl className="flip-facts">
                    {facts.map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {reactions.length > 0 && (
                  <div className="flip-felt" aria-label="How it hit you">
                    {reactions.map((r) => (
                      <span key={r} title={REACTIONS[r].label}>
                        {REACTIONS[r].emoji} <b>{felt.get(r)}</b>
                      </span>
                    ))}
                  </div>
                )}
                {rewatches.length > 0 && (
                  <ul className="flip-watches">
                    {rewatches.map((w, i) => (
                      <li key={i}>
                        <b>{w.label}</b> {w.going ? `since ${formatDate(w.from)}` : w.to ? formatDate(w.to) : ''}
                      </li>
                    ))}
                  </ul>
                )}
                <MyTerms titleKey={t.key} />
              </>
            )}
            <div className="flip-actions">
              <button className="btn primary" onClick={open}>
                Open its page
              </button>
              <button className="btn" ref={back} onClick={close}>
                Turn it back
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
