import { History } from 'lucide-react'
import { useState } from 'react'
import { localDate } from '@core/library'
import { agoLabel, episodeSpan, onThisDay, type Memory } from '@core/onthisday'
import { formatDate, plural } from '@core/format'
import { useApp } from '../store/app'
import Poster from './Poster'

function sentence(m: Memory): string {
  if (m.kind === 'episodes') return `You watched ${plural(m.episodes.length, 'episode')} of ${m.title.name} (${episodeSpan(m.episodes)}).`
  if (m.type === 'tv') return m.episodes.length ? `You finished ${m.title.name} (${episodeSpan(m.episodes)}).` : `You finished ${m.title.name}.`
  return `You watched ${m.title.name}.`
}

/** Home: "One year ago today you watched Interstellar", with the note you left. */
export default function OnThisDay(): React.JSX.Element | null {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const [all, setAll] = useState(false)
  const { nearby, memories } = onThisDay(library, localDate(new Date()))
  if (!memories.length) return null
  const shown = all ? memories : memories.slice(0, 3)

  return (
    <section className="otd" aria-label="On this day">
      <div className="otd-kicker">
        <History size={14} /> On this day
      </div>
      <ul className="otd-list">
        {shown.map((m, i) => {
          const firstOfYear = i === 0 || shown[i - 1].yearsAgo !== m.yearsAgo
          return (
            <li key={`${m.key}:${m.date}:${m.kind}`}>
              {firstOfYear && <div className="otd-when">{agoLabel(m.yearsAgo, nearby)}</div>}
              <button className="otd-item" onClick={() => go({ name: 'title', type: m.type, id: m.id })}>
                <span className="otd-poster">
                  <Poster path={m.title.posterPath} type={m.type} name={m.title.name} size="w92" />
                </span>
                <span className="otd-text">
                  <span className="otd-line">{sentence(m)}</span>
                  {m.note && <span className="otd-note">“{m.note}”</span>}
                  {nearby && <span className="otd-date">{formatDate(m.date)}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {memories.length > 3 && (
        <button className="link-btn" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `${memories.length - 3} more`}
        </button>
      )}
    </section>
  )
}
