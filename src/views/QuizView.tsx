import { useEffect, useReducer, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { PieceDropHandlerArgs } from 'react-chessboard'
import { colorToMove } from '../domain/chess'
import { buildPgn } from '../domain/pgn'
import type { MoveRow } from '../domain/pgn'
import { findMatchingChild, getChildren, nextMoveColor, quizReducer } from '../domain/quiz'
import type { QuizState, RepertoireEdge } from '../domain/quiz'
import { listEdges, listRepertoires } from '../lib/repertoireRepo'
import type { EdgeRow, RepertoireRow } from '../lib/repertoireRepo'
import { useClickToMove } from './useClickToMove'

const REP_COMPLETE_DELAY_MS = 1200
const AUTO_MOVE_DELAY_MS = 500

const linkButtonStyle = {
  border: 'none',
  background: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: 0,
  font: 'inherit',
  fontSize: '0.75rem',
} as const

/**
 * Lichess's analysis board reads the FEN from the URL path, not a query
 * string (?fen= is silently ignored) — spaces become underscores and the
 * slashes stay literal, since encoding them as %2F leaves the path
 * unparsed. A FEN's own characters are all otherwise URL-safe.
 */
function lichessAnalysisUrl(fen: string): string {
  return `https://lichess.org/analysis/${fen.replaceAll(' ', '_')}`
}

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length)
}

function toRepertoireEdge(edge: EdgeRow): RepertoireEdge {
  return {
    fromFen: edge.from_fen,
    san: edge.san,
    toFen: edge.to_fen,
    active: edge.status !== 'ignored',
  }
}

function initialQuizState(repertoire: RepertoireRow, edges: RepertoireEdge[]): QuizState {
  return {
    rootFen: repertoire.root_fen,
    trainingColor: repertoire.training_color,
    edges,
    currentFen: repertoire.root_fen,
    path: [],
    lastOutcome: null,
    hadMistakeThisRep: false,
    sessionStats: { repsCompleted: 0, perfectReps: 0, mistakes: 0 },
  }
}

/** Pairs a played path into White/Black rows, numbered like standard notation. */
function buildMoveRows(path: RepertoireEdge[]): MoveRow[] {
  const rows: MoveRow[] = []
  let number = 0

  for (const edge of path) {
    if (colorToMove(edge.fromFen) === 'white') {
      number += 1
      rows.push({ number, white: edge.san })
    } else {
      const lastRow = rows[rows.length - 1]
      if (lastRow && lastRow.black === undefined) {
        lastRow.black = edge.san
      } else {
        number += 1
        rows.push({ number, black: edge.san })
      }
    }
  }

  return rows
}

function CurrentLinePanel({ rows }: { rows: MoveRow[] }) {
  return (
    <div style={{ fontSize: '0.9rem' }}>
      <h3
        style={{
          margin: '0 0 0.25rem',
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Current Line
      </h3>
      {rows.length === 0 && <p style={{ color: '#888', margin: 0 }}>Start of the repertoire</p>}
      {rows.map((row) => (
        <div key={row.number} style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ width: 22, flexShrink: 0, color: '#888' }}>{row.number}.</span>
          <span style={{ width: 64, flexShrink: 0 }}>{row.white ?? ''}</span>
          <span style={{ width: 64, flexShrink: 0 }}>{row.black ?? ''}</span>
        </div>
      ))}
    </div>
  )
}

function QuizRunner({
  repertoire,
  edges,
}: {
  repertoire: RepertoireRow
  edges: RepertoireEdge[]
}) {
  const [state, dispatch] = useReducer(quizReducer, undefined, () =>
    initialQuizState(repertoire, edges),
  )
  const { currentFen, sessionStats } = state
  const [pgnCopied, setPgnCopied] = useState(false)
  const rows = buildMoveRows(state.path)

  const nextColor = nextMoveColor(state.edges, currentFen)
  const isTraineesTurn = nextColor === repertoire.training_color
  const isRepComplete = nextColor === null

  // Auto-play the opponent's move, or start the next rep once this one ends.
  useEffect(() => {
    if (isRepComplete) {
      const timer = setTimeout(() => dispatch({ type: 'START_REP' }), REP_COMPLETE_DELAY_MS)
      return () => clearTimeout(timer)
    }

    if (!isTraineesTurn) {
      const timer = setTimeout(() => {
        const children = getChildren(state.edges, currentFen)
        dispatch({ type: 'AUTO_ADVANCE', childIndex: randomIndex(children.length) })
      }, AUTO_MOVE_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [state.edges, currentFen, isRepComplete, isTraineesTurn])

  function attemptMove(from: string, to: string): boolean {
    let san: string
    try {
      san = new Chess(currentFen).move({ from, to, promotion: 'q' }).san
    } catch {
      return false // not a legal chess move at all
    }

    const isInRepertoire = Boolean(findMatchingChild(state.edges, currentFen, san))
    dispatch({ type: 'SUBMIT_MOVE', san })
    return isInRepertoire
  }

  const { squareStyles, onSquareClick } = useClickToMove(currentFen, attemptMove, isTraineesTurn)

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!isTraineesTurn || !targetSquare) return false
    return attemptMove(sourceSquare, targetSquare)
  }

  async function handleCopyPgn() {
    try {
      await navigator.clipboard.writeText(buildPgn(repertoire.root_fen, rows))
      setPgnCopied(true)
      setTimeout(() => setPgnCopied(false), 1500)
    } catch {
      // clipboard access can fail (permissions, insecure context) — not worth surfacing as a training error
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '2rem',
        maxWidth: 780,
        margin: '2rem auto',
        padding: '0 1rem',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: '1 1 220px' }}>
        <CurrentLinePanel rows={rows} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button type="button" onClick={handleCopyPgn} style={linkButtonStyle}>
            {pgnCopied ? 'Copied!' : 'Copy PGN'}
          </button>
          <a href={lichessAnalysisUrl(currentFen)} target="_blank" rel="noreferrer" style={linkButtonStyle}>
            Analyze on Lichess ↗
          </a>
        </div>
      </div>
      <div style={{ flex: '0 1 480px', minWidth: 0 }}>
        <p>
          {repertoire.name} ({repertoire.training_color}) — reps: {sessionStats.repsCompleted}{' '}
          (perfect: {sessionStats.perfectReps}, mistakes: {sessionStats.mistakes})
        </p>
        <Chessboard
          options={{
            position: currentFen,
            onPieceDrop,
            onSquareClick,
            squareStyles,
            boardOrientation: repertoire.training_color,
            allowDragging: isTraineesTurn,
          }}
        />
        <div style={{ minHeight: '3rem', marginTop: '0.5rem' }}>
          {state.lastOutcome === 'wrong' && (
            <p style={{ color: 'crimson' }}>✗ Not in your repertoire — try again</p>
          )}
          {isRepComplete && <p>Rep complete — starting a new one…</p>}
        </div>
      </div>
    </div>
  )
}

function QuizSession({ repertoire }: { repertoire: RepertoireRow }) {
  const [edges, setEdges] = useState<RepertoireEdge[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setEdges(null)
    setError(null)
    listEdges(repertoire.id)
      .then((rows) => setEdges(rows.map(toRepertoireEdge)))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [repertoire.id])

  if (error) {
    return <p style={{ color: 'crimson', maxWidth: 480, margin: '2rem auto' }}>{error}</p>
  }
  if (!edges) {
    return <p style={{ maxWidth: 480, margin: '2rem auto' }}>Loading…</p>
  }
  if (edges.every((edge) => !edge.active)) {
    return (
      <p style={{ maxWidth: 480, margin: '2rem auto' }}>
        "{repertoire.name}" doesn't have any moves yet — add some in Build mode first.
      </p>
    )
  }
  return <QuizRunner repertoire={repertoire} edges={edges} />
}

function RepertoirePicker({
  familyId,
  onSelect,
}: {
  familyId: string
  onSelect: (repertoire: RepertoireRow) => void
}) {
  const [repertoires, setRepertoires] = useState<RepertoireRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRepertoires(familyId)
      .then(setRepertoires)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [familyId])

  return (
    <div style={{ padding: '1rem', maxWidth: 480, margin: '2rem auto' }}>
      <h2>Start a quiz</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!error && !repertoires && <p>Loading…</p>}
      {repertoires && repertoires.length === 0 && (
        <p>No repertoires yet — build one in Build mode first.</p>
      )}
      {repertoires && repertoires.length > 0 && (
        <ul>
          {repertoires.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onSelect(r)}>
                {r.name} ({r.training_color})
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function QuizView({ familyId }: { familyId: string }) {
  const [repertoire, setRepertoire] = useState<RepertoireRow | null>(null)

  if (!repertoire) {
    return <RepertoirePicker familyId={familyId} onSelect={setRepertoire} />
  }

  return <QuizSession repertoire={repertoire} />
}
