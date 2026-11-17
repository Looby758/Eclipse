import type { LibraryItem } from '@core/library'
import type { TitleDetails } from '@core/types'

/** What the library needs to know about a title to save it. */
export const itemOf = (d: TitleDetails): LibraryItem => ({ key: d.key, type: d.type, id: d.id, title: { name: d.name, year: d.year, posterPath: d.posterPath } })
