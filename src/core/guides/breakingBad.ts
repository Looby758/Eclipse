import type { Guide } from './index'

/** Breaking Bad, Better Call Saul and El Camino. */
export const BREAKING_BAD: Guide = {
  id: 'breaking-bad',
  name: 'Breaking Bad',
  aliases: ['breaking bad', 'better call saul', 'el camino'],
  description: 'Breaking Bad, Better Call Saul and El Camino, season by season, in release order or in story order.',
  entries: [
    { type: 'tv', id: 60059, name: 'Better Call Saul', year: 2015, note: 'Mostly before Breaking Bad; its black-and-white scenes come after it' },
    { type: 'tv', id: 1396, name: 'Breaking Bad', year: 2008 },
    { type: 'movie', id: 559969, name: 'El Camino: A Breaking Bad Movie', year: 2019, note: 'Straight after Breaking Bad’s finale' }
  ]
}
