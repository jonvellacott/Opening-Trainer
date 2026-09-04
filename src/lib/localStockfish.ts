import { colorToMove } from '../domain/chess'

export interface EngineLine {
  /** UCI moves, e.g. "d2d4". */
  moves: string[]
  cp?: number
  mate?: number
}

const MULTI_PV = 3
const MOVETIME_MS = 3000

/**
 * UCI scores are always relative to the side to move, but the rest of the
 * app (formatEval, etc.) expects White's point of view, matching the
 * convention of Lichess's cloud-eval API this replaces.
 */
function toWhitePov(fen: string, lines: EngineLine[]): EngineLine[] {
  if (colorToMove(fen) === 'white') return lines
  return lines.map((line) => ({
    moves: line.moves,
    cp: line.cp === undefined ? undefined : -line.cp,
    mate: line.mate === undefined ? undefined : -line.mate,
  }))
}

function parseInfoLine(text: string): { multipv: number; line: EngineLine } | null {
  const tokens = text.split(' ')
  const multipvIdx = tokens.indexOf('multipv')
  const scoreIdx = tokens.indexOf('score')
  const pvIdx = tokens.indexOf('pv')
  if (multipvIdx === -1 || scoreIdx === -1 || pvIdx === -1) return null

  const multipv = Number(tokens[multipvIdx + 1])
  const scoreType = tokens[scoreIdx + 1]
  const scoreValue = Number(tokens[scoreIdx + 2])
  const moves = tokens.slice(pvIdx + 1)
  if (!Number.isFinite(multipv) || !Number.isFinite(scoreValue) || moves.length === 0) return null

  const line: EngineLine = { moves }
  if (scoreType === 'mate') line.mate = scoreValue
  else line.cp = scoreValue
  return { multipv, line }
}

/** A single, lazily-started Stockfish worker, reused across searches. */
class LocalStockfish {
  private worker: Worker
  private readyPromise: Promise<void>
  private resolveReady!: () => void
  private queue: Promise<unknown> = Promise.resolve()
  private searching = false
  private pendingLines = new Map<number, EngineLine>()
  private resolveSearch: ((lines: EngineLine[]) => void) | null = null

  constructor() {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve
    })
    this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`)
    this.worker.onmessage = (event: MessageEvent<string>) => this.handleMessage(event.data)
    this.worker.postMessage('uci')
  }

  private handleMessage(text: string): void {
    if (text === 'uciok') {
      this.worker.postMessage(`setoption name MultiPV value ${MULTI_PV}`)
      this.worker.postMessage('isready')
    } else if (text === 'readyok') {
      this.resolveReady()
    } else if (text.startsWith('info ')) {
      const parsed = parseInfoLine(text)
      if (parsed) this.pendingLines.set(parsed.multipv, parsed.line)
    } else if (text.startsWith('bestmove')) {
      this.searching = false
      const lines = [...this.pendingLines.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, line]) => line)
      this.resolveSearch?.(lines)
      this.resolveSearch = null
    }
  }

  /** Runs a fresh search, cutting short any search still in flight. */
  evaluate(fen: string): Promise<EngineLine[]> {
    if (this.searching) this.worker.postMessage('stop')
    const task = this.queue.then(() => this.readyPromise).then(() => this.runSearch(fen))
    this.queue = task.catch(() => undefined)
    return task
  }

  private runSearch(fen: string): Promise<EngineLine[]> {
    this.pendingLines = new Map()
    this.searching = true
    this.worker.postMessage(`position fen ${fen}`)
    this.worker.postMessage(`go movetime ${MOVETIME_MS}`)
    return new Promise((resolve) => {
      this.resolveSearch = resolve
    })
  }
}

let engine: LocalStockfish | null = null

/** Evaluates a position with a local engine search (~3s), MultiPV 3, White's POV. */
export async function evaluatePosition(fen: string): Promise<EngineLine[]> {
  if (!engine) engine = new LocalStockfish()
  const lines = await engine.evaluate(fen)
  return toWhitePov(fen, lines)
}

export function formatEval(line: EngineLine): string {
  if (line.mate !== undefined) {
    return line.mate > 0 ? `#${line.mate}` : `-#${Math.abs(line.mate)}`
  }
  const pawns = (line.cp ?? 0) / 100
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2)
}
