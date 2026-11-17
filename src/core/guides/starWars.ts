import type { Guide } from './index'

/** Star Wars films and live-action and animated series in story order. */
export const STAR_WARS: Guide = {
  id: 'star-wars',
  name: 'Star Wars',
  aliases: ['star wars'],
  description: 'The films and series, in release order or in story order from the High Republic to the sequel trilogy.',
  entries: [
    { type: 'tv', id: 114479, name: 'The Acolyte', year: 2024, note: 'A century before Episode I' },
    { type: 'tv', id: 203085, name: 'Tales of the Jedi', year: 2022, note: 'Short stories across the prequel era' },
    { type: 'movie', id: 1893, name: 'Star Wars: Episode I – The Phantom Menace', year: 1999 },
    { type: 'movie', id: 1894, name: 'Star Wars: Episode II – Attack of the Clones', year: 2002 },
    { type: 'movie', id: 12180, name: 'Star Wars: The Clone Wars', year: 2008, note: 'The animated film that starts the series' },
    { type: 'tv', id: 4194, name: 'Star Wars: The Clone Wars', year: 2008 },
    { type: 'movie', id: 1895, name: 'Star Wars: Episode III – Revenge of the Sith', year: 2005 },
    { type: 'tv', id: 289219, name: 'Maul: Shadow Lord', year: 2026 },
    { type: 'tv', id: 105971, name: 'Star Wars: The Bad Batch', year: 2021 },
    { type: 'movie', id: 348350, name: 'Solo: A Star Wars Story', year: 2018 },
    { type: 'tv', id: 92830, name: 'Obi-Wan Kenobi', year: 2022 },
    { type: 'tv', id: 83867, name: 'Andor', year: 2022 },
    { type: 'tv', id: 60554, name: 'Star Wars Rebels', year: 2014 },
    { type: 'movie', id: 330459, name: 'Rogue One: A Star Wars Story', year: 2016 },
    { type: 'movie', id: 11, name: 'Star Wars: Episode IV – A New Hope', year: 1977 },
    { type: 'movie', id: 1891, name: 'The Empire Strikes Back', year: 1980 },
    { type: 'movie', id: 1892, name: 'Return of the Jedi', year: 1983 },
    { type: 'tv', id: 82856, name: 'The Mandalorian', year: 2019 },
    { type: 'tv', id: 115036, name: 'The Book of Boba Fett', year: 2021, note: 'Between Mandalorian seasons 2 and 3' },
    { type: 'tv', id: 202879, name: 'Star Wars: Skeleton Crew', year: 2024 },
    { type: 'tv', id: 114461, name: 'Ahsoka', year: 2023 },
    { type: 'movie', id: 1228710, name: 'The Mandalorian and Grogu', year: 2026 },
    { type: 'tv', id: 79093, name: 'Star Wars Resistance', year: 2018 },
    { type: 'movie', id: 140607, name: 'Star Wars: The Force Awakens', year: 2015 },
    { type: 'movie', id: 181808, name: 'Star Wars: The Last Jedi', year: 2017 },
    { type: 'movie', id: 181812, name: 'Star Wars: The Rise of Skywalker', year: 2019 }
  ]
}
