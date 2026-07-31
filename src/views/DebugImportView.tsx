import { useState } from 'react'
import { Chessboard } from 'react-chessboard'
import { parseStudyPgn, PgnImportError } from '../domain/pgn'
import { getChildren } from '../domain/repertoire'
import type { Chapter, Color, Repertoire, RepertoireNode } from '../domain/repertoire'

function extractStudyId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/lichess\.org\/study\/([A-Za-z0-9]+)/)
  return match ? match[1] : trimmed
}

function describeShapes(node: RepertoireNode): string | null {
  if (!node.shapes) return null
  const all = [...node.shapes.arrows, ...node.shapes.squares]
  return all.length > 0 ? `[shapes: ${all.join(', ')}]` : null
}

function TreeNode({
  chapter,
  nodeId,
  selectedId,
  onSelect,
}: {
  chapter: Chapter
  nodeId: string
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const node = chapter.nodes[nodeId]
  const children = getChildren(chapter, nodeId)
  const isTrainingMove = node.color === chapter.trainingColor
  const shapeLabel = describeShapes(node)

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(nodeId)}
        style={{
          fontWeight: isTrainingMove ? 'bold' : 'normal',
          background: selectedId === nodeId ? 'Highlight' : undefined,
        }}
      >
        {node.san}
      </button>
      {node.nags && ' ' + node.nags.join(' ')}
      {node.comment && <span> — {node.comment}</span>}
      {shapeLabel && <span> {shapeLabel}</span>}
      {children.length > 0 && (
        <ul>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              chapter={chapter}
              nodeId={child.id}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function ChapterView({ chapter }: { chapter: Chapter }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const position = selectedId ? chapter.nodes[selectedId].fen : chapter.startingFen
  const rootChildren = getChildren(chapter, null)

  return (
    <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', alignItems: 'flex-start' }}>
      <div>
        <h3>
          {chapter.name} ({chapter.trainingColor})
        </h3>
        <ul>
          {rootChildren.map((child) => (
            <TreeNode
              key={child.id}
              chapter={chapter}
              nodeId={child.id}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ))}
        </ul>
      </div>
      <div style={{ width: 320, flexShrink: 0, position: 'sticky', top: '1rem' }}>
        <Chessboard
          options={{
            position,
            allowDragging: false,
            boardOrientation: chapter.trainingColor,
          }}
        />
      </div>
    </div>
  )
}

export function DebugImportView() {
  const [studyInput, setStudyInput] = useState('wDAoY1rd')
  const [trainingColor, setTrainingColor] = useState<Color>('white')
  const [repertoire, setRepertoire] = useState<Repertoire | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLoad() {
    setLoading(true)
    setError(null)
    setRepertoire(null)
    try {
      const studyId = extractStudyId(studyInput)
      const response = await fetch(`https://lichess.org/api/study/${studyId}.pgn`)
      if (!response.ok) {
        throw new Error(`Lichess returned ${response.status}`)
      }
      const pgnText = await response.text()
      setRepertoire(parseStudyPgn(pgnText, trainingColor))
    } catch (err) {
      const message =
        err instanceof PgnImportError || err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 900, margin: '0 auto' }}>
      <h2>Debug: import a repertoire</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          value={studyInput}
          onChange={(e) => setStudyInput(e.target.value)}
          placeholder="Study ID or URL"
          style={{ flex: 1 }}
        />
        <select value={trainingColor} onChange={(e) => setTrainingColor(e.target.value as Color)}>
          <option value="white">White</option>
          <option value="black">Black</option>
        </select>
        <button type="button" onClick={handleLoad} disabled={loading}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {repertoire && (
        <div>
          <h2>{repertoire.name}</h2>
          {repertoire.chapters.map((chapter, i) => (
            <ChapterView key={i} chapter={chapter} />
          ))}
        </div>
      )}
    </div>
  )
}
