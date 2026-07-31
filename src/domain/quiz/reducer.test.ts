import { describe, expect, it } from 'vitest'
import { parseStudyPgn } from '../pgn'
import type { Repertoire } from '../repertoire/types'
import { quizReducer } from './reducer'
import type { QuizState } from './types'

// e4 e5 is the mainline; 1...c5 is Black's alternative, both children of e4.
const pgn = `[Event "Test"]

1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *`

function initialState(repertoire: Repertoire): QuizState {
  return {
    repertoire,
    chapter: repertoire.chapters[0],
    currentNodeId: null,
    lastOutcome: null,
    hadMistakeThisRep: false,
    sessionStats: { repsCompleted: 0, perfectReps: 0, mistakes: 0 },
  }
}

describe('quizReducer', () => {
  it('advances on a move that matches the repertoire', () => {
    const repertoire = parseStudyPgn(pgn, 'white')
    const state = quizReducer(initialState(repertoire), { type: 'SUBMIT_MOVE', san: 'e4' })

    expect(state.currentNodeId).toBe('e4')
    expect(state.lastOutcome).toBe('correct')
  })

  it('rejects a move not in the repertoire without advancing', () => {
    const repertoire = parseStudyPgn(pgn, 'white')
    const state = quizReducer(initialState(repertoire), { type: 'SUBMIT_MOVE', san: 'd4' })

    expect(state.currentNodeId).toBeNull()
    expect(state.lastOutcome).toBe('wrong')
    expect(state.hadMistakeThisRep).toBe(true)
    expect(state.sessionStats.mistakes).toBe(1)
  })

  it('auto-advances using the supplied child index', () => {
    const repertoire = parseStudyPgn(pgn, 'white')
    let state = quizReducer(initialState(repertoire), { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'AUTO_ADVANCE', childIndex: 1 }) // e4's 2nd child is c5

    expect(state.currentNodeId).toBe('e4/c5')
  })

  it('completes a rep as perfect when every move was right first try', () => {
    const repertoire = parseStudyPgn(pgn, 'white')
    let state = initialState(repertoire)
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'AUTO_ADVANCE', childIndex: 0 }) // e5
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'Nf3' }) // leaf

    expect(state.sessionStats.repsCompleted).toBe(1)
    expect(state.sessionStats.perfectReps).toBe(1)
  })

  it('does not count a rep as perfect if a mistake happened earlier in it', () => {
    const repertoire = parseStudyPgn(pgn, 'white')
    let state = initialState(repertoire)
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'd4' }) // mistake
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'AUTO_ADVANCE', childIndex: 0 }) // e5
    state = quizReducer(state, { type: 'SUBMIT_MOVE', san: 'Nf3' }) // leaf

    expect(state.sessionStats.repsCompleted).toBe(1)
    expect(state.sessionStats.perfectReps).toBe(0)
    expect(state.sessionStats.mistakes).toBe(1)
  })

  it('START_REP resets to the given chapter root', () => {
    const repertoire = parseStudyPgn(pgn, 'white')
    let state = quizReducer(initialState(repertoire), { type: 'SUBMIT_MOVE', san: 'e4' })
    state = quizReducer(state, { type: 'START_REP', chapterIndex: 0 })

    expect(state.currentNodeId).toBeNull()
    expect(state.lastOutcome).toBeNull()
    expect(state.hadMistakeThisRep).toBe(false)
  })
})
