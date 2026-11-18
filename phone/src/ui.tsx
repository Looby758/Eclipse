import { imageUrl } from '@core/tmdb'
import { onMyServices } from '@core/providers'
import { preferencesOf, activeEntry } from '@core/library'
import type { LibraryItem } from '@core/library'
import type { LibraryEntry, MediaType, SearchResult, TitleKey } from '@core/types'
import { usePhone } from './store'
import { getProviders, useLoad } from './cache'

/** Small pieces shared by the phone's screens. */

export function Poster({ path, name, size = 'w185', className = '' }: { path: string | null; name: string; size?: 'w92' | 'w185' | 'w342' | 'w500'; className?: string }): React.JSX.Element {
  const src = imageUrl(path, size)
  return src ? (
    <img className={`poster ${className}`} src={src} alt="" loading="lazy" decoding="async" />
  ) : (
    <div className={`poster poster-empty ${className}`} aria-hidden>
      {name.slice(0, 1)}
    </div>
  )
}

/** Your services that have it, as small logos (loaded when shown). */
export function MyServices({ type, id }: { type: MediaType; id: number }): React.JSX.Element | null {
  const prefs = preferencesOf(usePhone((s) => s.view))
  const { data } = useLoad(() => getProviders(type, id, prefs.region), [type, id, prefs.region])
  const mine = onMyServices(data, prefs.services)
  if (!mine.length) return null
  return (
    <span className="mini-services">
      {mine.slice(0, 3).map((p) => (p.logoPath ? <img key={p.id} src={imageUrl(p.logoPath, 'w92')!} alt={p.name} title={p.name} /> : <span key={p.id}>{p.name}</span>))}
    </span>
  )
}

export const itemOf = (r: Pick<SearchResult, 'key' | 'type' | 'id' | 'name' | 'year' | 'posterPath'>): LibraryItem => ({
  key: r.key as TitleKey,
  type: r.type,
  id: r.id,
  title: { name: r.name, year: r.year, posterPath: r.posterPath }
})

export const itemOfEntry = (e: LibraryEntry): LibraryItem => ({ key: e.key, type: e.type, id: e.id, title: e.title })

/** The entry as the screens should see it (on a rewatch: Watching, with the rewatch's ticks). */
export const useEntry = (key: string): LibraryEntry | undefined => activeEntry(usePhone((s) => s.view.entries[key]))

export const epLabel = (season: number, episode: number): string => `S${season} E${episode}`

/** Goes to a title page (kept in the address history, so the phone's back gesture works). */
export function openTitle(type: MediaType, id: number): void {
  history.pushState({ title: `${type}:${id}` }, '', `#${type}/${id}`)
  window.dispatchEvent(new PopStateEvent('popstate', { state: { title: `${type}:${id}` } }))
}
