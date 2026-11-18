import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { activeEntry, localDate, nextEpisodeFor } from '@core/library'
import { episodeKey, STATUS_LABELS, type LibraryEntry, type WatchStatus } from '@core/types'
import { usePhone } from './store'
import { getDetails, useLoad } from './cache'
import { MyServices, Poster, epLabel, itemOfEntry, openTitle } from './ui'

const TABS: WatchStatus[] = ['watching', 'want', 'watched']

const fold = (s: string): string => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Your library: Watching, Want to watch and Watched, with a box to find something by name. */
export default function LibraryTab(): React.JSX.Element {
  const view = usePhone((s) => s.view)
  const [tab, setTab] = useState<WatchStatus>(() => (sessionStorage.getItem('eclipse.phone.libTab') as WatchStatus) || 'watching')
  const [query, setQuery] = useState('')
  const choose = (t: WatchStatus): void => {
    setTab(t)
    sessionStorage.setItem('eclipse.phone.libTab', t)
  }

  const groups = useMemo(() => {
    const out: Record<WatchStatus, LibraryEntry[]> = { want: [], watching: [], watched: [], stopped: [] }
    for (const raw of Object.values(view.entries)) {
      const e = activeEntry(raw)!
      out[e.status].push(e)
    }
    out.watching.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    out.want.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    out.watched.sort((a, b) => (b.watchedOn ?? b.updatedAt).localeCompare(a.watchedOn ?? a.updatedAt))
    return out
  }, [view])

  const q = fold(query.trim())
  const shown = q ? [...groups.watching, ...groups.want, ...groups.watched, ...groups.stopped].filter((e) => fold(e.title.name).includes(q)) : groups[tab]

  return (
    <section className="tab">
      <input className="field search-field" type="search" placeholder="Find in your library" value={query} onChange={(e) => setQuery(e.target.value)} enterKeyHint="search" />
      {!q && (
        <div className="segments" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => choose(t)}>
              {STATUS_LABELS[t]} <span className="count">{groups[t].length}</span>
            </button>
          ))}
        </div>
      )}
      {!shown.length && <p className="empty">{q ? 'Nothing in your library by that name.' : tab === 'watching' ? 'Nothing on the go. Find something in Search or For you.' : 'Nothing here yet.'}</p>}
      <ul className="rows">
        {shown.slice(0, 300).map((e) => (
          <Row key={e.key} entry={e} showStatus={!!q} providers={e.status !== 'watched'} />
        ))}
      </ul>
      {shown.length > 300 && <p className="empty">Showing the latest 300. Type a name to find older ones.</p>}
    </section>
  )
}

function Row({ entry, showStatus, providers }: { entry: LibraryEntry; showStatus: boolean; providers: boolean }): React.JSX.Element {
  return (
    <li className="row">
      <button className="row-main" onClick={() => openTitle(entry.type, entry.id)}>
        <Poster path={entry.title.posterPath} name={entry.title.name} size="w92" className="row-poster" />
        <span className="row-text">
          <b>{entry.title.name}</b>
          <span className="sub">
            {[entry.title.year, entry.type === 'tv' ? 'Show' : 'Film', showStatus ? STATUS_LABELS[entry.status] : null].filter(Boolean).join(' · ')}
          </span>
          {entry.type === 'tv' && entry.status === 'watching' && <NextLine entry={entry} />}
          {providers && <MyServices type={entry.type} id={entry.id} />}
        </span>
      </button>
      {entry.type === 'tv' && entry.status === 'watching' && <TickNext entry={entry} />}
    </li>
  )
}

function useNext(entry: LibraryEntry): { season: number; episode: number } | null | undefined {
  const { data } = useLoad(() => getDetails('tv', entry.id), [entry.id])
  if (!data) return undefined
  return nextEpisodeFor(entry, data.seasons)
}

function NextLine({ entry }: { entry: LibraryEntry }): React.JSX.Element | null {
  const next = useNext(entry)
  if (next === undefined) return null
  return <span className="sub next">{next ? `Next: ${epLabel(next.season, next.episode)}` : 'All caught up'}</span>
}

/** One tap to tick the next episode, right from the list. */
function TickNext({ entry }: { entry: LibraryEntry }): React.JSX.Element | null {
  const act = usePhone((s) => s.act)
  const next = useNext(entry)
  if (!next) return null
  const tick = (): void =>
    act({ kind: 'episodes', item: itemOfEntry(entry), keys: [episodeKey(next.season, next.episode)], watched: true, day: today(), had: true })
  return (
    <button className="tick-next" onClick={tick} aria-label={`Tick ${entry.title.name} ${epLabel(next.season, next.episode)}`}>
      <Check size={18} />
      <span>{epLabel(next.season, next.episode)}</span>
    </button>
  )
}

/** Today on this phone, YYYY-MM-DD. */
export const today = (): string => localDate(new Date())
