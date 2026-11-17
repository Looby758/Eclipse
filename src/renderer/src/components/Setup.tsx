import { Check, FolderOpen } from 'lucide-react'
import { useApp } from '../store/app'
import KeyForm from './KeyForm'

/** First launch: pick the data folder and add the TMDB key. */
export default function Setup(): React.JSX.Element {
  const status = useApp((s) => s.status)!
  const { setStatus, setLibrary } = useApp.getState()
  const folderDone = !!status.dataFolder && !status.dataFolderMissing

  const pick = async (): Promise<void> => {
    setStatus(await window.api.pickDataFolder())
    setLibrary(await window.api.getLibrary())
  }

  return (
    <div className="setup">
      <h1>Welcome to Eclipse</h1>
      <p className="lede">Two quick things and you’re in.</p>

      <section className={`setup-step ${folderDone ? 'done' : ''}`}>
        <div className="step-num">{folderDone ? <Check size={16} /> : 1}</div>
        <div className="step-body">
          <h2>Choose where your data lives</h2>
          <p>
            Your watchlist and history are saved as a plain file (<code>library.json</code>) in this folder. Pick a folder inside Google Drive to have the same library on your PC and your Mac.
          </p>
          {status.dataFolderMissing && <p className="error">Can’t find {status.dataFolder}. Is Google Drive running? Start it, or choose the folder again.</p>}
          {status.dataFolder && !status.dataFolderMissing && <p className="path">{status.dataFolder}</p>}
          <button className="btn" onClick={pick}>
            <FolderOpen size={16} /> {folderDone ? 'Change folder' : 'Choose folder'}
          </button>
        </div>
      </section>

      <section className={`setup-step ${status.hasKey ? 'done' : ''}`}>
        <div className="step-num">{status.hasKey ? <Check size={16} /> : 2}</div>
        <div className="step-body">
          <h2>Add your TMDB key</h2>
          <p>Eclipse gets posters, runtimes and episode data from TMDB, which is free for personal use.</p>
          {status.hasKey ? <p className="ok">Key saved.</p> : status.canEncrypt ? <KeyForm /> : <p className="error">This computer can’t store the key securely, so Eclipse can’t save it.</p>}
        </div>
      </section>
    </div>
  )
}
