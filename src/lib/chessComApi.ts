export interface ChessComGame {
  pgn: string
  rules: string
  white: { username: string; result: string }
  black: { username: string; result: string }
}

/** Chess.com's public Published Data API — no auth, open CORS. */
export async function fetchChessComArchives(username: string): Promise<string[]> {
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`)
  if (!res.ok) throw new Error(`Chess.com archive list request failed (${res.status})`)
  const data: { archives: string[] } = await res.json()
  return data.archives
}

export async function fetchChessComMonth(archiveUrl: string): Promise<ChessComGame[]> {
  const res = await fetch(archiveUrl)
  if (!res.ok) throw new Error(`Chess.com games request failed (${res.status})`)
  const data: { games: ChessComGame[] } = await res.json()
  return data.games
}
