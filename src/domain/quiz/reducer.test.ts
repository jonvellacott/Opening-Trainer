import { describe, expect, it } from 'vitest'
import { quizReducer } from './reducer'
import type { QuizState, RepertoireEdge } from './types'

// Reducer logic doesn't validate chess legality, so plain labels stand in
// for FENs — only edge identity (fromFen/toFen matching) matters here.
const ROOT = 'root'
const AFTER_E4 = 'after-e4'
const AFTER_E4_E5 = 'after-e4-e5'
const AFTER_E4_C5 = 'after-e4-c5'
const AFTER_E4_E5_NF3 = 'after-e4-e5-nf3' // leaf

const edges: RepertoireEdge[] = [
  { fromFen: ROOT, san: 'e4', toFen: AFTER_E4, active: true },
  { fromFen: AFTER_E4, san: 'e5', toFen: AFTER_E4_E5, active: true },
  { fromFen: AFTER_E4, san: 'c5', toFen: AFTER_E4_C5, active: true },
  { fromFen: AFTER_E4_E5, san: 'Nf3', toFen: AFTER_E4_E5_NF3, active: true },
]

function initialState(): QuizState {
  return {
    rootFen: ROOT,
    trainingColor: 'white',
    edges,
    currentFen: ROOT,
    path: [],
    lastOutcome: null,
    hadMistakeThisRep: false,
    sessionStats: { repsCompleted: 0, perfectReps: 0, mistakes: 0 },
  }
}

describe('quizReducer', () => {
  it('advances on a move that matches the repertoire', () => {
    const state = quizReducer(initialState(), { type: 'SUBMIT_MOVE', san: 'e4' })

    expect(state.currentFen).toBe(AFTER_E4)
    expect(state.lastOutcome).toBe('correct')
  })

  it('rejects a move not in the repertoire without advancing', () => {
    const state = quizReducer(initialState(), { type: 'SUBMIT_MOVE', san: 'd4' })

    expect(state.currentFen).toBe(ROOT)
    expect(state.lastOutcome).toBe('wrong')
    expect(state.hadMistakeThisRep).toBe(true)
    expect(state.sessionStats.mistakes).toBe(1)
  })

  it('ignores a hidden edge as if it were not in the repertoire', () => {
    const hiddenEdges: RepertoireEdge[] = [
      { fromFen: ROOT, san: 'e4', toFen: AFTER_E4, active: false },
    ]
    const state = quizReducer(
      { ...initialState(), edges: hiddenEdges },
      { type: 'SUBMIT_MOVE', san: 'e4' },
    )

    expect(state.currentFen).toBe(ROOT)
    expect(state.lastOutcome).toBe('wrong')
  })

  it('auto-advances using the supplied child index', () => {
    let state = quizReducer(initialState(), { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'AUTO_ADVANCE', childIndex: 1 }) // e4's 2nd child is c5

    expect(state.currentFen).toBe(AFTER_E4_C5)
  })

  it('tracks the played moves as the path', () => {
    let state = quizReducer(initialState(), { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'AUTO_ADVANCE', childIndex: 0 }) // e5

    expect(state.path.map((edge) => edge.san)).toEqual(['e4', 'e5'])
  })

  it('completes a rep as perfect when every move was right first try', () => {
    let state = initialState()
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'AUTO_ADVANCE', childIndex: 0 }) // e5
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'Nf3' }) // leaf

    expect(state.sessionStats.repsCompleted).toBe(1)
    expect(state.sessionStats.perfectReps).toBe(1)
  })

  it('does not count a rep as perfect if a mistake happened earlier in it', () => {
    let state = initialState()
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'd4' }) // mistake
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'AUTO_ADVANCE', childIndex: 0 }) // e5
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'Nf3' }) // leaf

    expect(state.sessionStats.repsCompleted).toBe(1)
    expect(state.sessionStats.perfectReps).toBe(0)
    expect(state.sessionStats.mistakes).toBe(1)
  })

  it('START_REP resets to the root position', () => {
    let state = quizReducer(initialState(), { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'START_REP' })

    expect(state.currentFen).toBe(ROOT)
    expect(state.path).toEqual([])
    expect(state.lastOutcome).toBeNull()
    expect(state.hadMistakeThisRep).toBe(false)
  })
})
