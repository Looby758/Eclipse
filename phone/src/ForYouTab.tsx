import { useMemo, useState } from 'react'
import { Heart, SkipForward, ThumbsDown, Play } from 'lucide-react'
import { candidateLists, rankRecommendations, seedsOf, whyText, type Recommendation } from '@core/recommend'
import { learnableKeys, pendingChanges, phoneView } from '@core/phone'
import type { Trait } from '@core/types'
import { imageUrl } from '@core/tmdb'
import { usePhone } from './store'
import { getDetails, recSources, useLoad } from './cache'
import { MyServices, itemOf, openTitle } from './ui'

/**
 * Recommendations, one at a time: Interested (adds it to Want to watch), Not for me (never shown
 * again, on the computer too) or Skip (just for now). Ranked exactly the way the computer ranks them
 * (core/recommend.ts): TMDB's "recommended" and "similar" lists for what you've watched, added up,
 * then raised or lowered by what your Interested and Not for me answers have taught it, including
 * the ones on this phone that are still waiting for your computer.
 */
export default function ForYouTab(): React.JSX.Element {
  const view = usePhone((s) => s.view)
  const act = usePhone((s) => s.act)
  const [skipped, setSkipped] = useState<string[]>(() => JSON.parse(sessionStorage.getItem('eclipse.phone.skipped') ?? '[]') as string[])
  // The seeds only change when your watching changes, not on every tick.
  const seedKey = seedsOf(view, new Date())
    .map((s) => s.key)
    .join(',')
  // Ranked once each time the tab opens (like the computer's One at a time), so the card you're
  // looking at never moves under your thumb; answers here count from the next time.
  const { data: recs, error } = useLoad(loadPicks, [seedKey])
  const queue = useMemo(() => {
    if (!recs) return null
    const hidden = new Set([...(view.recsHidden ?? []), ...(view.dropped ?? []).map((d) => d.entry.key), ...skipped])
    return recs.filter((r) => !view.entries[r.key] && !hidden.has(r.key))
  }, [recs, view, skipped])
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

async function loadPicks(): Promise<Recommendation[]> {
  const { library, queue, view } = usePhone.getState()
  const seeds = seedsOf(view, new Date())
  const lists = await candidateLists(seeds, recSources)
  if (!lists.length && seeds.length) throw new Error('Couldn’t reach TMDB for recommendations. Are you online?')
  // The phone's own answers that haven't reached the computer yet teach it too.
  const traits: Record<string, Trait[]> = {}
  await Promise.all(
    learnableKeys(pendingChanges(library, queue)).map(async (key) => {
      try {
        traits[key] = await recSources.traits(key)
      } catch {
        // Learnt from once it can be fetched (or when the computer folds it in).
      }
    })
  )
  const taste = phoneView(library, queue, traits).recsTaste
  return rankRecommendations(view, lists, recSources, { candidates: 120, withTraits: 80, limit: 80 }, taste)
}

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
        <p className="because">{whyText(rec)}</p>
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
