import { Search, Sparkles, X } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import {
  countByStatus,
  entriesWith,
  localDate,
  preferencesOf,
} from "@core/library";
import type { MediaType, WatchStatus } from "@core/types";
import { STATUS_LABELS, WATCH_STATUSES } from "@core/types";
import {
  FILTER_LABELS,
  onService,
  passesFilter,
  servicesIn,
  type AvailabilityFilter as Filter,
} from "@core/providers";
import type { Provider } from "@core/types";
import { daysBetween } from "@core/finale";
import { timeLeft, watchlistHours, type TimeLeft } from "@core/time";
import { formatRuntime, plural, sinceLabel } from "@core/format";
import {
  isSort,
  lastWatched,
  matchesQuery,
  SORT_LABELS,
  sortEntries,
  type LibrarySort,
} from "@core/find";
import { useApp } from "../store/app";
import { useAvailability, useDetailsMany } from "../lib/availability";
import Sheet from "./Sheet";
import TitleCard from "./TitleCard";
import Credits from "./Credits";
import { RecentlyDropped } from "./ClearOutSheet";
import { focusSearch } from "./Dock";
import AvailabilityFilter from "./AvailabilityFilter";
import WatchlistHours from "./WatchlistHours";

const SORT_KEY = "eclipse.librarySort";
const FIRST_CARDS = 42;
/** Watching cards say when you last watched; after this many days it's highlighted as stalled. */
const STALLED_DAYS = 60;

function savedSort(): LibrarySort {
  try {
    const s = localStorage.getItem(SORT_KEY);
    return isSort(s) ? s : "recent";
  } catch {
    return "recent";
  }
}

/** "2h 46m" for a film, "9h left · 12 eps" for a show. */
function leftLabel(
  type: MediaType,
  left: TimeLeft | undefined,
  status: WatchStatus,
): string | undefined {
  if (!left || status === "watched" || status === "stopped") return undefined;
  if (type === "movie")
    return left.minutes ? formatRuntime(left.minutes) : undefined;
  if (!left.episodes) return "Up to date";
  return `${left.minutes < 60 ? `${left.minutes}m` : `${Math.round(left.minutes / 60)}h`} left · ${plural(left.episodes, "ep")}`;
}

export default function LibrarySheet(): React.JSX.Element {
  const library = useApp((s) => s.library);
  const services = preferencesOf(library).services;
  const counts = countByStatus(library);
  // Open on the first status that has something in it.
  const [tab, setTab] = useState<WatchStatus>(
    () => WATCH_STATUSES.find((s) => counts[s] > 0) ?? "want",
  );
  const [type, setType] = useState<MediaType | undefined>();
  const [filter, setFilter] = useState<Filter>("any");
  // One service ("On Disney+"), or null for any.
  const [service, setService] = useState<number | null>(null);
  const [allServices, setAllServices] = useState<Provider[]>([]);
  useEffect(() => {
    let live = true;
    window.api.services().then((r) => live && r.ok && setAllServices(r.value.data));
    return () => {
      live = false;
    };
  }, []);
  const [sort, setSortState] = useState<LibrarySort>(savedSort);
  const [query, setQuery] = useState("");
  const setSort = (s: LibrarySort): void => {
    setSortState(s);
    try {
      localStorage.setItem(SORT_KEY, s);
    } catch {
      // Remembering it is only a nicety.
    }
  };
  // A long library draws its first few rows straight away and the rest just after the page has
  // come up, so opening it never waits on hundreds of posters.
  const [limit, setLimit] = useState(FIRST_CARDS);
  useEffect(() => {
    const t = setTimeout(() => startTransition(() => setLimit(Infinity)), 400);
    return () => clearTimeout(t);
  }, []);
  const timed = tab === "want" || tab === "watching";
  const inTab = entriesWith(library, tab, type);
  const keys = inTab.map((e) => e.key);
  const { map, providers, checking } = useAvailability(
    keys,
    filter !== "any" || service !== null || timed,
  );
  const mine = services
    .map((id) => allServices.find((p) => p.id === id))
    .filter((p): p is Provider => !!p);
  const serviceOptions = servicesIn(
    keys.map((k) => providers[k]),
    mine,
  );
  const serviceName =
    service === null
      ? null
      : (serviceOptions.find((p) => p.id === service)?.name ?? "that service");
  const { map: details, checking: loadingTimes } = useDetailsMany(keys, timed);
  const today = localDate(new Date());
  const left: Record<string, TimeLeft> = {};
  for (const e of inTab)
    if (details[e.key]) left[e.key] = timeLeft(details[e.key], e, today);

  // Quickest to finish only means something where there's time left.
  const sortNow: LibrarySort = sort === "quickest" && !timed ? "recent" : sort;
  const minutes: Record<string, number> = {};
  for (const k in left) minutes[k] = left[k].minutes;
  const entries = sortEntries(
    inTab.filter(
      (e) =>
        matchesQuery(e, query) &&
        passesFilter(filter, map[e.key]) &&
        (service === null || onService(providers[e.key], service)),
    ),
    sortNow,
    minutes,
  );
  // Typing a name that's in another tab: say where it is.
  const elsewhere = query.trim()
    ? WATCH_STATUSES.filter((s) => s !== tab)
        .map((s) => ({
          s,
          n: entriesWith(library, s, type).filter((e) => matchesQuery(e, query))
            .length,
        }))
        .filter((x) => x.n > 0)
    : [];
  const hours = timed
    ? watchlistHours(
        entries
          .filter((e) => left[e.key])
          .map((e) => ({ key: e.key, left: left[e.key] })),
        providers,
        services,
      )
    : null;
  const empty = Object.keys(library.entries).length === 0;
  // Watching cards: "Last watched 3 weeks ago", highlighted once it's been a while.
  const watchingNote = (
    e: (typeof inTab)[number],
  ): { text: string; stalled: boolean } | undefined => {
    if (e.status !== "watching") return undefined;
    const last = lastWatched(e);
    if (!last) return undefined;
    const days = Math.max(0, daysBetween(last, today));
    return { text: `Last watched ${sinceLabel(days)}`, stalled: days >= STALLED_DAYS };
  };

  return (
    <Sheet>
      <div className="sheet-head">
        <h1>Your library</h1>
        <div className="segmented">
          {([undefined, "movie", "tv"] as const).map((t) => (
            <button
              key={t ?? "all"}
              className={type === t ? "on" : ""}
              onClick={() => setType(t)}
            >
              {t === "movie" ? "Films" : t === "tv" ? "Shows" : "All"}
            </button>
          ))}
        </div>
      </div>
      <nav className="tabs">
        {WATCH_STATUSES.map((s) => (
          <button
            key={s}
            className={tab === s ? "on" : ""}
            onClick={() => setTab(s)}
          >
            {STATUS_LABELS[s]} <span className="count">{counts[s]}</span>
          </button>
        ))}
      </nav>
      {tab === "want" && counts.want > 0 && (
        <div className="row clearout-link">
          <button
            className="btn glass"
            onClick={() => useApp.getState().go({ name: "clearout" })}
          >
            <Sparkles size={16} /> Clear out the watchlist
          </button>
        </div>
      )}
      {hours && entries.length > 0 && (
        <WatchlistHours
          tab={tab}
          hours={hours}
          loading={loadingTimes}
          unknown={entries.length - entries.filter((e) => left[e.key]).length}
        />
      )}
      {!empty && (
        <div className="library-controls">
          <div className="library-tools">
            <label className="library-find">
              <Search size={16} aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                placeholder="Find in your library"
                aria-label="Find in your library"
                spellCheck={false}
              />
              {query && (
                <button
                  className="library-find-clear"
                  onClick={() => setQuery("")}
                  aria-label="Clear"
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <label className="sort-select">
              <span>Sort</span>
              <select
                value={sortNow}
                onChange={(e) =>
                  isSort(e.target.value) && setSort(e.target.value)
                }
              >
                {(Object.keys(SORT_LABELS) as LibrarySort[])
                  .filter((s) => s !== "quickest" || timed)
                  .map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABELS[s]}
                    </option>
                  ))}
              </select>
            </label>
            <label className="sort-select">
              <span>Service</span>
              <select
                value={service ?? ""}
                onChange={(e) =>
                  setService(e.target.value ? Number(e.target.value) : null)
                }
                aria-label="Only show what's on one service"
              >
                <option value="">Any</option>
                {serviceOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <AvailabilityFilter
            value={filter}
            onChange={setFilter}
            checking={checking && filter !== "any"}
          />
        </div>
      )}
      {empty ? (
        <div className="empty">
          <p>Nothing here yet.</p>
          <button className="btn primary" onClick={focusSearch}>
            Search for something
          </button>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty">
          <p>
            {query.trim()
              ? `Nothing called “${query.trim()}” in ${STATUS_LABELS[tab]}${filter !== "any" ? ` that’s ${FILTER_LABELS[filter].toLowerCase()}` : ""}${serviceName ? ` on ${serviceName}` : ""}.`
              : checking && (filter !== "any" || service !== null)
                ? "Checking where to watch…"
                : `Nothing marked “${STATUS_LABELS[tab]}”${type ? ` in ${type === "movie" ? "films" : "shows"}` : ""}${filter !== "any" ? ` that’s ${FILTER_LABELS[filter].toLowerCase()}` : ""}${serviceName ? ` on ${serviceName}` : ""}.`}
          </p>
          {elsewhere.length > 0 && (
            <div className="row" style={{ justifyContent: "center" }}>
              {elsewhere.map(({ s, n }) => (
                <button key={s} className="btn glass" onClick={() => setTab(s)}>
                  {n} in {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid">
          {entries.slice(0, limit).map((e) => (
            <TitleCard
              key={e.key}
              type={e.type}
              id={e.id}
              name={e.title.name}
              year={e.title.year}
              posterPath={e.title.posterPath}
              extra={leftLabel(e.type, left[e.key], e.status)}
              note={watchingNote(e)}
            />
          ))}
        </div>
      )}
      {tab === "want" && <RecentlyDropped limit={5} />}
      <Credits justWatch={filter !== "any" || service !== null || timed} />
    </Sheet>
  );
}
