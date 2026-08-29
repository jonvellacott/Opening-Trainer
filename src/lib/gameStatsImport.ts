import { parseGames } from '@mliebelt/pgn-parser'
import { Chess } from 'chess.js'
import { normalizeFen } from '../domain/chess'
import { fetchChessComArchives, fetchChessComMonth } from './chessComApi'
import type { ChessComGame } from './chessComApi'
import type { MoveStatsRow } from './moveStatsRepo'

function classifyResult(whiteResult: string, blackResult: string): 'white' | 'draws' | 'black' {
  if (whiteResult === 'win') return 'white'
  if (blackResult === 'win') return 'black'
  return 'draws'
}

/**
 * Tallies the moves `username` played (as either color) across a batch of
 * their games into `into`, up to `maxPlies` per game. A position's FEN
 * already fixes whose turn it is, so from_fen alone disambiguates which
 * color a tallied move belongs to — no separate color column is needed.
 */
export function aggregateChessComGames(
  games: ChessComGame[],
  username: string,
  maxPlies: number,
  source: string,
  into: Map<string, MoveStatsRow>,
): void {
  const lowerUsername = username.toLowerCase()

  for (const game of games) {
    if (game.rules !== 'chess') continue // skip variants (960, KOTH, etc.)
    const isWhite = game.white.username.toLowerCase() === lowerUsername
    const isBlack = game.black.username.toLowerCase() === lowerUsername
    if (!isWhite && !isBlack) continue
    const playerColor = isWhite ? 'w' : 'b'
    const outcome = classifyResult(game.white.result, game.black.result)

    let parsed
    try {
      parsed = parseGames(game.pgn)[0]
    } catch {
      continue // skip unparseable PGN rather than aborting the whole import
    }
    if (!parsed) continue

    const chess = new Chess()
    for (const move of parsed.moves.slice(0, maxPlies)) {
      const fromFen = normalizeFen(chess.fen())
      const toMove = chess.turn()
      let san: string
      try {
        san = chess.move(move.notation.notation).san
      } catch {
        break // corrupt PGN partway through — keep what we tallied so far
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
        row.stats[outcome] += 1
        into.set(key, row)
      }
    }
  }
}

export interface ImportProgress {
  monthsTotal: number
  monthsDone: number
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

  for (let i = 0; i < archives.length; i++) {
    const games = await fetchChessComMonth(archives[i])
    aggregateChessComGames(games, username, maxPlies, source, stats)
    gamesProcessed += games.length
    onProgress?.({ monthsTotal: archives.length, monthsDone: i + 1, gamesProcessed })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  return [...stats.values()]
}
