import { useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { PieceDropHandlerArgs } from 'react-chessboard'

function App() {
  const [game] = useState(() => new Chess())
  const [position, setPosition] = useState(game.fen())

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs) {
    if (!targetSquare) return false

    try {
      game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
    } catch {
      return false
    }

    setPosition(game.fen())
    return true
  }

  function resetBoard() {
    game.reset()
    setPosition(game.fen())
  }

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto' }}>
      <Chessboard
        options={{
          position,
          onPieceDrop,
        }}
      />
      <button type="button" onClick={resetBoard} style={{ marginTop: '1rem' }}>
        Reset board
      </button>
    </div>
  )
}

export default App
