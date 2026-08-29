import { describe, expect, it } from 'vitest'
import { STANDARD_STARTING_FEN } from '../domain/chess'
import { aggregateChessComGames } from './gameStatsImport'
import type { MoveStatsRow } from './moveStatsRepo'
import type { ChessComGame } from './chessComApi'

const USERNAME = 'chesswithakeem'

function game(params: {
  whiteUsername: string
  blackUsername: string
  whiteResult: string
  blackResult: string
  moves: string
}): ChessComGame {
  return {
    rules: 'chess',
    white: { username: params.whiteUsername, result: params.whiteResult },
    black: { username: params.blackUsername, result: params.blackResult },
    pgn: `[White "${params.whiteUsername}"]\n[Black "${params.blackUsername}"]\n\n${params.moves}`,
  }
}

describe('aggregateChessComGames', () => {
  it('only tallies the tracked player\'s own moves, keyed by the position before each move', () => {
    const games: ChessComGame[] = [
      game({
        whiteUsername: USERNAME,
        blackUsername: 'randomOpponent',
        whiteResult: 'win',
        blackResult: 'resigned',
        moves: '1. d4 d5 2. c4 e6 1-0',
      }),
      // Username matching is case-insensitive.
      game({
        whiteUsername: 'someoneElse',
        blackUsername: 'ChessWithAKeem',
        whiteResult: 'agreed',
        blackResult: 'agreed',
        moves: '1. e4 e5 2. Nf3 Nc6 1/2-1/2',
      }),
    ]

    const stats = new Map<string, MoveStatsRow>()
    aggregateChessComGames(games, USERNAME, 20, 'chess.com:chesswithakeem', stats)
    const rows = [...stats.values()]

    // Game 1: White's own moves (d4, c4) are tallied; Black's (d5, e6) are not.
    const d4Row = rows.find((r) => r.san === 'd4')
    expect(d4Row?.from_fen).toBe(STANDARD_STARTING_FEN)
    expect(d4Row?.stats).toEqual({ white: 1, draws: 0, black: 0 })
    expect(rows.find((r) => r.san === 'c4')?.stats).toEqual({ white: 1, draws: 0, black: 0 })
    expect(rows.find((r) => r.san === 'd5')).toBeUndefined()
    expect(rows.find((r) => r.san === 'e6')).toBeUndefined()

    // Game 2: username played Black, so only e5/Nc6 are tallied, as draws.
    const e5Row = rows.find((r) => r.san === 'e5')
    expect(e5Row?.stats).toEqual({ white: 0, draws: 1, black: 0 })
    expect(rows.find((r) => r.san === 'e4')).toBeUndefined()
    expect(rows.find((r) => r.san === 'Nf3')).toBeUndefined()

    const nc6Row = rows.find((r) => r.san === 'Nc6')
    expect(nc6Row?.stats).toEqual({ white: 0, draws: 1, black: 0 })
  })

  it('caps replay at maxPlies', () => {
    const games: ChessComGame[] = [
      game({
        whiteUsername: USERNAME,
        blackUsername: 'opp',
        whiteResult: 'win',
        blackResult: 'checkmated',
        moves: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 1-0',
      }),
    ]

    const stats = new Map<string, MoveStatsRow>()
    aggregateChessComGames(games, USERNAME, 3, 'chess.com:chesswithakeem', stats)
    const sans = [...stats.values()].map((r) => r.san)

    // maxPlies=3 covers d4, d5, c4 — Nc3 (ply 5) should not be reached.
    expect(sans).toContain('d4')
    expect(sans).toContain('c4')
    expect(sans).not.toContain('Nc3')
  })

  it('ignores games the tracked player was not part of', () => {
    const games: ChessComGame[] = [
      game({
        whiteUsername: 'someone',
        blackUsername: 'someoneElse',
        whiteResult: 'win',
        blackResult: 'resigned',
        moves: '1. d4 d5 1-0',
      }),
    ]

    const stats = new Map<string, MoveStatsRow>()
    aggregateChessComGames(games, USERNAME, 20, 'chess.com:chesswithakeem', stats)
    expect(stats.size).toBe(0)
  })
})
