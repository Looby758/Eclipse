import type { Guide } from './index'

/**
 * The Walking Dead and its spin-offs, season by season. In story order the two main shows
 * interleave the way their timelines meet (Morgan crosses over after The Walking Dead season 8).
 * Specials, recaps and aftershows are left out.
 */
export const WALKING_DEAD: Guide = {
  id: 'walking-dead',
  name: 'The Walking Dead',
  aliases: ['walking dead', 'twd', 'fear walking dead', 'fear the walking dead'],
  description: 'The Walking Dead and every spin-off, season by season, in release order or in story order.',
  sections: ['Main story', 'Spin-offs'],
  entries: [
    { type: 'tv', id: 62286, name: 'Fear the Walking Dead', year: 2015, seasons: [1], note: 'The first days of the outbreak', sections: ['Spin-offs'] },
    { type: 'tv', id: 1402, name: 'The Walking Dead', year: 2010, seasons: [1], sections: ['Main story'] },
    { type: 'tv', id: 62286, name: 'Fear the Walking Dead', year: 2015, seasons: [2], sections: ['Spin-offs'] },
    { type: 'tv', id: 1402, name: 'The Walking Dead', year: 2010, seasons: [2], sections: ['Main story'] },
    { type: 'tv', id: 62286, name: 'Fear the Walking Dead', year: 2015, seasons: [3], sections: ['Spin-offs'] },
    { type: 'tv', id: 1402, name: 'The Walking Dead', year: 2010, seasons: [3, 4, 5, 6, 7, 8], sections: ['Main story'] },
    { type: 'tv', id: 62286, name: 'Fear the Walking Dead', year: 2015, seasons: [4], note: 'Morgan arrives from The Walking Dead', sections: ['Spin-offs'] },
    { type: 'tv', id: 1402, name: 'The Walking Dead', year: 2010, seasons: [9], sections: ['Main story'] },
    { type: 'tv', id: 62286, name: 'Fear the Walking Dead', year: 2015, seasons: [5], sections: ['Spin-offs'] },
    { type: 'tv', id: 1402, name: 'The Walking Dead', year: 2010, seasons: [10], sections: ['Main story'] },
    { type: 'tv', id: 62286, name: 'Fear the Walking Dead', year: 2015, seasons: [6], sections: ['Spin-offs'] },
    { type: 'tv', id: 1402, name: 'The Walking Dead', year: 2010, seasons: [11], sections: ['Main story'] },
    { type: 'tv', id: 206586, name: 'The Walking Dead: The Ones Who Live', year: 2024, note: 'Straight after The Walking Dead ends', sections: ['Main story'] },
    { type: 'tv', id: 211684, name: 'The Walking Dead: Daryl Dixon', year: 2023, note: 'Straight after The Walking Dead ends', sections: ['Main story'] },
    { type: 'tv', id: 62286, name: 'Fear the Walking Dead', year: 2015, seasons: [7, 8], sections: ['Spin-offs'] },
    { type: 'tv', id: 194583, name: 'The Walking Dead: Dead City', year: 2023, note: 'Years after The Walking Dead ends', sections: ['Main story'] },
    { type: 'tv', id: 94305, name: 'The Walking Dead: World Beyond', year: 2020, note: 'Side story, separate from the main shows', sections: ['Spin-offs'] },
    { type: 'tv', id: 136248, name: 'Tales of the Walking Dead', year: 2022, note: 'Standalone stories, separate from the main shows', sections: ['Spin-offs'] }
  ]
}
