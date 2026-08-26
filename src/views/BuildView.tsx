import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { PieceDropHandlerArgs } from 'react-chessboard'
import { normalizeFen, STANDARD_STARTING_FEN } from '../domain/chess'
import type { Color } from '../domain/repertoire'
import { createRepertoire, listRepertoires, saveEdge } from '../lib/repertoireRepo'
import type { RepertoireRow } from '../lib/repertoireRepo'

function RepertoirePicker({
  familyId,
  userId,
  onSelect,
}: {
  familyId: string
  userId: string
  onSelect: (repertoire: RepertoireRow) => void
}) {
  const [repertoires, setRepertoires] = useState<RepertoireRow[] | null>(null)
  const [name, setName] = useState('')
  const [trainingColor, setTrainingColor] = useState<Color>('white')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listRepertoires(familyId)
      .then(setRepertoires)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [familyId])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const repertoire = await createRepertoire({
        familyId,
        createdBy: userId,
        name,
        trainingColor,
        rootFen: STANDARD_STARTING_FEN,
      })
      onSelect(repertoire)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 480, margin: '2rem auto' }}>
      <h2>Build a repertoire</h2>
      {repertoires && repertoires.length > 0 && (
        <ul>
          {repertoires.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onSelect(r)}>
                {r.name} ({r.training_color})
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Repertoire name"
          required
          style={{ flex: 1 }}
        />
        <select value={trainingColor} onChange={(e) => setTrainingColor(e.target.value as Color)}>
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>
        <button type="submit">Create</button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </div>
  )
}

function BuildSession({ repertoire }: { repertoire: RepertoireRow }) {
  const [position, setPosition] = useState(repertoire.root_fen)
  const [lastMove, setLastMove] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false

    const chess = new Chess(position)
    let move
    try {
      move = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
    } catch {
      return false // not a legal chess move at all
    }

    const fromFen = position
    const toFen = normalizeFen(chess.fen())
    setError(null)
    saveEdge({ repertoireId: repertoire.id, fromFen, san: move.san, toFen })
      .then(() => {
        setPosition(toFen)
        setLastMove(move.san)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))

    return true
  }

  return (
    <div style={{ maxWidth: 480, margin: '2rem auto' }}>
      <p>
        {repertoire.name} ({repertoire.training_color})
      </p>
      <Chessboard
        options={{
          position,
          onPieceDrop,
          boardOrientation: repertoire.training_color,
        }}
      />
      <div style={{ minHeight: '3rem', marginTop: '0.5rem' }}>
        {error && <p style={{ color: 'crimson' }}>Couldn't save: {error}</p>}
        {!error && lastMove && <p>Saved {lastMove}</p>}
      </div>
    </div>
  )
}

export function BuildView({ familyId, userId }: { familyId: string; userId: string }) {
  const [repertoire, setRepertoire] = useState<RepertoireRow | null>(null)

  if (!repertoire) {
    return <RepertoirePicker familyId={familyId} userId={userId} onSelect={setRepertoire} />
  }

  return <BuildSession repertoire={repertoire} />
}
