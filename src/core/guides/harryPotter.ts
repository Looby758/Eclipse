import type { Guide } from './index'

/** The Wizarding World: the Fantastic Beasts and Harry Potter films, and HBO's Harry Potter series. */
export const HARRY_POTTER: Guide = {
  id: 'harry-potter',
  name: 'Harry Potter',
  aliases: ['harry potter', 'fantastic beasts', 'wizarding world', 'hogwarts'],
  description: 'All eight Harry Potter films, the three Fantastic Beasts films and HBO’s Harry Potter series, in release order or in story order.',
  sections: ['Harry Potter', 'Fantastic Beasts', 'HBO series'],
  entries: [
    { type: 'movie', id: 259316, name: 'Fantastic Beasts and Where to Find Them', year: 2016, note: 'Set in 1926', sections: ['Fantastic Beasts'] },
    { type: 'movie', id: 338952, name: 'Fantastic Beasts: The Crimes of Grindelwald', year: 2018, sections: ['Fantastic Beasts'] },
    { type: 'movie', id: 338953, name: 'Fantastic Beasts: The Secrets of Dumbledore', year: 2022, note: 'Set in the early 1930s', sections: ['Fantastic Beasts'] },
    { type: 'movie', id: 671, name: 'Harry Potter and the Philosopher’s Stone', year: 2001, sections: ['Harry Potter'] },
    { type: 'movie', id: 672, name: 'Harry Potter and the Chamber of Secrets', year: 2002, sections: ['Harry Potter'] },
    { type: 'movie', id: 673, name: 'Harry Potter and the Prisoner of Azkaban', year: 2004, sections: ['Harry Potter'] },
    { type: 'movie', id: 674, name: 'Harry Potter and the Goblet of Fire', year: 2005, sections: ['Harry Potter'] },
    { type: 'movie', id: 675, name: 'Harry Potter and the Order of the Phoenix', year: 2007, sections: ['Harry Potter'] },
    { type: 'movie', id: 767, name: 'Harry Potter and the Half-Blood Prince', year: 2009, sections: ['Harry Potter'] },
    { type: 'movie', id: 12444, name: 'Harry Potter and the Deathly Hallows: Part 1', year: 2010, sections: ['Harry Potter'] },
    { type: 'movie', id: 12445, name: 'Harry Potter and the Deathly Hallows: Part 2', year: 2011, sections: ['Harry Potter'] },
    { type: 'tv', id: 224377, name: 'Harry Potter', year: 2027, note: 'HBO’s retelling of the books, a season per book', sections: ['HBO series'] }
  ]
}
