import { REACTION_LIST, REACTIONS, type Reaction } from '@core/types'

/**
 * Phase 47: the five reactions as a row of buttons (😭 🔥 😂 😴 🤯). Pressing the one already
 * chosen takes it off again.
 */
export default function ReactionPicker({ value, onPick, disabled, size = 'md' }: { value?: Reaction; onPick: (r: Reaction | null) => void; disabled?: boolean; size?: 'md' | 'lg' }): React.JSX.Element {
  return (
    <div className={`react-row ${size}`} role="group" aria-label="How did it hit you?">
      {REACTION_LIST.map((r) => (
        <button
          key={r}
          className={`react-btn ${value === r ? 'on' : ''} ${value && value !== r ? 'other' : ''}`}
          aria-pressed={value === r}
          title={value === r ? `${REACTIONS[r].label} (click to take it off)` : REACTIONS[r].label}
          aria-label={REACTIONS[r].label}
          disabled={disabled}
          onClick={() => onPick(value === r ? null : r)}
        >
          <span aria-hidden>{REACTIONS[r].emoji}</span>
        </button>
      ))}
    </div>
  )
}
