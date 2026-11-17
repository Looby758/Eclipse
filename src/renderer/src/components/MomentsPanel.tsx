import { Bookmark, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatAt, momentsOf } from '@core/watching'
import { parseEpisodeKey, type TitleKey } from '@core/types'
import { useApp } from '../store/app'

/** Title page: moments you bookmarked with the shortcut (Phase 30). Ones past where you are stay hidden. */
export default function MomentsPanel({ titleKey }: { titleKey: TitleKey }): React.JSX.Element | null {
  const entry = useApp((s) => s.library.entries[titleKey])
  const setLibrary = useApp((s) => s.setLibrary)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  if (!entry?.moments?.length) return null
  const { shown, hidden } = momentsOf(entry)
  const save = async (index: number, note: string | null): Promise<void> => {
    setLibrary(await window.api.editMoment(titleKey, index, note))
    setDrafts((d) => {
      const { [index]: _, ...rest } = d
      return rest
    })
  }
  return (
    <section className="moments" aria-label="Saved moments">
      <div className="note-kicker">
        <Bookmark size={14} /> Saved moments
      </div>
      {shown.map((m) => {
        const ep = m.episode ? parseEpisodeKey(m.episode) : null
        return (
          <div key={`${m.savedAt}-${m.index}`} className="moment">
            <span className="moment-at">
              {ep ? `S${ep.season} E${ep.episode} · ` : ''}
              {formatAt(m.at)}
            </span>
            <input
              value={drafts[m.index] ?? m.note ?? ''}
              placeholder="Add a note"
              onChange={(e) => setDrafts((d) => ({ ...d, [m.index]: e.target.value }))}
              onBlur={() => drafts[m.index] !== undefined && drafts[m.index] !== (m.note ?? '') && void save(m.index, drafts[m.index])}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <button className="link-btn inline small" aria-label="Delete this moment" onClick={() => void save(m.index, null)}>
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}
      {hidden > 0 && <p className="muted small">{hidden === 1 ? '1 moment is' : `${hidden} moments are`} further on than you’ve watched, so hidden for now.</p>}
    </section>
  )
}
