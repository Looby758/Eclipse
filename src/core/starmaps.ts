import type { Library, TitleRef } from './types'
import { parseEpisodeKey } from './types'
import { isItemSeen, itemKey } from './lists'

/**
 * Phase 49: franchises as a star map. Each watch order drawn as a night sky: every film or season
 * a star, each series its own constellation, dotted lines where the stories cross. Lit once you've
 * seen it, partly lit while you're partway, dashed when it isn't out yet, and the next one glows.
 *
 * The skies are placed by hand (picked from drafts, 19 Nov 2026) so that no lines cross and each
 * spin-off sits next to where it branches off. Everything is on a 1280 × 800 canvas.
 */

/** A star: what it stands for, and where. `key` is a title (`tv:84958`, all its seasons as one star) or one season of it (`tv:1402#s8`). */
export type StarSpot = readonly [key: string, x: number, y: number, short?: string]

export interface StarGroupLayout {
  id: string
  name: string
  /** Which of the map's six colours (0 to 5). */
  tint: number
  /** Where its name goes (the middle of the text). */
  label: readonly [number, number]
  /** A few words under the name ("Standalone stories"). */
  note?: string
  /** The bright main line (the Avengers films, the Skywalker saga), with each star named. */
  spine?: boolean
  /** Name the stars "S1", "S2"… above or below them. */
  seasons?: 'above' | 'below'
  /** Spine names alternate below and above, when they're long. */
  alt?: boolean
  /** In the order the line joins them. */
  stars: readonly StarSpot[]
}

export interface StarLinkLayout {
  from: string
  to: string
  /** Why they connect ("Morgan"), shown only when that's switched on in Settings. */
  why: string
  /** How far the line bows (0.06 by default; negative bows the other way). */
  bend?: number
  /** Where "why" goes, from the middle of the line. */
  cap?: readonly [dx: number, dy: number, anchor: 'start' | 'middle' | 'end']
}

export interface StarMapLayout {
  guideId: string
  groups: readonly StarGroupLayout[]
  links: readonly StarLinkLayout[]
  /** Eras or sagas named along the top, from this x. */
  regions?: readonly (readonly [string, number])[]
  /** Faint lines between the regions. */
  dividers?: readonly number[]
}

const L = (from: string, to: string, why: string, cap?: StarLinkLayout['cap'], bend?: number): StarLinkLayout => ({ from, to, why, ...(cap ? { cap } : {}), ...(bend !== undefined ? { bend } : {}) })

const WALKING_DEAD: StarMapLayout = {
  guideId: 'walking-dead',
  groups: [
    { id: 'twd', name: 'The Walking Dead', tint: 0, label: [430, 494], seasons: 'below', stars: [['tv:1402#s1', 190, 525], ['tv:1402#s2', 245, 478], ['tv:1402#s3', 305, 452], ['tv:1402#s4', 370, 432], ['tv:1402#s5', 435, 426], ['tv:1402#s6', 500, 432], ['tv:1402#s7', 565, 444], ['tv:1402#s8', 628, 458], ['tv:1402#s9', 690, 476], ['tv:1402#s10', 752, 494], ['tv:1402#s11', 832, 506]] },
    { id: 'fear', name: 'Fear the Walking Dead', tint: 1, label: [632, 186], seasons: 'above', stars: [['tv:62286#s1', 362, 262], ['tv:62286#s2', 424, 238], ['tv:62286#s3', 488, 226], ['tv:62286#s4', 612, 262], ['tv:62286#s5', 690, 232], ['tv:62286#s6', 760, 214], ['tv:62286#s7', 832, 224], ['tv:62286#s8', 902, 252]] },
    { id: 'owl', name: 'The Ones Who Live', tint: 4, label: [722, 676], stars: [['tv:206586#s1', 722, 640]] },
    { id: 'wb', name: 'World Beyond', tint: 5, label: [553, 712], seasons: 'below', stars: [['tv:94305#s1', 508, 676], ['tv:94305#s2', 598, 664]] },
    { id: 'daryl', name: 'Daryl Dixon', tint: 3, label: [1040, 350], seasons: 'above', stars: [['tv:211684#s1', 968, 424], ['tv:211684#s2', 1040, 392], ['tv:211684#s3', 1112, 410]] },
    { id: 'dc', name: 'Dead City', tint: 2, label: [1008, 680], seasons: 'below', stars: [['tv:194583#s1', 968, 596], ['tv:194583#s2', 1048, 630]] },
    { id: 'tales', name: 'Tales of the Walking Dead', tint: 5, label: [150, 336], note: 'Standalone stories', stars: [['tv:136248#s1', 150, 300]] }
  ],
  links: [
    L('tv:1402#s8', 'tv:62286#s4', 'Morgan', [-10, 0, 'end']),
    L('tv:1402#s9', 'tv:206586#s1', 'Rick', [-12, 6, 'end']),
    L('tv:1402#s10', 'tv:206586#s1', 'Michonne', [12, 6, 'start']),
    L('tv:94305#s2', 'tv:206586#s1', 'The CRM', [-4, -9, 'middle']),
    L('tv:1402#s11', 'tv:211684#s1', 'Daryl', [6, -10, 'middle']),
    L('tv:1402#s11', 'tv:194583#s1', 'Maggie and Negan', [8, 14, 'start'])
  ]
}

const zig = (keys: string[], x0: number, y0: number, dx: number, dy: number): StarSpot[] => keys.map((k, i) => [k, x0 + i * dx, y0 + (i % 2 ? dy : 0) + (i % 4 === 3 ? 8 : 0)] as const)

const MARVEL: StarMapLayout = {
  guideId: 'marvel',
  regions: [['The Infinity Saga', 60], ['The Multiverse Saga', 770]],
  dividers: [742],
  groups: [
    { id: 'avengers', name: 'Avengers', tint: 0, label: [350, 352], spine: true, stars: [['movie:24428', 220, 405, 'The Avengers'], ['movie:99861', 350, 385, 'Age of Ultron'], ['movie:299536', 480, 398, 'Infinity War'], ['movie:299534', 600, 418, 'Endgame'], ['movie:1003596', 1040, 402, 'Doomsday'], ['movie:1003598', 1160, 382, 'Secret Wars']] },
    { id: 'ironman', name: 'Iron Man', tint: 2, label: [122, 180], stars: [['movie:1726', 80, 250], ['movie:10138', 120, 215], ['movie:68721', 165, 240]] },
    { id: 'thor', name: 'Thor', tint: 1, label: [282, 172], stars: [['movie:10195', 225, 252], ['movie:76338', 255, 214], ['movie:284053', 300, 200], ['movie:616037', 338, 228]] },
    { id: 'cap', name: 'Captain America', tint: 3, label: [472, 162], stars: [['movie:1771', 395, 246], ['movie:100402', 420, 206], ['movie:271110', 465, 190], ['tv:88396', 510, 214], ['movie:822119', 550, 190]] },
    { id: 'guardians', name: 'Guardians', tint: 4, label: [652, 172], stars: [['movie:118340', 615, 236], ['movie:283995', 650, 200], ['movie:447365', 692, 222]] },
    { id: 'hulk', name: 'Hulk', tint: 5, label: [112, 608], stars: [['movie:1724', 92, 540], ['tv:92783', 134, 578]] },
    { id: 'strange', name: 'Doctor Strange', tint: 1, label: [306, 576], stars: [['movie:284052', 285, 522], ['movie:453395', 328, 546]] },
    { id: 'wakanda', name: 'Wakanda', tint: 4, label: [511, 574], stars: [['movie:284054', 470, 522], ['movie:505642', 512, 544], ['tv:114471', 552, 522]] },
    { id: 'antman', name: 'Ant-Man', tint: 5, label: [217, 698], stars: [['movie:102899', 178, 640], ['movie:363088', 215, 666], ['movie:640146', 256, 645]] },
    { id: 'spidey', name: 'Spider-Man', tint: 2, label: [435, 706], stars: [['movie:315635', 378, 640], ['movie:429617', 410, 670], ['movie:634649', 450, 650], ['movie:969681', 492, 676]] },
    { id: 'marvels', name: 'The Marvels', tint: 0, label: [652, 698], stars: [['movie:299537', 600, 632], ['tv:92782', 632, 662], ['tv:114472', 668, 640], ['movie:609681', 704, 666]] },
    { id: 'wanda', name: 'Wanda and Vision', tint: 4, label: [831, 180], stars: [['tv:85271', 790, 240], ['tv:138501', 830, 210], ['tv:213375', 872, 236]] },
    { id: 'multiverse', name: 'Time and multiverse', tint: 2, label: [1007, 186], stars: [['tv:84958', 962, 222], ['tv:91363', 1006, 254], ['movie:533535', 1052, 224]] },
    { id: 'hawkeye', name: 'Hawkeye', tint: 1, label: [1175, 182], stars: [['tv:88329', 1150, 216], ['tv:122226', 1200, 242]] },
    { id: 'yelena', name: 'Black Widow and Thunderbolts', tint: 3, label: [1128, 548], stars: [['movie:497698', 1212, 516], ['movie:986056', 1150, 488]] },
    { id: 'solo', name: 'Standalone heroes', tint: 5, label: [859, 598], stars: [['movie:566525', 796, 540], ['movie:524434', 838, 566], ['tv:92749', 880, 540], ['movie:617126', 922, 566]] },
    {
      id: 'defenders',
      name: 'The Defenders',
      tint: 3,
      label: [1110, 662],
      note: 'Netflix, set apart',
      stars: zig(['tv:61889#s1', 'tv:38472#s1', 'tv:61889#s2', 'tv:62126#s1', 'tv:62127#s1', 'tv:62285', 'tv:67178#s1', 'tv:38472#s2', 'tv:62126#s2', 'tv:62127#s2', 'tv:61889#s3', 'tv:67178#s2', 'tv:38472#s3', 'tv:202555'], 996, 598, 17.5, 28)
    }
  ],
  links: [
    L('movie:10138', 'movie:24428', 'Fury’s Avengers Initiative', [-12, -6, 'end']),
    L('movie:10195', 'movie:24428', 'Loki', [6, -14, 'start']),
    L('movie:1771', 'movie:24428', 'The Tesseract', [10, 6, 'start']),
    L('movie:1724', 'movie:24428', 'Bruce Banner', [-8, 0, 'end']),
    L('movie:283995', 'movie:299536', 'Thanos'),
    L('movie:284052', 'movie:299536', 'The Time Stone', [-8, 14, 'end']),
    L('movie:284054', 'movie:299536', 'Battle of Wakanda', [10, 2, 'start']),
    L('movie:299537', 'movie:299534', 'The pager'),
    L('movie:299534', 'tv:85271', 'After Endgame'),
    L('movie:299534', 'tv:84958', 'Loki escapes in 2012'),
    L('movie:453395', 'movie:634649', 'Strange’s spell'),
    L('tv:84958', 'movie:1003596', 'The multiverse', [-14, 0, 'end']),
    L('tv:91363', 'movie:1003596', ''),
    L('movie:533535', 'movie:1003596', ''),
    L('movie:986056', 'movie:1003596', 'The New Avengers'),
    L('movie:617126', 'movie:1003596', 'Doctor Doom')
  ]
}

const STAR_WARS: StarMapLayout = {
  guideId: 'star-wars',
  regions: [['High Republic', 50], ['Fall of the Jedi', 165], ['Reign of the Empire', 430], ['Rebellion', 605], ['New Republic', 830], ['First Order', 1010]],
  dividers: [140, 420, 595, 820, 1000],
  groups: [
    { id: 'saga', name: 'The Skywalker Saga', tint: 0, label: [712, 372], spine: true, stars: [['movie:1893', 200, 440, 'Episode I'], ['movie:1894', 275, 420, 'Episode II'], ['movie:1895', 390, 414, 'Episode III'], ['movie:11', 640, 420, 'Episode IV'], ['movie:1891', 712, 408, 'Episode V'], ['movie:1892', 784, 424, 'Episode VI'], ['movie:140607', 1040, 420, 'Episode VII'], ['movie:181808', 1112, 406, 'Episode VIII'], ['movie:181812', 1184, 424, 'Episode IX']] },
    { id: 'acolyte', name: 'The Acolyte', tint: 5, label: [90, 252], stars: [['tv:114479', 90, 290]] },
    { id: 'totj', name: 'Tales of the Jedi', tint: 5, label: [160, 634], stars: [['tv:203085', 160, 600]] },
    { id: 'cw', name: 'The Clone Wars', tint: 1, label: [296, 200], stars: [['movie:12180', 262, 262], ['tv:4194', 330, 236]] },
    { id: 'maul', name: 'Maul: Shadow Lord', tint: 4, label: [440, 160], stars: [['tv:289219', 440, 196]] },
    { id: 'badbatch', name: 'The Bad Batch', tint: 2, label: [480, 330], stars: [['tv:105971', 480, 292]] },
    { id: 'andor', name: 'Andor and Rogue One', tint: 3, label: [590, 200], stars: [['tv:83867', 560, 236], ['movie:330459', 620, 296]] },
    { id: 'rebels', name: 'Rebels', tint: 1, label: [722, 238], stars: [['tv:60554', 740, 205]] },
    { id: 'ahsoka', name: 'Ahsoka', tint: 4, label: [1010, 166], stars: [['tv:114461', 935, 168]] },
    { id: 'mando', name: 'The Mandalorian', tint: 2, label: [920, 318], stars: [['tv:82856', 860, 280], ['tv:115036', 920, 244], ['movie:1228710', 980, 280]] },
    { id: 'solo', name: 'Solo', tint: 3, label: [460, 624], stars: [['movie:348350', 460, 590]] },
    { id: 'obiwan', name: 'Obi-Wan Kenobi', tint: 2, label: [560, 654], stars: [['tv:92830', 560, 620]] },
    { id: 'skeleton', name: 'Skeleton Crew', tint: 5, label: [880, 568], stars: [['tv:202879', 880, 600]] },
    { id: 'resistance', name: 'Resistance', tint: 5, label: [1110, 644], stars: [['tv:79093', 1110, 610]] }
  ],
  links: [
    L('tv:114479', 'movie:1893', 'The Sith return'),
    L('movie:1894', 'movie:12180', 'The war begins'),
    L('tv:4194', 'movie:1895', 'Order 66', [6, 0, 'start']),
    L('tv:4194', 'tv:289219', 'Maul'),
    L('movie:1895', 'tv:105971', 'Order 66', [10, 14, 'start']),
    L('tv:83867', 'movie:330459', 'Cassian'),
    L('movie:330459', 'movie:11', 'The Death Star plans', [12, -26, 'start']),
    L('tv:92830', 'movie:11', 'Luke and Leia'),
    L('movie:348350', 'movie:11', 'Han and Chewie'),
    L('movie:1892', 'tv:82856', 'After the Empire falls', [14, 6, 'start']),
    L('tv:82856', 'tv:114461', 'Ahsoka finds Grogu', [-10, 6, 'end']),
    L('tv:115036', 'tv:114461', 'Ahsoka trains Grogu', [12, 8, 'start']),
    L('tv:60554', 'tv:114461', 'Ezra and Thrawn', [0, -12, 'middle']),
    L('tv:79093', 'movie:140607', 'Before The Force Awakens')
  ]
}

const X_MEN: StarMapLayout = {
  guideId: 'x-men',
  groups: [
    { id: 'original', name: 'The original X-Men', tint: 0, label: [285, 232], spine: true, stars: [['movie:36657', 180, 300, 'X-Men'], ['movie:36658', 285, 268, 'X2'], ['movie:36668', 390, 292, 'The Last Stand']] },
    { id: 'firstclass', name: 'First Class', tint: 1, label: [765, 226], spine: true, stars: [['movie:49538', 600, 262, 'First Class'], ['movie:127585', 710, 318, 'Days of Future Past'], ['movie:246655', 820, 282, 'Apocalypse'], ['movie:320288', 930, 306, 'Dark Phoenix']] },
    { id: 'wolverine', name: 'Wolverine', tint: 2, label: [410, 656], spine: true, stars: [['movie:2080', 300, 560, 'Origins'], ['movie:76170', 410, 590, 'The Wolverine'], ['movie:263115', 520, 566, 'Logan']] },
    { id: 'deadpool', name: 'Deadpool', tint: 4, label: [830, 676], spine: true, stars: [['movie:293660', 780, 600, 'Deadpool'], ['movie:383498', 880, 628, 'Deadpool 2']] }
  ],
  links: [L('movie:36668', 'movie:127585', 'The two casts meet', [0, 18, 'middle']), L('movie:36668', 'movie:2080', 'Logan’s past', [-10, 0, 'end']), L('movie:2080', 'movie:293660', 'Wade Wilson', [60, -42, 'middle'], -0.2)]
}

const HARRY_POTTER: StarMapLayout = {
  guideId: 'harry-potter',
  groups: [
    {
      id: 'hp',
      name: 'Harry Potter',
      tint: 0,
      label: [500, 372],
      spine: true,
      alt: true,
      stars: [['movie:671', 170, 500, 'Philosopher’s Stone'], ['movie:672', 265, 466, 'Chamber of Secrets'], ['movie:673', 360, 446, 'Prisoner of Azkaban'], ['movie:674', 455, 436, 'Goblet of Fire'], ['movie:675', 550, 436, 'Order of the Phoenix'], ['movie:767', 645, 446, 'Half-Blood Prince'], ['movie:12444', 740, 466, 'Deathly Hallows 1'], ['movie:12445', 835, 500, 'Deathly Hallows 2']]
    },
    { id: 'fb', name: 'Fantastic Beasts', tint: 1, label: [870, 186], stars: [['movie:259316', 760, 250], ['movie:338952', 870, 222], ['movie:338953', 980, 250]] },
    { id: 'hbo', name: 'HBO’s Harry Potter', tint: 2, label: [470, 674], note: 'A retelling', stars: [['tv:224377', 470, 640]] }
  ],
  links: [L('movie:671', 'movie:259316', 'Newt’s textbook', [-40, -70, 'middle'], -0.2), L('movie:338953', 'movie:12444', 'Grindelwald', [12, 6, 'start'])]
}

const THE_BOYS: StarMapLayout = {
  guideId: 'the-boys',
  groups: [
    { id: 'boys', name: 'The Boys', tint: 0, label: [540, 532], seasons: 'below', stars: [['tv:76479#s1', 250, 500], ['tv:76479#s2', 395, 462], ['tv:76479#s3', 540, 446], ['tv:76479#s4', 685, 456], ['tv:76479#s5', 830, 490]] },
    { id: 'genv', name: 'Gen V', tint: 1, label: [715, 196], seasons: 'above', stars: [['tv:205715#s1', 640, 262], ['tv:205715#s2', 790, 244]] },
    { id: 'vought', name: 'Vought Rising', tint: 2, label: [420, 676], note: 'A 1950s prequel', stars: [['tv:259878', 420, 640]] },
    { id: 'diabolical', name: 'Diabolical', tint: 5, label: [150, 326], note: 'Animated shorts', stars: [['tv:152483', 150, 290]] }
  ],
  links: [L('tv:205715#s1', 'tv:76479#s4', 'Leads into season 4', [-10, 0, 'end']), L('tv:205715#s2', 'tv:76479#s5', 'Leads into season 5', [10, 0, 'start']), L('tv:259878', 'tv:76479#s3', 'Soldier Boy', [10, 8, 'start'])]
}

const BREAKING_BAD: StarMapLayout = {
  guideId: 'breaking-bad',
  groups: [
    { id: 'bb', name: 'Breaking Bad', tint: 0, label: [385, 540], seasons: 'below', stars: [['tv:1396#s1', 200, 520], ['tv:1396#s2', 290, 478], ['tv:1396#s3', 385, 458], ['tv:1396#s4', 480, 462], ['tv:1396#s5', 575, 488]] },
    { id: 'bcs', name: 'Better Call Saul', tint: 1, label: [798, 188], seasons: 'above', stars: [['tv:60059#s1', 560, 262], ['tv:60059#s2', 655, 236], ['tv:60059#s3', 750, 226], ['tv:60059#s4', 845, 232], ['tv:60059#s5', 940, 250], ['tv:60059#s6', 1035, 282]] },
    { id: 'elcamino', name: 'El Camino', tint: 2, label: [700, 632], stars: [['movie:559969', 700, 600]] }
  ],
  links: [L('tv:60059#s6', 'tv:1396#s2', 'Saul meets Walt', [-10, -64, 'middle'], 0.12), L('tv:1396#s5', 'tv:60059#s6', 'Gene, after Breaking Bad', [10, 12, 'start']), L('tv:1396#s5', 'movie:559969', 'Jesse escapes', [10, 4, 'start'])]
}

export const STAR_MAPS: readonly StarMapLayout[] = [MARVEL, X_MEN, STAR_WARS, HARRY_POTTER, WALKING_DEAD, BREAKING_BAD, THE_BOYS]

export const starMapFor = (guideId: string): StarMapLayout | undefined => STAR_MAPS.find((m) => m.guideId === guideId)

/** The title a star key is about (`tv:1402#s8` → `tv:1402`). */
export const starTitle = (key: string): string => key.split('#')[0]

// ---------------------------------------------------------------------------------------------
// The map itself, from a guide's rows and your library.

export type StarState = 'seen' | 'partial' | 'unseen' | 'soon'

export interface MapStar {
  key: string
  x: number
  y: number
  group: string
  /** The watch-order rows it stands for (a show's seasons, when it's one star for the show). */
  rows: TitleRef[]
  /** What it's called on hover ("The Walking Dead, season 8"). */
  name: string
  /** Its name on a spine ("Endgame"), or "S8" for a season. */
  short?: string
  state: StarState
  /** How much is seen, 0 to 1 (episodes for shows). */
  fraction: number
  seenEpisodes: number
  episodes: number
  next: boolean
}

export interface MapGroup extends Omit<StarGroupLayout, 'stars'> {
  stars: MapStar[]
  lit: number
}

export interface MapLink {
  from: MapStar
  to: MapStar
  why: string
  lit: boolean
  /** The curve's control point. */
  cx: number
  cy: number
  cap: { x: number; y: number; anchor: 'start' | 'middle' | 'end' } | null
}

export interface StarMap {
  guideId: string
  groups: MapGroup[]
  links: MapLink[]
  regions: readonly (readonly [string, number])[]
  dividers: readonly number[]
  next: MapStar | null
  seen: number
  partial: number
  total: number
  /** The part of the canvas that has anything on it. */
  bounds: { x: number; y: number; width: number; height: number }
}

const ticked = (library: Library, r: TitleRef): number =>
  Object.keys(library.entries[r.key]?.episodes ?? {}).filter((k) => {
    const p = parseEpisodeKey(k)
    return !!p && p.season > 0 && (!r.season || p.season === r.season)
  }).length

function starState(rows: TitleRef[], library: Library, today: string): Pick<MapStar, 'state' | 'fraction' | 'seenEpisodes' | 'episodes'> {
  const out = rows.filter((r) => !r.date || r.date <= today)
  if (!out.length) return { state: 'soon', fraction: 0, seenEpisodes: 0, episodes: rows.reduce((n, r) => n + (r.episodes ?? 1), 0) }
  let episodes = 0
  let seen = 0
  let allSeen = true
  for (const r of out) {
    const n = r.episodes ?? 1
    episodes += n
    if (isItemSeen(library, r)) seen += n
    else {
      allSeen = false
      seen += Math.min(n, r.type === 'tv' ? ticked(library, r) : 0)
    }
  }
  if (allSeen) return { state: 'seen', fraction: 1, seenEpisodes: episodes, episodes }
  return { state: seen > 0 ? 'partial' : 'unseen', fraction: episodes ? seen / episodes : 0, seenEpisodes: seen, episodes }
}

/** Where to put a season the layout doesn't know yet (a new season): one more step along from the show's last star. */
function extend(spots: StarSpot[], title: string): readonly [number, number] | null {
  const own = spots.filter((s) => starTitle(s[0]) === title)
  if (!own.length) return null
  const last = own[own.length - 1]
  const prev = own.length > 1 ? own[own.length - 2] : null
  const dx = prev ? last[1] - prev[1] : 64
  const dy = prev ? last[2] - prev[2] : 0
  return [last[1] + dx, last[2] + dy]
}

/**
 * Lays a watch order out as its sky. `rows` are the guide's rows (story order), `next` the row the
 * list says is next. Rows the layout has no place for are left off, unless they're a new season of
 * a show already on the map.
 */
export function buildStarMap(layout: StarMapLayout, rows: TitleRef[], library: Library, today: string, next: TitleRef | null = null): StarMap {
  const exact = new Map<string, string>()
  const whole = new Map<string, string>()
  for (const g of layout.groups) for (const [key] of g.stars) (key.includes('#') ? exact : whole).set(key, g.id)

  const byStar = new Map<string, TitleRef[]>()
  const extra = new Map<string, { group: string; rows: TitleRef[] }>()
  for (const r of rows) {
    const k = itemKey(r)
    const star = exact.has(k) ? k : whole.has(r.key) ? r.key : null
    if (star) {
      byStar.set(star, [...(byStar.get(star) ?? []), r])
      continue
    }
    // A season the layout doesn't know yet: next to the same show's other seasons.
    const group = layout.groups.find((g) => g.stars.some((s) => starTitle(s[0]) === r.key))
    if (group && r.season) extra.set(k, { group: group.id, rows: [r] })
  }

  const nextKey = next ? itemKey(next) : null
  const groups: MapGroup[] = layout.groups.map((g) => {
    const spots: StarSpot[] = [...g.stars]
    for (const [k, e] of extra) {
      if (e.group !== g.id) continue
      const at = extend(spots, e.rows[0].key)
      if (at) spots.push([k, at[0], at[1]])
    }
    const stars: MapStar[] = []
    for (const [key, x, y, short] of spots) {
      const mine = byStar.get(key) ?? extra.get(key)?.rows ?? []
      if (!mine.length) continue
      const r = mine[0]
      const season = key.includes('#') ? r.season : undefined
      stars.push({
        key,
        x,
        y,
        group: g.id,
        rows: mine,
        name: season ? `${r.name}, season ${season}` : r.name,
        short: short ?? (g.seasons && season ? `S${season}` : undefined),
        next: !!nextKey && mine.some((m) => itemKey(m) === nextKey),
        ...starState(mine, library, today)
      })
    }
    const { stars: _spots, ...rest } = g
    return { ...rest, stars, lit: stars.filter((s) => s.state === 'seen').length }
  })

  const all = groups.flatMap((g) => g.stars)
  const at = new Map(all.map((s) => [s.key, s]))
  const links: MapLink[] = []
  for (const l of layout.links) {
    const from = at.get(l.from)
    const to = at.get(l.to)
    if (!from || !to) continue
    const b = l.bend ?? 0.06
    const mx = (from.x + to.x) / 2
    const my = (from.y + to.y) / 2
    const dx = to.x - from.x
    const dy = to.y - from.y
    let cap: MapLink['cap'] = null
    if (l.why) {
      if (l.cap) cap = { x: mx + l.cap[0], y: my + l.cap[1], anchor: l.cap[2] }
      else {
        const len = Math.hypot(dx, dy) || 1
        const side = dx * dy > 0 ? 1 : -1
        cap = { x: mx + (side * 8 * Math.abs(dy)) / len, y: my + 4, anchor: side > 0 ? 'start' : 'end' }
      }
    }
    links.push({ from, to, why: l.why, lit: from.state === 'seen' && (to.state === 'seen' || to.state === 'partial'), cx: mx - dy * b, cy: my + dx * b, cap })
  }

  const ys = [...all.map((s) => s.y), ...groups.filter((g) => g.stars.length).map((g) => g.label[1])]
  const top = Math.min(...ys, ...(layout.regions?.length ? [150] : [])) - 44
  const bottom = Math.max(...ys) + 36
  return {
    guideId: layout.guideId,
    groups: groups.filter((g) => g.stars.length),
    links,
    regions: layout.regions ?? [],
    dividers: layout.dividers ?? [],
    next: all.find((s) => s.next) ?? null,
    seen: all.filter((s) => s.state === 'seen').length,
    partial: all.filter((s) => s.state === 'partial').length,
    total: all.length,
    bounds: all.length ? { x: 0, y: top, width: 1280, height: bottom - top } : { x: 0, y: 0, width: 1280, height: 800 }
  }
}

/** The constellations a title is in, and the ones linked straight to them (for "You're here" on its page). */
export function focusOf(map: StarMap, titleKey: string): { here: Set<string>; near: Set<string> } {
  const here = new Set(map.groups.filter((g) => g.stars.some((s) => starTitle(s.key) === titleKey)).map((g) => g.id))
  const near = new Set<string>()
  for (const l of map.links) {
    if (here.has(l.from.group) && !here.has(l.to.group)) near.add(l.to.group)
    if (here.has(l.to.group) && !here.has(l.from.group)) near.add(l.from.group)
  }
  return { here, near }
}
