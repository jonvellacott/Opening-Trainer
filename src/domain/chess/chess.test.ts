import { describe, expect, it } from 'vitest'
import { applySanMove, STANDARD_STARTING_FEN } from './index'

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
