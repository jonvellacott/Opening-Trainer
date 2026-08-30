import { parseGames } from '@mliebelt/pgn-parser'
import { Chess } from 'chess.js'
import { normalizeFen } from '../domain/chess'
import { fetchChessComArchives, fetchChessComMonth } from './chessComApi'
import type { ChessComGame } from './chessComApi'
import { fetchLichessGames } from './lichessGamesApi'
import type { LichessGame } from './lichessGamesApi'
import type { MoveStatsRow } from './moveStatsRepo'

function classifyResult(whiteResult: string, blackResult: string): 'white' | 'draws' | 'black' {
  if (whiteResult === 'win') return 'white'
  if (blackResult === 'win') return 'black'
  return 'draws'
}

/** A game reduced to just what the aggregator needs, independent of which site it came from. */
interface NormalizedGame {
  white: string // lowercase username
  black: string // lowercase username
  outcome: 'white' | 'draws' | 'black'
  sanMoves: string[]
}

/**
 * Tallies the moves `username` played (as either color) across a batch of
 * normalized games into `into`, up to `maxPlies` per game. A position's FEN
 * already fixes whose turn it is, so from_fen alone disambiguates which
 * color a tallied move belongs to — no separate color column is needed.
 */
function aggregateGames(
  games: NormalizedGame[],
  username: string,
  maxPlies: number,
  source: string,
  into: Map<string, MoveStatsRow>,
): void {
  const lowerUsername = username.toLowerCase()

  for (const game of games) {
    const isWhite = game.white === lowerUsername
    const isBlack = game.black === lowerUsername
    if (!isWhite && !isBlack) continue
    const playerColor = isWhite ? 'w' : 'b'

    const chess = new Chess()
    for (const move of game.sanMoves.slice(0, maxPlies)) {
      const fromFen = normalizeFen(chess.fen())
      const toMove = chess.turn()
      let san: string
      try {
        san = chess.move(move).san
      } catch {
        break // corrupt move text partway through — keep what we tallied so far
      }
      const toFen = normalizeFen(chess.fen())

      if (toMove === playerColor) {
        const key = `${fromFen}|${san}`
        const row = into.get(key) ?? {
          from_fen: fromFen,
          san,
          to_fen: toFen,
          source,
          stats: { white: 0, draws: 0, black: 0 },
        }
        row.stats[game.outcome] += 1
        into.set(key, row)
      }
    }
  }
}

export function aggregateChessComGames(
  games: ChessComGame[],
  username: string,
  maxPlies: number,
  source: string,
  into: Map<string, MoveStatsRow>,
): void {
  const normalized: NormalizedGame[] = []
  for (const game of games) {
    if (game.rules !== 'chess') continue // skip variants (960, KOTH, etc.)
    let parsed
    try {
      parsed = parseGames(game.pgn)[0]
    } catch {
      continue // skip unparseable PGN rather than aborting the whole import
    }
    if (!parsed) continue
    normalized.push({
      white: game.white.username.toLowerCase(),
      black: game.black.username.toLowerCase(),
      outcome: classifyResult(game.white.result, game.black.result),
      sanMoves: parsed.moves.map((m) => m.notation.notation),
    })
  }
  aggregateGames(normalized, username, maxPlies, source, into)
}

export function aggregateLichessGames(
  games: LichessGame[],
  username: string,
  maxPlies: number,
  source: string,
  into: Map<string, MoveStatsRow>,
): void {
  const normalized: NormalizedGame[] = []
  for (const game of games) {
    if (game.variant !== 'standard' || !game.moves) continue // skip variants and moveless (e.g. aborted) games
    normalized.push({
      white: game.white,
      black: game.black,
      outcome: game.winner === 'white' ? 'white' : game.winner === 'black' ? 'black' : 'draws',
      sanMoves: game.moves.split(' ').filter(Boolean),
    })
  }
  aggregateGames(normalized, username, maxPlies, source, into)
}

export interface ImportProgress {
  gamesProcessed: number
}

/**
 * Fetches every monthly archive for a Chess.com player and aggregates their
 * moves into move_stats rows. Fetches sequentially (polite to Chess.com's
 * API) and yields to the event loop between months so the UI can repaint
 * progress instead of the tab looking hung.
 */
export async function importChessComPlayer(
  username: string,
  maxPlies: number,
  onProgress?: (progress: ImportProgress) => void,
): Promise<MoveStatsRow[]> {
  const source = `chess.com:${username.toLowerCase()}`
  const archives = await fetchChessComArchives(username)
  const stats = new Map<string, MoveStatsRow>()
  let gamesProcessed = 0

  for (const archive of archives) {
    const games = await fetchChessComMonth(archive)
    aggregateChessComGames(games, username, maxPlies, source, stats)
    gamesProcessed += games.length
    onProgress?.({ gamesProcessed })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return [...stats.values()]
}

/**
 * Streams every game for a Lichess player and aggregates their moves into
 * move_stats rows, the same shape and one-time-import model as Chess.com —
 * a live per-position lookup is too slow for accounts with tens of
 * thousands of games (some of this app's tracked players are in that range).
 */
export async function importLichessPlayer(
  username: string,
  maxPlies: number,
  onProgress?: (progress: ImportProgress) => void,
): Promise<MoveStatsRow[]> {
  const source = `lichess:${username.toLowerCase()}`
  const stats = new Map<string, MoveStatsRow>()
  let gamesProcessed = 0

  await fetchLichessGames(username, async (games) => {
    aggregateLichessGames(games, username, maxPlies, source, stats)
    gamesProcessed += games.length
    onProgress?.({ gamesProcessed })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  return [...stats.values()]
}
