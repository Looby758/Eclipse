import { ArrowDown, ArrowUp, Check, GripVertical, Moon, X } from 'lucide-react'
import { useState } from 'react'
import { formatRuntime, formatShortDay, plural } from '@core/format'
import { activeEntry, localDate, preferencesOf } from '@core/library'
import { formatHours, tonight } from '@core/time'
import { episodeRange, planEvenings, soonItem, tonightOptions, watchSoonOf, type SoonItem } from '@core/watchsoon'
import { useApp } from '../store/app'
import { useDetailsMany } from '../lib/availability'
import Sheet from './Sheet'
import Poster from './Poster'
import Credits from './Credits'

const dayName = (day: string, today: string): string => (day === today ? 'Tonight' : formatShortDay(day))

/** "Mon 17 Nov" style, or "Tonight", or "Tomorrow". */
function whenLabel(day: string, today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const tomorrow = localDate(new Date(y, m - 1, d + 1))
  return day === today ? 'tonight' : day === tomorrow ? 'tomorrow' : formatShortDay(day)
}

function leftLabel(i: SoonItem): string {
  if (i.unknown) return 'Working out how long…'
  if (i.done) return i.film ? 'Watched' : 'Caught up'
  const about = i.estimated ? 'about ' : ''
  if (i.film) return `Film · ${about}${formatRuntime(i.minutes)}`
  return `${plural(i.episodes.length, 'episode')} left (from ${episodeRange(i.episodes.slice(0, 1))}) · ${about}${formatHours(i.minutes)}`
}

/** Watch soon: a few films and shows to get to next, how long they take and how they fit your evenings. */
export default function WatchSoonSheet(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const { go, setLibrary } = useApp.getState()
  const prefs = preferencesOf(library)
  const refs = watchSoonOf(library)
  const { map } = useDetailsMany(
    refs.map((r) => r.key),
    refs.length > 0
  )
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const now = new Date()
  const today = tonight(now, prefs).day
  const items = refs.map((r) => soonItem(r, map[r.key], activeEntry(library.entries[r.key]), today))
  const plan = planEvenings(items, now, prefs)
  const first = plan.nights[0]
  const tonightPlan = first?.tonight ? first : null
  const options = tonightOptions(items, now, prefs).filter((o) => !tonightPlan?.slots.some((s) => s.key === o.key && s.minutes === o.minutes))
  const loading = items.some((i) => i.unknown)
  const leftTonight = tonight(now, prefs).minutesLeft

  const move = async (from: number, to: number): Promise<void> => setLibrary(await window.api.moveWatchSoon(from, to))

  return (
    <Sheet>
      <div className="sheet-head">
        <h1>Watch soon</h1>
      </div>

      {refs.length === 0 ? (
        <p className="muted">
          Nothing here yet. Open a film or show you want to get to next and press <strong>Watch soon</strong> on its page. Add a few, and this works out how long they take and what fits each evening.
        </p>
      ) : (
        <>
          <div className="soon-summary">
            <div className="soon-total">{plan.totalMinutes ? formatHours(plan.totalMinutes) : loading ? '…' : 'All done'}</div>
            <div className="muted">
              {plan.totalMinutes === 0
                ? loading
                  ? 'Adding it all up…'
                  : 'You’ve watched everything here. Take things off, or add more.'
                : plan.finish
                  ? `${plural(plan.nights.length, 'evening')} of watching. You’d finish ${whenLabel(plan.finish, today)}${plan.finish === today ? '' : ', watching on your usual nights'}.`
                  : 'Pick the nights you usually watch in Settings, under Your evenings, to see when you’d finish.'}
            </div>
          </div>

          {plan.totalMinutes > 0 && (
            <section className="soon-tonight">
              <h2>
                <Moon size={17} /> Tonight
              </h2>
              {tonightPlan ? (
                <p>
                  <strong>{tonightPlan.slots.map((s) => (s.film ? s.name : `${s.name} ${episodeRange(s.episodes)}`)).join(', then ')}</strong>{' '}
                  <span className="muted">({formatHours(tonightPlan.minutes)}, done before bed)</span>
                </p>
              ) : (
                <p className="muted">{leftTonight > 0 ? 'Nothing from your list fits what’s left of tonight. ' : tonight(now, prefs).slots.length ? 'It’s past bedtime. ' : 'Tonight isn’t one of your watching nights. '}{first ? `Next up ${whenLabel(first.day, today)}.` : ''}</p>
              )}
              {options.length > 0 && (
                <p className="muted small">
                  Or instead:{' '}
                  {options.map((o, n) => (
                    <span key={o.key}>
                      {n > 0 ? ', ' : ''}
                      {o.film ? o.name : `${plural(o.episodes, 'episode')} of ${o.name}`}
                    </span>
                  ))}
                  .
                </p>
              )}
            </section>
          )}

          <h2 className="list-sub">In your order</h2>
          <ol className="list-rows">
            {items.map((i, pos) => (
              <li
                key={i.ref.key}
                className={`list-row ${i.done ? 'seen' : ''} ${pos === items.findIndex((x) => !x.done && !x.unknown) ? 'next' : ''} ${dragFrom === pos ? 'dragging' : ''}`}
                draggable
                onDragStart={() => setDragFrom(pos)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async () => {
                  if (dragFrom !== null && dragFrom !== pos) await move(dragFrom, pos)
                  setDragFrom(null)
                }}
                onDragEnd={() => setDragFrom(null)}
              >
                <GripVertical className="list-grip" size={16} aria-hidden />
                <span className="list-num">{pos + 1}</span>
                <button className="list-open" onClick={() => go({ name: 'title', type: i.ref.type, id: i.ref.id })}>
                  <span className="list-poster">
                    <Poster path={i.ref.posterPath} type={i.ref.type} id={i.ref.id} name={i.ref.name} size="w92" />
                  </span>
                  <span className="list-text">
                    <span className="list-name">{i.ref.name}</span>
                    <span className="list-meta">{leftLabel(i)}</span>
                  </span>
                </button>
                <span className="list-end">
                  {i.done && (
                    <span className="list-seen">
                      <Check size={15} strokeWidth={3} /> Done
                    </span>
                  )}
                  <span className="list-tools">
                    <button aria-label="Move up" disabled={pos === 0} onClick={() => move(pos, pos - 1)}>
                      <ArrowUp size={14} />
                    </button>
                    <button aria-label="Move down" disabled={pos === items.length - 1} onClick={() => move(pos, pos + 1)}>
                      <ArrowDown size={14} />
                    </button>
                    <button aria-label="Take off Watch soon" onClick={async () => setLibrary(await window.api.setWatchSoon(i.ref, false))}>
                      <X size={14} />
                    </button>
                  </span>
                </span>
              </li>
            ))}
          </ol>

          {plan.nights.length > 0 && (
            <>
              <h2 className="list-sub">Your evenings</h2>
              <ol className="soon-nights">
                {plan.nights.map((n) => (
                  <li key={n.day} className={n.tonight ? 'tonight' : ''}>
                    <span className="soon-day">{dayName(n.day, today)}</span>
                    <span className="soon-what">{n.slots.map((s) => (s.film ? s.name : `${s.name} ${episodeRange(s.episodes)}`)).join(' · ')}</span>
                    <span className="soon-time muted small">{formatHours(n.minutes)}</span>
                  </li>
                ))}
              </ol>
              <p className="muted small">
                Laid out in your order over the evenings you watch, from Your evenings in Settings{prefs.weeklyBudgetMinutes ? `, keeping to about ${formatHours(prefs.weeklyBudgetMinutes)} a week` : ''}. A film goes on a night it fits; a show carries on over as many nights as it takes.
              </p>
            </>
          )}
        </>
      )}
      <Credits />
    </Sheet>
  )
}
