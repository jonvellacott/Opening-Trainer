import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import type { SquareHandlerArgs } from 'react-chessboard'

/**
 * Click-to-move as an alternative to drag-and-drop: click a piece to select
 * it, then click a destination square to play it. Selection resets whenever
 * the position changes, and `enabled=false` (e.g. mid auto-play in Quiz)
 * makes clicks a no-op without disturbing drag-and-drop's own gating.
 */
export function useClickToMove(
  position: string,
  onMove: (from: string, to: string) => void,
  enabled = true,
) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)

  useEffect(() => {
    setSelectedSquare(null)
  }, [position])

  const legalTargets = useMemo<Square[]>(() => {
    if (!selectedSquare) return []
    return new Chess(position).moves({ square: selectedSquare, verbose: true }).map((m) => m.to)
  }, [selectedSquare, position])

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}
    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' }
    }
    for (const square of legalTargets) {
      styles[square] = {
        ...styles[square],
        backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.25) 24%, transparent 25%)',
      }
    }
    return styles
  }, [selectedSquare, legalTargets])

  function onSquareClick({ square }: SquareHandlerArgs) {
    if (!enabled) return

    if (selectedSquare && legalTargets.includes(square as Square)) {
      onMove(selectedSquare, square)
      setSelectedSquare(null)
      return
    }

    if (selectedSquare === square) {
      setSelectedSquare(null)
      return
    }

    const chess = new Chess(position)
    const piece = chess.get(square as Square)
    setSelectedSquare(piece && piece.color === chess.turn() ? (square as Square) : null)
  }

  return { squareStyles, onSquareClick }
}
