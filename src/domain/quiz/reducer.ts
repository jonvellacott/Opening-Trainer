import { findMatchingChild, getChildren } from './queries'
import type { QuizAction, QuizState, RepertoireEdge } from './types'

/**
 * All randomness (which opponent branch) is supplied by the caller as action
 * payloads, so this reducer stays a pure function and the rep-completion
 * bookkeeping is easy to test without mocking Math.random.
 */
export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case 'START_REP': {
      return {
        ...state,
        currentFen: state.rootFen,
        path: [],
        lastOutcome: null,
        hadMistakeThisRep: false,
      }
    }

    case 'AUTO_ADVANCE': {
      const children = getChildren(state.edges, state.currentFen)
      return advanceTo(state, children[action.childIndex])
    }

    case 'SUBMIT_MOVE': {
      const match = findMatchingChild(state.edges, state.currentFen, action.san)
      if (!match) {
        return {
          ...state,
          lastOutcome: 'wrong',
          hadMistakeThisRep: true,
          sessionStats: { ...state.sessionStats, mistakes: state.sessionStats.mistakes + 1 },
        }
      }
      return advanceTo(state, match)
    }

    default:
      return state
  }
}

function advanceTo(state: QuizState, edge: RepertoireEdge): QuizState {
  const isLeaf = getChildren(state.edges, edge.toFen).length === 0
  return {
    ...state,
    currentFen: edge.toFen,
    path: [...state.path, edge],
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
