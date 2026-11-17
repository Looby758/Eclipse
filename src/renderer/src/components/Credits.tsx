import { TMDB_SITE } from '@core/tmdb'

/** TMDB's terms ask for this credit wherever its data is shown. */
export default function Credits(): React.JSX.Element {
  return (
    <footer className="credits">
      Film and TV data from{' '}
      <a
        href={TMDB_SITE}
        onClick={(e) => {
          e.preventDefault()
          window.api.openExternal(TMDB_SITE)
        }}
      >
        TMDB
      </a>
      . This product uses the TMDB API but is not endorsed or certified by TMDB.
    </footer>
  )
}
