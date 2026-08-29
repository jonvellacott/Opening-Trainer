import type { Color } from '../repertoire/types'

/**
 * A quizzable move, independent of how it's stored (Supabase row shape,
 * column names, etc.) — the view layer maps repertoire_edges rows into
 * these before handing them to the reducer.
 */
export interface RepertoireEdge {
  fromFen: string
  san: string
  toFen: string
  /** false for a hidden ('ignored') edge: training must skip it entirely. */
  active: boolean
}

export interface SessionStats {
  repsCompleted: number
  perfectReps: number
  mistakes: number
}

export interface QuizState {
  rootFen: string
  trainingColor: Color
  edges: RepertoireEdge[]
  currentFen: string
  /** Moves played so far this rep, root to current, for display. */
  path: RepertoireEdge[]
  lastOutcome: 'correct' | 'wrong' | null
  hadMistakeThisRep: boolean
  sessionStats: SessionStats
}

export type QuizAction =
  | { type: 'START_REP' }
  | { type: 'AUTO_ADVANCE'; childIndex: number }
  | { type: 'SUBMIT_MOVE'; san: string }
