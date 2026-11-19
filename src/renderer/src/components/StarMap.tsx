import { useId, useMemo, useRef, useState } from "react";
import type { MapGroup, MapStar, StarMap as Sky } from "@core/starmaps";
import { useApp } from "../store/app";
import { useStarWhy } from "../lib/starWhy";

/** The six constellation colours (a group's `tint`). */
export const STAR_TINTS = [
  "#8fe3ff",
  "#b4a2ff",
  "#9fc4ff",
  "#6f9dff",
  "#d4b8ff",
  "#a9b6ee",
];

const r1 = (n: number): number => Math.round(n * 10) / 10;

/** The same faint dust every time for the same map. */
function dust(
  seed: string,
  b: Sky["bounds"],
  n: number,
): { x: number; y: number; r: number; o: number }[] {
  let s = 1;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  s = s || 1;
  const rnd = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  return Array.from({ length: n }, () => ({
    x: b.x + rnd() * b.width,
    y: b.y + rnd() * b.height,
    r: 0.35 + rnd() * 0.9,
    o: 0.08 + rnd() * 0.38,
  }));
}

function pie(r: number, f: number): string {
  const a = -Math.PI / 2 + f * 2 * Math.PI;
  return `M0 0 L0 ${-r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${r1(r * Math.cos(a))} ${r1(r * Math.sin(a))} Z`;
}

const monthYear = (d: string | null | undefined): string =>
  d
    ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      })
    : "later";

function stateText(s: MapStar): string {
  if (s.state === "seen")
    return s.episodes > 1 ? `Seen, all ${s.episodes} episodes` : "Seen";
  if (s.state === "partial")
    return `${s.seenEpisodes} of ${s.episodes} episodes`;
  if (s.state === "soon") return `Out ${monthYear(s.rows[0]?.date)}`;
  return s.episodes > 1
    ? `Not started · ${s.episodes} episodes`
    : "Not seen yet";
}

export interface StarFocus {
  here: Set<string>;
  near: Set<string>;
}

/**
 * Phase 49: a watch order as a night sky. Each series is a constellation, dotted lines are where
 * the stories cross, and stars light up as you watch. Hover a star for its name, click it to open it.
 * With `focus` (on a show's page), its own constellation says "You're here", the ones linked to it
 * stay bright and the rest fade back.
 */
export default function StarMap({
  map,
  focus,
  onDark,
  legend = true,
}: {
  map: Sky;
  focus?: StarFocus;
  onDark?: boolean;
  legend?: boolean;
}): React.JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const why = useStarWhy();
  const wrap = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{
    star: MapStar;
    x: number;
    y: number;
  } | null>(null);
  const specks = useMemo(
    () =>
      dust(
        map.guideId,
        map.bounds,
        Math.round((map.bounds.width * map.bounds.height) / 3400),
      ),
    [map.guideId, map.bounds],
  );
  const groupOf = useMemo(
    () => new Map(map.groups.map((g) => [g.id, g])),
    [map.groups],
  );
  const small = map.guideId === "marvel";
  const op = (g: string): number =>
    !focus || focus.here.has(g) ? 1 : focus.near.has(g) ? 0.92 : 0.45;
  const open = (s: MapStar): void => {
    const r = s.rows[0];
    if (r) useApp.getState().go({ name: "title", type: r.type, id: r.id });
  };
  const b = map.bounds;

  const showTip = (
    star: MapStar,
    e: { clientX: number; clientY: number } | null,
  ): void => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    if (e)
      return setTip({ star, x: e.clientX - box.left, y: e.clientY - box.top });
    // From the keyboard: next to the star itself.
    const k = box.width / b.width;
    setTip({ star, x: (star.x - b.x) * k, y: (star.y - b.y) * k });
  };

  const drawStar = (s: MapStar, g: MapGroup): React.JSX.Element => {
    const r = g.spine ? 7.5 : focus?.here.has(g.id) ? 7 : small ? 5 : 6;
    return (
      <g
        key={s.key}
        className={`sm-star ${s.state}${s.next ? " next" : ""}`}
        transform={`translate(${s.x} ${s.y})`}
        role="button"
        tabIndex={0}
        aria-label={`${s.name}: ${stateText(s)}${s.next ? ", up next" : ""}`}
        onClick={() => open(s)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open(s);
          }
        }}
        onMouseMove={(e) => showTip(s, e)}
        onMouseLeave={() => setTip(null)}
        onFocus={() => showTip(s, null)}
        onBlur={() => setTip(null)}
      >
        {s.next ? (
          <circle className="sm-halo" r={r * 4.2} fill={`url(#${uid}-next)`} />
        ) : (
          (s.state === "seen" || s.state === "partial") && (
            <circle
              className="sm-halo"
              r={r * (s.state === "seen" ? 3.4 : 2.6)}
              fill={`url(#${uid}-t${g.tint})`}
            />
          )
        )}
        {s.state === "seen" && <circle className="sm-core" r={r} />}
        {s.state === "partial" && (
          <>
            <circle className="sm-pbase" r={r} />
            <path className="sm-core" d={pie(r, s.fraction)} />
          </>
        )}
        {s.state === "soon" && <circle className="sm-soon" r={r * 0.85} />}
        {s.state === "unseen" && <circle className="sm-dim" r={r * 0.62} />}
        {s.next && (
          <>
            <circle className="sm-pulse" r={r * 1.25} />
            <circle className="sm-pulse p2" r={r * 1.25} />
            {s.state === "unseen" && (
              <circle className="sm-ncore" r={r * 0.8} />
            )}
          </>
        )}
        <circle className="sm-hit" r={Math.max(11, r * 2)} />
      </g>
    );
  };

  const drawGroup = (g: MapGroup): React.JSX.Element => {
    const here = !!focus?.here.has(g.id);
    const regionsTop = map.regions.length > 0;
    return (
      <g key={g.id} opacity={op(g.id)} className="sm-group">
        {g.stars.slice(1).map((s, i) => {
          const a = g.stars[i];
          const lit =
            a.state === "seen" && (s.state === "seen" || s.state === "partial");
          return (
            <line
              key={s.key}
              className={`sm-rail${lit ? " lit" : ""}${g.spine ? " spine" : ""}`}
              x1={a.x}
              y1={a.y}
              x2={s.x}
              y2={s.y}
            />
          );
        })}
        {g.stars.map((s, i) => (
          <g key={`l${s.key}`} aria-hidden>
            {s.short && (
              <text
                className={`sm-lbl${s.state === "seen" ? " lit" : ""}`}
                x={s.x}
                y={
                  g.spine
                    ? g.alt && i % 2
                      ? s.y - 15
                      : s.y + 24
                    : g.seasons === "above"
                      ? s.y - 14
                      : s.y + 21
                }
                textAnchor="middle"
              >
                {s.short}
              </text>
            )}
          </g>
        ))}
        {g.stars.map((s) => drawStar(s, g))}
        <text
          className="sm-name"
          x={g.label[0]}
          y={g.label[1]}
          textAnchor="middle"
          fill={STAR_TINTS[g.tint]}
          style={g.spine ? { fontSize: 12 } : undefined}
        >
          {g.name}
        </text>
        <text
          className="sm-count"
          x={g.label[0]}
          y={g.label[1] + 14}
          textAnchor="middle"
        >
          {g.note ? `${g.note} · ` : ""}
          {g.lit} of {g.stars.length} lit
        </text>
        {here && (
          <text
            className="sm-here"
            x={g.label[0]}
            y={
              g.label[1] +
              (g.label[1] < Math.min(...g.stars.map((s) => s.y)) &&
              !(regionsTop && g.label[1] < 190)
                ? -18
                : 30)
            }
            textAnchor="middle"
          >
            You’re here
          </text>
        )}
      </g>
    );
  };

  const tipGroup = tip ? groupOf.get(tip.star.group) : undefined;
  const wide = wrap.current?.clientWidth ?? 0;
  const tall = wrap.current?.clientHeight ?? 0;
  return (
    <div
      className={`starmap${onDark ? " on-dark" : ""}${why ? " why" : ""}`}
      ref={wrap}
    >
      <svg
        viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`}
        role="group"
        aria-label="Star map"
      >
        <defs>
          {STAR_TINTS.map((c, i) => (
            <radialGradient key={c} id={`${uid}-t${i}`}>
              <stop offset="0" stopColor={c} stopOpacity=".75" />
              <stop offset=".35" stopColor={c} stopOpacity=".22" />
              <stop offset="1" stopColor={c} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id={`${uid}-next`}>
            <stop offset="0" stopColor="#8fe3ff" stopOpacity=".9" />
            <stop offset=".4" stopColor="#4f8bff" stopOpacity=".3" />
            <stop offset="1" stopColor="#3f5bff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g aria-hidden>
          {specks.map((d, i) => (
            <circle
              key={i}
              className="sm-dust"
              cx={r1(d.x)}
              cy={r1(d.y)}
              r={r1(d.r)}
              opacity={r1(d.o * 10) / 10}
            />
          ))}
          {map.dividers.map((x) => (
            <line
              key={x}
              className="sm-divider"
              x1={x}
              x2={x}
              y1={Math.max(150, b.y)}
              y2={b.y + b.height - 20}
            />
          ))}
          {map.regions.map(([t, x]) => (
            <text key={t} className="sm-region" x={x} y={142}>
              {t}
            </text>
          ))}
          {map.links.map((l) => {
            const o = Math.max(op(l.from.group), op(l.to.group));
            return (
              <g key={`${l.from.key}>${l.to.key}`} opacity={o}>
                <path
                  className={`sm-link${l.lit ? " lit" : ""}`}
                  d={`M${l.from.x} ${l.from.y} Q${r1(l.cx)} ${r1(l.cy)} ${l.to.x} ${l.to.y}`}
                />
                {why && l.cap && (
                  <text
                    className="sm-why"
                    x={r1(l.cap.x)}
                    y={r1(l.cap.y)}
                    textAnchor={l.cap.anchor}
                  >
                    {l.why}
                  </text>
                )}
              </g>
            );
          })}
        </g>
        {map.groups.map(drawGroup)}
      </svg>
      {tip && tipGroup && (
        <div
          className="sm-tip"
          style={{
            left: tip.x + 16 + 240 > wide ? tip.x - 256 : tip.x + 16,
            top: tip.y + 16 + 90 > tall ? tip.y - 96 : tip.y + 16,
          }}
          aria-hidden
        >
          <div
            className="sm-tip-k"
            style={{ color: STAR_TINTS[tipGroup.tint] }}
          >
            {tipGroup.name}
            {tip.star.next ? " · up next" : ""}
          </div>
          <div className="sm-tip-name">{tip.star.name}</div>
          <div className="sm-tip-state">
            {stateText(tip.star)}
            {tip.star.rows[0]?.year ? ` · ${tip.star.rows[0].year}` : ""}
          </div>
          {tip.star.episodes > 1 && (
            <div className="sm-tip-bar">
              <b style={{ width: `${100 * tip.star.fraction}%` }} />
            </div>
          )}
        </div>
      )}
      {legend && (
        <div className="sm-legend" aria-hidden>
          <span>
            <i className="l1" />
            Seen
          </span>
          <span>
            <i className="l2" />
            Partway
          </span>
          <span>
            <i className="l3" />
            Not seen
          </span>
          <span>
            <i className="l4" />
            Coming
          </span>
          <span>
            <i className="l5" />
            Up next
          </span>
          <span className="sm-hint">
            Hover a star for its name, click to open it
          </span>
        </div>
      )}
    </div>
  );
}
