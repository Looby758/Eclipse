import { FolderOpen } from "lucide-react";
import { useState } from "react";
import {
  applyThemeMode,
  savedThemeMode,
  type ThemeMode,
} from "../lib/themeMode";
import { applyStill, savedStill } from "../lib/motion";
import { setStarWhy, useStarWhy } from "../lib/starWhy";
import { playSeasonChime, playTick, setSounds, useSounds } from "../lib/sounds";
import { usePremiereMode, type PremiereMode } from "../lib/premiere";
import { useApp } from "../store/app";
import { useHomeStyle } from "../lib/homeStyle";
import KeyForm from "./KeyForm";
import TextSize from "./TextSize";
import Sheet from "./Sheet";
import Credits from "./Credits";
import ServicesCard from "./ServicesCard";
import EveningsCard from "./EveningsCard";
import CalendarCard from "./CalendarCard";
import SequelImportCard from "./SequelImportCard";
import ExportCard from "./ExportCard";
import UpdatesCard from "./UpdatesCard";
import RemoteCard from "./RemoteCard";
import HistoryCard from "./HistoryCard";
import TrayCard from "./TrayCard";
import NoticingCard from "./NoticingCard";
import DiscordCard from "./DiscordCard";
import StartupCard from "./StartupCard";
import BackupsCard from "./BackupsCard";
import HealthCard from "./HealthCard";

export default function SettingsView(): React.JSX.Element {
  const status = useApp((s) => s.status)!;
  const { setStatus, setLibrary } = useApp.getState();
  const [mode, setMode] = useState<ThemeMode>(savedThemeMode());
  const [cleared, setCleared] = useState(false);
  const home = useHomeStyle();
  const [still, setStill] = useState(savedStill);
  const starWhy = useStarWhy();
  const sounds = useSounds();
  const premiere = usePremiereMode();

  return (
    <Sheet className="settings">
      <div className="sheet-head">
        <h1>Settings</h1>
      </div>

      <div className="settings-cols">
        <section className="card">
          <h2>Appearance</h2>
          <div className="segmented">
            {(["system", "dark", "light"] as const).map((m) => (
              <button
                key={m}
                className={mode === m ? "on" : ""}
                onClick={() => {
                  setMode(m);
                  applyThemeMode(m);
                }}
              >
                {m === "system"
                  ? "Match system"
                  : m === "dark"
                    ? "Dark"
                    : "Light"}
              </button>
            ))}
          </div>
          <TextSize />
          <h3 className="card-sub">Home</h3>
          <p className="muted small">
            Spotlight puts tonight’s pick inside the Tonight dial. Classic is
            the Home from before, with the suggestion on the left and the cards
            on the right.
          </p>
          <div className="segmented">
            <button
              className={home.style === "spotlight" ? "on" : ""}
              onClick={() => home.set("spotlight")}
            >
              Spotlight
            </button>
            <button
              className={home.style === "classic" ? "on" : ""}
              onClick={() => home.set("classic")}
            >
              Classic (legacy)
            </button>
          </div>
          <h3 className="card-sub">Premiere night</h3>
          <p className="muted small">
            On the day a season you’ve been waiting for comes out, Spotlight
            Home can turn into that show with a countdown to its UK release
            time, show just the countdown beside your usual Home, or leave Home
            as it is.
          </p>
          <div
            className="segmented"
            role="radiogroup"
            aria-label="Premiere night"
          >
            {(
              [
                ["home", "Whole Home"],
                ["countdown", "Just a countdown"],
                ["off", "Off"],
              ] as [PremiereMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                role="radio"
                aria-checked={premiere.mode === mode}
                className={premiere.mode === mode ? "on" : ""}
                onClick={() => premiere.set(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <h3 className="card-sub">Keep the poster wall still</h3>
          <p className="muted small">
            Stops the drifting posters, the glowing dots, the pages sliding in
            and the opening when Eclipse starts. Your computer’s own “reduce
            animations” setting does this too.
          </p>
          <div
            className="segmented"
            role="radiogroup"
            aria-label="Keep the poster wall still"
          >
            <button
              role="radio"
              aria-checked={!still}
              className={!still ? "on" : ""}
              onClick={() => (setStill(false), applyStill(false))}
            >
              Moving
            </button>
            <button
              role="radio"
              aria-checked={still}
              className={still ? "on" : ""}
              onClick={() => (setStill(true), applyStill(true))}
            >
              Still
            </button>
          </div>
          <h3 className="card-sub">Sounds</h3>
          <p className="muted small">
            A soft click when you tick an episode, and a brighter chime when
            that finishes a season. Finishing a whole show keeps its own
            send-off.
          </p>
          <div className="segmented" role="radiogroup" aria-label="Sounds">
            <button
              role="radio"
              aria-checked={!sounds}
              className={!sounds ? "on" : ""}
              onClick={() => setSounds(false)}
            >
              Off
            </button>
            <button
              role="radio"
              aria-checked={sounds}
              className={sounds ? "on" : ""}
              onClick={() => {
                // Turning them on plays both once, so you know what you'll hear.
                if (!sounds) {
                  playTick();
                  playSeasonChime(0.6);
                }
                setSounds(true);
              }}
            >
              On
            </button>
          </div>
          <h3 className="card-sub">Star maps: why things connect</h3>
          <p className="muted small">
            Names each dotted line on a watch order’s star map, like “Morgan”
            between The Walking Dead and Fear.
          </p>
          <div
            className="segmented"
            role="radiogroup"
            aria-label="Star maps: why things connect"
          >
            <button
              role="radio"
              aria-checked={!starWhy}
              className={!starWhy ? "on" : ""}
              onClick={() => setStarWhy(false)}
            >
              Hidden
            </button>
            <button
              role="radio"
              aria-checked={starWhy}
              className={starWhy ? "on" : ""}
              onClick={() => setStarWhy(true)}
            >
              Shown
            </button>
          </div>
        </section>

        <ServicesCard />

        <EveningsCard />

        <NoticingCard />

        <DiscordCard />

        <RemoteCard />

        <TrayCard />

        <StartupCard />

        <CalendarCard />

        <SequelImportCard />

        <HistoryCard />

        <section className="card">
          <h2>Data folder</h2>
          <p className="muted">
            Your library is saved here as library.json. Put it in Google Drive
            to share it between your computers (just don’t have Eclipse open on
            both at once).
          </p>
          <p className="path">{status.dataFolder}</p>
          <div className="row">
            <button
              className="btn glass"
              onClick={async () => {
                setStatus(await window.api.pickDataFolder());
                setLibrary(await window.api.getLibrary());
              }}
            >
              <FolderOpen size={16} /> Change folder
            </button>
            <button
              className="btn glass"
              onClick={() => window.api.revealDataFolder()}
            >
              Show in{" "}
              {window.api.platform === "mac" ? "Finder" : "File Explorer"}
            </button>
          </div>
        </section>

        <BackupsCard />

        <ExportCard />

        <section className="card">
          <h2>TMDB API key</h2>
          <p className="muted">
            {status.hasKey
              ? "A key is saved (encrypted on this computer)."
              : "No key saved."}
          </p>
          <KeyForm replacing={status.hasKey} />
          {status.hasKey && (
            <button
              className="btn glass danger"
              onClick={async () => setStatus(await window.api.clearTmdbKey())}
            >
              Remove key
            </button>
          )}
        </section>

        <section className="card">
          <h2>Saved TMDB data</h2>
          <p className="muted">
            Eclipse keeps copies of TMDB details so it’s quick and works
            offline. Details refresh weekly and searches daily. Clearing them is
            safe; your library isn’t touched.
          </p>
          <button
            className="btn glass"
            onClick={async () => {
              await window.api.clearCache();
              setCleared(true);
            }}
          >
            {cleared ? "Cleared" : "Clear saved TMDB data"}
          </button>
        </section>

        <HealthCard />

        <UpdatesCard />
      </div>

      <Credits justWatch />
    </Sheet>
  );
}
