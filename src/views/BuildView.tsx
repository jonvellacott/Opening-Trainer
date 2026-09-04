import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import type { Arrow, PieceDropHandlerArgs } from 'react-chessboard'
import { applySanMove, colorToMove, normalizeFen, STANDARD_STARTING_FEN, uciToSan } from '../domain/chess'
import { buildPgn } from '../domain/pgn'
import type { Color } from '../domain/repertoire'
import { buildHash, parseBuildHash } from '../lib/buildHash'
import { getFamily } from '../lib/familiesRepo'
import { fetchExplorerMoves } from '../lib/lichessExplorer'
import type { ExplorerMove } from '../lib/lichessExplorer'
import { evaluatePosition, formatEval } from '../lib/localStockfish'
import type { EngineLine } from '../lib/localStockfish'
import { listMoveStatsBySource, moveStatsToExplorerMoves } from '../lib/moveStatsRepo'
import {
  createRepertoire,
  deleteEdges,
  deleteRepertoire,
  getRepertoire,
  listEdges,
  listRepertoires,
  saveEdge,
  setEdgeStatus,
} from '../lib/repertoireRepo'
import type { EdgeRow, EdgeStatus, RepertoireRow } from '../lib/repertoireRepo'
import { listTrackedPlayers, statsSourceFor } from '../lib/trackedPlayersRepo'
import type { TrackedPlayerRow } from '../lib/trackedPlayersRepo'
import { EvalBar } from './EvalBar'
import { useClickToMove } from './useClickToMove'

/** Used while the family's real setting is still loading. */
const DEFAULT_SUGGESTION_THRESHOLD_PERCENT = 7

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

  async function handleDelete(r: RepertoireRow) {
    const ok = window.confirm(`Permanently delete "${r.name}" and everything in it? This can't be undone.`)
    if (!ok) return
    setError(null)
    try {
      await deleteRepertoire(r.id)
      setRepertoires((prev) => (prev ?? []).filter((x) => x.id !== r.id))
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
            <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button type="button" onClick={() => onSelect(r)}>
                {r.name} ({r.training_color})
              </button>
              <button
                type="button"
                onClick={() => handleDelete(r)}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#888',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Delete
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

function groupByFromFen(edges: EdgeRow[]): Map<string, EdgeRow[]> {
  const map = new Map<string, EdgeRow[]>()
  for (const edge of edges) {
    const list = map.get(edge.from_fen)
    if (list) list.push(edge)
    else map.set(edge.from_fen, [edge])
  }
  return map
}

/**
 * Lichess's analysis board reads the FEN from the URL path, not a query
 * string (?fen= is silently ignored) — spaces become underscores and the
 * slashes stay literal, since encoding them as %2F leaves the path
 * unparsed. A FEN's own characters are all otherwise URL-safe.
 */
function lichessAnalysisUrl(fen: string): string {
  return `https://lichess.org/analysis/${fen.replaceAll(' ', '_')}`
}

/**
 * The edges to delete along with `target`: its descendants, but only where
 * deleting `target` actually orphans them. A descendant reachable through
 * some other still-live edge (a transposition back into shared territory)
 * keeps its subtree intact.
 */
function collectDeletionIds(target: EdgeRow, allEdges: EdgeRow[]): string[] {
  const toDelete = new Set<string>([target.id])
  const queue: string[] = [target.to_fen]
  const visitedFens = new Set<string>()

  while (queue.length > 0) {
    const fen = queue.shift()!
    if (visitedFens.has(fen)) continue
    visitedFens.add(fen)

    const stillReachable = allEdges.some((e) => e.to_fen === fen && !toDelete.has(e.id))
    if (stillReachable) continue

    for (const child of allEdges) {
      if (child.from_fen === fen && !toDelete.has(child.id)) {
        toDelete.add(child.id)
        queue.push(child.to_fen)
      }
    }
  }

  return [...toDelete]
}

interface MoveCell {
  edge: EdgeRow
  index: number
}

interface MoveRow {
  number: number
  white?: MoveCell
  black?: MoveCell
}

/** Pairs a played path into White/Black rows, numbered like standard notation. */
function buildMoveRows(path: EdgeRow[]): MoveRow[] {
  const rows: MoveRow[] = []
  let number = 0

  for (const [index, edge] of path.entries()) {
    const cell: MoveCell = { edge, index }
    if (colorToMove(edge.from_fen) === 'white') {
      number += 1
      rows.push({ number, white: cell })
    } else {
      const lastRow = rows[rows.length - 1]
      if (lastRow && lastRow.black === undefined) {
        lastRow.black = cell
      } else {
        number += 1
        rows.push({ number, black: cell })
      }
    }
  }

  return rows
}

const MAX_VISIBLE_ROWS = 8

function MoveCellButton({
  cell,
  isCurrent,
  onJump,
}: {
  cell?: MoveCell
  isCurrent: boolean
  onJump: (index: number) => void
}) {
  if (!cell) return <span style={{ width: 64, display: 'inline-block', flexShrink: 0 }} />

  return (
    <button
      type="button"
      onClick={() => onJump(cell.index)}
      style={{
        width: 64,
        flexShrink: 0,
        textAlign: 'left',
        border: 'none',
        background: 'none',
        font: 'inherit',
        fontWeight: isCurrent ? 700 : 400,
        color: 'inherit',
        cursor: 'pointer',
        padding: '1px 0',
      }}
    >
      {cell.edge.san}
    </button>
  )
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3
      style={{
        margin: '0 0 0.25rem',
        fontSize: '0.7rem',
        fontWeight: 600,
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </h3>
  )
}

function CurrentLinePanel({
  rows,
  currentIndex,
  onJump,
}: {
  rows: MoveRow[]
  currentIndex: number
  onJump: (index: number) => void
}) {
  const visibleRows = rows.slice(-MAX_VISIBLE_ROWS)
  const truncated = rows.length > visibleRows.length

  return (
    <div style={{ fontSize: '0.9rem' }}>
      <SectionHeading>Current Line</SectionHeading>
      {rows.length === 0 && <p style={{ color: '#888', margin: 0 }}>Start of the repertoire</p>}
      {truncated && <p style={{ color: '#888', margin: '0 0 2px' }}>⋯</p>}
      {visibleRows.map((row) => (
        <div key={row.number} style={{ display: 'flex', gap: '0.5rem' }}>
          <span style={{ width: 22, flexShrink: 0, color: '#888' }}>{row.number}.</span>
          <MoveCellButton cell={row.white} isCurrent={row.white?.index === currentIndex} onJump={onJump} />
          <MoveCellButton cell={row.black} isCurrent={row.black?.index === currentIndex} onJump={onJump} />
        </div>
      ))}
    </div>
  )
}

function CurrentPositionBanner({ turn }: { turn: 'white' | 'black' }) {
  return <p style={{ margin: '0.75rem 0', fontWeight: 600 }}>{turn === 'white' ? 'White to move' : 'Black to move'}</p>
}

interface SuggestedMove {
  san: string
  edge?: EdgeRow
  percentage?: number
  games?: number
  wdl?: WdlCounts
}

interface OpponentMoveGroups {
  known: SuggestedMove[]
  suggestions: SuggestedMove[]
}

/**
 * Splits opponent replies into what's already in the repertoire (kept
 * regardless of frequency — it's a deliberate choice, not a suggestion) and
 * new Lichess moves that clear the threshold but haven't been added yet.
 */
function groupOpponentChoices(
  edges: EdgeRow[],
  explorerMoves: ExplorerMove[] | null,
  thresholdPercent: number,
): OpponentMoveGroups {
  const known = new Map<string, SuggestedMove>()
  for (const edge of edges) {
    known.set(edge.san, { san: edge.san, edge })
  }

  const suggestions: SuggestedMove[] = []
  for (const move of explorerMoves ?? []) {
    const wdl: WdlCounts = { white: move.white, draws: move.draws, black: move.black }
    const existing = known.get(move.san)
    if (existing) {
      existing.percentage = move.percentage
      existing.games = move.games
      existing.wdl = wdl
    } else if (move.percentage >= thresholdPercent) {
      suggestions.push({ san: move.san, percentage: move.percentage, games: move.games, wdl })
    }
  }

  const knownList = [...known.values()].sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1))
  suggestions.sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))

  return { known: knownList, suggestions }
}

function formatGameCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1000)}k`
  return String(n)
}

const linkButtonStyle = {
  border: 'none',
  background: 'none',
  color: '#888',
  cursor: 'pointer',
  padding: 0,
  font: 'inherit',
  fontSize: '0.65rem',
} as const

// rgb triples so both the tile tint and its border can share one accent per source.
const ACCENT = {
  known: '52,199,89', // green — already prepared
  lichess: '90,140,255', // blue — common among all Lichess players
  masters: '155,110,225', // purple — common among titled/OTB players
  stockfish: '230,126,34', // orange — engine evaluation
  streamer: '38,166,154', // teal — a tracked player's own games
} as const

interface WdlCounts {
  white: number
  draws: number
  black: number
}

/** The classic white/draw/black result bar, proportioned to this move's own games. */
function WdlBar({ wdl }: { wdl: WdlCounts }) {
  const total = wdl.white + wdl.draws + wdl.black
  if (total === 0) return null
  const whitePct = (wdl.white / total) * 100
  const drawPct = (wdl.draws / total) * 100
  const blackPct = (wdl.black / total) * 100

  return (
    <div
      title={`White ${whitePct.toFixed(0)}% · Draw ${drawPct.toFixed(0)}% · Black ${blackPct.toFixed(0)}%`}
      style={{
        display: 'flex',
        width: '100%',
        height: 5,
        borderRadius: 3,
        overflow: 'hidden',
        border: '1px solid rgba(128,128,128,0.3)',
      }}
    >
      <div style={{ width: `${whitePct}%`, background: '#e8e8e8' }} />
      <div style={{ width: `${drawPct}%`, background: '#8a8a8a' }} />
      <div style={{ width: `${blackPct}%`, background: '#333' }} />
    </div>
  )
}

/** A single move option: SAN plus an optional badge (e.g. a percentage or an eval) and caption. */
function MoveTile({
  san,
  accent,
  badgeText,
  badgeColor,
  caption,
  wdl,
  hidden,
  known,
  onSelect,
  onToggleHide,
  onDelete,
}: {
  san: string
  accent: string
  badgeText?: string
  badgeColor?: string
  caption?: string
  wdl?: WdlCounts
  hidden?: boolean
  known?: boolean
  onSelect: () => void
  onToggleHide?: () => void
  onDelete?: () => void
}) {
  const borderAlpha = hidden ? 0.15 : 0.4

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 84 }}>
      <button
        type="button"
        onClick={onSelect}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.3rem',
          width: '100%',
          padding: '0.6rem 0.4rem',
          borderRadius: known ? '10px 10px 0 0' : 10,
          border: `1px solid rgba(${accent}, ${borderAlpha})`,
          borderBottom: known ? 'none' : `1px solid rgba(${accent}, ${borderAlpha})`,
          background: `rgba(${accent}, ${hidden ? 0.03 : 0.08})`,
          color: hidden ? '#888' : 'inherit',
          textDecoration: hidden ? 'line-through' : 'none',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>{san}</span>
        {wdl && <WdlBar wdl={wdl} />}
        {badgeText && (
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: '#fff',
              background: hidden ? '#666' : (badgeColor ?? '#3b6fed'),
              borderRadius: 999,
              padding: '1px 8px',
            }}
          >
            {badgeText}
          </span>
        )}
        {caption && <span style={{ fontSize: '0.65rem', color: '#888' }}>{caption}</span>}
      </button>
      {known && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '3px 4px',
            border: `1px solid rgba(${accent}, ${borderAlpha})`,
            borderTop: 'none',
            borderRadius: '0 0 10px 10px',
          }}
        >
          <button type="button" onClick={onToggleHide} style={linkButtonStyle}>
            {hidden ? 'Restore' : 'Hide'}
          </button>
          <button type="button" onClick={onDelete} style={linkButtonStyle}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

const BADGE_COLOR = {
  known: '#2fa84f',
  lichess: '#3b6fed',
  masters: '#9b6ee1',
  streamer: '#26a69a',
} as const

/** Arrows for moves already saved in the repertoire from the current position. */
function buildKnownMoveArrows(choices: EdgeRow[], position: string): Arrow[] {
  const arrows: Arrow[] = []
  for (const edge of choices) {
    if (edge.status === 'ignored') continue
    const move = applySanMove(position, edge.san)
    if (!move) continue
    arrows.push({ startSquare: move.from, endSquare: move.to, color: BADGE_COLOR.known })
  }
  return arrows
}

const LAST_MOVE_ARROW_COLOR = 'rgba(170, 170, 170, 0.65)'

/** A faint arrow for whichever move (yours or the opponent's) led to the current position. */
function buildLastMoveArrow(lastEdge: EdgeRow | undefined): Arrow | null {
  if (!lastEdge) return null
  const move = applySanMove(lastEdge.from_fen, lastEdge.san)
  if (!move) return null
  return { startSquare: move.from, endSquare: move.to, color: LAST_MOVE_ARROW_COLOR }
}

function OpponentMoveTile({
  move,
  variant,
  onSelect,
  onToggleHide,
  onDelete,
}: {
  move: SuggestedMove
  variant: 'known' | 'lichess' | 'masters' | 'streamer'
  onSelect: () => void
  onToggleHide?: () => void
  onDelete?: () => void
}) {
  return (
    <MoveTile
      san={move.san}
      accent={ACCENT[variant]}
      badgeText={move.percentage !== undefined ? `${move.percentage.toFixed(1)}%` : undefined}
      badgeColor={BADGE_COLOR[variant]}
      caption={move.games !== undefined ? `${formatGameCount(move.games)} games` : undefined}
      wdl={move.wdl}
      hidden={move.edge?.status === 'ignored'}
      known={move.edge !== undefined}
      onSelect={onSelect}
      onToggleHide={onToggleHide}
      onDelete={onDelete}
    />
  )
}

function OpponentMoves({
  choices,
  explorerMoves,
  explorerError,
  loading,
  thresholdPercent,
  onSelectKnown,
  onSelectSuggestion,
  onToggleHide,
  onDelete,
}: {
  choices: EdgeRow[]
  explorerMoves: ExplorerMove[] | null
  explorerError: string | null
  loading: boolean
  thresholdPercent: number
  onSelectKnown: (edge: EdgeRow) => void
  onSelectSuggestion: (move: SuggestedMove) => void
  onToggleHide: (edge: EdgeRow) => void
  onDelete: (edge: EdgeRow) => void
}) {
  const { known, suggestions } = useMemo(
    () => groupOpponentChoices(choices, explorerMoves, thresholdPercent),
    [choices, explorerMoves, thresholdPercent],
  )

  return (
    <div>
      {known.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <SectionHeading>Your Repertoire</SectionHeading>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
            {known.map((move) => (
              <OpponentMoveTile
                key={move.san}
                move={move}
                variant="known"
                onSelect={() => onSelectKnown(move.edge!)}
                onToggleHide={() => onToggleHide(move.edge!)}
                onDelete={() => onDelete(move.edge!)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionHeading>Lichess Suggestions</SectionHeading>
        {loading && <p style={{ color: '#888', margin: 0, fontSize: '0.8rem' }}>Loading Lichess stats…</p>}
        {explorerError && (
          <p style={{ color: '#888', margin: 0, fontSize: '0.8rem' }}>
            Couldn't load Lichess stats: {explorerError}
          </p>
        )}
        {!loading && !explorerError && suggestions.length === 0 && (
          <p style={{ color: '#888', margin: 0 }}>
            {known.length > 0
              ? 'No other common replies above threshold.'
              : 'No common replies found — play one on the board.'}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          {suggestions.map((move) => (
            <OpponentMoveTile
              key={move.san}
              move={move}
              variant="lichess"
              onSelect={() => onSelectSuggestion(move)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** A single comparable number (white-relative), so mate scores still sort past any finite cp score. */
function evalToComparable(line: EngineLine): number {
  if (line.mate !== undefined) return line.mate > 0 ? 100000 - line.mate : -100000 - line.mate
  return line.cp ?? 0
}

/** How many centipawns (white-relative) a played move gave up vs. the best move available before it. */
const BLUNDER_CP_LOSS = 200

interface MoveGrade {
  line: EngineLine
  isBad: boolean
}

interface EvalSuggestion {
  san: string
  evalText: string
}

/** The first move of each engine line, as SAN, skipping ones already in the repertoire. */
function buildEvalSuggestions(
  position: string,
  lines: EngineLine[],
  knownSans: ReadonlySet<string>,
): EvalSuggestion[] {
  const seen = new Set<string>()
  const out: EvalSuggestion[] = []
  for (const line of lines) {
    const uci = line.moves[0]
    const san = uci ? uciToSan(position, uci) : null
    if (!san || knownSans.has(san) || seen.has(san)) continue
    seen.add(san)
    out.push({ san, evalText: formatEval(line) })
  }
  return out
}

/**
 * A tracked player's moves at this position, shaped like any other
 * percentage-based source — regardless of whether they came from a live
 * Lichess query or a cached Chess.com import, by the time they get here
 * they're both plain ExplorerMove[].
 */
function buildStreamerSuggestions(moves: ExplorerMove[], thresholdPercent: number): SuggestedMove[] {
  return moves
    .filter((m) => m.percentage >= thresholdPercent)
    .map(
      (m): SuggestedMove => ({
        san: m.san,
        games: m.games,
        percentage: m.percentage,
        wdl: { white: m.white, draws: m.draws, black: m.black },
      }),
    )
    .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
}

const mutedNoteStyle = { color: '#888', margin: 0, fontSize: '0.8rem' } as const

interface StreamerData {
  player: TrackedPlayerRow
  moves: ExplorerMove[] | null
  loading: boolean
  error: string | null
}

function StreamerAccordion({
  data,
  thresholdPercent,
  expanded,
  onToggle,
  onSelect,
}: {
  data: StreamerData
  thresholdPercent: number
  expanded: boolean
  onToggle: () => void
  onSelect: (san: string) => void
}) {
  const suggestions = useMemo(
    () => (data.moves ? buildStreamerSuggestions(data.moves, thresholdPercent) : []),
    [data.moves, thresholdPercent],
  )

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            flex: 1,
            border: 'none',
            background: 'none',
            padding: '0.2rem 0',
            cursor: 'pointer',
            font: 'inherit',
            textAlign: 'left',
            color: 'inherit',
          }}
        >
          <span style={{ fontSize: '0.65rem', color: '#888', width: 10, flexShrink: 0 }}>
            {expanded ? '▼' : '▶'}
          </span>
          <strong style={{ fontSize: '0.85rem' }}>{data.player.username}</strong>
          <span style={{ fontSize: '0.7rem', color: '#888' }}>({data.player.source})</span>
        </button>
      </div>
      {expanded && (
        <div style={{ paddingLeft: '0.8rem', marginTop: '0.25rem' }}>
          {data.loading && <p style={mutedNoteStyle}>Loading…</p>}
          {data.error && <p style={mutedNoteStyle}>Couldn't load: {data.error}</p>}
          {!data.loading && !data.error && suggestions.length === 0 && (
            <p style={mutedNoteStyle}>No moves above threshold at this position.</p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {suggestions.map((move) => (
              <OpponentMoveTile
                key={move.san}
                move={move}
                variant="streamer"
                onSelect={() => onSelect(move.san)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PlayerMoves({
  choices,
  position,
  mastersMoves,
  mastersLoading,
  mastersError,
  evalLines,
  evalLoading,
  evalError,
  streamers,
  expandedStreamers,
  onToggleStreamer,
  thresholdPercent,
  onSelectKnown,
  onSelectSuggestion,
  onToggleHide,
  onDelete,
}: {
  choices: EdgeRow[]
  position: string
  mastersMoves: ExplorerMove[] | null
  mastersLoading: boolean
  mastersError: string | null
  evalLines: EngineLine[] | null
  evalLoading: boolean
  evalError: string | null
  streamers: StreamerData[]
  expandedStreamers: ReadonlySet<string>
  onToggleStreamer: (playerId: string) => void
  thresholdPercent: number
  onSelectKnown: (edge: EdgeRow) => void
  onSelectSuggestion: (san: string) => void
  onToggleHide: (edge: EdgeRow) => void
  onDelete: (edge: EdgeRow) => void
}) {
  const { known, suggestions: mastersSuggestions } = useMemo(
    () => groupOpponentChoices(choices, mastersMoves, thresholdPercent),
    [choices, mastersMoves, thresholdPercent],
  )

  const knownSans = useMemo(() => new Set(choices.map((e) => e.san)), [choices])

  const evalSuggestions = useMemo(
    () => (evalLines ? buildEvalSuggestions(position, evalLines, knownSans) : []),
    [evalLines, position, knownSans],
  )

  return (
    <div>
      {known.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <SectionHeading>Your Repertoire</SectionHeading>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
            {known.map((move) => (
              <OpponentMoveTile
                key={move.san}
                move={move}
                variant="known"
                onSelect={() => onSelectKnown(move.edge!)}
                onToggleHide={() => onToggleHide(move.edge!)}
                onDelete={() => onDelete(move.edge!)}
              />
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '0.75rem' }}>
        <SectionHeading>Stockfish</SectionHeading>
        {evalLoading && <p style={mutedNoteStyle}>Thinking…</p>}
        {evalError && <p style={mutedNoteStyle}>Couldn't load Stockfish eval: {evalError}</p>}
        {!evalLoading && !evalError && evalLines !== null && evalSuggestions.length === 0 && (
          <p style={mutedNoteStyle}>No legal moves in this position.</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          {evalSuggestions.map((s) => (
            <MoveTile
              key={s.san}
              san={s.san}
              accent={ACCENT.stockfish}
              badgeText={s.evalText}
              badgeColor="#e67e22"
              onSelect={() => onSelectSuggestion(s.san)}
            />
          ))}
        </div>
      </div>

      <div style={{ marginBottom: streamers.length > 0 ? '0.75rem' : 0 }}>
        <SectionHeading>Masters</SectionHeading>
        {mastersLoading && <p style={mutedNoteStyle}>Loading masters games…</p>}
        {mastersError && <p style={mutedNoteStyle}>Couldn't load masters games: {mastersError}</p>}
        {!mastersLoading && !mastersError && mastersMoves !== null && mastersSuggestions.length === 0 && (
          <p style={mutedNoteStyle}>No other common master moves above threshold.</p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          {mastersSuggestions.map((move) => (
            <OpponentMoveTile
              key={move.san}
              move={move}
              variant="masters"
              onSelect={() => onSelectSuggestion(move.san)}
            />
          ))}
        </div>
      </div>

      {streamers.length > 0 && (
        <div>
          <SectionHeading>Streamers</SectionHeading>
          {streamers.map((data) => (
            <StreamerAccordion
              key={data.player.id}
              data={data}
              thresholdPercent={thresholdPercent}
              expanded={expandedStreamers.has(data.player.id)}
              onToggle={() => onToggleStreamer(data.player.id)}
              onSelect={onSelectSuggestion}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NavigationBar({
  canGoBack,
  onBack,
  onBackAndDelete,
}: {
  canGoBack: boolean
  onBack: () => void
  onBackAndDelete: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
      <button type="button" onClick={onBack} disabled={!canGoBack}>
        ← Back
      </button>
      <button type="button" onClick={onBackAndDelete} disabled={!canGoBack}>
        ← Back & Delete
      </button>
    </div>
  )
}

interface NavState {
  path: EdgeRow[]
}

/**
 * Walks backward from a bookmarked FEN to the repertoire root, one incoming
 * edge at a time, to rebuild a plausible Current Line to display. Where a
 * transposition means multiple edges could lead here, the first one found
 * wins — a bookmark restores *a* path to the position, not necessarily the
 * exact line you originally walked to reach it, which is the right trade-off
 * for a "position is the real identity" app. Falls back to the root (empty
 * path) if the FEN isn't reachable at all, e.g. a stale or bad bookmark.
 */
function reconstructPathTo(targetFen: string, rootFen: string, edges: EdgeRow[]): EdgeRow[] {
  if (targetFen === rootFen) return []

  const parentByToFen = new Map<string, EdgeRow>()
  for (const edge of edges) {
    if (!parentByToFen.has(edge.to_fen)) parentByToFen.set(edge.to_fen, edge)
  }

  const path: EdgeRow[] = []
  const visited = new Set<string>()
  let cursor = targetFen

  while (cursor !== rootFen) {
    if (visited.has(cursor)) return [] // cycle — bail to root rather than loop forever
    visited.add(cursor)
    const edge = parentByToFen.get(cursor)
    if (!edge) return [] // not reachable from root — bail to root
    path.push(edge)
    cursor = edge.from_fen
  }

  return path.reverse()
}

const NAV_STORAGE_PREFIX = 'build-nav-path:'

/**
 * Remembers the exact sequence of edge ids played in one repertoire this tab
 * session, so a page reload (a dev-server hot-reload counts too) can restore
 * precisely where you were — see resolveStoredPath for why this is preferred
 * over reconstructPathTo's FEN-only reconstruction.
 */
function readStoredPath(repertoireId: string): string[] | null {
  try {
    const raw = sessionStorage.getItem(NAV_STORAGE_PREFIX + repertoireId)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((x) => typeof x === 'string') ? parsed : null
  } catch {
    return null
  }
}

function writeStoredPath(repertoireId: string, edgeIds: string[]): void {
  try {
    sessionStorage.setItem(NAV_STORAGE_PREFIX + repertoireId, JSON.stringify(edgeIds))
  } catch {
    // sessionStorage can be unavailable (private browsing, quota) — losing
    // exact-path recall on reload is a minor degradation, not worth surfacing
  }
}

/**
 * Rebuilds nav.path from a remembered sequence of edge ids, rather than
 * reconstructing an arbitrary (but equally valid) path from the FEN alone —
 * reconstructPathTo can silently pick the *other* branch of a transposition,
 * which looks like the line reverting a move or two even though the
 * resulting position is correct. Stops at the first id that no longer forms
 * a valid next step (e.g. deleted since) rather than discarding it all.
 */
function resolveStoredPath(edgeIds: string[], rootFen: string, edges: EdgeRow[]): EdgeRow[] {
  const byId = new Map(edges.map((e) => [e.id, e]))
  const path: EdgeRow[] = []
  let cursor = rootFen
  for (const id of edgeIds) {
    const edge = byId.get(id)
    if (!edge || edge.from_fen !== cursor) break
    path.push(edge)
    cursor = edge.to_fen
  }
  return path
}

function BuildSession({
  repertoire,
  initialFen,
}: {
  repertoire: RepertoireRow
  initialFen?: string | null
}) {
  const [edges, setEdges] = useState<EdgeRow[] | null>(null)
  const [nav, setNav] = useState<NavState>({ path: [] })
  const [hasRestoredInitialFen, setHasRestoredInitialFen] = useState(false)
  const [lastMove, setLastMove] = useState<string | null>(null)
  const [pgnCopied, setPgnCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [explorerMoves, setExplorerMoves] = useState<ExplorerMove[] | null>(null)
  const [explorerLoading, setExplorerLoading] = useState(false)
  const [explorerError, setExplorerError] = useState<string | null>(null)
  const [mastersMoves, setMastersMoves] = useState<ExplorerMove[] | null>(null)
  const [mastersLoading, setMastersLoading] = useState(false)
  const [mastersError, setMastersError] = useState<string | null>(null)
  const [evalLines, setEvalLines] = useState<EngineLine[] | null>(null)
  const [evalLoading, setEvalLoading] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [moveGrade, setMoveGrade] = useState<MoveGrade | null>(null)
  // Holds the last non-null eval so the bar doesn't flash back to neutral
  // every time a new search kicks off — it just sits still until one lands.
  const [displayedEvalLine, setDisplayedEvalLine] = useState<EngineLine | null>(null)
  // The most recent successfully-loaded eval, so a just-played move can be graded
  // against it without re-running the search for the position it was played from.
  const lastEvalRef = useRef<{ fen: string; lines: EngineLine[] } | null>(null)
  const [trackedPlayers, setTrackedPlayers] = useState<TrackedPlayerRow[]>([])
  const [streamerMoves, setStreamerMoves] = useState<Record<string, ExplorerMove[]>>({})
  const [streamerLoading, setStreamerLoading] = useState<Record<string, boolean>>({})
  const [streamerErrors, setStreamerErrors] = useState<Record<string, string>>({})
  const [expandedStreamers, setExpandedStreamers] = useState<ReadonlySet<string>>(new Set())
  const [thresholdPercent, setThresholdPercent] = useState(DEFAULT_SUGGESTION_THRESHOLD_PERCENT)

  useEffect(() => {
    listEdges(repertoire.id)
      .then(setEdges)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [repertoire.id])

  useEffect(() => {
    listTrackedPlayers(repertoire.family_id)
      .then(setTrackedPlayers)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    getFamily(repertoire.family_id)
      .then((f) => setThresholdPercent(f.suggestion_threshold_percent))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [repertoire.family_id])

  const position = nav.path.at(-1)?.to_fen ?? repertoire.root_fen
  const byFen = useMemo(() => groupByFromFen(edges ?? []), [edges])
  const choices = byFen.get(position) ?? []
  const rows = useMemo(() => buildMoveRows(nav.path), [nav.path])
  const turn = useMemo(() => colorToMove(position), [position])
  const opponentToMove = turn !== repertoire.training_color
  const currentEvalLine = opponentToMove ? (moveGrade?.line ?? null) : (evalLines?.[0] ?? null)

  useEffect(() => {
    if (currentEvalLine) setDisplayedEvalLine(currentEvalLine)
  }, [currentEvalLine])

  // Only the opponent's move gets an arrow — once it's the opponent's turn
  // again, the last path edge is your own move, so no arrow.
  const lastMoveArrow = useMemo(
    () => (opponentToMove ? null : buildLastMoveArrow(nav.path.at(-1))),
    [nav.path, opponentToMove],
  )
  const arrows = useMemo(() => {
    const known = buildKnownMoveArrows(choices, position)
    return lastMoveArrow ? [...known, lastMoveArrow] : known
  }, [choices, position, lastMoveArrow])

  useEffect(() => {
    if (!edges || hasRestoredInitialFen) return
    const storedIds = readStoredPath(repertoire.id)
    const path = storedIds
      ? resolveStoredPath(storedIds, repertoire.root_fen, edges)
      : initialFen
        ? reconstructPathTo(initialFen, repertoire.root_fen, edges)
        : []
    setNav({ path })
    setHasRestoredInitialFen(true)
  }, [edges, initialFen, hasRestoredInitialFen, repertoire.id, repertoire.root_fen])

  useEffect(() => {
    if (!hasRestoredInitialFen) return // don't clobber the stored path before it's been read
    writeStoredPath(
      repertoire.id,
      nav.path.map((e) => e.id),
    )
  }, [nav.path, hasRestoredInitialFen, repertoire.id])

  useEffect(() => {
    history.replaceState(null, '', buildHash(repertoire.id, position))
  }, [repertoire.id, position])

  useEffect(() => {
    if (!opponentToMove) {
      setExplorerMoves(null)
      setExplorerError(null)
      return
    }
    let cancelled = false
    setExplorerMoves(null) // clear the previous position's data so stale tiles don't linger under "loading"
    setExplorerLoading(true)
    setExplorerError(null)
    fetchExplorerMoves(position)
      .then((moves) => {
        if (!cancelled) setExplorerMoves(moves)
      })
      .catch((err) => {
        if (!cancelled) setExplorerError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setExplorerLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [position, opponentToMove])

  useEffect(() => {
    if (opponentToMove) {
      setMastersMoves(null)
      setMastersError(null)
      return
    }
    let cancelled = false
    setMastersMoves(null)
    setMastersLoading(true)
    setMastersError(null)
    fetchExplorerMoves(position, 'masters')
      .then((moves) => {
        if (!cancelled) setMastersMoves(moves)
      })
      .catch((err) => {
        if (!cancelled) setMastersError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setMastersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [position, opponentToMove])

  useEffect(() => {
    if (opponentToMove) {
      setEvalLines(null)
      setEvalError(null)
      return
    }
    let cancelled = false
    setEvalLines(null)
    setEvalLoading(true)
    setEvalError(null)
    evaluatePosition(position)
      .then((lines) => {
        if (cancelled) return
        setEvalLines(lines)
        lastEvalRef.current = { fen: position, lines }
      })
      .catch((err) => {
        if (!cancelled) setEvalError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setEvalLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [position, opponentToMove])

  useEffect(() => {
    const edge = nav.path.at(-1)
    const cached = edge ? lastEvalRef.current : null
    if (!edge || colorToMove(edge.from_fen) !== repertoire.training_color || !cached || cached.fen !== edge.from_fen) {
      setMoveGrade(null)
      return
    }
    const bestBefore = cached.lines[0]
    if (!bestBefore) {
      setMoveGrade(null)
      return
    }
    let cancelled = false
    setMoveGrade(null)
    evaluatePosition(edge.to_fen)
      .then((afterLines) => {
        if (cancelled) return
        const bestAfter = afterLines[0]
        if (!bestAfter) return
        const moverIsWhite = colorToMove(edge.from_fen) === 'white'
        const cpLoss = moverIsWhite
          ? evalToComparable(bestBefore) - evalToComparable(bestAfter)
          : evalToComparable(bestAfter) - evalToComparable(bestBefore)
        setMoveGrade({ line: bestAfter, isBad: cpLoss >= BLUNDER_CP_LOSS })
      })
      .catch(() => {
        if (!cancelled) setMoveGrade(null)
      })
    return () => {
      cancelled = true
    }
  }, [nav.path, repertoire.training_color])

  useEffect(() => {
    if (opponentToMove || trackedPlayers.length === 0) return
    let cancelled = false

    for (const player of trackedPlayers) {
      setStreamerLoading((prev) => ({ ...prev, [player.id]: true }))
      setStreamerErrors((prev) => {
        const next = { ...prev }
        delete next[player.id]
        return next
      })
      setStreamerMoves((prev) => {
        const next = { ...prev }
        delete next[player.id]
        return next
      })
      listMoveStatsBySource(statsSourceFor(player), position)
        .then(moveStatsToExplorerMoves)
        .then((moves) => {
          if (!cancelled) setStreamerMoves((prev) => ({ ...prev, [player.id]: moves }))
        })
        .catch((err) => {
          if (!cancelled) {
            setStreamerErrors((prev) => ({
              ...prev,
              [player.id]: err instanceof Error ? err.message : String(err),
            }))
          }
        })
        .finally(() => {
          if (!cancelled) setStreamerLoading((prev) => ({ ...prev, [player.id]: false }))
        })
    }

    return () => {
      cancelled = true
    }
  }, [position, opponentToMove, trackedPlayers])

  function handleToggleStreamer(playerId: string) {
    setExpandedStreamers((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  function handleBack() {
    setNav((prev) => {
      if (prev.path.length === 0) return prev
      return { path: prev.path.slice(0, -1) }
    })
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleChoose(edge: EdgeRow) {
    setLastMove(null)
    setError(null)
    setNav((prev) => ({ path: [...prev.path, edge] }))
  }

  function handleJump(index: number) {
    setLastMove(null)
    setError(null)
    setNav((prev) => ({ path: prev.path.slice(0, index + 1) }))
  }

  function handleToggleHide(edge: EdgeRow) {
    const nextStatus: EdgeStatus = edge.status === 'ignored' ? 'active' : 'ignored'
    setError(null)
    setEdgeStatus(edge.id, nextStatus)
      .then((updated) => {
        setEdges((prev) => (prev ?? []).map((e) => (e.id === updated.id ? updated : e)))
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  function handleDelete(edge: EdgeRow) {
    const ids = collectDeletionIds(edge, edges ?? [])
    if (ids.length > 1) {
      const extra = ids.length - 1
      const ok = window.confirm(
        `Delete "${edge.san}" and ${extra} move${extra === 1 ? '' : 's'} that follow it? This can't be undone.`,
      )
      if (!ok) return
    }
    setError(null)
    deleteEdges(ids)
      .then(() => {
        setEdges((prev) => (prev ?? []).filter((e) => !ids.includes(e.id)))
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  /** Steps back one move and deletes it (and anything now-orphaned after it) from the repertoire. */
  function handleBackAndDelete() {
    const edge = nav.path.at(-1)
    if (!edge) return
    const ids = collectDeletionIds(edge, edges ?? [])
    if (ids.length > 1) {
      const extra = ids.length - 1
      const ok = window.confirm(
        `Go back and delete "${edge.san}" and ${extra} move${extra === 1 ? '' : 's'} that follow it? This can't be undone.`,
      )
      if (!ok) return
    }
    setError(null)
    deleteEdges(ids)
      .then(() => {
        setEdges((prev) => (prev ?? []).filter((e) => !ids.includes(e.id)))
        setNav((prev) => ({ path: prev.path.slice(0, -1) }))
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  /** Plays a SAN move from the current position, saving it as a repertoire edge. */
  async function handleCopyPgn() {
    const pgnRows = rows.map((row) => ({
      number: row.number,
      white: row.white?.edge.san,
      black: row.black?.edge.san,
    }))
    try {
      await navigator.clipboard.writeText(buildPgn(repertoire.root_fen, pgnRows))
      setPgnCopied(true)
      setTimeout(() => setPgnCopied(false), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function playMove(san: string): boolean {
    const chess = new Chess(position)
    let move
    try {
      move = chess.move(san)
    } catch {
      return false // not a legal move
    }

    const fromFen = position
    const toFen = normalizeFen(chess.fen())
    setError(null)
    saveEdge({ repertoireId: repertoire.id, fromFen, san: move.san, toFen })
      .then((saved) => {
        setLastMove(move.san)
        setEdges((prev) => {
          const withoutStale = (prev ?? []).filter((e) => e.id !== saved.id)
          return [...withoutStale, saved]
        })
        setNav((prev) => ({ path: [...prev.path, saved] }))
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))

    return true
  }

  function attemptMove(from: string, to: string): boolean {
    const chess = new Chess(position)
    let move
    try {
      move = chess.move({ from, to, promotion: 'q' })
    } catch {
      return false // not a legal chess move at all
    }

    return playMove(move.san)
  }

  function onPieceDrop({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean {
    if (!targetSquare) return false
    return attemptMove(sourceSquare, targetSquare)
  }

  const { squareStyles, onSquareClick } = useClickToMove(position, attemptMove)

  if (!edges) {
    return <p style={{ padding: '1rem' }}>Loading…</p>
  }

  const streamers: StreamerData[] = trackedPlayers.map((player) => ({
    player,
    moves: streamerMoves[player.id] ?? null,
    loading: streamerLoading[player.id] ?? false,
    error: streamerErrors[player.id] ?? null,
  }))

  return (
    <div
      style={{ display: 'flex', gap: '2rem', maxWidth: 820, margin: '2rem auto', alignItems: 'flex-start' }}
    >
      <div style={{ width: 280, flexShrink: 0 }}>
        <CurrentLinePanel rows={rows} currentIndex={nav.path.length - 1} onJump={handleJump} />
        <NavigationBar
          canGoBack={nav.path.length > 0}
          onBack={handleBack}
          onBackAndDelete={handleBackAndDelete}
        />
        <CurrentPositionBanner turn={turn} />
        {opponentToMove ? (
          <OpponentMoves
            choices={choices}
            explorerMoves={explorerMoves}
            explorerError={explorerError}
            loading={explorerLoading}
            thresholdPercent={thresholdPercent}
            onSelectKnown={handleChoose}
            onSelectSuggestion={(move) => playMove(move.san)}
            onToggleHide={handleToggleHide}
            onDelete={handleDelete}
          />
        ) : (
          <PlayerMoves
            choices={choices}
            position={position}
            mastersMoves={mastersMoves}
            mastersLoading={mastersLoading}
            mastersError={mastersError}
            evalLines={evalLines}
            evalLoading={evalLoading}
            evalError={evalError}
            streamers={streamers}
            expandedStreamers={expandedStreamers}
            onToggleStreamer={handleToggleStreamer}
            thresholdPercent={thresholdPercent}
            onSelectKnown={handleChoose}
            onSelectSuggestion={(san) => playMove(san)}
            onToggleHide={handleToggleHide}
            onDelete={handleDelete}
          />
        )}
      </div>
      <div style={{ width: 506, flexShrink: 0 }}>
        <p>
          {repertoire.name} ({repertoire.training_color})
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
          <EvalBar line={displayedEvalLine} boardOrientation={repertoire.training_color} isBad={moveGrade?.isBad} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Chessboard
              options={{
                position,
                onPieceDrop,
                onSquareClick,
                squareStyles,
                boardOrientation: repertoire.training_color,
                arrows,
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button type="button" onClick={handleCopyPgn} style={linkButtonStyle}>
            {pgnCopied ? 'Copied!' : 'Copy PGN'}
          </button>
          <a href={lichessAnalysisUrl(position)} target="_blank" rel="noreferrer" style={linkButtonStyle}>
            Analyze on Lichess ↗
          </a>
        </div>
        <div style={{ minHeight: '3rem', marginTop: '0.5rem' }}>
          {error && <p style={{ color: 'crimson' }}>Couldn't save: {error}</p>}
          {!error && lastMove && <p>Saved {lastMove}</p>}
        </div>
      </div>
    </div>
  )
}

export function BuildView({ familyId, userId }: { familyId: string; userId: string }) {
  const [repertoire, setRepertoire] = useState<RepertoireRow | null>(null)
  const [initialFen, setInitialFen] = useState<string | null>(null)
  // Only true if there's actually a bookmark to resolve — otherwise the
  // picker should render immediately, same as before this feature existed.
  const [restoring, setRestoring] = useState(() => parseBuildHash(window.location.hash) !== null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  // Bumped on every bookmark load (initial and pasted-while-open) and used as
  // BuildSession's key, so pasting a link into an already-open tab remounts
  // it fresh at the new position instead of being ignored after the first load.
  const [linkVersion, setLinkVersion] = useState(0)

  useEffect(() => {
    function loadFromHash() {
      const bookmark = parseBuildHash(window.location.hash)
      if (!bookmark) return
      setRestoring(true)
      getRepertoire(bookmark.repertoireId)
        .then((r) => {
          setRepertoire(r)
          setInitialFen(bookmark.fen)
          setLinkVersion((v) => v + 1)
        })
        .catch((err) => setRestoreError(err instanceof Error ? err.message : String(err)))
        .finally(() => setRestoring(false))
    }
    loadFromHash()
    window.addEventListener('hashchange', loadFromHash)
    return () => window.removeEventListener('hashchange', loadFromHash)
  }, [])

  if (restoring) {
    return <p style={{ padding: '1rem' }}>Loading…</p>
  }

  if (!repertoire) {
    return (
      <>
        {restoreError && (
          <p style={{ color: 'crimson', textAlign: 'center' }}>
            Couldn't open that bookmarked repertoire: {restoreError}
          </p>
        )}
        <RepertoirePicker familyId={familyId} userId={userId} onSelect={setRepertoire} />
      </>
    )
  }

  return <BuildSession key={linkVersion} repertoire={repertoire} initialFen={initialFen} />
}
