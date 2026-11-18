import { Check, ChevronDown, ExternalLink } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { preferencesOf } from '@core/library'
import { imageUrl } from '@core/tmdb'
import { watchChoices } from '@core/watching'
import type { TitleDetails, WatchProviders } from '@core/types'
import { useApp } from '../store/app'

const KEY = 'eclipse.watchOn'

/** The service you picked for each title, remembered on this computer. */
function remembered(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}
function remember(key: string, service: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...remembered(), [key]: service }))
  } catch {
    // Not remembered; it still opens.
  }
}

/**
 * "Continue on Disney+", with a menu to watch somewhere else instead ("Watch on NOW"). Where you've
 * been watching goes straight back to the show; the other services go through TMDB's where-to-watch
 * page, one click from the show there. The one you pick becomes this title's button.
 */
export default function WatchButton({ details: d }: { details: TitleDetails }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[d.key])
  const mine = useApp((s) => preferencesOf(s.library).services)
  const [providers, setProviders] = useState<WatchProviders | null>(null)
  const [picked, setPicked] = useState<string | undefined>(() => remembered()[d.key])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    window.api.providers(d.type, d.id).then((r) => !cancelled && r.ok && setProviders(r.value.data))
    return () => {
      cancelled = true
    }
  }, [d.key])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])

  const choices = watchChoices(entry, providers, mine)
  if (!choices.length) return null
  // Your pick for this title, else where you've been watching, else the first of yours.
  const main = choices.find((c) => c.service === picked) ?? choices[0]
  const watch = (c: (typeof choices)[number]): void => {
    remember(d.key, c.service)
    setPicked(c.service)
    setOpen(false)
    void window.api.openExternal(c.url)
  }
  const logo = (path: string | null): React.JSX.Element | null => {
    const url = imageUrl(path, 'w92')
    return url ? <img className="st-svc" src={url} alt="" draggable={false} /> : null
  }

  return (
    <div className={`st-dd st-watch ${open ? 'open' : ''}`} ref={ref}>
      <button className="st-pill st-watch-main" onClick={() => watch(main)}>
        {logo(main.logoPath) ?? <ExternalLink size={15} />} {main.label}
      </button>
      {choices.length > 1 && (
        <button className="st-pill st-watch-more" aria-haspopup="menu" aria-expanded={open} aria-label="Watch somewhere else" title="Watch somewhere else" onClick={() => setOpen(!open)}>
          <ChevronDown size={15} className="st-caret" />
        </button>
      )}
      {open && (
        <div className="st-menu" role="menu">
          <span className="st-menu-k">Watch on</span>
          {choices.map((c) => (
            <button key={c.service} role="menuitem" onClick={() => watch(c)}>
              {logo(c.logoPath) ?? <ExternalLink size={15} />}
              <span className="st-menu-main">{c.service}</span>
              <span className="st-menu-note">{c.learnt ? 'where you watch' : c.yours ? 'yours' : ''}</span>
              {c === main && <Check size={15} />}
            </button>
          ))}
          <span className="st-menu-foot">The one you pick becomes this button. New services open TMDB’s where-to-watch page, one click from the show.</span>
        </div>
      )}
    </div>
  )
}
