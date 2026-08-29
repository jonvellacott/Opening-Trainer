/**
 * Deep-linking for Build mode, via the URL hash rather than a real path route
 * — the hash is never sent to the server, so it works on static GitHub Pages
 * hosting without hitting the deep-link/404 problem a path-based route would.
 */
export interface BuildHashState {
  repertoireId: string
  fen: string | null
}

export function parseBuildHash(hash: string): BuildHashState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const repertoireId = params.get('repertoire')
  if (!repertoireId) return null
  return { repertoireId, fen: params.get('fen') }
}

export function buildHash(repertoireId: string, fen: string): string {
  return `#${new URLSearchParams({ repertoire: repertoireId, fen }).toString()}`
}
