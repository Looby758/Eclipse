import type { ClaudeShow } from '@shared/claudeDesktop'
import { useApp, type View } from '../store/app'

/** The page Claude asked for (open_in_eclipse), as one of the window's views. */
export function viewFor(what: ClaudeShow): View {
  if ('title' in what) return { name: 'title', type: what.title.type, id: what.title.id }
  switch (what.page) {
    case 'favourites':
      return { name: 'shelf', room: 'favourites' }
    case 'shelf':
      return { name: 'shelf', room: 'shelf' }
    default:
      return { name: what.page }
  }
}

/** Follows Claude's "show me …": now, and anything asked while the window was still opening. */
export function watchClaudeShow(): () => void {
  const go = (what: ClaudeShow | null): void => {
    if (!what) return
    useApp.getState().go(viewFor(what))
    window.api.claudeShown()
  }
  void window.api.takeClaudeShow().then(go)
  return window.api.onClaudeShow(go)
}
