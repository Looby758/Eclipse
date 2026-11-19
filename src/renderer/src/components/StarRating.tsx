import { Star } from 'lucide-react'
import { useState } from 'react'
import type { TitleKey } from '@core/types'
import { useApp } from '../store/app'

/**
 * Your rating, as five stars you can fill by halves (like Sequel): ten steps, saved out of 10, so
 * three and a half stars is 7. Clicking the rating you already gave takes it off.
 */
export default function StarRating({ titleKey, name }: { titleKey: TitleKey; name: string }): React.JSX.Element {
  const rating = useApp((s) => s.library.entries[titleKey]?.rating)
  const setLibrary = useApp((s) => s.setLibrary)
  const [hover, setHover] = useState<number | null>(null)
  // Ratings brought over from Sequel can have decimals: show them to the nearest half star.
  const saved = rating === undefined ? 0 : Math.round(rating)
  const shown = hover ?? saved
  const set = async (value: number | null): Promise<void> => setLibrary(await window.api.setRating(titleKey, value))

  const key = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') set(Math.min(10, saved + 1))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') set(saved <= 1 ? null : saved - 1)
    else if (e.key === 'Delete' || e.key === 'Backspace') set(null)
    else return
    e.preventDefault()
  }

  return (
    <div className="stars-wrap">
      <div
        className="stars"
        role="slider"
        tabIndex={0}
        aria-label={`Your rating for ${name}`}
        aria-valuemin={0}
        aria-valuemax={10}
        aria-valuenow={saved}
        aria-valuetext={saved ? `${saved / 2} stars, ${saved} out of 10` : 'Not rated'}
        onKeyDown={key}
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = shown >= n * 2 ? 100 : shown === n * 2 - 1 ? 50 : 0
          return (
            <span key={n} className="star">
              <Star className="star-empty" size={24} aria-hidden />
              <span className="star-fill" style={{ width: `${fill}%` }} aria-hidden>
                <Star size={24} fill="currentColor" />
              </span>
              {/* Two halves: the left gives half a star, the right a whole one. */}
              {[n * 2 - 1, n * 2].map((v) => (
                <button key={v} tabIndex={-1} className={`star-half ${v % 2 ? 'l' : 'r'}`} aria-hidden onMouseEnter={() => setHover(v)} onClick={() => set(v === saved ? null : v)} title={`${v / 2} stars (${v}/10)`} />
              ))}
            </span>
          )
        })}
      </div>
      <span className="stars-label">{shown ? `${shown}/10` : 'Not rated'}</span>
      {saved > 0 && hover === null && (
        <button className="link-btn stars-clear" onClick={() => set(null)}>
          Clear
        </button>
      )}
    </div>
  )
}
