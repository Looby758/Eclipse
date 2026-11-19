import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { localDate } from '@core/library'
import { freshTick, isTicked, type FreshTick } from '@core/reactions'
import { episodeKey, REACTIONS, type Library, type Reaction } from '@core/types'
import { useApp } from '../store/app'
import ReactionPicker from './ReactionPicker'

/** How long the question waits before it quietly goes away. */
const SHOW_FOR = 12_000

/**
 * Phase 47: straight after you tick an episode (anywhere: a title page, Home, the tray, the phone,
 * or when the player finishes it), one optional tap for how it hit you. It never asks about a batch
 * (a whole season, seen before), and it goes away by itself if you ignore it. Keys 1 to 5 pick too.
 */
export default function ReactionAsk(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const setLibrary = useApp((s) => s.setLibrary)
  const prev = useRef<Library | null>(null)
  const [ask, setAsk] = useState<FreshTick | null>(null)
  const [thanks, setThanks] = useState<Reaction | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const close = (ms = 0): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setAsk(null)
      setThanks(null)
    }, ms)
  }

  useEffect(() => {
    const before = prev.current
    prev.current = library
    // The first library to arrive (opening the app) is never "just ticked".
    if (!before || !Object.keys(before.entries).length) return
    const fresh = freshTick(before, library, localDate(new Date()))
    if (fresh) {
      setAsk(fresh)
      setThanks(null)
      close(SHOW_FOR)
    } else if (ask && !isTicked(library.entries[ask.key], episodeKey(ask.season, ask.episode))) {
      // The tick was undone: nothing left to react to.
      close()
    }
  }, [library])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const pick = async (r: Reaction | null): Promise<void> => {
    if (!ask) return
    try {
      setLibrary(await window.api.setReaction(ask.key as `tv:${number}`, episodeKey(ask.season, ask.episode), r))
      setThanks(r)
      close(r ? 1400 : 0)
    } catch {
      close()
    }
  }

  useEffect(() => {
    if (!ask || thanks) return
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= 5) {
        e.preventDefault()
        void pick((['cry', 'fire', 'laugh', 'sleep', 'wow'] as Reaction[])[n - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!ask) return null
  const label = `${ask.name} · S${ask.season} E${ask.episode}`
  return (
    <div className={`react-ask ${thanks ? 'done' : ''}`} role="dialog" aria-label="How did that episode hit you?">
      {thanks ? (
        <span className="react-ask-text">
          <span className="react-thanks" aria-hidden>
            {REACTIONS[thanks].emoji}
          </span>
          Saved on your heatmap
        </span>
      ) : (
        <>
          <span className="react-ask-text">
            <b>How did it hit you?</b>
            <span>{label}</span>
          </span>
          <ReactionPicker onPick={pick} />
          <button className="icon-btn react-ask-x" title="Not this time" aria-label="Not this time" onClick={() => close()}>
            <X size={15} />
          </button>
        </>
      )}
    </div>
  )
}
