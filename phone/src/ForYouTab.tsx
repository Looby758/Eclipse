import { useMemo, useState } from 'react'
import { Heart, SkipForward, ThumbsDown, Play } from 'lucide-react'
import { recommend, seedsOf, type Recommendation, type Seed } from '@core/recommend'
import { parseTitleKey, type SearchResult } from '@core/types'
import { imageUrl } from '@core/tmdb'
import { usePhone } from './store'
import { getDetails, getRecs, useLoad } from './cache'
import { MyServices, itemOf, openTitle } from './ui'

/**
 * Recommendations, one at a time: Interested (adds it to Want to watch), Not for me (never shown
 * again, on the computer too) or Skip (just for now). Built from TMDB's "if you liked this" lists
 * for what you've watched, the same way the computer does it.
 */
export default function ForYouTab(): React.JSX.Element {
  const view = usePhone((s) => s.view)
  const act = usePhone((s) => s.act)
  const [skipped, setSkipped] = useState<string[]>(() => JSON.parse(sessionStorage.getItem('eclipse.phone.skipped') ?? '[]') as string[])
  // The seeds only change when your watching changes, not on every tick.
  const seedKey = seedsOf(view, new Date())
    .map((s) => s.key)
    .join(',')
  const { data: lists, error } = useLoad(() => loadLists(seedsOf(usePhone.getState().view, new Date())), [seedKey])
  const recs = useMemo(() => (lists ? recommend(view, lists, 80) : null), [lists, view])
  const queue = recs?.filter((r) => !skipped.includes(r.key)) ?? null
  const rec = queue?.[0]

  const skip = (key: string): void => {
    const next = [...skipped, key]
    setSkipped(next)
    sessionStorage.setItem('eclipse.phone.skipped', JSON.stringify(next))
  }

  if (error) return <p className="error pad">{error}</p>
  if (!queue) return <p className="empty">Finding things you might like…</p>
  if (!rec)
    return (
      <section className="tab">
        <p className="empty">That's everything for now. Watch (or tick) a few more things and there'll be more.</p>
        {skipped.length > 0 && (
          <button className="btn ghost wide" onClick={() => (setSkipped([]), sessionStorage.removeItem('eclipse.phone.skipped'))}>
            Show the ones I skipped
          </button>
        )}
      </section>
    )
  return (
    <section className="tab foryou">
      <Card rec={rec} />
      <div className="foryou-actions">
        <button className="btn round" onClick={() => act({ kind: 'notForMe', key: rec.key })} aria-label="Not for me">
          <ThumbsDown size={22} />
          <span>Not for me</span>
        </button>
        <button className="btn round" onClick={() => skip(rec.key)} aria-label="Skip">
          <SkipForward size={22} />
          <span>Skip</span>
        </button>
        <button className="btn round primary" onClick={() => act({ kind: 'status', item: itemOf(rec), status: 'want', was: null })} aria-label="Interested">
          <Heart size={22} />
          <span>Interested</span>
        </button>
      </div>
      <p className="sub center">{queue.length - 1} more after this one</p>
    </section>
  )
}

async function loadLists(seeds: Seed[]): Promise<{ seed: Seed; results: SearchResult[] }[]> {
  const lists: { seed: Seed; results: SearchResult[] }[] = []
  await Promise.all(
    seeds.map(async (seed) => {
      const t = parseTitleKey(seed.key)
      if (!t) return
      try {
        lists.push({ seed, results: await getRecs(t.type, t.id) })
      } catch {
        // Left out until it can be fetched.
      }
    })
  )
  if (!lists.length && seeds.length) throw new Error('Couldn’t reach TMDB for recommendations. Are you online?')
  return lists
}

const because = (names: string[]): string => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

function Card({ rec }: { rec: Recommendation }): React.JSX.Element {
  const { data: d } = useLoad(() => getDetails(rec.type, rec.id), [rec.key])
  return (
    <article className="rec-card">
      <button className="rec-poster" onClick={() => openTitle(rec.type, rec.id)} aria-label={`More about ${rec.name}`}>
        {rec.posterPath && <img src={imageUrl(rec.posterPath, 'w500')!} alt="" />}
      </button>
      <div className="rec-text">
        <h2>{rec.name}</h2>
        <p className="sub">{[rec.year, rec.type === 'tv' ? 'Show' : 'Film', d?.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}</p>
        <p className="because">Because of {because(rec.because.slice(0, 3))}</p>
        <MyServices type={rec.type} id={rec.id} />
        {rec.overview && <p className="overview clamp">{rec.overview}</p>}
        {d?.trailer && (
          <a className="link" href={`https://www.youtube.com/watch?v=${d.trailer}`} target="_blank" rel="noreferrer">
            <Play size={14} /> Trailer
          </a>
        )}
      </div>
    </article>
  )
}
