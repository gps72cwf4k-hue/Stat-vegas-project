import { useEffect, useRef, useState } from 'react'
import { createInteractiveMontyHallRound } from '../../simulation/montyHall.js'
import './InteractiveRound.css'

/* User-facing door numbers are 1, 2, 3; internal ids remain 0, 1, 2. */
const DOOR_IDS = [0, 1, 2]
const doorLabel = (id) => id + 1

/**
 * The playable three-door round: choose a door, then stay or switch, then see
 * the reveal. It uses its own randomness and local state and is fully separate
 * from the batch simulation below (Play again never touches batch results).
 *
 * The round is generated only in the initial door-click handler — never during
 * render or in an effect — and closed doors never expose the car in markup.
 *
 * @returns {import('react').ReactElement} The interactive round card.
 */
function InteractiveRound() {
  // stage: 'choose' | 'decide' | 'finished'
  const [stage, setStage] = useState('choose')
  const [round, setRound] = useState(null)
  const [finalDoor, setFinalDoor] = useState(null)
  const [strategy, setStrategy] = useState(null)

  const stayButtonRef = useRef(null)
  const playAgainButtonRef = useRef(null)
  const firstDoorRef = useRef(null)

  // Focus management only: no randomness or simulation here.
  useEffect(() => {
    if (stage === 'decide') {
      stayButtonRef.current?.focus()
    } else if (stage === 'finished') {
      playAgainButtonRef.current?.focus()
    } else if (stage === 'choose') {
      firstDoorRef.current?.focus()
    }
  }, [stage])

  /** Generate the round once, from the player's initial choice. */
  function handleChooseDoor(doorId) {
    if (stage !== 'choose') {
      return
    }
    const nextRound = createInteractiveMontyHallRound(doorId)
    setRound(nextRound)
    setStage('decide')
  }

  /** Record the decision, derive the outcome from the actual car. */
  function handleDecision(nextStrategy) {
    if (stage !== 'decide') {
      return
    }
    const chosenDoor = nextStrategy === 'stay' ? round.initialDoor : round.switchDoor
    setFinalDoor(chosenDoor)
    setStrategy(nextStrategy)
    setStage('finished')
  }

  /** Reset only this interactive round (batch state untouched). */
  function handlePlayAgain() {
    setRound(null)
    setFinalDoor(null)
    setStrategy(null)
    setStage('choose')
  }

  const won = stage === 'finished' && finalDoor === round?.carDoor

  const statusText = buildStatusText(stage, round, finalDoor, strategy, won)

  return (
    <section className="card interactive-round" aria-labelledby="interactive-round-heading">
      <h2 className="interactive-round__heading" id="interactive-round-heading">
        Try one round
      </h2>

      <p className="interactive-round__host-rule">
        The host knows where the car is and always opens an unchosen door with a
        goat.
      </p>

      <p className="interactive-round__status" role="status" aria-live="polite">
        {statusText}
      </p>

      <div className="interactive-round__doors">
        {DOOR_IDS.map((doorId, index) => (
          <Door
            key={doorId}
            doorId={doorId}
            index={index}
            firstDoorRef={firstDoorRef}
            stage={stage}
            round={round}
            finalDoor={finalDoor}
            onChoose={handleChooseDoor}
          />
        ))}
      </div>

      {stage === 'decide' ? (
        <div className="interactive-round__controls">
          <button
            type="button"
            className="button button--primary"
            ref={stayButtonRef}
            onClick={() => handleDecision('stay')}
          >
            Stay with Door {doorLabel(round.initialDoor)}
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => handleDecision('switch')}
          >
            Switch to Door {doorLabel(round.switchDoor)}
          </button>
        </div>
      ) : null}

      {stage === 'finished' ? (
        <div className="interactive-round__controls">
          <button
            type="button"
            className="button"
            ref={playAgainButtonRef}
            onClick={handlePlayAgain}
          >
            Play again
          </button>
        </div>
      ) : null}

      <p className="interactive-round__disclaimer">
        One round illustrates the rules; repeated experiments compare the
        strategies.
      </p>
    </section>
  )
}

/**
 * Build the polite status message for the current stage (announced only).
 *
 * @param {string} stage - Current stage.
 * @param {object|null} round - The generated round, or null.
 * @param {number|null} finalDoor - The player's final door, or null.
 * @param {string|null} strategy - 'stay' | 'switch' | null.
 * @param {boolean} won - Whether the final door holds the car.
 * @returns {string} The status text.
 */
function buildStatusText(stage, round, finalDoor, strategy, won) {
  if (stage === 'choose') {
    return 'Choose a door.'
  }
  if (stage === 'decide') {
    return `The host opened Door ${doorLabel(round.openedDoor)} with a goat. Stay with Door ${doorLabel(round.initialDoor)} or switch to Door ${doorLabel(round.switchDoor)}?`
  }
  const result = won ? 'You won the car!' : 'You got a goat.'
  const action = strategy === 'stay' ? 'You stayed.' : 'You switched.'
  return `${action} ${result} Your final door is Door ${doorLabel(finalDoor)}.`
}

/**
 * One door in the interactive round. In the "choose" stage it is a native
 * button; afterwards it becomes a noninteractive display. The car is never
 * present in the markup of a closed door — contents render only once revealed.
 *
 * @param {object} props
 * @param {number} props.doorId - Internal door id (0, 1, 2).
 * @param {number} props.index - Position in the row (for focus ref).
 * @param {import('react').RefObject<HTMLButtonElement>} props.firstDoorRef - Ref for the first door.
 * @param {string} props.stage - Current stage.
 * @param {object|null} props.round - The generated round, or null.
 * @param {number|null} props.finalDoor - The player's final door, or null.
 * @param {(doorId: number) => void} props.onChoose - Choose handler.
 * @returns {import('react').ReactElement} The door element.
 */
function Door({ doorId, index, firstDoorRef, stage, round, finalDoor, onChoose }) {
  const isOpen = (stage === 'decide' && round.openedDoor === doorId) || stage === 'finished'

  // Never leak the car on a closed door: only build revealed content.
  let revealedContent = null
  if (stage === 'finished') {
    revealedContent = round.carDoor === doorId ? 'Car' : 'Goat'
  }

  // Emoji for the visible state only (never a hidden car/goat behind a closed door).
  let emoji = '🚪'
  if (stage === 'decide' && round.openedDoor === doorId) {
    emoji = '🐐'
  } else if (stage === 'finished') {
    emoji = round.carDoor === doorId ? '🚗' : '🐐'
  }

  // Textual state labels (meaning is never carried by color alone).
  const labels = []
  if (stage === 'decide' && round.openedDoor === doorId) {
    labels.push('Host opened: Goat')
  }
  if (stage === 'decide' && round.initialDoor === doorId) {
    labels.push('Your choice')
  }
  if (stage === 'decide' && round.initialDoor !== doorId && round.openedDoor !== doorId) {
    labels.push('Switch option')
  }
  if (stage === 'finished' && finalDoor === doorId) {
    labels.push('Your final choice')
  }
  if (stage === 'finished' && round.carDoor === doorId) {
    labels.push('Car here')
  }

  const doorClasses = [
    'interactive-round__door',
    isOpen ? 'interactive-round__door--open' : '',
    stage === 'decide' && round.initialDoor === doorId ? 'interactive-round__door--chosen' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const buttonClasses = [
    'interactive-round__door-button',
    stage === 'decide' && round.initialDoor === doorId
      ? 'interactive-round__door-button--selected'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  if (stage === 'choose') {
    return (
      <div className={doorClasses}>
        <button
          type="button"
          className={buttonClasses}
          ref={index === 0 ? firstDoorRef : undefined}
          aria-label={`Choose Door ${doorLabel(doorId)}`}
          onClick={() => onChoose(doorId)}
        >
          <span className="interactive-round__cover" aria-hidden="true" />
          <span className="interactive-round__number">{doorLabel(doorId)}</span>
          <span className="interactive-round__emoji" aria-hidden="true">{emoji}</span>
        </button>
      </div>
    )
  }

  return (
    <div className={doorClasses}>
      <div className="interactive-round__door-display">
        <span className="interactive-round__number">{doorLabel(doorId)}</span>
        <span className="interactive-round__emoji" aria-hidden="true">{emoji}</span>
        {isOpen ? (
          <span className="interactive-round__revealed">{revealedContent}</span>
        ) : (
          <span className="interactive-round__cover" aria-hidden="true" />
        )}
      </div>
      {labels.map((label) => (
        <span key={label} className="interactive-round__door-label">
          {label}
        </span>
      ))}
    </div>
  )
}

export default InteractiveRound
