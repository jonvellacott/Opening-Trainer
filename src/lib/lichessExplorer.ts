export interface ExplorerMove {
  san: string
  games: number
  percentage: number
  white: number
  draws: number
  black: number
}

interface ExplorerMoveResponse {
  san: string
  white: number
  draws: number
  black: number
}

interface ExplorerResponse {
  white: number
  draws: number
  black: number
  moves: ExplorerMoveResponse[]
}

async function fetchExplorer(url: URL): Promise<ExplorerResponse> {
  // The explorer API allows unauthenticated server-to-server requests, but
  // requires a bearer token for cross-origin browser requests like this one.
  const token = import.meta.env.VITE_LICHESS_API_TOKEN
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) throw new Error(`Lichess explorer request failed (${res.status})`)

  // /lichess and /masters return one JSON object, but /player streams
  // newline-delimited JSON — a fuller snapshot on each line as Lichess scans
  // more of that player's games live. Either way the last non-empty line is
  // the final, complete result.
  const text = await res.text()
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) throw new Error('Lichess explorer returned an empty response')
  return JSON.parse(lines[lines.length - 1])
}

function toExplorerMoves(data: ExplorerResponse): ExplorerMove[] {
  const total = data.white + data.draws + data.black
  if (total === 0) return []

  return data.moves.map((m) => {
    const games = m.white + m.draws + m.black
    return {
      san: m.san,
      games,
      percentage: (games / total) * 100,
      white: m.white,
      draws: m.draws,
      black: m.black,
    }
  })
}

export type ExplorerDb = 'lichess' | 'masters'

/** Move stats for a position, from either the full Lichess database or the masters (OTB) database. */
export async function fetchExplorerMoves(fen: string, db: ExplorerDb = 'lichess'): Promise<ExplorerMove[]> {
  const url = new URL(`https://explorer.lichess.org/${db}`)
  url.searchParams.set('fen', fen)
  url.searchParams.set('topGames', '0')
  url.searchParams.set('recentGames', '0')
  return toExplorerMoves(await fetchExplorer(url))
}

/** Move stats for a position from one Lichess player's own games, as the given color. */
export async function fetchPlayerExplorerMoves(
  fen: string,
  username: string,
  color: 'white' | 'black',
): Promise<ExplorerMove[]> {
  const url = new URL('https://explorer.lichess.org/player')
  url.searchParams.set('player', username)
  url.searchParams.set('color', color)
  url.searchParams.set('fen', fen)
  url.searchParams.set('topGames', '0')
  url.searchParams.set('recentGames', '0')
  return toExplorerMoves(await fetchExplorer(url))
}
