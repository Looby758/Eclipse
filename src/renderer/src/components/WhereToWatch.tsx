import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { imageUrl } from '@core/tmdb'
import { preferencesOf } from '@core/library'
import type { MediaType, Provider, WatchProviders } from '@core/types'
import { useApp } from '../store/app'

function Logos({ list, mine }: { list: Provider[]; mine: number[] }): React.JSX.Element {
  return (
    <div className="provider-logos">
      {list.map((p) => {
        const url = imageUrl(p.logoPath, 'w92')
        const yours = mine.includes(p.id)
        return (
          <span key={p.id} className={`provider ${yours ? 'yours' : ''}`} title={yours ? `${p.name} (yours)` : p.name}>
            {url ? <img src={url} alt="" draggable={false} /> : <span className="provider-fallback">{p.name.slice(0, 2)}</span>}
            <span className="provider-name">{p.name}</span>
            {yours && <span className="provider-yours">yours</span>}
          </span>
        )
      })}
    </div>
  )
}

/** Where you can watch a title in your region, with your own services lit up and listed first. */
export default function WhereToWatch({ type, id }: { type: MediaType; id: number }): React.JSX.Element {
  const prefs = useApp((s) => preferencesOf(s.library))
  const [data, setData] = useState<WatchProviders | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setData(null)
    window.api.providers(type, id).then((r) => {
      if (cancelled) return
      if (r.ok) {
        setData(r.value.data)
        setError('')
      } else setError(r.error)
    })
    return () => {
      cancelled = true
    }
  }, [type, id, prefs.region])

  const mineFirst = (list: Provider[]): Provider[] => [...list.filter((p) => prefs.services.includes(p.id)), ...list.filter((p) => !prefs.services.includes(p.id))]
  const yours = data ? [...data.stream, ...data.free].filter((p, i, all) => prefs.services.includes(p.id) && all.findIndex((x) => x.id === p.id) === i) : []
  // Free services (BBC iPlayer, ITVX, Channel 4, My5…) get their own group, after yours.
  const free = data ? data.free.filter((p) => !prefs.services.includes(p.id)) : []
  const stream = data ? mineFirst(data.stream.filter((p) => !free.some((f) => f.id === p.id))) : []

  return (
    <section className="where">
      <div className="where-head">
        <h2>Where to watch</h2>
        {data?.link && (
          <button className="link-btn" onClick={() => window.api.openExternal(data.link!)}>
            Every option <ExternalLink size={13} />
          </button>
        )}
      </div>
      {error && <p className="muted">{error}</p>}
      {!data && !error && <p className="muted">Checking…</p>}
      {data && (
        <>
          <p className={`where-verdict ${yours.length ? 'yours' : ''}`}>
            {yours.length
              ? `On ${yours.map((p) => p.name).join(' and ')}, which you have.`
              : free.length
                ? `Free on ${free.map((p) => p.name).slice(0, 2).join(' and ')}.`
                : stream.length
                ? 'Streaming, but not on your services.'
                : data.rent.length || data.buy.length
                  ? 'Not streaming. You can rent or buy it.'
                  : `Not available to watch in ${prefs.region === 'GB' ? 'the UK' : prefs.region} right now.`}
          </p>
          {yours.length > 0 && (
            <div className="where-group">
              <div className="where-label">Yours</div>
              <Logos list={yours} mine={prefs.services} />
            </div>
          )}
          {free.length > 0 && (
            <div className="where-group">
              <div className="where-label">Free</div>
              <Logos list={free} mine={prefs.services} />
            </div>
          )}
          {stream.filter((p) => !prefs.services.includes(p.id)).length > 0 && (
            <div className="where-group">
              <div className="where-label">Stream</div>
              <Logos list={stream.filter((p) => !prefs.services.includes(p.id))} mine={prefs.services} />
            </div>
          )}
          {data.rent.length > 0 && (
            <div className="where-group">
              <div className="where-label">Rent</div>
              <Logos list={data.rent} mine={prefs.services} />
            </div>
          )}
          {data.buy.length > 0 && (
            <div className="where-group">
              <div className="where-label">Buy</div>
              <Logos list={data.buy} mine={prefs.services} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
