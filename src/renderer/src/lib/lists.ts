import { useEffect, useState } from 'react'
import { sourceOf } from '@core/lists'
import type { ListView } from '@shared/api'
import { useApp } from '../store/app'

/** Loads a list's titles (saved by the app, so quick after the first time). Your own lists follow your changes. */
export function useList(id: string): { view: ListView | null; error: string; reload: (refresh?: boolean) => void } {
  const ownItems = useApp((s) => (s.library.lists ?? []).find((l) => l.id === id))
  // "From Sam" lists are made from your library, so they follow every change to it.
  const library = useApp((s) => (sourceOf(id)?.kind === 'from' ? s.library : null))
  const [view, setView] = useState<ListView | null>(null)
  const [error, setError] = useState('')
  const [nonce, setNonce] = useState<{ n: number; refresh: boolean }>({ n: 0, refresh: false })

  useEffect(() => {
    let cancelled = false
    window.api.openList(id, nonce.refresh).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setView(r.value)
        setError('')
      } else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [id, nonce.n, sourceOf(id)?.kind === 'custom' ? ownItems : null, library])

  return { view, error, reload: (refresh = false) => setNonce((x) => ({ n: x.n + 1, refresh })) }
}

/** "You've seen 7 of 12 Christopher Nolan films", worded for the kind of list. */
export function progressSentence(id: string, name: string, seen: number, total: number): string {
  const s = sourceOf(id)
  const of = `${seen} of ${total}`
  switch (s?.kind) {
    case 'person':
      return s.role === 'director' ? `You’ve seen ${of} ${name} films` : `You’ve seen ${of} films and shows with ${name}`
    case 'collection':
      return `You’ve seen ${of} films in ${name}`
    case 'guide':
      return `You’ve seen ${of} in the ${name.replace(/^the /i, '')} watch order`
    case 'from':
      return `${name}: you’ve watched ${of}`
    default:
      return `You’ve seen ${of} on ${name}`
  }
}

/** What kind of list it is, in a word or two. */
export function kindLabel(id: string): string {
  const s = sourceOf(id)
  switch (s?.kind) {
    case 'person':
      return s.role === 'director' ? 'Director' : 'Actor'
    case 'collection':
      return 'Film series'
    case 'guide':
      return 'Watch order'
    case 'tmdbList':
      return 'TMDB list'
    case 'from':
      return 'Recommended'
    default:
      return 'Your list'
  }
}
