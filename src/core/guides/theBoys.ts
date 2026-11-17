import type { Guide } from './index'

/** The Boys and its spin-offs, season by season. */
export const THE_BOYS: Guide = {
  id: 'the-boys',
  name: 'The Boys',
  aliases: ['boys', 'gen v', 'vought rising', 'boys presents diabolical', 'diabolical'],
  description: 'The Boys, Gen V and the other spin-offs, season by season, in release order or in story order.',
  entries: [
    { type: 'tv', id: 259878, name: 'Vought Rising', year: 2026, note: 'Prequel, set in the 1950s' },
    { type: 'tv', id: 76479, name: 'The Boys', year: 2019, seasons: [1, 2, 3] },
    { type: 'tv', id: 205715, name: 'Gen V', year: 2023, seasons: [1], note: 'Between The Boys seasons 3 and 4' },
    { type: 'tv', id: 76479, name: 'The Boys', year: 2019, seasons: [4] },
    { type: 'tv', id: 205715, name: 'Gen V', year: 2023, seasons: [2], note: 'After The Boys season 4' },
    { type: 'tv', id: 76479, name: 'The Boys', year: 2019, seasons: [5] },
    { type: 'tv', id: 152483, name: 'The Boys Presents: Diabolical', year: 2022, note: 'Animated shorts, mostly separate from the main story' }
  ]
}
