import { describe, expect, it } from 'vitest'
import { STANDARD_STARTING_FEN } from '../chess'
import { buildPgn } from './buildPgn'

describe('buildPgn', () => {
  it('renders paired move rows as standard PGN movetext', () => {
    const rows = [
      { number: 1, white: 'e4', black: 'e5' },
      { number: 2, white: 'Nf3' },
    ]
    expect(buildPgn(STANDARD_STARTING_FEN, rows)).toBe('1. e4 e5 2. Nf3 *')
  })

  it('renders a Black-only row with an ellipsis move number', () => {
    const rows = [{ number: 1, black: 'e5' }]
    expect(buildPgn(STANDARD_STARTING_FEN, rows)).toBe('1... e5 *')
  })

  it('marks an empty line as just an unknown result', () => {
    expect(buildPgn(STANDARD_STARTING_FEN, [])).toBe('*')
  })

  it('adds FEN/SetUp tags when the root position is not the standard start', () => {
    const customFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    const rows = [{ number: 1, black: 'c5' }]
    expect(buildPgn(customFen, rows)).toBe(
      `[FEN "${customFen}"]\n[SetUp "1"]\n\n1... c5 *`,
    )
  })
})
