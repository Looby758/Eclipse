import { Clapperboard, Flame, ListChecks, Tv, User, Video } from 'lucide-react'
import { useEffect, useState } from 'react'
import { localDate } from '@core/library'
import { yearsWithWatches, type YearReview } from '@core/year'
import { formatDate, plural } from '@core/format'
import { formatHours } from '@core/time'
import type { View } from '../store/app'
import { useApp } from '../store/app'
import Sheet from './Sheet'
import Poster from './Poster'
import Credits from './Credits'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Your year in Eclipse (Phase 25): the year in review, from your watch dates. */
export default function YearSheet({ year: asked }: { year?: number }): React.JSX.Element {
  const library = useApp((s) => s.library)
  const go = useApp((s) => s.go)
  const years = yearsWithWatches(library)
  const thisYear = Number(localDate(new Date()).slice(0, 4))
  const year = asked ?? (years.includes(thisYear) ? thisYear : (years[0] ?? thisYear))
  const [review, setReview] = useState<YearReview | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setReview(null)
    window.api.yearReview(year).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setReview(r.value)
        setError('')
      } else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [year])

  const open = (key: string): void => {
    const [type, id] = key.split(':')
    go({ name: 'title', type: type as 'movie' | 'tv', id: Number(id) })
  }
  const peak = review ? Math.max(1, ...review.months) : 1

  return (
    <Sheet className="year">
      <div className="sheet-head">
        <h1>Your {year} in Eclipse</h1>
      </div>
      {years.length > 1 && (
        <div className="segmented">
          {years.slice(0, 8).map((y) => (
            <button key={y} className={y === year ? 'on' : ''} onClick={() => go({ name: 'year', year: y } as View)}>
              {y}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {!review && !error && <p className="muted">Adding up your year…</p>}
      {review && !review.minutes && <p>Nothing with a date in {year} yet. Watches with no date (seen before Eclipse) don’t count here.</p>}
      {review && review.minutes > 0 && (
        <>
          <div className="year-big">
            <div>
              <strong>{formatHours(review.minutes)}</strong>
              <span>watched</span>
            </div>
            <div>
              <strong>{review.films}</strong>
              <span>{review.films === 1 ? 'film' : 'films'}</span>
            </div>
            <div>
              <strong>{review.episodes}</strong>
              <span>episodes of {plural(review.shows, 'show')}</span>
            </div>
            <div>
              <strong>{review.days}</strong>
              <span>days with something on</span>
            </div>
          </div>

          <section className="card year-months" aria-label="Hours by month">
            <h2>{review.busiestMonth !== null ? `Your busiest month was ${MONTH_NAMES[review.busiestMonth]}` : 'By month'}</h2>
            <div className="year-bars">
              {review.months.map((m, i) => (
                <div key={i} className={`year-bar ${i === review.busiestMonth ? 'peak' : ''}`} title={`${MONTH_NAMES[i]}: ${m ? formatHours(m) : 'nothing'}`}>
                  <span className="year-bar-value">{m ? formatHours(m) : ''}</span>
                  <span className="year-bar-fill" style={{ height: `${Math.max(m ? 4 : 0, (m / peak) * 100)}%` }} />
                  <span className="year-bar-label">{MONTHS[i]}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="year-grid">
            {review.binge && (
              <section className="card">
                <h2>
                  <Flame size={16} /> Longest binge
                </h2>
                <p>
                  {plural(review.binge.episodes, 'episode')} of{' '}
                  <button className="note-open" onClick={() => open(review.binge!.key)}>
                    <strong>{review.binge.name}</strong>
                  </button>{' '}
                  on {formatDate(review.binge.day)}.
                </p>
                {review.streak && (
                  <p className="muted small">
                    And {review.streak.days} days in a row with something on, {formatDate(review.streak.from)} to {formatDate(review.streak.to)}.
                  </p>
                )}
              </section>
            )}
            {review.director && (
              <section className="card">
                <h2>
                  <Video size={16} /> Your director
                </h2>
                <p>
                  <strong>{review.director.person.name}</strong>: {plural(review.director.titles.length, 'film')} ({review.director.titles.join(', ')}).
                </p>
              </section>
            )}
            {review.actor && (
              <section className="card">
                <h2>
                  <User size={16} /> Your actor
                </h2>
                <p>
                  <strong>{review.actor.person.name}</strong>, in {review.actor.titles.slice(0, 4).join(', ')}
                  {review.actor.titles.length > 4 ? ` and ${review.actor.titles.length - 4} more` : ''}.
                </p>
              </section>
            )}
            {(review.showsFinished > 0 || review.listsFinished.length > 0) && (
              <section className="card">
                <h2>
                  <ListChecks size={16} /> Finished
                </h2>
                {review.showsFinished > 0 && <p>{plural(review.showsFinished, 'show')} all the way through.</p>}
                {review.listsFinished.length > 0 && <p>Lists and watch orders: {review.listsFinished.join(', ')}.</p>}
              </section>
            )}
          </div>

          <h2 className="list-sub">Most watched</h2>
          <div className="year-top">
            {review.topTitles.map((t, i) => (
              <button key={t.key} className="year-top-item" onClick={() => open(t.key)}>
                <span className="year-rank">{i + 1}</span>
                <span className="year-top-poster">
                  <Poster path={t.posterPath} type={t.type} id={Number(t.key.split(":")[1])} name={t.name} size="w185" />
                </span>
                <span className="year-top-name">{t.name}</span>
                <span className="muted small">
                  {t.type === 'tv' ? <Tv size={12} /> : <Clapperboard size={12} />} {formatHours(t.minutes)}
                  {t.type === 'tv' ? ` · ${plural(t.count, 'episode')}` : t.count > 1 ? ` · ${t.count} times` : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <Credits />
    </Sheet>
  )
}
