import type { Guide } from './index'

/** The Walking Dead and its spin-offs. Specials, recaps and aftershows are left out. */
export const WALKING_DEAD: Guide = {
  id: 'walking-dead',
  name: 'The Walking Dead',
  aliases: ['walking dead', 'twd', 'fear walking dead', 'fear the walking dead'],
  description: 'The Walking Dead and every spin-off series, in release order or in story order.',
  entries: [
    { type: 'tv', id: 62286, name: 'Fear the Walking Dead', year: 2015, note: 'Starts as the outbreak begins; later seasons run alongside The Walking Dead' },
    { type: 'tv', id: 1402, name: 'The Walking Dead', year: 2010 },
    { type: 'tv', id: 136248, name: 'Tales of the Walking Dead', year: 2022, note: 'Standalone stories; watch any time' },
    { type: 'tv', id: 94305, name: 'The Walking Dead: World Beyond', year: 2020, note: 'Ten years in, during The Walking Dead’s later seasons' },
    { type: 'tv', id: 206586, name: 'The Walking Dead: The Ones Who Live', year: 2024, note: 'Rick and Michonne' },
    { type: 'tv', id: 194583, name: 'The Walking Dead: Dead City', year: 2023, note: 'Maggie and Negan' },
    { type: 'tv', id: 211684, name: 'The Walking Dead: Daryl Dixon', year: 2023 }
  ]
}
