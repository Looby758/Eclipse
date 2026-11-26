import type { ClaudeShow } from '@shared/claudeDesktop'
import { useApp, type View } from '../store/app'
import { applyThemeMode } from './themeMode'
import { useHomeStyle } from './homeStyle'
import { applyStill } from './motion'
import { usePosterLook } from './posterLook'
import { setSounds } from './sounds'
import { setStarWhy } from './starWhy'
import { usePremiereMode } from './premiere'
import { useHeatView } from './heatView'
import { saveMuted } from './finale'

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

/** Applies a look Claude changed (set_appearance), the same way Settings → Appearance does. */
export function applyLook(setting: string, value: string): void {
  const on = value === 'on'
  switch (setting) {
    case 'theme':
      if (value === 'system' || value === 'dark' || value === 'light') applyThemeMode(value)
      break
    case 'home_style':
      if (value === 'spotlight' || value === 'classic') useHomeStyle.getState().set(value)
      break
    case 'keep_wall_still':
      applyStill(on)
      break
    case 'posters_fill_in':
      usePosterLook.getState().setFill(on)
      break
    case 'sounds':
      setSounds(on)
      break
    case 'star_map_why':
      setStarWhy(on)
      break
    case 'premiere_night':
      if (value === 'home' || value === 'countdown' || value === 'off') usePremiereMode.getState().set(value)
      break
    case 'heatmap':
      if (value === 'tmdb' || value === 'mine') useHeatView.getState().set(value)
      break
    case 'finale_music':
      saveMuted(!on)
      break
  }
}

/** Follows Claude's changes to how Eclipse looks: now, and any made while the window was closed. */
export function watchClaudeLooks(): () => void {
  const apply = (look: { setting: string; value: string }): void => {
    applyLook(look.setting, look.value)
    window.api.claudeLookApplied()
  }
  void window.api.takeClaudeLooks().then((looks) => looks.forEach(apply))
  return window.api.onClaudeAppearance(apply)
}
