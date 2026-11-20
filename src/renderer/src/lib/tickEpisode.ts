import { episodeKey, type TitleDetails } from '@core/types'
import { useApp } from '../store/app'
import { itemOf } from './item'

/** Double-click an episode (in the heatmap or the rating bars) to tick it, or untick it if it's watched. */
export async function tickEpisode(details: TitleDetails, season: number, episode: number, watched: boolean): Promise<void> {
  useApp.getState().setLibrary(await window.api.setEpisodes(itemOf(details), [episodeKey(season, episode)], !watched))
}
