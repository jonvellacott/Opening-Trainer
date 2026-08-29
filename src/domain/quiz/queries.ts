import { colorToMove } from '../chess'
import type { Color } from '../repertoire/types'
import type { RepertoireEdge } from './types'

/** The active (non-hidden) moves available from a position. */
export function getChildren(edges: RepertoireEdge[], fen: string): RepertoireEdge[] {
  return edges.filter((edge) => edge.fromFen === fen && edge.active)
}

/** Colour to move next, or null if the position is a leaf (no active edges). */
export function nextMoveColor(edges: RepertoireEdge[], fen: string): Color | null {
  return getChildren(edges, fen).length > 0 ? colorToMove(fen) : null
}

/** The active edge whose move matches the given SAN, if the move is in the repertoire. */
export function findMatchingChild(
  edges: RepertoireEdge[],
  fen: string,
  san: string,
): RepertoireEdge | undefined {
  return getChildren(edges, fen).find((edge) => edge.san === san)
}
