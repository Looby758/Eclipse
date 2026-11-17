import { TMDB_SITE } from '@core/tmdb'
import { JUSTWATCH_URL } from '@core/providers'

const open = (url: string) => (e: React.MouseEvent): void => {
  e.preventDefault()
  window.api.openExternal(url)
}

/** TMDB's terms ask for this credit wherever its data is shown, and JustWatch's wherever where-to-watch is. */
export default function Credits({ justWatch = false }: { justWatch?: boolean }): React.JSX.Element {
  return (
    <footer className="credits">
      Film and TV data from{' '}
      <a href={TMDB_SITE} onClick={open(TMDB_SITE)}>
        TMDB
      </a>
      . This product uses the TMDB API but is not endorsed or certified by TMDB.
      {justWatch && (
        <>
          {' '}
          Where-to-watch data from{' '}
          <a href={JUSTWATCH_URL} onClick={open(JUSTWATCH_URL)}>
            JustWatch
          </a>
          .
        </>
      )}
    </footer>
  )
}
