import type { Guide } from './index'

/** Fox's X-Men films, from the original trilogy and the First Class cast up to Dark Phoenix. */
export const X_MEN: Guide = {
  id: 'x-men',
  name: 'X-Men (Fox)',
  aliases: ['x men', 'xmen', 'x men fox', 'wolverine', 'deadpool', 'logan'],
  description: 'Fox’s X-Men films up to Dark Phoenix, with the Wolverine and Deadpool films, in release order or in story order.',
  entries: [
    { type: 'movie', id: 49538, name: 'X-Men: First Class', year: 2011, note: 'Set in 1962' },
    { type: 'movie', id: 2080, name: 'X-Men Origins: Wolverine', year: 2009, note: 'Logan’s early years' },
    { type: 'movie', id: 36657, name: 'X-Men', year: 2000 },
    { type: 'movie', id: 36658, name: 'X2', year: 2003 },
    { type: 'movie', id: 36668, name: 'X-Men: The Last Stand', year: 2006 },
    { type: 'movie', id: 76170, name: 'The Wolverine', year: 2013 },
    { type: 'movie', id: 127585, name: 'X-Men: Days of Future Past', year: 2014, note: 'Links the two casts and resets the timeline' },
    { type: 'movie', id: 246655, name: 'X-Men: Apocalypse', year: 2016, note: 'Set in 1983' },
    { type: 'movie', id: 320288, name: 'Dark Phoenix', year: 2019, note: 'Set in 1992' },
    { type: 'movie', id: 293660, name: 'Deadpool', year: 2016 },
    { type: 'movie', id: 383498, name: 'Deadpool 2', year: 2018 },
    { type: 'movie', id: 263115, name: 'Logan', year: 2017, note: 'Set in 2029' }
  ]
}
