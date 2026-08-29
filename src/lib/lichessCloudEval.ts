export interface CloudEvalLine {
  /** UCI moves, e.g. "d2d4". */
  moves: string[]
  cp?: number
  mate?: number
}

interface CloudEvalApiResponse {
  depth: number
  pvs: { moves: string; cp?: number; mate?: number }[]
}

/**
 * Pre-computed Stockfish lines for a position, from Lichess's shared eval
 * cache. Returns [] if this exact position hasn't been analyzed — there's no
 * on-demand engine here, just whatever Lichess already has.
 */
export async function fetchCloudEval(fen: string, multiPv = 3): Promise<CloudEvalLine[]> {
  const url = new URL('https://lichess.org/api/cloud-eval')
  url.searchParams.set('fen', fen)
  url.searchParams.set('multiPv', String(multiPv))

  const token = import.meta.env.VITE_LICHESS_API_TOKEN
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Lichess cloud eval request failed (${res.status})`)

  const data: CloudEvalApiResponse = await res.json()
  return data.pvs.map((p) => ({ moves: p.moves.split(' '), cp: p.cp, mate: p.mate }))
}
