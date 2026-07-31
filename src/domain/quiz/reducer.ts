import { findMatchingChild, getChildren } from '../repertoire/queries'
import type { QuizAction, QuizState } from './types'

/**
 * All randomness (which chapter, which opponent branch) is supplied by the
 * caller as action payloads, so this reducer stays a pure function and the
 * rep-completion bookkeeping is easy to test without mocking Math.random.
 */
export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'START_REP': {
      const chapter = state.repertoire.chapters[action.chapterIndex]
      return {
        ...state,
        chapter,
        currentNodeId: null,
        lastOutcome: null,
        hadMistakeThisRep: false,
      }
    }

    case 'AUTO_ADVANCE': {
      const children = getChildren(state.chapter, state.currentNodeId)
      return advanceTo(state, children[action.childIndex].id)
    }

    case 'SUBMIT_MOVE': {
      const match = findMatchingChild(state.chapter, state.currentNodeId, action.san)
      if (!match) {
        return {
          ...state,
          lastOutcome: 'wrong',
          hadMistakeThisRep: true,
          sessionStats: { ...state.sessionStats, mistakes: state.sessionStats.mistakes + 1 },
        }
      }
      return advanceTo(state, match.id)
    }

    default:
      return state
  }
}

function advanceTo(state: QuizState, nodeId: string): QuizState {
  const isLeaf = getChildren(state.chapter, nodeId).length === 0
  return {
    ...state,
    currentNodeId: nodeId,
    lastOutcome: 'correct',
    sessionStats: isLeaf
      ? {
          repsCompleted: state.sessionStats.repsCompleted + 1,
          perfectReps: state.sessionStats.perfectReps + (state.hadMistakeThisRep ? 0 : 1),
          mistakes: state.sessionStats.mistakes,
        }
      : state.sessionStats,
  }
}
