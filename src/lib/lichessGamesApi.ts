export interface LichessGame {
  variant: string
  white: string // lowercase username, '' if anonymous/unknown
  black: string
  winner?: 'white' | 'black' // absent = draw
  moves: string // space-separated SAN
}

interface LichessGameJson {
  variant?: string
  players?: {
    white?: { user?: { id?: string } }
    black?: { user?: { id?: string } }
  }
  winner?: 'white' | 'black'
  moves?: string
}

function parseLine(line: string): LichessGame | null {
  let data: LichessGameJson
  try {
    data = JSON.parse(line)
  } catch {
    return null
  }
  return {
    variant: data.variant ?? '',
    white: data.players?.white?.user?.id ?? '',
    black: data.players?.black?.user?.id ?? '',
    winner: data.winner,
    moves: data.moves ?? '',
  }
}

/**
 * Streams every game for a Lichess account as newline-delimited JSON,
 * calling onBatch periodically so a very active player's full history (some
 * of the accounts this app tracks have 10,000-40,000+ games) doesn't have to
 * be buffered in memory before any processing can start, and so the UI can
 * show real progress instead of hanging on one giant request.
 */
export async function fetchLichessGames(
  username: string,
  onBatch: (games: LichessGame[]) => Promise<void> | void,
): Promise<void> {
  const token = import.meta.env.VITE_LICHESS_API_TOKEN
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(username)}`, {
    headers: {
      Accept: 'application/x-ndjson',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok || !res.body) throw new Error(`Lichess games export failed (${res.status})`)

  const BATCH_SIZE = 200
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let batch: LichessGame[] = []

  async function flush() {
    if (batch.length === 0) return
    await onBatch(batch)
    batch = []
  }

  while (true) {
    const { done, value } = await reader.read()
    if (value) {
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex: number
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) {
          const game = parseLine(line)
          if (game) batch.push(game)
        }
        if (batch.length >= BATCH_SIZE) await flush()
      }
    }
    if (done) break
  }

  const trailing = buffer.trim()
  if (trailing) {
    const game = parseLine(trailing)
    if (game) batch.push(game)
  }
  await flush()
}
