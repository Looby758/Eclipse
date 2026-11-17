import { ArrowLeft, ArrowRight, Check, Cloud, FolderOpen, HardDrive } from 'lucide-react'
import { useApp } from '../store/app'
import { useWelcome, WELCOME_STEPS, type WelcomeStep } from '../lib/welcome'
import KeyForm from './KeyForm'
import ServicesCard from './ServicesCard'
import SequelImportCard from './SequelImportCard'
import Logo from './Logo'

const TMDB_SIGNUP = 'https://www.themoviedb.org/signup'
const TMDB_KEY_PAGE = 'https://www.themoviedb.org/settings/api'

function Link({ href, children }: { href: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        window.api.openExternal(href)
      }}
    >
      {children}
    </a>
  )
}

/** First launch (Phase 42): a short welcome, a few steps, everything changeable later in Settings. */
export default function Setup(): React.JSX.Element {
  const status = useApp((s) => s.status)!
  const { step, go } = useWelcome()

  // Someone who's set up, but whose data folder can't be found right now (Google Drive not running).
  if (status.dataFolder && status.dataFolderMissing && !step) return <MissingFolder />

  const now: WelcomeStep = step ?? (status.dataFolder ? 'key' : 'hello')
  const index = WELCOME_STEPS.indexOf(now)
  const next = (): void => go(WELCOME_STEPS[index + 1] ?? null)
  const prev = (): void => go(WELCOME_STEPS[index - 1] ?? 'hello')
  const finish = (): void => {
    go(null)
    useApp.getState().go({ name: 'home' })
  }

  return (
    <div className="setup welcome" role="dialog" aria-label="Welcome to Eclipse">
      {now !== 'hello' && (
        <ol className="welcome-progress" aria-label={`Step ${index} of ${WELCOME_STEPS.length - 1}`}>
          {WELCOME_STEPS.slice(1).map((s, i) => (
            <li key={s} className={i + 1 < index ? 'done' : i + 1 === index ? 'on' : ''} />
          ))}
        </ol>
      )}

      {now === 'hello' && (
        <>
          <Logo size={64} className="welcome-logo" />
          <h1>Welcome to Eclipse</h1>
          <p className="lede">A place to keep track of the films and shows you watch, on your own computer.</p>
          <ul className="welcome-points">
            <li>
              <b>Your watchlist and history.</b> Tick episodes as you go, and see what’s next.
            </li>
            <li>
              <b>Where to watch.</b> See which of your streaming services has it, and what’s free.
            </li>
            <li>
              <b>Your evenings.</b> How much fits before bed, and when to start.
            </li>
          </ul>
          <p className="muted small">It’s free, there’s no account with us, and your library stays in a file you control. Setting up takes a couple of minutes.</p>
          <div className="welcome-nav">
            <span />
            <button className="btn primary big" onClick={next} autoFocus>
              Get started <ArrowRight size={18} />
            </button>
          </div>
        </>
      )}

      {now === 'data' && <DataStep onDone={next} />}

      {now === 'key' && (
        <>
          <h1>Connect to TMDB</h1>
          <p className="lede">Eclipse gets posters, episode lists and where to watch from TMDB, a free film and TV database. It needs a key, which takes a few minutes to get:</p>
          <ol className="welcome-steps">
            <li>
              <Link href={TMDB_SIGNUP}>Make a free TMDB account</Link> and confirm your email.
            </li>
            <li>
              Go to <Link href={TMDB_KEY_PAGE}>Settings → API</Link> and ask for a key. Choose <em>Developer</em>, say it’s for personal use, and fill in the short form.
            </li>
            <li>
              Copy the <b>API Read Access Token</b> (the long one) and paste it here.
            </li>
          </ol>
          {status.hasKey ? (
            <p className="ok">
              <Check size={16} /> Key saved, and checked with TMDB.
            </p>
          ) : status.canEncrypt ? (
            <KeyForm />
          ) : (
            <p className="error">This computer can’t store the key securely, so Eclipse can’t save it.</p>
          )}
          <div className="welcome-nav">
            <button className="btn" onClick={prev}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn primary" disabled={!status.hasKey} onClick={next}>
              Next <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}

      {now === 'services' && (
        <>
          <h1>Your country and services</h1>
          <p className="lede">Pick the streaming services you pay for, so Eclipse can show what’s on them. Skip it if you’d rather do it later.</p>
          <ServicesCard welcome />
          <div className="welcome-nav">
            <button className="btn" onClick={prev}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn primary" onClick={next}>
              Next <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}

      {now === 'sequel' && (
        <>
          <h1>Used Sequel before?</h1>
          <p className="lede">If you kept track in the Sequel app, you can bring your history over. If not, you’re done.</p>
          <SequelImportCard />
          <div className="welcome-nav">
            <button className="btn" onClick={prev}>
              <ArrowLeft size={16} /> Back
            </button>
            <button className="btn primary big" onClick={finish}>
              Start using Eclipse <ArrowRight size={18} />
            </button>
          </div>
          <p className="muted small welcome-later">You can change all of this later in Settings.</p>
        </>
      )}
    </div>
  )
}

function DataStep({ onDone }: { onDone: () => void }): React.JSX.Element {
  const status = useApp((s) => s.status)!
  const { setStatus, setLibrary } = useApp.getState()
  const prev = (): void => useWelcome.getState().go('hello')
  const use = async (pick: () => Promise<typeof status>): Promise<void> => {
    const s = await pick()
    setStatus(s)
    setLibrary(await window.api.getLibrary())
  }
  const chosen = !!status.dataFolder && !status.dataFolderMissing
  return (
    <>
      <h1>Where to keep your library</h1>
      <p className="lede">Everything you track is saved as one small file. Choose where it lives.</p>
      <div className="welcome-choices">
        <button className="welcome-choice" onClick={() => use(window.api.useDefaultDataFolder)}>
          <HardDrive size={22} />
          <span>
            <b>On this computer</b>
            <span>The simplest. It goes in an Eclipse folder in your Documents.</span>
          </span>
        </button>
        <button className="welcome-choice" onClick={() => use(window.api.pickDataFolder)}>
          <Cloud size={22} />
          <span>
            <b>In Google Drive (or another synced folder)</b>
            <span>For using Eclipse on two computers: pick a folder inside Google Drive on both, and they share one library. Don’t have it open on both at the same time.</span>
          </span>
        </button>
      </div>
      {chosen && (
        <p className="path welcome-path">
          <Check size={14} /> {status.dataFolder}
        </p>
      )}
      <p className="muted small">Already use Eclipse on another computer? Choose the folder it uses, and your library comes with it.</p>
      <div className="welcome-nav">
        <button className="btn" onClick={prev}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn primary" disabled={!chosen} onClick={onDone}>
          Next <ArrowRight size={16} />
        </button>
      </div>
    </>
  )
}

/** The data folder was picked before but can't be found: usually Google Drive hasn't started yet. */
function MissingFolder(): React.JSX.Element {
  const status = useApp((s) => s.status)!
  const { setStatus, setLibrary } = useApp.getState()
  const retry = async (): Promise<void> => {
    setStatus(await window.api.status())
    setLibrary(await window.api.getLibrary())
  }
  return (
    <div className="setup">
      <h1>Can’t find your library</h1>
      <p className="lede">Eclipse keeps your library in this folder, but it isn’t there right now:</p>
      <p className="path">{status.dataFolder}</p>
      <p>If it’s in Google Drive, start Google Drive and wait a moment, then try again.</p>
      <div className="row">
        <button className="btn primary" onClick={retry}>
          Try again
        </button>
        <button
          className="btn glass"
          onClick={async () => {
            setStatus(await window.api.pickDataFolder())
            setLibrary(await window.api.getLibrary())
          }}
        >
          <FolderOpen size={16} /> Choose the folder again
        </button>
      </div>
    </div>
  )
}
