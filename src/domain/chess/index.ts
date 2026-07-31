import { Chess } from 'chess.js'

export const STANDARD_STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export interface AppliedMove {
  san: string
  from: string
  to: string
  promotion?: string
  fen: string
}

/** Plays a SAN move against a position. Returns null if the move is illegal. */
export function applySanMove(fen: string, san: string): AppliedMove | null {
  const chess = new Chess(fen)
  try {
    const move = chess.move(san)
    return {
      san: move.san,
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      fen: chess.fen(),
    }
  } catch {
    return null
  }
}
