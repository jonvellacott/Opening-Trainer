import { useEffect, useMemo, useReducer, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { PieceDropHandlerArgs } from 'react-chessboard'
import { quizReducer } from '../domain/quiz'
import type { QuizState } from '../domain/quiz'
import {
  findMatchingChild,
  getChildren,
  groupAndMergeChapters,
  nextMoveColor,
} from '../domain/repertoire'
import type { Color, Repertoire } from '../domain/repertoire'
import { useRepertoireLoader } from './useRepertoireLoader'

const REP_COMPLETE_DELAY_MS = 1200
const AUTO_MOVE_DELAY_MS = 500

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length)
}

function initialQuizState(repertoire: Repertoire): QuizState {
  return {
    repertoire,
    chapter: repertoire.chapters[randomIndex(repertoire.chapters.length)],
    currentNodeId: null,
    lastOutcome: null,
    hadMistakeThisRep: false,
    sessionStats: { repsCompleted: 0, perfectReps: 0, mistakes: 0 },
  }
}

function QuizSession({ repertoire }: { repertoire: Repertoire }) {
  // Chapters that share a starting position and colour are merged into one
  // tree, so a branch point on the training side (e.g. two White chapters
  // both starting 1.d4) is a choice you make by playing a move, not a
  // pre-selection the app makes for you.
  const quizRepertoire = useMemo(
    () => ({ ...repertoire, chapters: groupAndMergeChapters(repertoire.chapters) }),
    [repertoire],
  )
  const [state, dispatch] = useReducer(quizReducer, quizRepertoire, initialQuizState)
  const { chapter, currentNodeId, sessionStats } = state

  const position = currentNodeId ? chapter.nodes[currentNodeId].fen : chapter.startingFen
  const comment = currentNodeId ? chapter.nodes[currentNodeId].comment : undefined
  const nextColor = nextMoveColor(chapter, currentNodeId)
  const isTraineesTurn = nextColor === chapter.trainingColor
  const isRepComplete = nextColor === null

  // Auto-play the opponent's move, or start the next rep once this one ends.
  useEffect(() => {
    if (isRepComplete) {
      const timer = setTimeout(() => {
        dispatch({ type: 'START_REP', chapterIndex: randomIndex(state.repertoire.chapters.length) })
      }, REP_COMPLETE_DELAY_MS)
      return () => clearTimeout(timer)
    }

    if (!isTraineesTurn) {
      const timer = setTimeout(() => {
        const children = getChildren(chapter, currentNodeId)
        dispatch({ type: 'AUTO_ADVANCE', childIndex: randomIndex(children.length) })
      }, AUTO_MOVE_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [chapter, currentNodeId, isRepComplete, isTraineesTurn, state.repertoire.chapters.length])

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!isTraineesTurn || !targetSquare) return false

    let san: string
    try {
      san = new Chess(position).move({ from: sourceSquare, to: targetSquare, promotion: 'q' }).san
    } catch {
      return false // not a legal chess move at all
    }

    const isInRepertoire = Boolean(findMatchingChild(chapter, currentNodeId, san))
    dispatch({ type: 'SUBMIT_MOVE', san })
    return isInRepertoire
  }

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto' }}>
      <p>
        {chapter.name} ({chapter.trainingColor}) — reps: {sessionStats.repsCompleted} (perfect:{' '}
        {sessionStats.perfectReps}, mistakes: {sessionStats.mistakes})
      </p>
      <Chessboard
        options={{
          position,
          onPieceDrop,
          boardOrientation: chapter.trainingColor,
          allowDragging: isTraineesTurn,
        }}
      />
      <div style={{ minHeight: '3rem', marginTop: '0.5rem' }}>
        {state.lastOutcome === 'wrong' && (
          <p style={{ color: 'crimson' }}>✗ Not in your repertoire — try again</p>
        )}
        {isRepComplete && <p>Rep complete — starting a new one…</p>}
        {comment && <p>{comment}</p>}
      </div>
    </div>
  )
}

export function QuizView() {
  const [studyInput, setStudyInput] = useState('wDAoY1rd')
  const [trainingColor, setTrainingColor] = useState<Color>('white')
  const { repertoire, error, loading, load } = useRepertoireLoader()

  if (!repertoire) {
    return (
      <div style={{ padding: '1rem', maxWidth: 480, margin: '0 auto' }}>
        <h2>Start a quiz</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={studyInput}
            onChange={(e) => setStudyInput(e.target.value)}
            placeholder="Study ID or URL"
            style={{ flex: 1 }}
          />
          <select value={trainingColor} onChange={(e) => setTrainingColor(e.target.value as Color)}>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
          <button type="button" onClick={() => load(studyInput, trainingColor)} disabled={loading}>
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
      </div>
    )
  }

  return <QuizSession repertoire={repertoire} />
}
