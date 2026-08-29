import { describe, expect, it } from 'vitest'
import { buildHash, parseBuildHash } from './buildHash'

describe('buildHash / parseBuildHash', () => {
  it('round-trips a repertoire id and a FEN containing spaces and slashes', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const hash = buildHash('a1b2c3', fen)

    expect(parseBuildHash(hash)).toEqual({ repertoireId: 'a1b2c3', fen })
  })

  it('returns null when there is no repertoire param', () => {
    expect(parseBuildHash('')).toBeNull()
    expect(parseBuildHash('#fen=whatever')).toBeNull()
  })

  it('parses a hash with no fen as fen: null', () => {
    expect(parseBuildHash('#repertoire=a1b2c3')).toEqual({ repertoireId: 'a1b2c3', fen: null })
  })
})
