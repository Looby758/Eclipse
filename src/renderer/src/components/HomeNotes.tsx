import { Check, Users } from 'lucide-react'
import { nextEpisodeFor, watchesWith } from '@core/library'
import { episodeKey } from '@core/types'
import { useApp } from '../store/app'
import { useDetailsMany } from '../lib/availability'

const label = (s: number, e: number): string => `S${s} E${e}`

/** Home: "Next with Sam: The Boys S3 E2", one card per show you're watching with someone. */
function Together(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const shows = Object.values(library.entries).filter((e) => e.type === 'tv' && watchesWith(e).length)
  const { map } = useDetailsMany(
    shows.map((e) => e.key),
    shows.length > 0
  )
  const rows = shows.flatMap((e) =>
    watchesWith(e).map(({ index, watch }) => {
      const d = map[e.key]
      const next = d ? nextEpisodeFor({ ...e, episodes: watch.episodes }, d.seasons) : null
      return { e, index, who: watch.with, next }
    })
  )
  if (!rows.length) return null
  return (
    <section className="note" aria-label="Watching with someone">
      <div className="note-kicker">
        <Users size={14} /> Watching together
      </div>
      {rows.map(({ e, index, who, next }) => (
        <div key={`${e.key}:${index}`} className="note-line">
          <button className="note-open" onClick={() => go({ name: 'title', type: e.type, id: e.id })}>
            Next with {who}: <strong>{e.title.name}</strong>
            {next ? ` ${label(next.season, next.episode)}` : ' (all caught up)'}
          </button>
          {next && (
            <div className="row" style={{ marginTop: 6 }}>
              <button className="chip" onClick={async () => setLibrary(await window.api.tickWith(e.key, index, [episodeKey(next.season, next.episode)], true))}>
                <Check size={14} /> Watched it with {who}
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  )
}

/** The small cards above On this day. */
export default function HomeNotes(): React.JSX.Element {
  return (
    <>
      <Together />
    </>
  )
}
