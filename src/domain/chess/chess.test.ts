import { describe, expect, it } from 'vitest'
import { applySanMove, colorToMove, normalizeFen, STANDARD_STARTING_FEN } from './index'

describe('applySanMove', () => {
  it('applies a legal move and returns the resulting position', () => {
    const result = applySanMove(STANDARD_STARTING_FEN, 'e4')
    expect(result?.san).toBe('e4')
    expect(result?.fen).toContain(' b ')
  })

  it('returns null for an illegal move', () => {
    expect(applySanMove(STANDARD_STARTING_FEN, 'e5')).toBeNull()
  })
})

describe('normalizeFen', () => {
  it('resets the halfmove/fullmove clocks to 0 1', () => {
    expect(normalizeFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 12 34')).toBe(
      STANDARD_STARTING_FEN,
    )
  })

  it('leaves an already-normalized FEN unchanged', () => {
    expect(normalizeFen(STANDARD_STARTING_FEN)).toBe(STANDARD_STARTING_FEN)
  })
})

describe('colorToMove', () => {
  it('reads the side to move from the FEN', () => {
    expect(colorToMove(STANDARD_STARTING_FEN)).toBe('white')
    expect(colorToMove(applySanMove(STANDARD_STARTING_FEN, 'e4')!.fen)).toBe('black')
  })
})
