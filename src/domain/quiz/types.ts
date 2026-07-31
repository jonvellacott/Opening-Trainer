import type { Chapter, Repertoire } from '../repertoire/types'

export interface SessionStats {
  repsCompleted: number
  perfectReps: number
  mistakes: number
}

export interface QuizState {
  repertoire: Repertoire
  chapter: Chapter
  /** null means "at the chapter's starting position, no moves played yet". */
  currentNodeId: string | null
  lastOutcome: 'correct' | 'wrong' | null
  hadMistakeThisRep: boolean
  sessionStats: SessionStats
}

export type QuizAction =
  | { type: 'START_REP'; chapterIndex: number }
  | { type: 'AUTO_ADVANCE'; childIndex: number }
  | { type: 'SUBMIT_MOVE'; san: string }
